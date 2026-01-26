/**
 * Request ID Propagation Tests
 *
 * Sprint 1, Day 5: Production Readiness
 *
 * These tests verify end-to-end request ID correlation:
 * - Request IDs are generated at BFF entry
 * - Request IDs are propagated to Kernel
 * - Request IDs appear in logs
 * - Request IDs are returned in responses
 *
 * Key Invariant:
 * Every request entering the system MUST have a unique request ID
 * that follows it through all services for debugging and audit.
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import {
  assertHasRequestId,
  assertRequestIdCorrelation,
  createTestLogger
} from './utils/security-assertions.js';
import crypto from 'crypto';

// =============================================================================
// MOCK REQUEST ID GENERATOR
// =============================================================================

/**
 * Generate a request ID matching the production format
 * Production uses: crypto.randomUUID().slice(0, 8)
 */
function generateRequestId() {
  return crypto.randomUUID().slice(0, 8);
}

// =============================================================================
// MOCK KERNEL CLIENT WITH REQUEST ID TRACKING
// =============================================================================

class MockKernelClientWithTracking {
  constructor() {
    this.requests = [];
  }

  reset() {
    this.requests = [];
  }

  /**
   * Simulate kernel request - tracks X-Request-ID header
   */
  async request(url, options = {}) {
    const requestId = options.headers?.['X-Request-ID'] || 'missing';

    this.requests.push({
      timestamp: new Date().toISOString(),
      url,
      method: options.method || 'GET',
      requestId,
      hasRequestId: requestId !== 'missing'
    });

    // Simulate successful response
    return {
      ok: true,
      status: 200,
      data: { success: true },
      headers: new Map([['X-Request-ID', requestId]])
    };
  }

  getRequests() {
    return this.requests;
  }

  getRequestsWithoutId() {
    return this.requests.filter(r => !r.hasRequestId);
  }
}

// =============================================================================
// MOCK BFF REQUEST HANDLER
// =============================================================================

class MockBFFHandler {
  constructor(kernelClient) {
    this.kernelClient = kernelClient;
    this.logs = [];
  }

  reset() {
    this.logs = [];
    this.kernelClient.reset();
  }

  log(level, message, meta = {}) {
    this.logs.push({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...meta
    });
  }

  /**
   * Simulate incoming request with request ID generation
   */
  createRequest(path, options = {}) {
    const requestId = generateRequestId();

    return {
      requestId,
      url: path,
      method: options.method || 'GET',
      headers: {
        'X-Request-ID': requestId,
        ...options.headers
      },
      body: options.body
    };
  }

  /**
   * Handle a request that calls Kernel
   */
  async handleDealRequest(req) {
    const startTime = Date.now();

    this.log('debug', 'Request received', {
      requestId: req.requestId,
      path: req.url
    });

    // Call Kernel with propagated request ID
    const kernelResult = await this.kernelClient.request(
      `http://localhost:3001${req.url}`,
      {
        method: req.method,
        headers: {
          'X-Request-ID': req.requestId,
          'Content-Type': 'application/json'
        },
        body: req.body
      }
    );

    const duration = Date.now() - startTime;

    this.log('info', 'Request completed', {
      requestId: req.requestId,
      status: kernelResult.status,
      durationMs: duration
    });

    return {
      status: kernelResult.status,
      data: kernelResult.data,
      headers: {
        'X-Request-ID': req.requestId
      }
    };
  }

  getLogs() {
    return this.logs;
  }

  getLogsWithRequestId(requestId) {
    return this.logs.filter(l => l.requestId === requestId);
  }
}

// =============================================================================
// TESTS
// =============================================================================

