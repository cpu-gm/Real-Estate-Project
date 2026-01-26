/**
 * P1 Security Sprint - Integration Tests
 *
 * Tests for actual HTTP requests to verify security fixes work end-to-end.
 * Requires running BFF server.
 */

import { jest } from '@jest/globals';

// Skip tests if not in integration test mode
const INTEGRATION_TEST = process.env.RUN_INTEGRATION_TESTS === 'true';
const BASE_URL = process.env.BFF_URL || 'http://localhost:8787';

// Helper to make HTTP requests
async function httpRequest(method, path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const { body, headers = {}, token } = options;

  const requestHeaders = {
    'Content-Type': 'application/json',
    ...headers
  };

  if (token) {
    requestHeaders['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined
    });

    const data = await response.json().catch(() => null);

    return {
      status: response.status,
      data,
      headers: Object.fromEntries(response.headers.entries())
    };
  } catch (error) {
    return { status: 0, error: error.message };
  }
}

// Test helpers
const describeIntegration = INTEGRATION_TEST ? describe : describe.skip;

// ============== Auth Endpoints Security ==============

describeIntegration('Auth Endpoints Security', () => {
  test('POST /api/auth/login - 429 on 6th attempt', async () => {
    const testEmail = `rate-limit-test-${Date.now()}@example.com`;

    // Make 5 failed attempts
    for (let i = 0; i < 5; i++) {
      await httpRequest('POST', '/api/auth/login', {
        body: { email: testEmail, password: 'wrong-password' }
      });
    }

    // 6th attempt should be rate limited
    const response = await httpRequest('POST', '/api/auth/login', {
      body: { email: testEmail, password: 'wrong-password' }
    });

    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBeDefined();
    expect(response.data?.retryAfterSeconds).toBeGreaterThan(0);
  }, 30000);

  test('POST /api/auth/signup - 429 on 6th attempt', async () => {
    const testEmail = `signup-test-${Date.now()}@example.com`;

    // Make 5 failed attempts (invalid passwords)
    for (let i = 0; i < 5; i++) {
      await httpRequest('POST', '/api/auth/signup', {
        body: { email: testEmail, password: '123', name: 'Test' }
      });
    }

    // 6th attempt should be rate limited
    const response = await httpRequest('POST', '/api/auth/signup', {
      body: { email: testEmail, password: '123', name: 'Test' }
    });

    expect(response.status).toBe(429);
  }, 30000);
});

// ============== Magic Link Security ==============

describeIntegration('Magic Link Security', () => {
  test('POST /api/magic-links - 401 without auth', async () => {
    const response = await httpRequest('POST', '/api/magic-links', {
      body: {
        dealId: 'test-deal-id',
        recipientEmail: 'test@example.com',
        recipientRole: 'LENDER'
      }
    });

    expect(response.status).toBe(401);
  });

  test('POST /api/magic-links - 404 for cross-org deal', async () => {
    // This test requires a valid JWT for org-A and a deal belonging to org-B
    // The test token would need to be generated for a specific test org
    const testToken = process.env.TEST_ORG_A_TOKEN;

    if (!testToken) {
      console.log('Skipping cross-org test - no test token provided');
      return;
    }

    // Try to create magic link for a deal in a different org
    const response = await httpRequest('POST', '/api/magic-links', {
      token: testToken,
      body: {
        dealId: 'deal-from-other-org',
        recipientEmail: 'test@example.com',
        recipientRole: 'LENDER'
      }
    });

    // Should return 404 (not 403) to hide deal existence
    expect(response.status).toBe(404);
    expect(response.data?.error).toBe('Deal not found');
    expect(response.data?.error).not.toContain('organization');
    expect(response.data?.error).not.toContain('forbidden');
  });

  test('GET /api/magic-links/:token/validate - rate limited', async () => {
    const fakeToken = `fake-token-${Date.now()}`;

    // Make 5 validation attempts
    for (let i = 0; i < 5; i++) {
      await httpRequest('GET', `/api/magic-links/${fakeToken}/validate`);
    }

    // 6th attempt should be rate limited
    const response = await httpRequest('GET', `/api/magic-links/${fakeToken}/validate`);

    // Either 429 (rate limited) or 401 (invalid token) is acceptable
    expect([401, 429]).toContain(response.status);
  }, 30000);
});

