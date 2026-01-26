/**
 * Auth Test Helper - Sprint 4
 * JWT token generation for authenticated test requests
 *
 * Usage:
 *   import { generateGPToken, authHeader } from './utils/auth-helper.js';
 *   const token = generateGPToken({ organizationId: 'org-123' });
 *   const response = await fetch('/api/deals', { headers: authHeader(token) });
 */
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// Use a predictable test secret that meets the 64-byte requirement
// This is only for tests - never use in production
const TEST_JWT_SECRET = process.env.JWT_SECRET ||
  'test-secret-for-unit-tests-only-must-be-at-least-64-bytes-long-to-pass-validation';

// Test organization and user IDs for isolation
export const TEST_ORG_ID = 'test-org-' + crypto.randomBytes(8).toString('hex');
export const TEST_USER_ID = 'test-user-' + crypto.randomBytes(8).toString('hex');

/**
 * Generate a JWT token for testing
 * @param {Object} payload - Token payload overrides
 * @param {string} expiresIn - Token expiration (default: 1h)
 * @returns {string} JWT token
 */
export function generateTestToken(payload = {}, expiresIn = '1h') {
  const defaultPayload = {
    sub: TEST_USER_ID,
    userId: TEST_USER_ID,
    email: 'test@example.com',
    role: 'GP',
    organizationId: TEST_ORG_ID,
    status: 'ACTIVE',
    iat: Math.floor(Date.now() / 1000)
  };

  return jwt.sign(
    { ...defaultPayload, ...payload },
    TEST_JWT_SECRET,
    { expiresIn }
  );
}

/**
 * Generate a GP token with optional overrides
 */
export function generateGPToken(overrides = {}) {
  return generateTestToken({ role: 'GP', ...overrides });
}

/**
 * Generate an Admin token with optional overrides
 */
export function generateAdminToken(overrides = {}) {
  return generateTestToken({ role: 'Admin', ...overrides });
}

/**
 * Generate an LP token with optional overrides
 */
export function generateLPToken(overrides = {}) {
  return generateTestToken({ role: 'LP', ...overrides });
}

/**
 * Generate an Analyst token with optional overrides
 */
export function generateAnalystToken(overrides = {}) {
  return generateTestToken({ role: 'GP Analyst', ...overrides });
}

/**
 * Generate a Broker token with optional overrides
 */
export function generateBrokerToken(overrides = {}) {
  return generateTestToken({ role: 'Broker', ...overrides });
}

/**
 * Create authorization header object for fetch requests
 * @param {string} token - JWT token
 * @returns {Object} Headers object with Authorization
 */
export function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Create full headers object for JSON requests with auth
 * @param {string} token - JWT token
 * @returns {Object} Headers object with Content-Type and Authorization
 */
export function jsonAuthHeaders(token) {
  return {
    'Content-Type': 'application/json',
    ...authHeader(token)
  };
}

/**
 * Generate an expired token for testing auth rejection
 */
export function generateExpiredToken(payload = {}) {
  return generateTestToken(payload, '-1s');
}

/**
 * Generate a token for a different organization (for isolation tests)
 */
export function generateOtherOrgToken(overrides = {}) {
  return generateTestToken({
    organizationId: 'other-org-' + crypto.randomBytes(8).toString('hex'),
    ...overrides
  });
}

/**
 * Decode a token without verification (for test assertions)
 */
export function decodeToken(token) {
  return jwt.decode(token);
}

/**
 * Create a mock authenticated user object (matches extractAuthUser output)
 */
export function createMockAuthUser(overrides = {}) {
  return {
    id: TEST_USER_ID,
    email: 'test@example.com',
    role: 'GP',
    organizationId: TEST_ORG_ID,
    status: 'ACTIVE',
    ...overrides
  };
}

/**
 * Create test context with user and org IDs for test isolation
 */
export function createTestContext() {
  const orgId = 'test-org-' + crypto.randomBytes(8).toString('hex');
  const userId = 'test-user-' + crypto.randomBytes(8).toString('hex');

  return {
    orgId,
    userId,
    gpToken: generateTestToken({ organizationId: orgId, userId, sub: userId, role: 'GP' }),
    adminToken: generateTestToken({ organizationId: orgId, userId, sub: userId, role: 'Admin' }),
    lpToken: generateTestToken({ organizationId: orgId, userId, sub: userId, role: 'LP' }),
    otherOrgToken: generateOtherOrgToken(),
    authUser: createMockAuthUser({ id: userId, organizationId: orgId })
  };
}
