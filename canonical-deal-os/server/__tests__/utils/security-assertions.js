/**
 * Security Test Assertions
 *
 * Sprint 1: Production Readiness
 * Purpose: Reusable assertions for security invariant testing
 *
 * Key Invariants Tested:
 * - Tenancy isolation (cross-org access returns 404)
 * - Authority enforcement (role-based access)
 * - Request ID correlation
 * - Audit logging completeness
 */

/**
 * Assert that cross-org access returns 404 (not 403)
 *
 * SECURITY INVARIANT: Cross-org requests must return 404 to prevent
 * resource enumeration attacks. A 403 would confirm the resource exists.
 *
 * @param {object} response - HTTP response object
 * @param {string} context - Description for error messages
 */
export function assertCrossOrgDenied(response, context = '') {
  const prefix = context ? `[${context}] ` : '';

  // CRITICAL: Must be 404, not 403
  if (response.status === 403) {
    throw new Error(
      `${prefix}SECURITY VIOLATION: Cross-org access returned 403 instead of 404. ` +
        'This reveals resource existence and enables enumeration attacks.'
    );
  }

  if (response.status !== 404) {
    throw new Error(
      `${prefix}Expected 404 for cross-org access, got ${response.status}. ` +
        `Body: ${JSON.stringify(response.body || response.data)}`
    );
  }

  // Verify error message doesn't leak info
  const body = response.body || response.data || {};
  const errorMessage = (body.error || body.message || '').toLowerCase();

  if (errorMessage.includes('forbidden') || errorMessage.includes('permission')) {
    throw new Error(
      `${prefix}SECURITY VIOLATION: Error message reveals access denial: "${errorMessage}". ` +
        'Use generic "not found" message to prevent enumeration.'
    );
  }

  return true;
}

/**
 * Assert that same-org access is allowed
 *
 * @param {object} response - HTTP response object
 * @param {string} context - Description for error messages
 */
export function assertSameOrgAllowed(response, context = '') {
  const prefix = context ? `[${context}] ` : '';

  if (response.status === 404) {
    throw new Error(
      `${prefix}Same-org access returned 404 unexpectedly. ` +
        `Body: ${JSON.stringify(response.body || response.data)}`
    );
  }

  if (response.status === 403) {
    throw new Error(
      `${prefix}Same-org access was forbidden (403). ` +
        `Body: ${JSON.stringify(response.body || response.data)}`
    );
  }

  if (response.status >= 400) {
    throw new Error(
      `${prefix}Same-org access failed with status ${response.status}. ` +
        `Body: ${JSON.stringify(response.body || response.data)}`
    );
  }

  return true;
}

/**
 * Assert that unauthenticated access returns 401
 *
 * @param {object} response - HTTP response object
 * @param {string} context - Description for error messages
 */
export function assertAuthRequired(response, context = '') {
  const prefix = context ? `[${context}] ` : '';

  if (response.status !== 401) {
    throw new Error(
      `${prefix}Expected 401 for unauthenticated access, got ${response.status}. ` +
        `Body: ${JSON.stringify(response.body || response.data)}`
    );
  }

  return true;
}

/**
 * Assert that insufficient role returns 403
 *
 * Note: This is different from cross-org denial. Role-based denial
 * can return 403 because it doesn't leak resource existence.
 *
 * @param {object} response - HTTP response object
 * @param {string} requiredRole - The role that was required
 * @param {string} context - Description for error messages
 */
export function assertRoleDenied(response, requiredRole, context = '') {
  const prefix = context ? `[${context}] ` : '';

  if (response.status !== 403) {
    throw new Error(
      `${prefix}Expected 403 for insufficient role (requires ${requiredRole}), ` +
        `got ${response.status}. Body: ${JSON.stringify(response.body || response.data)}`
    );
  }

  return true;
}

/**
 * Assert that a request has proper request ID
 *
 * @param {object} request - Request object or headers
 * @param {string} context - Description for error messages
 */
export function assertHasRequestId(request, context = '') {
  const prefix = context ? `[${context}] ` : '';
  const headers = request.headers || request;

  const requestId =
    headers['x-request-id'] || headers['X-Request-ID'] || headers.requestId;

  if (!requestId) {
    throw new Error(`${prefix}Missing request ID in headers`);
  }

  // Request IDs should be non-empty strings
  if (typeof requestId !== 'string' || requestId.trim() === '') {
    throw new Error(`${prefix}Invalid request ID: ${requestId}`);
  }

  return requestId;
}

/**
 * Assert that response includes correlation ID matching request
 *
 * @param {object} request - Original request
 * @param {object} response - Response object or headers
 * @param {string} context - Description for error messages
 */
export function assertRequestIdCorrelation(request, response, context = '') {
  const prefix = context ? `[${context}] ` : '';

  const reqHeaders = request.headers || request;
  const resHeaders = response.headers || response;

  const requestId = reqHeaders['x-request-id'] || reqHeaders['X-Request-ID'];
  const responseId = resHeaders['x-request-id'] || resHeaders['X-Request-ID'];

  if (!requestId) {
    throw new Error(`${prefix}Request missing X-Request-ID header`);
  }

  if (!responseId) {
    throw new Error(`${prefix}Response missing X-Request-ID header`);
  }

  if (requestId !== responseId) {
    throw new Error(
      `${prefix}Request ID mismatch: request=${requestId}, response=${responseId}`
    );
  }

  return true;
}

