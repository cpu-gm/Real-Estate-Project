/**
 * Rate Limiter Service (T1.4 - P1 Security Sprint)
 *
 * Redis-backed rate limiting for authentication and sensitive endpoints.
 * Provides brute force protection with configurable thresholds.
 *
 * SECURITY: Prevents:
 * - Brute force password attacks
 * - Credential stuffing
 * - Account enumeration via timing attacks
 * - Magic link abuse
 *
 * Configuration (via environment variables):
 * - REDIS_URL: Redis connection string (default: redis://localhost:6379)
 * - RATE_LIMIT_WINDOW_MS: Time window in ms (default: 900000 = 15 min)
 * - RATE_LIMIT_MAX_ATTEMPTS: Max attempts per window (default: 5)
 */

import Redis from 'ioredis';
import { getPrisma } from '../db.js';

// =============================================================================
// Configuration
// =============================================================================

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10);  // 15 min
const MAX_ATTEMPTS = parseInt(process.env.RATE_LIMIT_MAX_ATTEMPTS || '5', 10);

// Endpoint-specific limits (can be more lenient for GP operations)
const ENDPOINT_LIMITS = {
  'auth:login': { maxAttempts: MAX_ATTEMPTS, windowMs: WINDOW_MS },
  'auth:signup': { maxAttempts: MAX_ATTEMPTS, windowMs: WINDOW_MS },
  'lp-portal:session': { maxAttempts: MAX_ATTEMPTS, windowMs: WINDOW_MS },
  'magic-links:create': { maxAttempts: 10, windowMs: 60 * 60 * 1000 },  // 10/hour for GPs
  'magic-links:validate': { maxAttempts: MAX_ATTEMPTS, windowMs: WINDOW_MS },
};

// =============================================================================
// Redis Connection
// =============================================================================

let redis = null;
let redisAvailable = false;

