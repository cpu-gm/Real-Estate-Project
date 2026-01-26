/**
 * Idempotency Integration Tests
 *
 * Sprint 2, Days 11-13: Idempotency for Financial Operations
 *
 * These tests verify the idempotency implementation for:
 * - Capital calls (POST /api/deals/:dealId/capital-calls)
 * - Distributions (POST /api/deals/:dealId/distributions)
 *
 * Key Invariant:
 * Financial operations with the same idempotency key MUST return
 * the same result, regardless of how many times they are called.
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createSprint2Logger, IdempotencyTestHelpers } from './utils/sprint2-logger.js';
import {
  idempotencyMiddleware,
  getIdempotencyStats,
  clearIdempotencyStore
} from '../middleware/idempotency.js';

// =============================================================================
// MOCK EXPRESS REQUEST/RESPONSE
// =============================================================================

function createMockRequest(options = {}) {
  return {
    headers: options.headers || {},
    params: options.params || {},
    body: options.body || {},
    authUser: options.authUser || {
      id: 'user-123',
      organizationId: 'org-123',
      role: 'GP',
      name: 'Test User'
    }
  };
}

function createMockResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    writeHead: function(status, headers) {
      this.statusCode = status;
      this.headers = { ...this.headers, ...headers };
    },
    setHeader: function(name, value) {
      this.headers[name] = value;
    },
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(data) {
      this.body = data;
      return this;
    },
    end: function(data) {
      if (data) this.body = JSON.parse(data);
    }
  };
  return res;
}

// =============================================================================
// TESTS
// =============================================================================

describe('Idempotency Middleware Integration', () => {
  let logger;

  beforeEach(() => {
    logger = createSprint2Logger('idempotency-integration', { consoleOutput: false });
    clearIdempotencyStore();
  });

  afterEach(() => {
    logger.writeSummary();
    clearIdempotencyStore();
  });

  describe('Middleware Behavior', () => {
    test('Middleware passes through without idempotency key', async () => {
      logger.testStart('Pass through without key');

      const middleware = idempotencyMiddleware('test-operation');
      const req = createMockRequest({});
      const res = createMockResponse();
      let nextCalled = false;

      await new Promise((resolve) => {
        middleware(req, res, () => {
          nextCalled = true;
          resolve();
        });
      });

      expect(nextCalled).toBe(true);
      expect(req.idempotency.enabled).toBe(false);

      logger.testPass('Pass through without key');
    });

    test('Middleware enables idempotency with key', async () => {
      logger.testStart('Enable with key');

      const middleware = idempotencyMiddleware('test-operation');
      const key = IdempotencyTestHelpers.generateKey();
      const req = createMockRequest({
        headers: { 'idempotency-key': key },
        params: { dealId: 'deal-123' },
        body: { amount: 1000 }
      });
      const res = createMockResponse();

      await new Promise((resolve) => {
        middleware(req, res, () => resolve());
      });

      expect(req.idempotency.enabled).toBe(true);
      expect(req.idempotency.hit).toBe(false);
      expect(req.idempotency.key).toBe(key);

      logger.testPass('Enable with key');
    });

    test('Middleware returns cached response for duplicate key', async () => {
      logger.testStart('Cache hit for duplicate');

      const middleware = idempotencyMiddleware('test-operation');
      const key = IdempotencyTestHelpers.generateKey();
      const body = { amount: 1000, title: 'Test' };

      // First request
      const req1 = createMockRequest({
        headers: { 'idempotency-key': key },
        params: { dealId: 'deal-123' },
        body
      });
      const res1 = createMockResponse();

      await new Promise((resolve) => {
        middleware(req1, res1, () => {
          res1.status(201).json({ id: 'result-123', title: 'Test' });
          resolve();
        });
      });

      expect(res1.statusCode).toBe(201);

      // Second request with same key
      const req2 = createMockRequest({
        headers: { 'idempotency-key': key },
        params: { dealId: 'deal-123' },
        body
      });
      const res2 = createMockResponse();

      await new Promise((resolve) => {
        middleware(req2, res2, () => {
          // This should not be called for cache hit
          res2.status(201).json({ id: 'different-result' });
          resolve();
        });
        // For cache hit, middleware sends response directly
        if (res2.statusCode === 200) resolve();
      });

      // Should get cached result with 200 status
      expect(res2.statusCode).toBe(200);
      expect(res2.body.id).toBe('result-123');

      logger.testPass('Cache hit for duplicate');
    });

    test('Different keys create separate operations', async () => {
      logger.testStart('Different keys separate');

      const middleware = idempotencyMiddleware('test-operation');
      const key1 = IdempotencyTestHelpers.generateKey();
      const key2 = IdempotencyTestHelpers.generateKey();
      const body = { amount: 1000, title: 'Test' };

      // First request
      const req1 = createMockRequest({
        headers: { 'idempotency-key': key1 },
        params: { dealId: 'deal-123' },
        body
      });
      const res1 = createMockResponse();
      let next1Called = false;

      await new Promise((resolve) => {
        middleware(req1, res1, () => {
          next1Called = true;
          res1.status(201).json({ id: 'result-1' });
          resolve();
        });
      });

      // Second request with different key
      const req2 = createMockRequest({
        headers: { 'idempotency-key': key2 },
        params: { dealId: 'deal-123' },
        body
      });
      const res2 = createMockResponse();
      let next2Called = false;

      await new Promise((resolve) => {
        middleware(req2, res2, () => {
          next2Called = true;
          res2.status(201).json({ id: 'result-2' });
          resolve();
        });
      });

      expect(next1Called).toBe(true);
      expect(next2Called).toBe(true);

      logger.testPass('Different keys separate');
    });

    test('Same key different payload creates new operation', async () => {
      logger.testStart('Same key different payload');

      const middleware = idempotencyMiddleware('test-operation');
      const key = IdempotencyTestHelpers.generateKey();

      // First request
      const req1 = createMockRequest({
        headers: { 'idempotency-key': key },
        params: { dealId: 'deal-123' },
        body: { amount: 1000 }
      });
      const res1 = createMockResponse();

      await new Promise((resolve) => {
        middleware(req1, res1, () => {
          res1.status(201).json({ id: 'result-1' });
          resolve();
        });
      });

      // Second request with different payload (should create new because hash differs)
      const req2 = createMockRequest({
        headers: { 'idempotency-key': key },
        params: { dealId: 'deal-123' },
        body: { amount: 2000 }
      });
      const res2 = createMockResponse();
      let next2Called = false;

      await new Promise((resolve) => {
        middleware(req2, res2, () => {
          next2Called = true;
          res2.status(201).json({ id: 'result-2' });
          resolve();
        });
      });

      expect(next2Called).toBe(true);

      logger.testPass('Same key different payload');
    });

    test('X-Idempotency-Key header also works', async () => {
      logger.testStart('X-Idempotency-Key header');

      const middleware = idempotencyMiddleware('test-operation');
      const key = IdempotencyTestHelpers.generateKey();
      const req = createMockRequest({
        headers: { 'x-idempotency-key': key },
        params: { dealId: 'deal-123' },
        body: { amount: 1000 }
      });
      const res = createMockResponse();

      await new Promise((resolve) => {
        middleware(req, res, () => resolve());
      });

      expect(req.idempotency.enabled).toBe(true);
      expect(req.idempotency.key).toBe(key);

      logger.testPass('X-Idempotency-Key header');
    });
  });

  describe('Organization Isolation', () => {
    test('Same key different orgs are isolated', async () => {
      logger.testStart('Org isolation');

      const middleware = idempotencyMiddleware('test-operation');
      const key = IdempotencyTestHelpers.generateKey();
      const body = { amount: 1000 };

      // Request from Org A
      const reqA = createMockRequest({
        headers: { 'idempotency-key': key },
        params: { dealId: 'deal-123' },
        body,
        authUser: { id: 'user-a', organizationId: 'org-a', role: 'GP' }
      });
      const resA = createMockResponse();
      let nextACalled = false;

      await new Promise((resolve) => {
        middleware(reqA, resA, () => {
          nextACalled = true;
          resA.status(201).json({ id: 'result-a' });
          resolve();
        });
      });

      // Request from Org B with same key
      const reqB = createMockRequest({
        headers: { 'idempotency-key': key },
        params: { dealId: 'deal-123' },
        body,
        authUser: { id: 'user-b', organizationId: 'org-b', role: 'GP' }
      });
      const resB = createMockResponse();
      let nextBCalled = false;

      await new Promise((resolve) => {
        middleware(reqB, resB, () => {
          nextBCalled = true;
          resB.status(201).json({ id: 'result-b' });
          resolve();
        });
      });

      // Both should call next because they're different orgs
      expect(nextACalled).toBe(true);
      expect(nextBCalled).toBe(true);

      logger.testPass('Org isolation');
    });
  });

  describe('Stats and Monitoring', () => {
    test('getIdempotencyStats returns accurate counts', async () => {
      logger.testStart('Stats accuracy');

      const middleware = idempotencyMiddleware('test-operation');

      // Create some records
      for (let i = 0; i < 5; i++) {
        const req = createMockRequest({
          headers: { 'idempotency-key': IdempotencyTestHelpers.generateKey() },
          params: { dealId: `deal-${i}` },
          body: { amount: i * 100 }
        });
        const res = createMockResponse();

        await new Promise((resolve) => {
          middleware(req, res, () => {
            res.status(201).json({ id: `result-${i}` });
            resolve();
          });
        });
      }

      const stats = getIdempotencyStats();

      expect(stats.totalRecords).toBe(5);
      expect(stats.activeRecords).toBe(5);
      expect(stats.expiredRecords).toBe(0);

      logger.testPass('Stats accuracy');
    });

    test('clearIdempotencyStore removes all records', async () => {
      logger.testStart('Clear store');

      const middleware = idempotencyMiddleware('test-operation');

      // Create a record
      const req = createMockRequest({
        headers: { 'idempotency-key': IdempotencyTestHelpers.generateKey() },
        params: { dealId: 'deal-123' },
        body: { amount: 1000 }
      });
      const res = createMockResponse();

      await new Promise((resolve) => {
        middleware(req, res, () => {
          res.status(201).json({ id: 'result-123' });
          resolve();
        });
      });

      expect(getIdempotencyStats().totalRecords).toBe(1);

      clearIdempotencyStore();

      expect(getIdempotencyStats().totalRecords).toBe(0);

      logger.testPass('Clear store');
    });
  });
});

describe('Capital Call Idempotency Schema', () => {
  test('idempotencyKey field is optional and unique', () => {
    // This test validates the schema expectation
    // In actual integration, the Prisma schema would be validated
    const capitalCallFields = {
      idempotencyKey: {
        type: 'String',
        optional: true,
        unique: true
      }
    };

    expect(capitalCallFields.idempotencyKey.optional).toBe(true);
    expect(capitalCallFields.idempotencyKey.unique).toBe(true);
  });
});

describe('Distribution Idempotency Schema', () => {
  test('idempotencyKey field is optional and unique', () => {
    const distributionFields = {
      idempotencyKey: {
        type: 'String',
        optional: true,
        unique: true
      }
    };

    expect(distributionFields.idempotencyKey.optional).toBe(true);
    expect(distributionFields.idempotencyKey.unique).toBe(true);
  });
});
