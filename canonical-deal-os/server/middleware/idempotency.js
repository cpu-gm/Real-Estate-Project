/**
 * Idempotency Middleware
 *
 * Sprint 2, Day 11: Production Readiness
 *
 * This middleware provides idempotency support for financial operations:
 * - Capital calls
 * - Distributions
 *
 * Pattern extracted from server/routes/actions.js (existing idempotency implementation)
 *
 * Key Invariant:
 * Financial operations with the same idempotency key MUST return
 * the same result, regardless of how many times they are called.
 *
 * Usage:
 * ```javascript
 * import { idempotencyMiddleware, checkIdempotency } from '../middleware/idempotency.js';
 *
 * // Apply middleware to route
 * router.post('/capital-calls', idempotencyMiddleware('capital-call'), async (req, res) => {
 *   // Check for cached response
 *   const cached = await checkIdempotency(req);
 *   if (cached) {
 *     return res.status(200).json(cached);
 *   }
 *   // ... create capital call ...
 *   // Store for idempotency
 *   await storeIdempotencyResult(req, result);
 *   res.status(201).json(result);
 * });
 * ```
 */

import crypto from 'crypto';

// In-memory store for idempotency records
// In production, this would be Redis or a database table
const idempotencyStore = new Map();

// Default TTL: 24 hours
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

// Cleanup interval: 1 hour
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Generate SHA-256 hash of payload for deduplication
 */
function hashPayload(payload) {
  if (!payload || Object.keys(payload).length === 0) {
    return 'empty';
  }
  const normalized = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

/**
 * Build full idempotency key including context
 */
function buildFullKey(prefix, idempotencyKey, organizationId, resourceId, payloadHash) {
  return `${prefix}:${organizationId}:${resourceId || 'global'}:${idempotencyKey}:${payloadHash}`;
}

/**
 * Cleanup expired records periodically
 */
function cleanupExpiredRecords() {
  const now = Date.now();
  for (const [key, record] of idempotencyStore.entries()) {
    if (now - record.createdAt > record.ttl) {
      idempotencyStore.delete(key);
    }
  }
}

// Start cleanup interval
let cleanupInterval = null;
function startCleanupInterval() {
  if (!cleanupInterval) {
    cleanupInterval = setInterval(cleanupExpiredRecords, CLEANUP_INTERVAL_MS);
    // Don't block process exit
    cleanupInterval.unref();
  }
}

/**
 * Idempotency middleware factory
 *
 * @param {string} prefix - Operation prefix (e.g., 'capital-call', 'distribution')
 * @param {object} options - Configuration options
 * @param {number} options.ttl - TTL in milliseconds (default: 24 hours)
 * @param {function} options.getResourceId - Function to extract resource ID from request
 * @returns {function} Express middleware
 */
export function idempotencyMiddleware(prefix, options = {}) {
  const {
    ttl = DEFAULT_TTL_MS,
    getResourceId = (req) => req.params.dealId || req.params.id
  } = options;

  startCleanupInterval();

  return (req, res, next) => {
    // Extract idempotency key from header
    const idempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];

    if (!idempotencyKey) {
      // No idempotency key provided - proceed without idempotency
      req.idempotency = { enabled: false };
      return next();
    }

    // Build context
    const organizationId = req.authUser?.organizationId || 'unknown';
    const resourceId = getResourceId(req);
    const payloadHash = hashPayload(req.body);
    const fullKey = buildFullKey(prefix, idempotencyKey, organizationId, resourceId, payloadHash);

    // Check for existing record
    const existing = idempotencyStore.get(fullKey);
    if (existing) {
      const age = Date.now() - existing.createdAt;
      if (age < existing.ttl) {
        // Return cached response
        req.idempotency = {
          enabled: true,
          hit: true,
          key: idempotencyKey,
          fullKey
        };

        // Log idempotency hit
        console.log(`[IDEMPOTENCY] Cache hit for ${prefix}`, {
          key: idempotencyKey,
          age: `${Math.round(age / 1000)}s`,
          resourceId
        });

        return res.status(200).json(existing.result);
      } else {
        // Expired - remove and proceed
        idempotencyStore.delete(fullKey);
      }
    }

    // Store idempotency context for later use
    req.idempotency = {
      enabled: true,
      hit: false,
      key: idempotencyKey,
      fullKey,
      ttl,
      prefix
    };

    // Override res.json to capture and store the response
    const originalJson = res.json.bind(res);
    res.json = function (data) {
      // Only store successful responses (2xx status)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        idempotencyStore.set(fullKey, {
          createdAt: Date.now(),
          ttl,
          result: data,
          statusCode: res.statusCode
        });

        console.log(`[IDEMPOTENCY] Stored result for ${prefix}`, {
          key: idempotencyKey,
          statusCode: res.statusCode,
          resourceId
        });
      }
      return originalJson(data);
    };

    next();
  };
}

/**
 * Check if request has cached idempotency result
 * Use this in route handler to check for cached result
 *
 * @param {object} req - Express request
 * @returns {object|null} Cached result or null
 */
export function checkIdempotency(req) {
  if (req.idempotency?.hit) {
    return req.idempotency.cachedResult;
  }
  return null;
}

/**
 * Store idempotency result manually
 * Use this when you need more control over what gets stored
 *
 * @param {object} req - Express request with idempotency context
 * @param {object} result - Result to store
 */
export function storeIdempotencyResult(req, result) {
  if (req.idempotency?.enabled && !req.idempotency.hit) {
    idempotencyStore.set(req.idempotency.fullKey, {
      createdAt: Date.now(),
      ttl: req.idempotency.ttl,
      result,
      statusCode: 201
    });
  }
}

/**
 * Get idempotency store stats (for debugging/monitoring)
 */
export function getIdempotencyStats() {
  const now = Date.now();
  let activeCount = 0;
  let expiredCount = 0;

  for (const [, record] of idempotencyStore.entries()) {
    if (now - record.createdAt < record.ttl) {
      activeCount++;
    } else {
      expiredCount++;
    }
  }

  return {
    totalRecords: idempotencyStore.size,
    activeRecords: activeCount,
    expiredRecords: expiredCount,
    memoryUsage: process.memoryUsage().heapUsed
  };
}

/**
 * Clear all idempotency records (for testing)
 */
export function clearIdempotencyStore() {
  idempotencyStore.clear();
}

/**
 * Clear records for a specific organization (for testing)
 */
export function clearOrganizationRecords(organizationId) {
  for (const key of idempotencyStore.keys()) {
    if (key.includes(`:${organizationId}:`)) {
      idempotencyStore.delete(key);
    }
  }
}

export default idempotencyMiddleware;
