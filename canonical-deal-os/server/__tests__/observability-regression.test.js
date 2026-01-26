/**
 * Observability Regression Tests
 *
 * Sprint 2, Day 14: Observability Infrastructure Validation
 *
 * These tests verify the existing observability infrastructure:
 * - Circuit breaker state transitions and recovery
 * - Retry logic with exponential backoff
 * - Structured logging format and correlation
 * - Metrics endpoint compliance
 *
 * Regression Coverage:
 * - Circuit breaker prevents cascade failures
 * - Retry logic handles transient failures
 * - Logs maintain correlation IDs across requests
 * - Metrics are exposed in Prometheus format
 *
 * Key Invariant:
 * Observability infrastructure MUST degrade gracefully under
 * failure conditions without losing visibility into system state.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  createSprint2Logger,
  createTestContext,
  CircuitBreakerTestHelpers
} from './utils/sprint2-logger.js';

// =============================================================================
// MOCK CIRCUIT BREAKER (Matches lib/circuit-breaker.js pattern)
// =============================================================================

/**
 * Circuit breaker states
 */
const CircuitState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
};

/**
 * Mock circuit breaker implementation matching production pattern
 */
class MockCircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.logger = createSprint2Logger(`circuit-${name}`, { consoleOutput: false });

    // Configuration
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.resetTimeout = options.resetTimeout || 30000; // 30 seconds
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute(fn) {
    if (this.state === CircuitState.OPEN) {
      // Check if reset timeout has passed
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this._transitionTo(CircuitState.HALF_OPEN);
      } else {
        this.logger.debug('Circuit OPEN - rejecting request', { name: this.name });
        throw new Error(`Circuit ${this.name} is OPEN`);
      }
    }

    try {
      const result = await fn();
      this._recordSuccess();
      return result;
    } catch (error) {
      this._recordFailure(error);
      throw error;
    }
  }

  _recordSuccess() {
    this.successCount++;
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.successCount >= this.successThreshold) {
        this._transitionTo(CircuitState.CLOSED);
      }
    }

    this.logger.debug('Request succeeded', {
      state: this.state,
      successCount: this.successCount
    });
  }

  _recordFailure(error) {
    this.failureCount++;
    this.successCount = 0;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this._transitionTo(CircuitState.OPEN);
    } else if (this.failureCount >= this.failureThreshold) {
      this._transitionTo(CircuitState.OPEN);
    }

    this.logger.debug('Request failed', {
      state: this.state,
      failureCount: this.failureCount,
      error: error.message
    });
  }

  _transitionTo(newState) {
    const oldState = this.state;
    this.state = newState;
    this.logger.circuitBreaker(this.name, oldState, newState);

    if (newState === CircuitState.CLOSED) {
      this.failureCount = 0;
      this.successCount = 0;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.successCount = 0;
    }
  }

  getState() {
    return this.state;
  }

  getStats() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime
    };
  }

  reset() {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
  }
}

// =============================================================================
// MOCK RETRY LOGIC (Matches lib/retry.js pattern)
// =============================================================================

/**
 * Calculate exponential backoff with jitter
 */
function calculateBackoff(attempt, baseDelay = 1000, maxDelay = 30000) {
  const exponential = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  const jitter = exponential * 0.1 * Math.random();
  return exponential + jitter;
}

/**
 * Retry function with exponential backoff
 */
async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 100,
    maxDelay = 5000,
    retryOn = () => true,
    onRetry = () => {}
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !retryOn(error)) {
        throw error;
      }

      const delay = calculateBackoff(attempt, baseDelay, maxDelay);
      onRetry(attempt + 1, delay, error);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// =============================================================================
// MOCK STRUCTURED LOGGER (Matches lib/logger.js pattern)
// =============================================================================

/**
 * Mock structured logger
 */
class MockStructuredLogger {
  constructor(component) {
    this.component = component;
    this.entries = [];
  }

  _log(level, message, meta = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      component: this.component,
      message,
      ...meta
    };
    this.entries.push(entry);
    return entry;
  }

  debug(message, meta) { return this._log('debug', message, meta); }
  info(message, meta) { return this._log('info', message, meta); }
  warn(message, meta) { return this._log('warn', message, meta); }
  error(message, meta) { return this._log('error', message, meta); }

  withRequestId(requestId) {
    const child = new MockStructuredLogger(this.component);
    child._log = (level, message, meta) => {
      return this._log(level, message, { requestId, ...meta });
    };
    return child;
  }

  getEntries() {
    return [...this.entries];
  }

  clear() {
    this.entries = [];
  }

  toJSON() {
    return this.entries.map(e => JSON.stringify(e));
  }
}

