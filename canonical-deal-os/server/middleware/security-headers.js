/**
 * Security Headers Middleware
 * Sprint 1: Security Hardening
 *
 * Provides centralized security headers for all responses.
 * Includes debug logging for development troubleshooting.
 */

const DEBUG = process.env.DEBUG_SECURITY_HEADERS === 'true';

function log(level, message, context = {}) {
  if (DEBUG || level === 'ERROR') {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      component: 'security-headers',
      message,
      ...context
    }));
  }
}

/**
 * Standard security headers (non-CORS, non-CSP)
 * These are safe to apply to all responses
 */
export function getSecurityHeaders() {
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  };

  // HSTS only in production with HTTPS
  if (process.env.NODE_ENV === 'production') {
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  }

  log('DEBUG', 'Generated security headers', {
    headerCount: Object.keys(headers).length,
    env: process.env.NODE_ENV
  });

  return headers;
}

/**
 * Content Security Policy
 * Configured for API server (not serving HTML/scripts directly)
 */
export function getCspHeader() {
  const directives = [
    "default-src 'self'",
    "script-src 'none'",           // API doesn't serve scripts
    "style-src 'none'",            // API doesn't serve styles
    "img-src 'none'",              // API doesn't serve images
    "connect-src 'self'",          // Allow API calls to self
    "frame-ancestors 'none'",      // Prevent framing
    "form-action 'none'",          // API doesn't process forms
    "base-uri 'self'"              // Prevent base tag injection
  ];

  log('DEBUG', 'Generated CSP header', { directiveCount: directives.length });
  return directives.join('; ');
}

/**
 * Get all security headers including CSP
 */
export function getAllSecurityHeaders() {
  const headers = getSecurityHeaders();
  headers['Content-Security-Policy'] = getCspHeader();
  return headers;
}

/**
 * Apply security headers to response
 * Call this early in request handling
 */
export function applySecurityHeaders(res) {
  const headers = getAllSecurityHeaders();
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  log('DEBUG', 'Applied security headers to response');
}
