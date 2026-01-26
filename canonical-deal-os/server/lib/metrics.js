/**
 * Prometheus Metrics
 * Sprint 2: Observability
 *
 * Provides application metrics in Prometheus format.
 * Exposes /metrics endpoint for scraping.
 */

import client from 'prom-client';

const DEBUG = process.env.DEBUG_METRICS === 'true';

function log(level, message, context = {}) {
  if (DEBUG || level === 'ERROR') {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      component: 'metrics',
      message,
      ...context
    }));
  }
}

// Create a registry for our metrics
const register = new client.Registry();

// Add default metrics (CPU, memory, event loop)
client.collectDefaultMetrics({ register });

// Custom metrics

// HTTP request duration histogram
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'path', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10]
});
register.registerMetric(httpRequestDuration);

// HTTP request counter
const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status_code']
});
register.registerMetric(httpRequestTotal);

// Active connections gauge
const activeConnections = new client.Gauge({
  name: 'http_active_connections',
  help: 'Number of active HTTP connections'
});
register.registerMetric(activeConnections);

// Database query duration
const dbQueryDuration = new client.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'table'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1]
});
register.registerMetric(dbQueryDuration);

// LLM call metrics
const llmCallDuration = new client.Histogram({
  name: 'llm_call_duration_seconds',
  help: 'Duration of LLM API calls in seconds',
  labelNames: ['model', 'endpoint'],
  buckets: [0.5, 1, 2, 5, 10, 30, 60]
});
register.registerMetric(llmCallDuration);

const llmTokensUsed = new client.Counter({
  name: 'llm_tokens_used_total',
  help: 'Total tokens used in LLM calls',
  labelNames: ['model', 'type']  // type: prompt, completion
});
register.registerMetric(llmTokensUsed);

// Error counter
const errorTotal = new client.Counter({
  name: 'errors_total',
  help: 'Total number of errors',
  labelNames: ['type', 'path']
});
register.registerMetric(errorTotal);

// Business metrics
const dealCreatedTotal = new client.Counter({
  name: 'deals_created_total',
  help: 'Total number of deals created'
});
register.registerMetric(dealCreatedTotal);

const distributionTotal = new client.Counter({
  name: 'distributions_total',
  help: 'Total number of distributions processed'
});
register.registerMetric(distributionTotal);

const capitalCallTotal = new client.Counter({
  name: 'capital_calls_total',
  help: 'Total number of capital calls created'
});
register.registerMetric(capitalCallTotal);

const lpInvitationTotal = new client.Counter({
  name: 'lp_invitations_total',
  help: 'Total number of LP invitations sent',
  labelNames: ['status']  // sent, accepted, expired
});
register.registerMetric(lpInvitationTotal);

/**
 * Normalize path for consistent labeling
 * Replace UUIDs and IDs with placeholders
 */
function normalizePath(path) {
  if (!path) return '/unknown';

  return path
    // Replace UUIDs (standard format)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    // Replace numeric IDs
    .replace(/\/\d+/g, '/:id')
    // Remove query strings
    .split('?')[0]
    // Normalize trailing slashes
    .replace(/\/+$/, '');
}

/**
 * Record HTTP request metrics
 * @param {string} method - HTTP method
 * @param {string} path - Request path
 * @param {number} statusCode - Response status code
 * @param {number} durationMs - Request duration in milliseconds
 */
export function recordHttpRequest(method, path, statusCode, durationMs) {
  const normalizedPath = normalizePath(path);
  const durationSeconds = durationMs / 1000;

  httpRequestDuration.observe(
    { method, path: normalizedPath, status_code: String(statusCode) },
    durationSeconds
  );

  httpRequestTotal.inc({ method, path: normalizedPath, status_code: String(statusCode) });

  log('DEBUG', 'Recorded HTTP request', {
    method, path: normalizedPath, statusCode, durationMs
  });
}

