/**
 * CORS Middleware
 * Sprint 1: Security Hardening
 *
 * Centralized CORS configuration with environment-based origin validation.
 * Replaces 47 hardcoded instances of Access-Control-Allow-Origin: "*"
 */

const DEBUG = process.env.DEBUG_CORS === 'true';

function log(level, message, context = {}) {
  if (DEBUG || level === 'WARN' || level === 'ERROR') {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      component: 'cors',
      message,
      ...context
    }));
  }
}

// Parse allowed origins from environment
// Default: localhost origins for development
const DEFAULT_ORIGINS = 'http://localhost:5173,http://localhost:8787,http://localhost:3000';

/**
 * Get allowed origins (re-parsed on each call to support runtime config changes)
 */
function getAllowedOrigins() {
  return (process.env.CORS_ALLOWED_ORIGINS || DEFAULT_ORIGINS)
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
}

// Log initial configuration
log('INFO', 'CORS module loaded', {
  defaultOrigins: DEFAULT_ORIGINS.split(','),
  fromEnv: !!process.env.CORS_ALLOWED_ORIGINS
});

/**
 * Validate if origin is allowed
 * @param {string|null|undefined} origin - Origin header from request
 * @returns {boolean} Whether the origin is allowed
 */
export function isOriginAllowed(origin) {
  // No origin header = same-origin request or server-to-server
  if (!origin) {
    log('DEBUG', 'No origin header - allowing same-origin request');
    return true;
  }

  const allowedOrigins = getAllowedOrigins();
  const allowed = allowedOrigins.includes(origin);
  log('DEBUG', 'Origin check', { origin, allowed, allowedOrigins });
  return allowed;
}

/**
 * Get CORS headers for a request
 * @param {string|null|undefined} requestOrigin - Origin header from request
 * @returns {Object} CORS headers to apply
 */
export function getCorsHeaders(requestOrigin) {
  const allowedOrigins = getAllowedOrigins();

  // Determine which origin to return
  let origin;

  if (!requestOrigin) {
    // Same-origin or server-to-server - use first allowed origin
    origin = allowedOrigins[0];
  } else if (isOriginAllowed(requestOrigin)) {
    // Valid origin - reflect it back
    origin = requestOrigin;
  } else {
    // Invalid origin - return first allowed (browser will block)
    log('WARN', 'Invalid origin rejected', {
      requestOrigin,
      allowedOrigins
    });
    origin = allowedOrigins[0];
  }

  const headers = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-Id, X-Idempotency-Key',
    'Access-Control-Max-Age': '86400' // 24 hours preflight cache
  };

  log('DEBUG', 'Generated CORS headers', { origin, requestOrigin });
  return headers;
}

/**
 * Handle CORS preflight (OPTIONS) request
 * @param {Object} req - HTTP request
 * @param {Object} res - HTTP response
 */
export function handleCorsPrelight(req, res) {
  const origin = req.headers.origin;
  const corsHeaders = getCorsHeaders(origin);

  log('DEBUG', 'Handling preflight', {
    origin,
    method: req.headers['access-control-request-method'],
    headers: req.headers['access-control-request-headers']
  });

  res.writeHead(204, corsHeaders);
  res.end();
}

/**
 * Apply CORS headers to response
 * @param {Object} req - HTTP request
 * @param {Object} res - HTTP response
 */
export function applyCorsHeaders(req, res) {
  const origin = req.headers.origin;
  const corsHeaders = getCorsHeaders(origin);

  for (const [key, value] of Object.entries(corsHeaders)) {
    res.setHeader(key, value);
  }
}

/**
 * Get static CORS headers (for backward compatibility during migration)
 * Uses first allowed origin as default
 */
export function getDefaultCorsHeaders() {
  return getCorsHeaders(null);
}

// Export for backward compatibility during migration
export const corsHeaders = getDefaultCorsHeaders();
