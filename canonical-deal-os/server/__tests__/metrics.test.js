import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import {
  recordHttpRequest,
  recordDbQuery,
  recordLlmCall,
  recordError,
  recordDealCreated,
  recordDistribution,
  recordCapitalCall,
  recordLpInvitation,
  incrementConnections,
  decrementConnections,
  getMetrics,
  getMetricsContentType,
  getMetricValues,
  resetMetrics,
  normalizePath
} from '../lib/metrics.js';

describe('Prometheus Metrics', () => {
  beforeEach(() => {
    // Reset metrics before each test for isolation
    resetMetrics();
  });

  describe('normalizePath', () => {
    test('replaces UUIDs with :id', () => {
      const path = '/api/deals/123e4567-e89b-12d3-a456-426614174000';
      expect(normalizePath(path)).toBe('/api/deals/:id');
    });

    test('replaces multiple UUIDs', () => {
      const path = '/api/deals/123e4567-e89b-12d3-a456-426614174000/allocations/987fcdeb-51a2-3bc4-d567-890123456789';
      expect(normalizePath(path)).toBe('/api/deals/:id/allocations/:id');
    });

    test('replaces numeric IDs', () => {
      const path = '/api/users/12345/profile';
      expect(normalizePath(path)).toBe('/api/users/:id/profile');
    });

    test('removes query strings', () => {
      const path = '/api/deals?page=1&limit=10';
      expect(normalizePath(path)).toBe('/api/deals');
    });

    test('removes trailing slashes', () => {
      const path = '/api/deals/';
      expect(normalizePath(path)).toBe('/api/deals');
    });

    test('handles null/undefined', () => {
      expect(normalizePath(null)).toBe('/unknown');
      expect(normalizePath(undefined)).toBe('/unknown');
    });

    test('handles empty string', () => {
      expect(normalizePath('')).toBe('/unknown');
    });
  });

  describe('recordHttpRequest', () => {
    test('records request duration and count', async () => {
      recordHttpRequest('GET', '/api/deals', 200, 150);

      const metrics = await getMetrics();
      expect(metrics).toContain('http_request_duration_seconds');
      expect(metrics).toContain('http_requests_total');
    });

    test('normalizes paths in metrics', async () => {
      recordHttpRequest('GET', '/api/deals/123e4567-e89b-12d3-a456-426614174000', 200, 50);

      const metrics = await getMetrics();
      expect(metrics).toContain('path="/api/deals/:id"');
    });

    test('includes method label', async () => {
      recordHttpRequest('POST', '/api/deals', 201, 100);

      const metrics = await getMetrics();
      expect(metrics).toContain('method="POST"');
    });

    test('includes status code label', async () => {
      recordHttpRequest('GET', '/api/deals', 404, 30);

      const metrics = await getMetrics();
      expect(metrics).toContain('status_code="404"');
    });

    test('handles multiple requests', async () => {
      recordHttpRequest('GET', '/api/deals', 200, 100);
      recordHttpRequest('GET', '/api/deals', 200, 150);
      recordHttpRequest('GET', '/api/deals', 200, 200);

      const metricValues = await getMetricValues();
      const requestTotal = metricValues.find(m => m.name === 'http_requests_total');

      expect(requestTotal).toBeDefined();
    });
  });

  describe('recordDbQuery', () => {
    test('records query duration', async () => {
      recordDbQuery('SELECT', 'deals', 25);

      const metrics = await getMetrics();
      expect(metrics).toContain('db_query_duration_seconds');
      expect(metrics).toContain('operation="SELECT"');
      expect(metrics).toContain('table="deals"');
    });

    test('records different operations', async () => {
      recordDbQuery('INSERT', 'distributions', 50);
      recordDbQuery('UPDATE', 'allocations', 30);

      const metrics = await getMetrics();
      expect(metrics).toContain('operation="INSERT"');
      expect(metrics).toContain('operation="UPDATE"');
    });
  });

  describe('recordLlmCall', () => {
    test('records LLM call duration', async () => {
      recordLlmCall('gpt-4', '/v1/chat/completions', 2500, 100, 500);

      const metrics = await getMetrics();
      expect(metrics).toContain('llm_call_duration_seconds');
      expect(metrics).toContain('model="gpt-4"');
    });

    test('records token usage', async () => {
      recordLlmCall('gpt-4o-mini', '/v1/chat/completions', 1500, 200, 300);

      const metrics = await getMetrics();
      expect(metrics).toContain('llm_tokens_used_total');
      expect(metrics).toContain('type="prompt"');
      expect(metrics).toContain('type="completion"');
    });

    test('handles zero tokens', async () => {
      recordLlmCall('gpt-4', '/v1/embeddings', 500, 0, 0);

      const metrics = await getMetrics();
      expect(metrics).toContain('llm_call_duration_seconds');
    });
  });

  describe('recordError', () => {
    test('increments error counter', async () => {
      recordError('VALIDATION_FAILED', '/api/deals');

      const metrics = await getMetrics();
      expect(metrics).toContain('errors_total');
      expect(metrics).toContain('type="VALIDATION_FAILED"');
    });

    test('normalizes error paths', async () => {
      recordError('NOT_FOUND', '/api/deals/123e4567-e89b-12d3-a456-426614174000');

      const metrics = await getMetrics();
      expect(metrics).toContain('path="/api/deals/:id"');
    });

    test('handles null error type', async () => {
      recordError(null, '/api/test');

      const metrics = await getMetrics();
      expect(metrics).toContain('type="UNKNOWN"');
    });
  });

  describe('Business Metrics', () => {
    test('recordDealCreated increments counter', async () => {
      recordDealCreated();
      recordDealCreated();

      const metrics = await getMetrics();
      expect(metrics).toContain('deals_created_total');
    });

    test('recordDistribution increments counter', async () => {
      recordDistribution();

      const metrics = await getMetrics();
      expect(metrics).toContain('distributions_total');
    });

    test('recordCapitalCall increments counter', async () => {
      recordCapitalCall();

      const metrics = await getMetrics();
      expect(metrics).toContain('capital_calls_total');
    });

    test('recordLpInvitation tracks status', async () => {
      recordLpInvitation('sent');
      recordLpInvitation('accepted');

      const metrics = await getMetrics();
      expect(metrics).toContain('lp_invitations_total');
      expect(metrics).toContain('status="sent"');
      expect(metrics).toContain('status="accepted"');
    });
  });

  describe('Connection Tracking', () => {
    test('incrementConnections increases gauge', async () => {
      incrementConnections();
      incrementConnections();

      const metrics = await getMetrics();
      expect(metrics).toContain('http_active_connections');
    });

    test('decrementConnections decreases gauge', async () => {
      incrementConnections();
      incrementConnections();
      decrementConnections();

      const metrics = await getMetrics();
      expect(metrics).toContain('http_active_connections');
    });
  });

  describe('getMetrics', () => {
    test('returns Prometheus format', async () => {
      recordHttpRequest('GET', '/api/health', 200, 10);

      const metrics = await getMetrics();

      expect(typeof metrics).toBe('string');
      expect(metrics).toContain('# HELP');
      expect(metrics).toContain('# TYPE');
    });

    test('includes default Node.js metrics', async () => {
      const metrics = await getMetrics();

      // Default metrics from prom-client
      expect(metrics).toContain('nodejs');
      expect(metrics).toContain('process');
    });
  });

  describe('getMetricsContentType', () => {
    test('returns correct content type', () => {
      const contentType = getMetricsContentType();

      expect(contentType).toContain('text/plain');
      // Or could be 'text/plain; version=0.0.4; charset=utf-8'
    });
  });

  describe('getMetricValues', () => {
    test('returns parsed metric values', async () => {
      recordHttpRequest('GET', '/api/test', 200, 50);

      const values = await getMetricValues();

      expect(Array.isArray(values)).toBe(true);
      expect(values.length).toBeGreaterThan(0);
    });
  });

  describe('resetMetrics', () => {
    test('clears all metric values', async () => {
      recordHttpRequest('GET', '/api/test', 200, 50);
      recordDealCreated();

      resetMetrics();

      // After reset, counters should be at 0
      // Note: histograms and counters are reset
      const values = await getMetricValues();
      const requestTotal = values.find(m => m.name === 'http_requests_total');

      // After reset, either the metric is gone or values are 0
      if (requestTotal && requestTotal.values) {
        const total = requestTotal.values.reduce((sum, v) => sum + v.value, 0);
        expect(total).toBe(0);
      }
    });
  });
});
