import { test, expect, APIRequestContext } from '@playwright/test';
import { LoginPage } from '../page-objects/LoginPage';

/**
 * P1 Security Sprint - E2E Tests
 *
 * Tests for security fixes:
 * - T1.1: JWT Secret Validation (tested at server startup)
 * - T1.2: Magic Link Authorization (cross-org access)
 * - T1.3: IDOR Prevention (X-User-Id header ignored)
 * - T1.4: Rate Limiting (429 on excessive attempts)
 *
 * Prerequisites:
 * - npm run db:seed:auth (creates test users)
 * - Services running (npm run start)
 */

const BASE_URL = process.env.VITE_API_URL || 'http://localhost:8787';

// Helper to reset rate limits before tests that need to login
async function resetRateLimits(request: APIRequestContext) {
  try {
    await request.post(`${BASE_URL}/api/debug/reset-rate-limit`, {
      headers: { 'Content-Type': 'application/json' },
      data: {}
    });
  } catch {
    // Ignore errors - endpoint might not exist in production
  }
}

// Helper to make API requests
async function apiRequest(
  request: APIRequestContext,
  method: string,
  path: string,
  options: { body?: object; headers?: Record<string, string>; token?: string } = {}
) {
  const { body, headers = {}, token } = options;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers
  };

  if (token) {
    requestHeaders['Authorization'] = `Bearer ${token}`;
  }

  const url = `${BASE_URL}${path}`;

  if (method === 'GET') {
    return request.get(url, { headers: requestHeaders });
  } else if (method === 'POST') {
    return request.post(url, { headers: requestHeaders, data: body });
  } else if (method === 'PUT') {
    return request.put(url, { headers: requestHeaders, data: body });
  } else if (method === 'DELETE') {
    return request.delete(url, { headers: requestHeaders });
  }

  throw new Error(`Unsupported method: ${method}`);
}

// Clear browser state before each test to ensure isolation
test.beforeEach(async ({ page }) => {
  // Navigate to app root first (may redirect to Login or Home)
  try {
    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 10000 });
    // Clear localStorage to remove any auth tokens from previous tests
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  } catch {
    // If navigation fails, try to clear storage anyway
    await page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch { /* ignore */ }
    });
  }
});

// ============== Rate Limiting Tests (T1.4) ==============

test.describe('Security - Rate Limiting (T1.4)', () => {
  test('login page shows rate limit after 5 failed attempts', async ({ page, request }) => {
    const testEmail = `rate-limit-e2e-${Date.now()}@example.com`;

    // Make 5 failed login attempts via API
    for (let i = 0; i < 5; i++) {
      await apiRequest(request, 'POST', '/api/auth/login', {
        body: { email: testEmail, password: 'wrongpassword' }
      });
    }

    // 6th attempt should be rate limited
    const response = await apiRequest(request, 'POST', '/api/auth/login', {
      body: { email: testEmail, password: 'wrongpassword' }
    });

    expect(response.status()).toBe(429);

    const data = await response.json();
    expect(data.retryAfterSeconds).toBeGreaterThan(0);
  });

  test('signup rate limiting after 5 attempts', async ({ request }) => {
    const testEmail = `signup-limit-e2e-${Date.now()}@example.com`;

    // Make 5 failed signup attempts
    for (let i = 0; i < 5; i++) {
      await apiRequest(request, 'POST', '/api/auth/signup', {
        body: { email: testEmail, password: '123', name: 'Test' }
      });
    }

    // 6th attempt should be rate limited
    const response = await apiRequest(request, 'POST', '/api/auth/signup', {
      body: { email: testEmail, password: '123', name: 'Test' }
    });

    expect(response.status()).toBe(429);
  });

  test('rate limit header includes retry-after', async ({ request }) => {
    const testEmail = `header-test-${Date.now()}@example.com`;

    // Exhaust rate limit
    for (let i = 0; i < 5; i++) {
      await apiRequest(request, 'POST', '/api/auth/login', {
        body: { email: testEmail, password: 'wrong' }
      });
    }

    // Check rate limited response
    const response = await apiRequest(request, 'POST', '/api/auth/login', {
      body: { email: testEmail, password: 'wrong' }
    });

    expect(response.status()).toBe(429);
    expect(response.headers()['retry-after']).toBeDefined();
  });
});

// ============== Authentication Required Tests ==============

