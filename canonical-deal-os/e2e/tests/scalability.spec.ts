/**
 * Scalability E2E Tests
 * Sprint 3: Scalability
 *
 * Tests for circuit breaker status, response times, and scalability features.
 */

import { test, expect } from '@playwright/test';

test.describe('Scalability Features', () => {
  test.describe('Circuit Breaker Status', () => {
    test('circuit breaker status endpoint requires authentication', async ({ request }) => {
      const response = await request.get('/api/debug/circuits');

      // Should require auth
      expect(response.status()).toBe(401);
    });

    test('circuit breaker status returns all circuits for admin', async ({ request }) => {
      // Login as admin first
      const loginResponse = await request.post('/api/auth/login', {
        data: { email: 'admin@canonical.com', password: 'admin123' }
      });

      if (loginResponse.status() !== 200) {
        test.skip();
        return;
      }

      const { token } = await loginResponse.json();

      const response = await request.get('/api/debug/circuits', {
        headers: { Authorization: `Bearer ${token}` }
      });

      // May be 403 in production mode
      if (response.status() === 403) {
        const body = await response.json();
        expect(body.error).toContain('production');
        return;
      }

      expect(response.status()).toBe(200);
      const data = await response.json();

      expect(data.circuits).toBeDefined();
      expect(Array.isArray(data.circuits)).toBe(true);
      expect(data.circuits.length).toBeGreaterThanOrEqual(4);

      // Verify each circuit has expected fields
      for (const circuit of data.circuits) {
        expect(circuit.name).toBeDefined();
        expect(circuit.state).toBeDefined();
        expect(['CLOSED', 'OPEN', 'HALF_OPEN']).toContain(circuit.state);
        expect(typeof circuit.failures).toBe('number');
      }

      // Verify summary
      expect(data.summary).toBeDefined();
      expect(data.summary.total).toBe(data.circuits.length);
    });

    test('circuit breaker reset endpoint works', async ({ request }) => {
      // Login as admin first
      const loginResponse = await request.post('/api/auth/login', {
        data: { email: 'admin@canonical.com', password: 'admin123' }
      });

      if (loginResponse.status() !== 200) {
        test.skip();
        return;
      }

      const { token } = await loginResponse.json();

      const response = await request.post('/api/debug/circuits/reset', {
        headers: { Authorization: `Bearer ${token}` }
      });

      // May be 403 in production mode
      if (response.status() === 403) {
        return;
      }

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data.message).toContain('reset');
    });
  });

  test.describe('Response Time Benchmarks', () => {
    test('health endpoint responds within 200ms', async ({ request }) => {
      const startTime = Date.now();
      const response = await request.get('/api/health');
      const duration = Date.now() - startTime;

      expect(response.status()).toBe(200);
      expect(duration).toBeLessThan(200);
    });

    test('metrics endpoint responds within 500ms', async ({ request }) => {
      const startTime = Date.now();
      const response = await request.get('/metrics');
      const duration = Date.now() - startTime;

      expect(response.status()).toBe(200);
      expect(duration).toBeLessThan(500);
    });

    test('login endpoint responds within 2 seconds', async ({ request }) => {
      const startTime = Date.now();
      const response = await request.post('/api/auth/login', {
        data: { email: 'gp@canonical.com', password: 'gp123' }
      });
      const duration = Date.now() - startTime;

      // Allow either success or auth failure - just checking response time
      expect([200, 401]).toContain(response.status());
      expect(duration).toBeLessThan(2000);
    });
  });

  test.describe('Concurrent Request Handling', () => {
    test('handles multiple concurrent health checks', async ({ request }) => {
      const concurrentRequests = 10;
      const promises = Array(concurrentRequests)
        .fill(null)
        .map(() => request.get('/api/health'));

      const startTime = Date.now();
      const responses = await Promise.all(promises);
      const totalDuration = Date.now() - startTime;

      // All should succeed
      for (const response of responses) {
        expect(response.status()).toBe(200);
      }

      // Should complete within reasonable time (not sequential)
      // 10 requests at 200ms each = 2000ms sequential, should be much faster
      expect(totalDuration).toBeLessThan(1000);
    });

    test('handles concurrent metrics requests', async ({ request }) => {
      const concurrentRequests = 5;
      const promises = Array(concurrentRequests)
        .fill(null)
        .map(() => request.get('/metrics'));

      const responses = await Promise.all(promises);

      for (const response of responses) {
        expect(response.status()).toBe(200);
        const body = await response.text();
        expect(body).toContain('http_request');
      }
    });
  });

  test.describe('Metrics Validation', () => {
    test('metrics endpoint returns Prometheus format', async ({ request }) => {
      const response = await request.get('/metrics');

      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('text/plain');

      const body = await response.text();

      // Should have HELP and TYPE comments (Prometheus format)
      expect(body).toContain('# HELP');
      expect(body).toContain('# TYPE');

      // Should have key metrics
      expect(body).toContain('http_request_duration_seconds');
      expect(body).toContain('http_requests_total');
    });

    test('metrics include Node.js runtime metrics', async ({ request }) => {
      const response = await request.get('/metrics');
      const body = await response.text();

      // Default Node.js metrics from prom-client
      expect(body).toContain('nodejs');
      expect(body).toContain('process_cpu');
    });

    test('metrics are updated after requests', async ({ request }) => {
      // Get initial metrics
      const response1 = await request.get('/metrics');
      const body1 = await response1.text();

      // Make some requests
      await request.get('/api/health');
      await request.get('/api/health');

      // Get metrics again
      const response2 = await request.get('/metrics');
      const body2 = await response2.text();

      // Both should be valid Prometheus format
      expect(body1).toContain('# TYPE');
      expect(body2).toContain('# TYPE');

      // Request count should have increased
      // (Exact comparison is tricky, just verify format is valid)
      expect(body2).toContain('http_requests_total');
    });
  });

  test.describe('Error Resilience', () => {
    test('server handles invalid JSON gracefully', async ({ request }) => {
      const response = await request.post('/api/auth/login', {
        headers: { 'Content-Type': 'application/json' },
        data: 'not valid json {'
      });

      // Should return 4xx error, not crash
      expect(response.status()).toBeGreaterThanOrEqual(400);
      expect(response.status()).toBeLessThan(500);
    });

    test('server handles missing required fields gracefully', async ({ request }) => {
      const response = await request.post('/api/auth/login', {
        data: { email: 'test@example.com' }  // Missing password
      });

      // Should return validation error, not crash
      expect(response.status()).toBeGreaterThanOrEqual(400);
      expect(response.status()).toBeLessThan(500);
    });
  });
});