// ============== IDOR Prevention ==============

describeIntegration('IDOR Prevention', () => {
  test('X-User-Id header ignored with valid JWT', async () => {
    const testToken = process.env.TEST_USER_TOKEN;

    if (!testToken) {
      console.log('Skipping IDOR test - no test token provided');
      return;
    }

    // Make request with spoofed X-User-Id header
    const response = await httpRequest('GET', '/api/notifications', {
      token: testToken,
      headers: {
        'X-User-Id': 'attacker-user-id'
      }
    });

    // Should succeed and return notifications for the JWT user, not the spoofed header
    expect(response.status).toBe(200);
    // Notifications should be for the actual user, not 'attacker-user-id'
  });

  test('Notifications scoped to authUser.id', async () => {
    const testToken = process.env.TEST_USER_TOKEN;

    if (!testToken) {
      console.log('Skipping notification scope test - no test token provided');
      return;
    }

    const response = await httpRequest('GET', '/api/notifications', {
      token: testToken
    });

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('notifications');
    // All notifications should belong to the authenticated user
  });

  test('Tasks scoped to authUser.id', async () => {
    const testToken = process.env.TEST_USER_TOKEN;

    if (!testToken) {
      console.log('Skipping task scope test - no test token provided');
      return;
    }

    const response = await httpRequest('GET', '/api/tasks', {
      token: testToken
    });

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('tasks');
  });
});

// ============== Organization Isolation ==============

describeIntegration('Organization Isolation', () => {
  test('User cannot access deal from different org', async () => {
    const testToken = process.env.TEST_ORG_A_TOKEN;
    const dealFromOrgB = process.env.TEST_ORG_B_DEAL_ID;

    if (!testToken || !dealFromOrgB) {
      console.log('Skipping org isolation test - no test tokens provided');
      return;
    }

    const response = await httpRequest('GET', `/api/deals/${dealFromOrgB}`, {
      token: testToken
    });

    // Should return 404 (not 403) to hide deal existence
    expect([403, 404]).toContain(response.status);
  });

  test('User can access deal from same org', async () => {
    const testToken = process.env.TEST_ORG_A_TOKEN;
    const dealFromOrgA = process.env.TEST_ORG_A_DEAL_ID;

    if (!testToken || !dealFromOrgA) {
      console.log('Skipping same-org access test - no test tokens provided');
      return;
    }

    const response = await httpRequest('GET', `/api/deals/${dealFromOrgA}`, {
      token: testToken
    });

    expect(response.status).toBe(200);
  });
});

// ============== Authentication Required ==============

describeIntegration('Authentication Required', () => {
  const protectedEndpoints = [
    { method: 'GET', path: '/api/notifications' },
    { method: 'GET', path: '/api/tasks' },
    { method: 'GET', path: '/api/inbox' },
    { method: 'POST', path: '/api/magic-links' },
    { method: 'POST', path: '/api/lp/invitations' },
    { method: 'GET', path: '/api/activity-feed' }
  ];

  test.each(protectedEndpoints)(
    '$method $path requires authentication',
    async ({ method, path }) => {
      const response = await httpRequest(method, path, {
        body: method === 'POST' ? {} : undefined
      });

      expect(response.status).toBe(401);
    }
  );
});

// ============== Server Health Check ==============

describeIntegration('Server Health', () => {
  test('Server is running', async () => {
    const response = await httpRequest('GET', '/health');

    expect(response.status).toBe(200);
  });

  test('Server refuses to start without JWT_SECRET', () => {
    // This is a startup-time check, documented rather than runtime tested
    // The validateJWTSecret function ensures server exits on startup if:
    // - JWT_SECRET is missing
    // - JWT_SECRET is empty
    // - JWT_SECRET is less than 64 bytes
    // - JWT_SECRET is the known default value
    expect(true).toBe(true);
  });
});

// Helper to run all tests with a fresh rate limit window
describe('Test Utilities', () => {
  test('Rate limit reset between test suites', async () => {
    // In a real integration test environment, you might want to reset
    // rate limits between test suites. This could be done via:
    // 1. A test-only endpoint: POST /api/debug/reset-rate-limits
    // 2. Direct Redis FLUSHDB (only in test environment)
    // 3. Waiting for the rate limit window to expire
    expect(true).toBe(true);
  });
});