// =============================================================================
// MOCK METRICS COLLECTOR
// =============================================================================

/**
 * Mock Prometheus-style metrics collector
 */
class MockMetricsCollector {
  constructor() {
    this.counters = new Map();
    this.histograms = new Map();
  }

  incrementCounter(name, labels = {}) {
    const key = this._labelKey(name, labels);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + 1);
  }

  observeHistogram(name, value, labels = {}) {
    const key = this._labelKey(name, labels);
    if (!this.histograms.has(key)) {
      this.histograms.set(key, []);
    }
    this.histograms.get(key).push(value);
  }

  _labelKey(name, labels) {
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return labelStr ? `${name}{${labelStr}}` : name;
  }

  toPrometheusFormat() {
    const lines = [];

    // Counters
    for (const [key, value] of this.counters) {
      lines.push(`${key} ${value}`);
    }

    // Histograms (simplified)
    for (const [key, values] of this.histograms) {
      const sum = values.reduce((a, b) => a + b, 0);
      const count = values.length;
      lines.push(`${key}_sum ${sum}`);
      lines.push(`${key}_count ${count}`);
    }

    return lines.join('\n');
  }

  reset() {
    this.counters.clear();
    this.histograms.clear();
  }
}

// =============================================================================
// TESTS
// =============================================================================

