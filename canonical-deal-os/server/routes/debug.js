/**
 * Debug Routes
 *
 * Provides debugging endpoints for development.
 * Only enabled in non-production environments.
 */

import { getRecentErrors, getRequestStats, clearStats } from '../middleware/request-logger.js';
import { resetRateLimit } from '../services/rate-limiter.js';
import { extractAuthUser } from './auth.js';
import { getAllCircuitStates, resetAllCircuits } from '../lib/circuit-breaker.js';

// Helper functions for auth checks
function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

async function requireAdmin(req, res) {
  const authUser = await extractAuthUser(req);
  if (!authUser) {
    sendJson(res, 401, { error: 'Authentication required', code: 'AUTH_REQUIRED' });
    return null;
  }
  if (authUser.role !== 'Admin') {
    sendJson(res, 403, { error: 'Admin role required', code: 'FORBIDDEN_ROLE' });
    return null;
  }
  return authUser;
}

async function requireGP(req, res) {
  const authUser = await extractAuthUser(req);
  if (!authUser) {
    sendJson(res, 401, { error: 'Authentication required', code: 'AUTH_REQUIRED' });
    return null;
  }
  if (!['GP', 'Admin'].includes(authUser.role)) {
    sendJson(res, 403, { error: 'GP or Admin role required', code: 'FORBIDDEN_ROLE' });
    return null;
  }
  return authUser;
}

const KERNEL_URL = process.env.KERNEL_API_URL || 'http://localhost:3001';

/**
 * Check health of a service
 */
async function checkServiceHealth(url, name) {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    return {
      name,
      status: res.ok ? 'up' : 'degraded',
      statusCode: res.status,
      latency: Date.now() - start,
    };
  } catch (error) {
    return {
      name,
      status: 'down',
      error: error.name === 'AbortError' ? 'Timeout' : error.message,
      latency: Date.now() - start,
    };
  }
}

/**
 * GET /api/debug/status
 *
 * Returns comprehensive system status including:
 * - Service health (kernel, database)
 * - Recent errors
 * - Request statistics
 */
export async function handleDebugStatus(req, res) {
  // SECURITY: Require Admin authentication for debug endpoints
  const authUser = await requireAdmin(req, res);
  if (!authUser) return;

  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    sendJson(res, 403, { error: 'Debug endpoints disabled in production' });
    return;
  }

  const [kernelHealth] = await Promise.all([
    checkServiceHealth(`${KERNEL_URL}/health`, 'Kernel API'),
  ]);

  const stats = getRequestStats();
  const recentErrors = getRecentErrors(10);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    services: {
      kernel: kernelHealth,
      bff: { name: 'BFF Server', status: 'up', latency: 0 },
    },
    requests: {
      total: stats.total,
      successful: stats.successful,
      failed: stats.failed,
      successRate: stats.successRate,
    },
    topEndpoints: stats.topPaths,
    recentErrors: recentErrors.map(e => ({
      timestamp: e.timestamp,
      method: e.method,
      path: e.path,
      status: e.status,
      message: e.message,
    })),
  }, null, 2));
}

/**
 * GET /api/debug/errors
 *
 * Returns list of recent errors with full details
 */
export async function handleDebugErrors(req, res) {
  // SECURITY: Require Admin authentication for debug endpoints
  const authUser = await requireAdmin(req, res);
  if (!authUser) return;

  if (process.env.NODE_ENV === 'production') {
    sendJson(res, 403, { error: 'Debug endpoints disabled in production' });
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);

  const errors = getRecentErrors(limit);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    count: errors.length,
    errors,
  }, null, 2));
}

/**
 * POST /api/debug/clear
 *
 * Clears all stats and error history
 */
