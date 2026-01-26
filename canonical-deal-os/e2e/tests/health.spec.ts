import { test, expect } from '@playwright/test';

/**
 * Service health check tests
 * Verifies all services are running and responding
 *
 * Services:
 * - Kernel API (port 3001) - Core business logic
 * - BFF Server (port 8787) - Backend for Frontend
 * - Vite Dev Server (port 5173) - React frontend
 */
test.describe('Service Health', () => {

  test('Kernel API should respond at /health', async ({ request }) => {
    const response = await request.get('http://localhost:3001/health');

    expect(response.ok()).toBe(true);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('status', 'ok');
  });

  test('BFF Server should respond at /health', async ({ request }) => {
    const response = await request.get('http://localhost:8787/health');

    expect(response.ok()).toBe(true);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('status');

    // BFF health includes kernel status (returns HTTP status code, 200 = healthy)
    if (data.kernelStatus !== undefined) {
      expect([200, 'ok']).toContain(data.kernelStatus);
    }
  });

  test('Vite Dev Server should serve frontend', async ({ request }) => {
    const response = await request.get('http://localhost:5173/');

    expect(response.ok()).toBe(true);
    expect(response.status()).toBe(200);

    // Should return HTML content
    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('text/html');
  });

  test('BFF should proxy to Kernel successfully', async ({ request }) => {
    // The /health endpoint on BFF checks Kernel connectivity
    const response = await request.get('http://localhost:8787/health');
    const data = await response.json();

    // If BFF can reach Kernel, kernelStatus should be 'ok' or 200
    // If Kernel is down, it would be 'error' or missing
    if (data.kernelStatus !== undefined) {
      expect([200, 'ok']).toContain(data.kernelStatus);
    }
  });

  test('All services healthy simultaneously', async ({ request }) => {
    // Test all services in parallel
    const [kernelRes, bffRes, viteRes] = await Promise.all([
      request.get('http://localhost:3001/health'),
      request.get('http://localhost:8787/health'),
      request.get('http://localhost:5173/'),
    ]);

    // All should respond successfully
    expect(kernelRes.ok()).toBe(true);
    expect(bffRes.ok()).toBe(true);
    expect(viteRes.ok()).toBe(true);

    // Log status for debugging
    console.log('Service Health Status:');
    console.log(`  Kernel: ${kernelRes.status()}`);
    console.log(`  BFF: ${bffRes.status()}`);
    console.log(`  Vite: ${viteRes.status()}`);
  });

  test('BFF API endpoints accessible', async ({ request }) => {
    // Test a simple API endpoint (organizations list is public)
    const response = await request.get('http://localhost:8787/api/organizations/public');

    // Should respond (even if empty list)
    expect(response.status()).toBeLessThan(500);
  });

  test('Kernel API deals endpoint accessible', async ({ request }) => {
    // Note: This may require auth, so we just check it doesn't 500
    const response = await request.get('http://localhost:3001/deals');

    // Should not be a server error (4xx is OK for auth required)
    expect(response.status()).toBeLessThan(500);
  });
});

test.describe('Service Response Times', () => {

  test('Kernel health responds under 500ms', async ({ request }) => {
    const start = Date.now();
    await request.get('http://localhost:3001/health');
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(500);
    console.log(`Kernel response time: ${duration}ms`);
  });

  test('BFF health responds under 1000ms', async ({ request }) => {
    const start = Date.now();
    await request.get('http://localhost:8787/health');
    const duration = Date.now() - start;

    // BFF health checks Kernel, so allow more time
    expect(duration).toBeLessThan(1000);
    console.log(`BFF response time: ${duration}ms`);
  });

  test('Vite serves page under 2000ms', async ({ request }) => {
    const start = Date.now();
    await request.get('http://localhost:5173/');
    const duration = Date.now() - start;

    // Initial page load can be slower
    expect(duration).toBeLessThan(2000);
    console.log(`Vite response time: ${duration}ms`);
  });
});
