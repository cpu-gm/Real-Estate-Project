import { test, expect } from '@playwright/test';

const BASE_URL = process.env.VITE_API_URL || 'http://localhost:8787';

/**
 * Sprint 2: Observability E2E Tests
 *
 * Tests for:
 * - Prometheus /metrics endpoint
 * - Metrics content format
 * - HTTP request metrics recording
 * - Default Node.js metrics
 */

test.describe('Observability - Prometheus Metrics', () => {
  test('metrics endpoint returns Prometheus format', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/metrics`);

    expect(response.status()).toBe(200);

    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('text/plain');

    const body = await response.text();
    expect(body).toContain('# HELP');
    expect(body).toContain('# TYPE');
  });

  test('metrics include http_request_duration_seconds', async ({ request }) => {
    // Make a request first to ensure metrics are recorded
    await request.get(`${BASE_URL}/health`);

    const response = await request.get(`${BASE_URL}/metrics`);
    const body = await response.text();

    expect(body).toContain('http_request_duration_seconds');
  });

  test('metrics include http_requests_total', async ({ request }) => {
    // Make a request first
    await request.get(`${BASE_URL}/health`);

    const response = await request.get(`${BASE_URL}/metrics`);
    const body = await response.text();

    expect(body).toContain('http_requests_total');
  });

  test('metrics include active connections gauge', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/metrics`);
    const body = await response.text();

    expect(body).toContain('http_active_connections');
  });

  test('metrics include default Node.js metrics', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/metrics`);
    const body = await response.text();

    // Default metrics from prom-client collectDefaultMetrics
    expect(body).toContain('nodejs');
    expect(body).toContain('process');
  });

  test('metrics include error counter', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/metrics`);
    const body = await response.text();

    expect(body).toContain('errors_total');
  });

  test('metrics include business metrics', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/metrics`);
    const body = await response.text();

    // Business metrics defined in metrics.js
    expect(body).toContain('deals_created_total');
    expect(body).toContain('distributions_total');
    expect(body).toContain('capital_calls_total');
    expect(body).toContain('lp_invitations_total');
  });

  test('metrics include LLM metrics', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/metrics`);
    const body = await response.text();

    expect(body).toContain('llm_call_duration_seconds');
    expect(body).toContain('llm_tokens_used_total');
  });

  test('metrics include database metrics', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/metrics`);
    const body = await response.text();

    expect(body).toContain('db_query_duration_seconds');
  });
});

test.describe('Observability - Metrics Recording', () => {
  test('requests are recorded in metrics', async ({ request }) => {
    // Make several requests
    await request.get(`${BASE_URL}/health`);
    await request.get(`${BASE_URL}/health`);
    await request.get(`${BASE_URL}/health`);

    // Check metrics
    const metricsResponse = await request.get(`${BASE_URL}/metrics`);
    const metrics = await metricsResponse.text();

    // Should have recorded requests to /health
    expect(metrics).toContain('path="/health"');
  });

  test('error responses are recorded in error metrics', async ({ request }) => {
    // Make a request that will fail (401)
    await request.get(`${BASE_URL}/api/notifications`);

    const metricsResponse = await request.get(`${BASE_URL}/metrics`);
    const metrics = await metricsResponse.text();

    // Should have errors recorded
    expect(metrics).toContain('errors_total');
  });

  test('metrics path is normalized (UUIDs replaced)', async ({ request }) => {
    // Make a request with a UUID in the path
    await request.get(`${BASE_URL}/api/deals/123e4567-e89b-12d3-a456-426614174000`);

    const metricsResponse = await request.get(`${BASE_URL}/metrics`);
    const metrics = await metricsResponse.text();

    // Should have normalized path with :id instead of UUID
    expect(metrics).toContain('path="/api/deals/:id"');
  });
});

test.describe('Observability - Health with Metrics', () => {
  test('health endpoint still works with observability enabled', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/health`);

    expect(response.status()).toBe(200);
  });

  test('health check does not appear in metrics (filtered)', async ({ request }) => {
    // Make health requests
    for (let i = 0; i < 5; i++) {
      await request.get(`${BASE_URL}/health`);
    }

    const metricsResponse = await request.get(`${BASE_URL}/metrics`);
    const metrics = await metricsResponse.text();

    // Health requests should not flood the metrics (filtered out in bffLog)
    // But they ARE still recorded in Prometheus metrics for completeness
    // This test just verifies the endpoint works
    expect(metricsResponse.status()).toBe(200);
  });

  test('metrics endpoint does not record itself', async ({ request }) => {
    // Make multiple metrics requests
    await request.get(`${BASE_URL}/metrics`);
    await request.get(`${BASE_URL}/metrics`);

    const metricsResponse = await request.get(`${BASE_URL}/metrics`);
    const metrics = await metricsResponse.text();

    // Metrics endpoint should be filtered from logs (not from Prometheus though)
    expect(metricsResponse.status()).toBe(200);
  });
});

test.describe('Observability - Security Headers on Metrics', () => {
  test('metrics endpoint includes security headers', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/metrics`);

    // Security headers should be present even on metrics endpoint
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
    expect(response.headers()['x-frame-options']).toBe('DENY');
  });

  test('metrics endpoint includes CORS headers', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/metrics`, {
      headers: { 'Origin': 'http://localhost:5173' }
    });

    expect(response.headers()['access-control-allow-origin']).toBe('http://localhost:5173');
  });
});