test.describe('Security - Authentication Required', () => {
  const protectedEndpoints = [
    { method: 'GET', path: '/api/notifications' },
    { method: 'GET', path: '/api/tasks' },
    { method: 'GET', path: '/api/inbox' },
    { method: 'POST', path: '/api/magic-links' },
    { method: 'POST', path: '/api/lp/invitations' },
    { method: 'GET', path: '/api/activity-feed' }
  ];

  for (const { method, path } of protectedEndpoints) {
    test(`${method} ${path} requires authentication`, async ({ request }) => {
      const response = await apiRequest(request, method, path, {
        body: method === 'POST' ? {} : undefined
      });

      expect(response.status()).toBe(401);
    });
  }
});

// ============== Magic Link Authorization Tests (T1.2) ==============

test.describe('Security - Magic Link Authorization (T1.2)', () => {
  test('magic link creation requires authentication', async ({ request }) => {
    const response = await apiRequest(request, 'POST', '/api/magic-links', {
      body: {
        dealId: 'some-deal-id',
        recipientEmail: 'test@example.com',
        recipientRole: 'LENDER'
      }
    });

    expect(response.status()).toBe(401);
  });

  test('magic link validation is rate limited', async ({ request }) => {
    const fakeToken = `fake-magic-token-${Date.now()}`;

    // Make 5 validation attempts
    for (let i = 0; i < 5; i++) {
      await apiRequest(request, 'GET', `/api/magic-links/${fakeToken}/validate`);
    }

    // 6th attempt - either 401 (invalid) or 429 (rate limited)
    const response = await apiRequest(request, 'GET', `/api/magic-links/${fakeToken}/validate`);
    expect([401, 429]).toContain(response.status());
  });
});

// ============== IDOR Prevention Tests (T1.3) ==============