// Structured logging
function log(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${timestamp}] [${level}] [RATE-LIMITER] ${message}${metaStr}`);
}

/**
 * Initialize Redis connection
 * Gracefully handles connection failures - falls back to in-memory if needed
 */
async function initRedis() {
  if (redis) return redis;

  try {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          log('WARN', 'Redis connection failed after retries, rate limiting degraded');
          redisAvailable = false;
          return null;  // Stop retrying
        }
        return Math.min(times * 100, 3000);
      },
      lazyConnect: true,
    });

    redis.on('connect', () => {
      log('INFO', 'Redis connected successfully');
      redisAvailable = true;
    });

    redis.on('error', (err) => {
      log('ERROR', 'Redis error', { error: err.message });
      redisAvailable = false;
    });

    redis.on('close', () => {
      log('WARN', 'Redis connection closed');
      redisAvailable = false;
    });

    await redis.connect();
    redisAvailable = true;
    return redis;
  } catch (error) {
    log('ERROR', 'Failed to initialize Redis', { error: error.message });
    redisAvailable = false;
    return null;
  }
}

// In-memory fallback when Redis is unavailable
const inMemoryStore = new Map();

/**
 * Clean up old in-memory entries
 */
function cleanupInMemory() {
  const now = Date.now();
  for (const [key, value] of inMemoryStore.entries()) {
    if (value.expiresAt && value.expiresAt < now) {
      inMemoryStore.delete(key);
    }
  }
}

// Periodic cleanup every minute
setInterval(cleanupInMemory, 60000);

// =============================================================================
// Rate Limiting Functions
// =============================================================================

/**
 * Check if an action is allowed under rate limits
 *
 * @param {string} identifier - Unique identifier (IP address, user ID, or token)
 * @param {string} endpoint - Endpoint being accessed (e.g., "auth:login")
 * @returns {Promise<Object>} Rate limit result
 */
export async function checkRateLimit(identifier, endpoint) {
  const limits = ENDPOINT_LIMITS[endpoint] || { maxAttempts: MAX_ATTEMPTS, windowMs: WINDOW_MS };
  const key = `ratelimit:${endpoint}:${identifier}`;

  let attempts = 0;
  let ttl = limits.windowMs;

  try {
    // Try Redis first
    if (redisAvailable && redis) {
      attempts = await redis.incr(key);

      if (attempts === 1) {
        // First attempt - set expiry
        await redis.pexpire(key, limits.windowMs);
        ttl = limits.windowMs;
      } else {
        // Get remaining TTL
        ttl = await redis.pttl(key);
        if (ttl < 0) {
          // Key doesn't have expiry (shouldn't happen), set it
          await redis.pexpire(key, limits.windowMs);
          ttl = limits.windowMs;
        }
      }
    } else {
      // Fallback to in-memory
      const existing = inMemoryStore.get(key);
      const now = Date.now();

      if (existing && existing.expiresAt > now) {
        attempts = existing.attempts + 1;
        existing.attempts = attempts;
        ttl = existing.expiresAt - now;
      } else {
        attempts = 1;
        inMemoryStore.set(key, {
          attempts: 1,
          expiresAt: now + limits.windowMs,
        });
        ttl = limits.windowMs;
      }
    }
  } catch (error) {
    log('ERROR', 'Rate limit check failed', { error: error.message, identifier, endpoint });
    // On error, allow the request but log it
    return {
      allowed: true,
      attempts: 0,
      maxAttempts: limits.maxAttempts,
      retryAfterMs: 0,
      retryAfterSeconds: 0,
      error: true,
    };
  }

  const allowed = attempts <= limits.maxAttempts;

  // Log security event to database
  try {
    const prisma = getPrisma();
    await prisma.securityEvent.create({
      data: {
        type: allowed ? 'RATE_LIMIT_CHECK' : 'RATE_LIMIT_EXCEEDED',
        identifier,
        endpoint,
        attempts,
        allowed,
        ipAddress: identifier.includes(':') ? identifier.split(':')[0] : identifier,
        timestamp: new Date(),
      },
    });
  } catch (dbError) {
    // Don't fail the request if logging fails
    log('ERROR', 'Failed to log security event', { error: dbError.message });
  }

  return {
    allowed,
    attempts,
    maxAttempts: limits.maxAttempts,
    retryAfterMs: allowed ? 0 : ttl,
    retryAfterSeconds: allowed ? 0 : Math.ceil(ttl / 1000),
  };
}

/**
 * Reset rate limit for an identifier (e.g., after successful login)
 *
 * @param {string} identifier - Unique identifier
 * @param {string} endpoint - Endpoint
 */
export async function resetRateLimit(identifier, endpoint) {
  const key = `ratelimit:${endpoint}:${identifier}`;

  try {
    if (redisAvailable && redis) {
      await redis.del(key);
    } else {
      inMemoryStore.delete(key);
    }
    log('INFO', 'Rate limit reset', { identifier, endpoint });
  } catch (error) {
    log('ERROR', 'Failed to reset rate limit', { error: error.message, identifier, endpoint });
  }
}

/**
 * Get current rate limit status without incrementing
 *
 * @param {string} identifier - Unique identifier
 * @param {string} endpoint - Endpoint
 * @returns {Promise<Object>} Current status
 */
export async function getRateLimitStatus(identifier, endpoint) {
  const limits = ENDPOINT_LIMITS[endpoint] || { maxAttempts: MAX_ATTEMPTS, windowMs: WINDOW_MS };
  const key = `ratelimit:${endpoint}:${identifier}`;

  try {
    let attempts = 0;
    let ttl = 0;

    if (redisAvailable && redis) {
      const value = await redis.get(key);
      attempts = value ? parseInt(value, 10) : 0;
      ttl = await redis.pttl(key);
      if (ttl < 0) ttl = 0;
    } else {
      const existing = inMemoryStore.get(key);
      if (existing && existing.expiresAt > Date.now()) {
        attempts = existing.attempts;
        ttl = existing.expiresAt - Date.now();
      }
    }

    return {
      attempts,
      maxAttempts: limits.maxAttempts,
      remaining: Math.max(0, limits.maxAttempts - attempts),
      resetsInMs: ttl,
      resetsInSeconds: Math.ceil(ttl / 1000),
    };
  } catch (error) {
    log('ERROR', 'Failed to get rate limit status', { error: error.message });
    return {
      attempts: 0,
      maxAttempts: limits.maxAttempts,
      remaining: limits.maxAttempts,
      resetsInMs: 0,
      resetsInSeconds: 0,
      error: true,
    };
  }
}

/**
 * Log a security event without affecting rate limits
 * Use for tracking successful operations or other security-relevant events
 *
 * @param {Object} event - Security event details
 */
export async function logSecurityEvent(event) {
  try {
    const prisma = getPrisma();
    await prisma.securityEvent.create({
      data: {
        type: event.type,
        identifier: event.identifier || '',
        endpoint: event.endpoint || '',
        allowed: event.allowed !== false,
        actorId: event.actorId || null,
        dealId: event.dealId || null,
        ipAddress: event.ipAddress || null,
        userAgent: event.userAgent || null,
        metadata: event.metadata ? JSON.stringify(event.metadata) : null,
        timestamp: new Date(),
      },
    });
  } catch (error) {
    log('ERROR', 'Failed to log security event', { error: error.message, event });
  }
}

// Initialize Redis on module load
initRedis().catch((err) => {
  log('WARN', 'Redis initialization deferred', { error: err.message });
});

// =============================================================================
// Exports
// =============================================================================

export {
  initRedis,
  WINDOW_MS,
  MAX_ATTEMPTS,
  ENDPOINT_LIMITS,
};