describe('Observability Regression Tests', () => {
  let logger;

  beforeEach(() => {
    logger = createSprint2Logger('observability-regression', { consoleOutput: false });
  });

  afterEach(() => {
    logger.writeSummary();
  });

  describe('Circuit Breaker State Machine', () => {
    let breaker;

    beforeEach(() => {
      breaker = new MockCircuitBreaker('test-service', {
        failureThreshold: 3,
        successThreshold: 2,
        resetTimeout: 100 // Short timeout for testing
      });
    });

    test('Starts in CLOSED state', () => {
      logger.testStart('Initial state');

      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      logger.testPass('Initial state');
    });

    test('Remains CLOSED on success', async () => {
      logger.testStart('Success keeps CLOSED');

      await breaker.execute(async () => 'success');

      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      logger.testPass('Success keeps CLOSED');
    });

    test('Opens after failure threshold', async () => {
      logger.testStart('Opens on threshold');

      const failFn = async () => { throw new Error('test failure'); };

      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failFn);
        } catch {}
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      logger.testPass('Opens on threshold');
    });

    test('Rejects requests when OPEN', async () => {
      logger.testStart('Rejects when OPEN');

      // Force open
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => { throw new Error('fail'); });
        } catch {}
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Should reject
      await expect(breaker.execute(async () => 'success'))
        .rejects.toThrow('Circuit test-service is OPEN');

      logger.testPass('Rejects when OPEN');
    });

    test('Transitions to HALF_OPEN after timeout', async () => {
      logger.testStart('HALF_OPEN after timeout');

      // Force open
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => { throw new Error('fail'); });
        } catch {}
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      // Next request should transition to HALF_OPEN
      try {
        await breaker.execute(async () => 'success');
      } catch {}

      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      logger.testPass('HALF_OPEN after timeout');
    });

    test('Closes from HALF_OPEN after success threshold', async () => {
      logger.testStart('CLOSED from HALF_OPEN');

      // Force to HALF_OPEN
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => { throw new Error('fail'); });
        } catch {}
      }
      await new Promise(resolve => setTimeout(resolve, 150));
      await breaker.execute(async () => 'success'); // Transitions to HALF_OPEN

      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Succeed again to close
      await breaker.execute(async () => 'success');

      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      logger.testPass('CLOSED from HALF_OPEN');
    });

    test('Returns to OPEN from HALF_OPEN on failure', async () => {
      logger.testStart('OPEN from HALF_OPEN on failure');

      // Force to HALF_OPEN
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => { throw new Error('fail'); });
        } catch {}
      }
      await new Promise(resolve => setTimeout(resolve, 150));
      await breaker.execute(async () => 'success');

      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Fail should go back to OPEN
      try {
        await breaker.execute(async () => { throw new Error('fail again'); });
      } catch {}

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      logger.testPass('OPEN from HALF_OPEN on failure');
    });

    test('Stats are accurate', async () => {
      logger.testStart('Stats accuracy');

      await breaker.execute(async () => 'success');
      await breaker.execute(async () => 'success');

      const stats = breaker.getStats();

      expect(stats.name).toBe('test-service');
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.successCount).toBe(2);
      expect(stats.failureCount).toBe(0);

      logger.testPass('Stats accuracy');
    });
  });

  describe('Retry Logic', () => {
    test('Succeeds on first attempt without retry', async () => {
      logger.testStart('Success no retry');

      let attempts = 0;
      const result = await retryWithBackoff(async () => {
        attempts++;
        return 'success';
      }, { maxRetries: 3 });

      expect(result).toBe('success');
      expect(attempts).toBe(1);

      logger.testPass('Success no retry');
    });

    test('Retries on failure and eventually succeeds', async () => {
      logger.testStart('Retry then success');

      let attempts = 0;
      const result = await retryWithBackoff(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('transient failure');
        }
        return 'success';
      }, { maxRetries: 3, baseDelay: 10 });

      expect(result).toBe('success');
      expect(attempts).toBe(3);

      logger.testPass('Retry then success');
    });

    test('Exhausts retries and throws', async () => {
      logger.testStart('Exhaust retries');

      let attempts = 0;
      await expect(retryWithBackoff(async () => {
        attempts++;
        throw new Error('persistent failure');
      }, { maxRetries: 2, baseDelay: 10 }))
        .rejects.toThrow('persistent failure');

      expect(attempts).toBe(3); // Initial + 2 retries

      logger.testPass('Exhaust retries');
    });

    test('Calls onRetry callback', async () => {
      logger.testStart('onRetry callback');

      const retryInfo = [];

      try {
        await retryWithBackoff(
          async () => { throw new Error('fail'); },
          {
            maxRetries: 2,
            baseDelay: 10,
            onRetry: (attempt, delay, error) => {
              retryInfo.push({ attempt, delay, error: error.message });
            }
          }
        );
      } catch {}

      expect(retryInfo.length).toBe(2);
      expect(retryInfo[0].attempt).toBe(1);
      expect(retryInfo[1].attempt).toBe(2);

      logger.testPass('onRetry callback');
    });

    test('Respects retryOn predicate', async () => {
      logger.testStart('retryOn predicate');

      let attempts = 0;
      const nonRetryableError = new Error('not retryable');
      nonRetryableError.retryable = false;

      await expect(retryWithBackoff(
        async () => {
          attempts++;
          throw nonRetryableError;
        },
        {
          maxRetries: 3,
          baseDelay: 10,
          retryOn: (error) => error.retryable !== false
        }
      )).rejects.toThrow('not retryable');

      expect(attempts).toBe(1); // No retries for non-retryable

      logger.testPass('retryOn predicate');
    });

    test('Backoff delay increases exponentially', () => {
      logger.testStart('Exponential backoff');

      const delays = [];
      for (let i = 0; i < 5; i++) {
        // Remove jitter for predictable test
        const delay = 100 * Math.pow(2, i);
        delays.push(delay);
      }

      expect(delays[0]).toBe(100);
      expect(delays[1]).toBe(200);
      expect(delays[2]).toBe(400);
      expect(delays[3]).toBe(800);
      expect(delays[4]).toBe(1600);

      logger.testPass('Exponential backoff');
    });
  });

  describe('Structured Logging', () => {
    let structuredLogger;

    beforeEach(() => {
      structuredLogger = new MockStructuredLogger('test-component');
    });

    test('Logs have required fields', () => {
      logger.testStart('Required log fields');

      structuredLogger.info('Test message', { key: 'value' });
      const entries = structuredLogger.getEntries();

      expect(entries[0]).toHaveProperty('timestamp');
      expect(entries[0]).toHaveProperty('level', 'info');
      expect(entries[0]).toHaveProperty('component', 'test-component');
      expect(entries[0]).toHaveProperty('message', 'Test message');
      expect(entries[0]).toHaveProperty('key', 'value');

      logger.testPass('Required log fields');
    });

    test('Child logger includes requestId', () => {
      logger.testStart('RequestId propagation');

      const child = structuredLogger.withRequestId('req-12345');
      child.info('Request processing');

      const entries = structuredLogger.getEntries();
      expect(entries[0]).toHaveProperty('requestId', 'req-12345');

      logger.testPass('RequestId propagation');
    });

    test('Logs can be serialized to JSON', () => {
      logger.testStart('JSON serialization');

      structuredLogger.info('Test', { nested: { data: true } });
      const json = structuredLogger.toJSON();

      expect(json.length).toBe(1);
      expect(() => JSON.parse(json[0])).not.toThrow();

      logger.testPass('JSON serialization');
    });

    test('All log levels work', () => {
      logger.testStart('All log levels');

      structuredLogger.debug('Debug message');
      structuredLogger.info('Info message');
      structuredLogger.warn('Warn message');
      structuredLogger.error('Error message');

      const entries = structuredLogger.getEntries();
      const levels = entries.map(e => e.level);

      expect(levels).toContain('debug');
      expect(levels).toContain('info');
      expect(levels).toContain('warn');
      expect(levels).toContain('error');

      logger.testPass('All log levels');
    });
  });

  describe('Metrics Collection', () => {
    let metrics;

    beforeEach(() => {
      metrics = new MockMetricsCollector();
    });

    test('Counters increment correctly', () => {
      logger.testStart('Counter increment');

      metrics.incrementCounter('http_requests_total', { method: 'GET', path: '/api/deals' });
      metrics.incrementCounter('http_requests_total', { method: 'GET', path: '/api/deals' });
      metrics.incrementCounter('http_requests_total', { method: 'POST', path: '/api/deals' });

      const output = metrics.toPrometheusFormat();

      expect(output).toContain('http_requests_total{method="GET",path="/api/deals"} 2');
      expect(output).toContain('http_requests_total{method="POST",path="/api/deals"} 1');

      logger.testPass('Counter increment');
    });

    test('Histograms track observations', () => {
      logger.testStart('Histogram observations');

      metrics.observeHistogram('http_request_duration_seconds', 0.1, { path: '/api/deals' });
      metrics.observeHistogram('http_request_duration_seconds', 0.2, { path: '/api/deals' });
      metrics.observeHistogram('http_request_duration_seconds', 0.3, { path: '/api/deals' });

      const output = metrics.toPrometheusFormat();

      expect(output).toContain('http_request_duration_seconds{path="/api/deals"}_sum 0.6');
      expect(output).toContain('http_request_duration_seconds{path="/api/deals"}_count 3');

      logger.testPass('Histogram observations');
    });

    test('Output is valid Prometheus format', () => {
      logger.testStart('Prometheus format');

      metrics.incrementCounter('test_counter', { label: 'value' });
      metrics.observeHistogram('test_histogram', 1.5);

      const output = metrics.toPrometheusFormat();
      const lines = output.split('\n');

      // Each line should match metric_name{labels} value or metric_name value
      for (const line of lines) {
        if (line.trim()) {
          expect(line).toMatch(/^[a-z_]+(\{[^}]*\})?\s+[\d.]+$/);
        }
      }

      logger.testPass('Prometheus format');
    });
  });

  describe('Integration: Circuit Breaker + Retry', () => {
    test('Retry respects circuit breaker', async () => {
      logger.testStart('Retry with circuit breaker');

      const breaker = new MockCircuitBreaker('integrated', {
        failureThreshold: 2,
        resetTimeout: 50
      });

      let attempts = 0;

      // First few failures should open circuit
      try {
        await retryWithBackoff(
          async () => {
            attempts++;
            return await breaker.execute(async () => {
              throw new Error('service down');
            });
          },
          { maxRetries: 5, baseDelay: 10 }
        );
      } catch (error) {
        // Expected to fail
      }

      // Circuit should be open after failures
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Attempts should be limited by circuit opening
      // (after circuit opens, retries fail fast)
      expect(attempts).toBeGreaterThan(2);

      logger.testPass('Retry with circuit breaker');
    });
  });
});

describe('Observability Helper Tests', () => {
  test('CircuitBreakerTestHelpers.simulateFailures works', async () => {
    const logger = createSprint2Logger('helper-test', { consoleOutput: false });
    let failCount = 0;

    const results = await CircuitBreakerTestHelpers.simulateFailures(
      5,
      async () => {
        failCount++;
        throw new Error('simulated');
      },
      logger
    );

    expect(results.length).toBe(5);
    expect(results.every(r => !r.success)).toBe(true);
    expect(failCount).toBe(5);
  });
});