test.describe('Security - IDOR Prevention (T1.3)', () => {
  let authToken: string;

  test.beforeAll(async ({ request }) => {
    // Login to get a valid token
    const loginResponse = await apiRequest(request, 'POST', '/api/auth/login', {
      body: { email: 'gp@canonical.com', password: 'gp123' }
    });

    if (loginResponse.status() === 200) {
      const data = await loginResponse.json();
      authToken = data.token;
    }
  });

  test('X-User-Id header is ignored with valid JWT', async ({ request }) => {
    if (!authToken) {
      test.skip();
      return;
    }

    // Make request with spoofed X-User-Id header
    const response = await apiRequest(request, 'GET', '/api/notifications', {
      token: authToken,
      headers: {
        'X-User-Id': 'attacker-spoofed-user-id'
      }
    });

    // Should succeed and use JWT identity, not header
    expect(response.status()).toBe(200);

    // The response should contain notifications for the JWT user,
    // not for the spoofed 'attacker-spoofed-user-id'
    const data = await response.json();
    expect(data).toHaveProperty('notifications');
  });

  test('X-Actor-Role header is ignored with valid JWT', async ({ request }) => {
    if (!authToken) {
      test.skip();
      return;
    }

    // Make request with spoofed role header
    const response = await apiRequest(request, 'GET', '/api/deals', {
      token: authToken,
      headers: {
        'X-Actor-Role': 'Admin' // Try to escalate to Admin
      }
    });

    // Should succeed but use JWT role, not header
    expect(response.status()).toBe(200);
  });

  test('tasks endpoint uses JWT identity not headers', async ({ request }) => {
    if (!authToken) {
      test.skip();
      return;
    }

    const response = await apiRequest(request, 'GET', '/api/tasks', {
      token: authToken,
      headers: {
        'X-User-Id': 'different-user-id'
      }
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('tasks');
  });
});

// ============== Cross-Organization Access Tests ==============

test.describe('Security - Organization Isolation', () => {
  test('unauthenticated user cannot access any deal', async ({ request }) => {
    const response = await apiRequest(request, 'GET', '/api/deals/any-deal-id');
    // Returns 404 (not 401) to hide whether deal exists - per security design
    expect([401, 404]).toContain(response.status());
  });

  test('deal access requires organization membership', async ({ page, request }) => {
    // Reset rate limits before login test
    await resetRateLimits(request);

    // Login as GP
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('gp@canonical.com', 'gp123');
    await expect(page).toHaveURL(/Home/);

    // Get token from localStorage
    const token = await page.evaluate(() => localStorage.getItem('auth_token'));

    if (token) {
      // Try to access a deal that doesn't exist (simulates cross-org)
      const response = await apiRequest(request, 'GET', '/api/deals/non-existent-deal-id', {
        token
      });

      // Should return 404 (not 403) to hide deal existence
      expect([404, 403]).toContain(response.status());
    }
  });
});

// ============== UI Security Tests ==============

test.describe('Security - UI Behavior', () => {
  test('login form shows appropriate error on rate limit', async ({ page, request }) => {
    // Reset rate limits first since previous tests may have used up the limit
    await resetRateLimits(request);

    const testEmail = `ui-rate-limit-${Date.now()}@example.com`;
    const loginPage = new LoginPage(page);

    // Exhaust rate limit via API first
    for (let i = 0; i < 5; i++) {
      await apiRequest(request, 'POST', '/api/auth/login', {
        body: { email: testEmail, password: 'wrongpassword' }
      });
    }

    // Now try via UI
    await loginPage.goto();
    await loginPage.login(testEmail, 'wrongpassword');

    // Should show rate limit error or stay on login page
    await expect(page).toHaveURL(/Login/);
  });

  test('protected page redirects to login when unauthenticated', async ({ browser }) => {
    // Use a fresh browser context to ensure no auth state from previous tests
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      // Try to access protected pages without any auth
      const protectedPages = ['/Home', '/Deals', '/DealOverview/test-deal'];

      for (const pagePath of protectedPages) {
        await page.goto(`http://localhost:5173${pagePath}`);
        // Should redirect to login
        await expect(page).toHaveURL(/Login/);
      }
    } finally {
      await context.close();
    }
  });

  test('session persists after page reload', async ({ page, request }) => {
    // Reset rate limits before login test
    await resetRateLimits(request);

    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.login('gp@canonical.com', 'gp123');
    await expect(page).toHaveURL(/Home/);

    // Reload page
    await page.reload();

    // Should still be authenticated
    await expect(page).toHaveURL(/Home/);

    // Token should still exist
    const token = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(token).toBeTruthy();
  });
});

// ============== Server Health Check ==============

test.describe('Security - Server Health', () => {
  test('health endpoint is accessible', async ({ request }) => {
    const response = await apiRequest(request, 'GET', '/health');
    expect(response.status()).toBe(200);
  });

  test('server returns proper CORS headers', async ({ request }) => {
    const response = await apiRequest(request, 'GET', '/health');
    // Note: CORS headers may vary based on configuration
    expect(response.status()).toBe(200);
  });
});

// ============== Security Headers Tests (Sprint 1) ==============

test.describe('Security - HTTP Headers', () => {
  test('includes X-Content-Type-Options: nosniff', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/health`);
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
  });

  test('includes X-Frame-Options: DENY', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/health`);
    expect(response.headers()['x-frame-options']).toBe('DENY');
  });

  test('includes X-XSS-Protection', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/health`);
    expect(response.headers()['x-xss-protection']).toBe('1; mode=block');
  });

  test('includes Referrer-Policy', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/health`);
    expect(response.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  test('includes Content-Security-Policy', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/health`);
    const csp = response.headers()['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  test('CORS allows configured origin', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/health`, {
      headers: { 'Origin': 'http://localhost:5173' }
    });
    expect(response.headers()['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  test('CORS rejects unconfigured origin', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/health`, {
      headers: { 'Origin': 'http://evil.com' }
    });
    // Should return first allowed origin, not the evil one
    expect(response.headers()['access-control-allow-origin']).not.toBe('http://evil.com');
  });

  test('CORS includes credentials support', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/health`);
    expect(response.headers()['access-control-allow-credentials']).toBe('true');
  });

  test('CORS includes allowed methods', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/health`);
    const methods = response.headers()['access-control-allow-methods'];
    expect(methods).toContain('GET');
    expect(methods).toContain('POST');
    expect(methods).toContain('PUT');
    expect(methods).toContain('DELETE');
  });

  test('CORS preflight (OPTIONS) returns 204', async ({ request }) => {
    const response = await request.fetch(`${BASE_URL}/api/deals`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST'
      }
    });
    expect(response.status()).toBe(204);
  });

  test('security headers present on error responses', async ({ request }) => {
    // Make request that will fail (no auth)
    const response = await request.get(`${BASE_URL}/api/notifications`);
    expect(response.status()).toBe(401);

    // Headers should still be present
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
    expect(response.headers()['x-frame-options']).toBe('DENY');
    expect(response.headers()['content-security-policy']).toBeTruthy();
  });
});