/**
 * Assert that audit log was created for an action
 *
 * @param {PrismaClient} prisma - Prisma client
 * @param {object} criteria - Search criteria
 * @param {string} context - Description for error messages
 */
export async function assertAuditLogCreated(prisma, criteria, context = '') {
  const prefix = context ? `[${context}] ` : '';

  const { actorId, action, targetId, afterTime } = criteria;

  const where = {};
  if (actorId) where.actorId = actorId;
  if (action) where.action = action;
  if (targetId) where.targetUserId = targetId;
  if (afterTime) where.createdAt = { gte: afterTime };

  const log = await prisma.permissionAuditLog.findFirst({
    where,
    orderBy: { createdAt: 'desc' }
  });

  if (!log) {
    throw new Error(
      `${prefix}Expected audit log not found. Criteria: ${JSON.stringify(criteria)}`
    );
  }

  return log;
}

/**
 * Assert that no audit log was created (for operations that shouldn't log)
 *
 * @param {PrismaClient} prisma - Prisma client
 * @param {object} criteria - Search criteria
 * @param {string} context - Description for error messages
 */
export async function assertNoAuditLog(prisma, criteria, context = '') {
  const prefix = context ? `[${context}] ` : '';

  const { actorId, action, afterTime } = criteria;

  const where = {};
  if (actorId) where.actorId = actorId;
  if (action) where.action = action;
  if (afterTime) where.createdAt = { gte: afterTime };

  const log = await prisma.permissionAuditLog.findFirst({
    where,
    orderBy: { createdAt: 'desc' }
  });

  if (log) {
    throw new Error(
      `${prefix}Unexpected audit log found: ${JSON.stringify(log)}`
    );
  }

  return true;
}

/**
 * Assert that response doesn't contain sensitive fields
 *
 * @param {object} data - Response data to check
 * @param {array} sensitiveFields - Field names that should not be present
 * @param {string} context - Description for error messages
 */
export function assertNoSensitiveData(data, sensitiveFields, context = '') {
  const prefix = context ? `[${context}] ` : '';

  const found = [];

  function checkObject(obj, path = '') {
    if (!obj || typeof obj !== 'object') return;

    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;

      if (sensitiveFields.includes(key.toLowerCase())) {
        found.push(currentPath);
      }

      if (typeof value === 'object' && value !== null) {
        checkObject(value, currentPath);
      }
    }
  }

  checkObject(data);

  if (found.length > 0) {
    throw new Error(
      `${prefix}Sensitive fields found in response: ${found.join(', ')}`
    );
  }

  return true;
}

/**
 * Assert Kernel is authoritative (BFF state matches Kernel)
 *
 * @param {object} bffState - BFF deal state
 * @param {object} kernelState - Kernel deal state
 * @param {string} context - Description for error messages
 */
export function assertKernelAuthoritative(bffState, kernelState, context = '') {
  const prefix = context ? `[${context}] ` : '';

  // Define expected mappings
  const stateMapping = {
    CLOSED: 'Closed',
    DEAD: 'Terminated',
    ON_HOLD: 'Frozen'
  };

  // Check critical states that must match
  const bffMapped = stateMapping[bffState];
  if (bffMapped && bffMapped !== kernelState) {
    throw new Error(
      `${prefix}State mismatch: BFF=${bffState} should map to Kernel=${bffMapped}, ` +
        `but Kernel=${kernelState}`
    );
  }

  return true;
}

/**
 * Create a test context logger for debugging
 *
 * @param {string} testName - Name of the test
 * @returns {object} Logger with contextual methods
 */
export function createTestLogger(testName) {
  const logs = [];

  return {
    log(message, data = {}) {
      logs.push({
        timestamp: new Date().toISOString(),
        test: testName,
        message,
        data
      });
    },

    error(message, error) {
      logs.push({
        timestamp: new Date().toISOString(),
        test: testName,
        level: 'ERROR',
        message,
        error: error?.message || error
      });
    },

    security(event, details) {
      logs.push({
        timestamp: new Date().toISOString(),
        test: testName,
        level: 'SECURITY',
        event,
        details
      });
    },

    print() {
      console.log(`\n=== Test Log: ${testName} ===`);
      logs.forEach((entry) => {
        const level = entry.level || 'INFO';
        console.log(`[${entry.timestamp}] [${level}] ${entry.message || entry.event}`);
        if (entry.data && Object.keys(entry.data).length > 0) {
          console.log('  ', JSON.stringify(entry.data));
        }
      });
      console.log('='.repeat(40) + '\n');
    },

    getLogs() {
      return logs;
    }
  };
}

export default {
  assertCrossOrgDenied,
  assertSameOrgAllowed,
  assertAuthRequired,
  assertRoleDenied,
  assertHasRequestId,
  assertRequestIdCorrelation,
  assertAuditLogCreated,
  assertNoAuditLog,
  assertNoSensitiveData,
  assertKernelAuthoritative,
  createTestLogger
};