export async function handleDebugClear(req, res) {
  // SECURITY: Require Admin authentication for debug endpoints
  const authUser = await requireAdmin(req, res);
  if (!authUser) return;

  if (process.env.NODE_ENV === 'production') {
    sendJson(res, 403, { error: 'Debug endpoints disabled in production' });
    return;
  }

  clearStats();

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'Stats cleared' }));
}

/**
 * GET /api/debug/endpoints
 *
 * Lists all registered endpoints (useful for documentation)
 */
export async function handleDebugEndpoints(req, res) {
  // SECURITY: Require GP or Admin for endpoint listing
  const authUser = await requireGP(req, res);
  if (!authUser) return;

  if (process.env.NODE_ENV === 'production') {
    sendJson(res, 403, { error: 'Debug endpoints disabled in production' });
    return;
  }

  // This would need to be populated by the main server
  // For now, return a helpful message
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    message: 'Run npm run test:endpoints to see all endpoints',
    docsUrl: '/api/debug/status for system status',
  }));
}

/**
 * GET /api/debug/circuits
 *
 * Returns circuit breaker states for all external services.
 * Shows which services are healthy, degraded, or failing.
 */
export async function handleDebugCircuits(req, res) {
  // SECURITY: Require Admin authentication for debug endpoints
  const authUser = await requireAdmin(req, res);
  if (!authUser) return;

  if (process.env.NODE_ENV === 'production') {
    sendJson(res, 403, { error: 'Debug endpoints disabled in production' });
    return;
  }

  const circuits = getAllCircuitStates();

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    timestamp: new Date().toISOString(),
    circuits: circuits.map(c => ({
      name: c.name,
      state: c.state,
      failures: c.failures,
      successes: c.successes,
      config: c.config,
      nextAttemptTime: c.nextAttemptTime ? new Date(c.nextAttemptTime).toISOString() : null,
    })),
    summary: {
      total: circuits.length,
      closed: circuits.filter(c => c.state === 'CLOSED').length,
      open: circuits.filter(c => c.state === 'OPEN').length,
      halfOpen: circuits.filter(c => c.state === 'HALF_OPEN').length,
    },
  }, null, 2));
}

/**
 * POST /api/debug/circuits/reset
 *
 * Resets all circuit breakers to CLOSED state.
 * Useful for testing and recovery scenarios.
 */
export async function handleDebugCircuitsReset(req, res) {
  // SECURITY: Require Admin authentication for debug endpoints
  const authUser = await requireAdmin(req, res);
  if (!authUser) return;

  if (process.env.NODE_ENV === 'production') {
    sendJson(res, 403, { error: 'Debug endpoints disabled in production' });
    return;
  }

  resetAllCircuits();

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    message: 'All circuit breakers reset to CLOSED state',
    timestamp: new Date().toISOString(),
  }));
}

/**
 * POST /api/debug/reset-rate-limit
 *
 * Resets rate limits for testing purposes.
 * Only available in non-production environments.
 *
 * Body:
 *   { identifier?: string, endpoint?: string }
 *   - If no identifier provided, uses the caller's IP
 *   - If no endpoint provided, resets 'auth:login' and 'auth:signup'
 */
export async function handleDebugResetRateLimit(req, res, readJsonBody) {
  if (process.env.NODE_ENV === 'production') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Not found' }));
    return;
  }

  try {
    let body = {};
    try {
      body = await readJsonBody(req) || {};
    } catch {
      // Empty body is fine
    }

    // Get caller's IP if no identifier provided
    const ip = body.identifier ||
               req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               req.socket?.remoteAddress ||
               '127.0.0.1';

    // Default to auth endpoints if none specified
    const endpoints = body.endpoint
      ? [body.endpoint]
      : ['auth:login', 'auth:signup'];

    const results = [];
    for (const endpoint of endpoints) {
      await resetRateLimit(ip, endpoint);
      results.push({ identifier: ip, endpoint, reset: true });
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      message: 'Rate limits reset',
      results,
    }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Failed to reset rate limits',
      message: error.message,
    }));
  }
}