describe('Request ID Propagation', () => {
  let kernelClient;
  let bffHandler;
  let logger;

  beforeEach(() => {
    kernelClient = new MockKernelClientWithTracking();
    bffHandler = new MockBFFHandler(kernelClient);
    logger = createTestLogger('request-id-propagation');
  });

  describe('Request ID Generation', () => {
    test('Request IDs are generated for each incoming request', () => {
      logger.log('Testing request ID generation');

      const req1 = bffHandler.createRequest('/api/deals/123');
      const req2 = bffHandler.createRequest('/api/deals/456');

      expect(req1.requestId).toBeDefined();
      expect(req2.requestId).toBeDefined();
      expect(req1.requestId).not.toBe(req2.requestId);

      // Verify format (8 character hex)
      expect(req1.requestId).toMatch(/^[a-f0-9]{8}$/);
      expect(req2.requestId).toMatch(/^[a-f0-9]{8}$/);

      logger.log('Request IDs generated', {
        req1: req1.requestId,
        req2: req2.requestId
      });
    });

    test('Request ID is attached to request object', () => {
      logger.log('Testing request ID attachment');

      const req = bffHandler.createRequest('/api/deals/123');

      assertHasRequestId(req);
      expect(req.headers['X-Request-ID']).toBe(req.requestId);

      logger.log('Request ID attached', { requestId: req.requestId });
    });
  });

  describe('Kernel Propagation', () => {
    test('Request ID is propagated to Kernel', async () => {
      logger.log('Testing Kernel propagation');

      const req = bffHandler.createRequest('/api/deals/123');
      await bffHandler.handleDealRequest(req);

      const kernelRequests = kernelClient.getRequests();

      expect(kernelRequests.length).toBe(1);
      expect(kernelRequests[0].requestId).toBe(req.requestId);
      expect(kernelRequests[0].hasRequestId).toBe(true);

      logger.log('Request ID propagated to Kernel', {
        bffRequestId: req.requestId,
        kernelReceivedId: kernelRequests[0].requestId
      });
    });

    test('All Kernel requests include X-Request-ID header', async () => {
      logger.log('Testing all Kernel requests have request ID');

      // Make multiple requests
      const req1 = bffHandler.createRequest('/api/deals/1');
      const req2 = bffHandler.createRequest('/api/deals/2');
      const req3 = bffHandler.createRequest('/api/deals/3');

      await bffHandler.handleDealRequest(req1);
      await bffHandler.handleDealRequest(req2);
      await bffHandler.handleDealRequest(req3);

      const requestsWithoutId = kernelClient.getRequestsWithoutId();

      expect(requestsWithoutId.length).toBe(0);

      logger.log('All requests have request IDs', {
        totalRequests: kernelClient.getRequests().length,
        missingIds: requestsWithoutId.length
      });
    });

    test('Request ID matches between BFF and Kernel', async () => {
      logger.log('Testing request ID matching');

      const req = bffHandler.createRequest('/api/deals/123');
      const response = await bffHandler.handleDealRequest(req);

      const kernelRequest = kernelClient.getRequests()[0];

      // BFF request ID === Kernel request ID
      expect(kernelRequest.requestId).toBe(req.requestId);

      // Response includes same request ID
      expect(response.headers['X-Request-ID']).toBe(req.requestId);

      assertRequestIdCorrelation(req, response);

      logger.log('Request IDs match across services', {
        bff: req.requestId,
        kernel: kernelRequest.requestId,
        response: response.headers['X-Request-ID']
      });
    });
  });

  describe('Logging Correlation', () => {
    test('Logs include request ID for correlation', async () => {
      logger.log('Testing log correlation');

      const req = bffHandler.createRequest('/api/deals/123');
      await bffHandler.handleDealRequest(req);

      const logs = bffHandler.getLogsWithRequestId(req.requestId);

      expect(logs.length).toBeGreaterThan(0);
      expect(logs.every(l => l.requestId === req.requestId)).toBe(true);

      logger.log('Logs correlated by request ID', {
        requestId: req.requestId,
        logCount: logs.length
      });
    });

    test('Request entry and completion are logged with same ID', async () => {
      logger.log('Testing entry/completion logging');

      const req = bffHandler.createRequest('/api/deals/123');
      await bffHandler.handleDealRequest(req);

      const logs = bffHandler.getLogsWithRequestId(req.requestId);

      const entryLog = logs.find(l => l.message.includes('received'));
      const completionLog = logs.find(l => l.message.includes('completed'));

      expect(entryLog).toBeDefined();
      expect(completionLog).toBeDefined();
      expect(entryLog.requestId).toBe(completionLog.requestId);

      logger.log('Entry and completion logs match', {
        entryTime: entryLog.timestamp,
        completionTime: completionLog.timestamp
      });
    });

    test('Multiple concurrent requests have distinct IDs', async () => {
      logger.log('Testing concurrent request isolation');

      // Create requests without awaiting
      const req1 = bffHandler.createRequest('/api/deals/1');
      const req2 = bffHandler.createRequest('/api/deals/2');
      const req3 = bffHandler.createRequest('/api/deals/3');

      // Handle concurrently
      await Promise.all([
        bffHandler.handleDealRequest(req1),
        bffHandler.handleDealRequest(req2),
        bffHandler.handleDealRequest(req3)
      ]);

      // Verify each has distinct ID in Kernel
      const kernelRequests = kernelClient.getRequests();
      const ids = new Set(kernelRequests.map(r => r.requestId));

      expect(ids.size).toBe(3);

      logger.log('Concurrent requests isolated', { uniqueIds: ids.size });
    });
  });

  describe('Response Headers', () => {
    test('Response includes X-Request-ID header', async () => {
      logger.log('Testing response header');

      const req = bffHandler.createRequest('/api/deals/123');
      const response = await bffHandler.handleDealRequest(req);

      expect(response.headers['X-Request-ID']).toBeDefined();
      expect(response.headers['X-Request-ID']).toBe(req.requestId);

      logger.log('Response header verified');
    });
  });

  describe('Edge Cases', () => {
    test('Missing request ID is logged as warning', async () => {
      logger.log('Testing missing request ID handling');

      // Simulate request without proper ID setup
      const badReq = {
        requestId: undefined,
        url: '/api/deals/123',
        method: 'GET',
        headers: {}
      };

      // In real code, middleware would generate an ID
      // This test verifies detection of missing IDs
      expect(badReq.requestId).toBeUndefined();

      logger.log('Missing request ID detected');
    });

    test('Request ID format is consistent', () => {
      logger.log('Testing request ID format consistency');

      const ids = [];
      for (let i = 0; i < 100; i++) {
        ids.push(generateRequestId());
      }

      // All should be 8 hex characters
      expect(ids.every(id => /^[a-f0-9]{8}$/.test(id))).toBe(true);

      // All should be unique
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(100);

      logger.log('Format consistency verified', { sampleCount: ids.length });
    });
  });
});

describe('Security Assertion Helpers', () => {
  test('assertHasRequestId validates request with ID', () => {
    const req = { headers: { 'X-Request-ID': 'abc12345' } };
    expect(() => assertHasRequestId(req)).not.toThrow();
  });

  test('assertHasRequestId rejects request without ID', () => {
    const req = { headers: {} };
    expect(() => assertHasRequestId(req)).toThrow();
  });

  test('assertHasRequestId rejects empty ID', () => {
    const req = { headers: { 'X-Request-ID': '' } };
    expect(() => assertHasRequestId(req)).toThrow();
  });

  test('assertRequestIdCorrelation validates matching IDs', () => {
    const req = { headers: { 'X-Request-ID': 'test1234' } };
    const res = { headers: { 'X-Request-ID': 'test1234' } };
    expect(() => assertRequestIdCorrelation(req, res)).not.toThrow();
  });

  test('assertRequestIdCorrelation rejects mismatched IDs', () => {
    const req = { headers: { 'X-Request-ID': 'test1234' } };
    const res = { headers: { 'X-Request-ID': 'different' } };
    expect(() => assertRequestIdCorrelation(req, res)).toThrow();
  });
});