/**
 * Record database query metrics
 * @param {string} operation - Query operation (SELECT, INSERT, UPDATE, DELETE)
 * @param {string} table - Table name
 * @param {number} durationMs - Query duration in milliseconds
 */
export function recordDbQuery(operation, table, durationMs) {
  dbQueryDuration.observe(
    { operation, table },
    durationMs / 1000
  );

  log('DEBUG', 'Recorded DB query', { operation, table, durationMs });
}

/**
 * Record LLM call metrics
 * @param {string} model - Model name (e.g., gpt-4, gpt-4o-mini)
 * @param {string} endpoint - API endpoint
 * @param {number} durationMs - Call duration in milliseconds
 * @param {number} promptTokens - Number of prompt tokens
 * @param {number} completionTokens - Number of completion tokens
 */
export function recordLlmCall(model, endpoint, durationMs, promptTokens = 0, completionTokens = 0) {
  llmCallDuration.observe({ model, endpoint }, durationMs / 1000);

  if (promptTokens > 0) {
    llmTokensUsed.inc({ model, type: 'prompt' }, promptTokens);
  }
  if (completionTokens > 0) {
    llmTokensUsed.inc({ model, type: 'completion' }, completionTokens);
  }

  log('DEBUG', 'Recorded LLM call', { model, endpoint, durationMs, promptTokens, completionTokens });
}

/**
 * Record error
 * @param {string} type - Error type/code
 * @param {string} path - Request path where error occurred
 */
export function recordError(type, path) {
  errorTotal.inc({ type: type || 'UNKNOWN', path: normalizePath(path) });
  log('DEBUG', 'Recorded error', { type, path: normalizePath(path) });
}

/**
 * Increment active connections
 */
export function incrementConnections() {
  activeConnections.inc();
}

/**
 * Decrement active connections
 */
export function decrementConnections() {
  activeConnections.dec();
}

/**
 * Record deal creation
 */
export function recordDealCreated() {
  dealCreatedTotal.inc();
  log('DEBUG', 'Recorded deal creation');
}

/**
 * Record distribution
 */
export function recordDistribution() {
  distributionTotal.inc();
  log('DEBUG', 'Recorded distribution');
}

/**
 * Record capital call
 */
export function recordCapitalCall() {
  capitalCallTotal.inc();
  log('DEBUG', 'Recorded capital call');
}

/**
 * Record LP invitation
 * @param {string} status - Invitation status (sent, accepted, expired)
 */
export function recordLpInvitation(status = 'sent') {
  lpInvitationTotal.inc({ status });
  log('DEBUG', 'Recorded LP invitation', { status });
}

// =============================================================================
// BUSINESS EVENT METRICS - Sprint 5
// =============================================================================

// Deal state transitions
const dealStateTransitions = new client.Counter({
  name: 'deal_state_transitions_total',
  help: 'Deal state machine transitions',
  labelNames: ['from_state', 'to_state', 'action']
});
register.registerMetric(dealStateTransitions);

// Authority gate evaluations
const authorityGateEvaluations = new client.Counter({
  name: 'authority_gate_evaluations_total',
  help: 'Authority gate check results',
  labelNames: ['gate', 'result']
});
register.registerMetric(authorityGateEvaluations);

// Waterfall calculations
const waterfallCalculations = new client.Histogram({
  name: 'waterfall_calculation_duration_seconds',
  help: 'Duration of waterfall calculations',
  labelNames: ['deal_type', 'lp_count'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});
register.registerMetric(waterfallCalculations);

// Document generation
const documentGenerationTotal = new client.Counter({
  name: 'document_generation_total',
  help: 'Documents generated',
  labelNames: ['doc_type', 'status']
});
register.registerMetric(documentGenerationTotal);

// External service call latency
const externalServiceLatency = new client.Histogram({
  name: 'external_service_latency_seconds',
  help: 'Latency of calls to external services',
  labelNames: ['service', 'endpoint'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30]
});
register.registerMetric(externalServiceLatency);

// Circuit breaker state changes
const circuitBreakerStateChanges = new client.Counter({
  name: 'circuit_breaker_state_changes_total',
  help: 'Circuit breaker state transitions',
  labelNames: ['service', 'from_state', 'to_state']
});
register.registerMetric(circuitBreakerStateChanges);

/**
 * Record deal state transition
 * @param {string} fromState - Previous state
 * @param {string} toState - New state
 * @param {string} action - Action that triggered transition
 */
export function recordStateTransition(fromState, toState, action) {
  dealStateTransitions.inc({ from_state: fromState, to_state: toState, action });
  log('DEBUG', 'Recorded state transition', { fromState, toState, action });
}

/**
 * Record authority gate evaluation
 * @param {string} gate - Gate name (e.g., 'SENIOR_REVIEW', 'COMPLIANCE_CHECK')
 * @param {boolean} passed - Whether the gate passed
 */
export function recordAuthorityGate(gate, passed) {
  authorityGateEvaluations.inc({ gate, result: passed ? 'allowed' : 'blocked' });
  log('DEBUG', 'Recorded authority gate', { gate, passed });
}

/**
 * Record waterfall calculation timing
 * @param {string} dealType - Type of deal
 * @param {number} lpCount - Number of LPs in calculation
 * @param {number} durationMs - Calculation duration in milliseconds
 */
export function recordWaterfallCalculation(dealType, lpCount, durationMs) {
  // Bucket LP count for cardinality control
  const lpBucket = lpCount <= 5 ? '1-5' : lpCount <= 20 ? '6-20' : '20+';
  waterfallCalculations.observe({ deal_type: dealType, lp_count: lpBucket }, durationMs / 1000);
  log('DEBUG', 'Recorded waterfall calculation', { dealType, lpCount, durationMs });
}

/**
 * Record document generation
 * @param {string} docType - Document type (e.g., 'CAPITAL_CALL_NOTICE', 'DISTRIBUTION_STATEMENT')
 * @param {string} status - Generation status ('success', 'failure')
 */
export function recordDocumentGeneration(docType, status) {
  documentGenerationTotal.inc({ doc_type: docType, status });
  log('DEBUG', 'Recorded document generation', { docType, status });
}

/**
 * Record external service call
 * @param {string} service - Service name (e.g., 'kernel', 'openai', 'sendgrid')
 * @param {string} endpoint - API endpoint
 * @param {number} durationMs - Call duration in milliseconds
 */
export function logExternalCall(service, endpoint, durationMs, statusCode = null, meta = {}) {
  externalServiceLatency.observe({ service, endpoint: normalizePath(endpoint) }, durationMs / 1000);
  log('DEBUG', 'Recorded external call', { service, endpoint, durationMs, statusCode, ...meta });
}

/**
 * Record circuit breaker state change
 * @param {string} service - Service name
 * @param {string} fromState - Previous state (CLOSED, OPEN, HALF_OPEN)
 * @param {string} toState - New state
 */
export function recordCircuitBreakerChange(service, fromState, toState) {
  circuitBreakerStateChanges.inc({ service, from_state: fromState, to_state: toState });
  log('INFO', 'Circuit breaker state changed', { service, fromState, toState });
}

/**
 * Get metrics in Prometheus format
 * @returns {Promise<string>} Prometheus-formatted metrics
 */
export async function getMetrics() {
  return await register.metrics();
}

/**
 * Get content type for metrics response
 * @returns {string} Content type header value
 */
export function getMetricsContentType() {
  return register.contentType;
}

/**
 * Get current metric values (for debugging/testing)
 * @returns {Promise<Object>} Parsed metric values
 */
export async function getMetricValues() {
  const metrics = await register.getMetricsAsJSON();
  return metrics;
}

/**
 * Reset all metrics (for testing)
 */
export function resetMetrics() {
  register.resetMetrics();
  log('DEBUG', 'All metrics reset');
}

// Export the registry for advanced use cases
export { register, normalizePath };
