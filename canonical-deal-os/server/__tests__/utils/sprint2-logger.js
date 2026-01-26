/**
 * Sprint 2 Test Logger Utility
 *
 * Provides comprehensive logging for debugging Sprint 2 tests:
 * - Idempotency operations
 * - Circuit breaker state transitions
 * - Backup/restore operations
 * - Incident drill timeline
 *
 * Logs are written to both console and file for post-mortem analysis.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGS_DIR = path.resolve(__dirname, '../../../../logs/sprint2');

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

/**
 * Log levels with colors for console output
 */
const LOG_LEVELS = {
  DEBUG: { value: 0, color: '\x1b[36m', label: 'DEBUG' },   // Cyan
  INFO: { value: 1, color: '\x1b[32m', label: 'INFO' },     // Green
  WARN: { value: 2, color: '\x1b[33m', label: 'WARN' },     // Yellow
  ERROR: { value: 3, color: '\x1b[31m', label: 'ERROR' },   // Red
  CRITICAL: { value: 4, color: '\x1b[35m', label: 'CRITICAL' } // Magenta
};

const RESET_COLOR = '\x1b[0m';

/**
 * Sprint 2 Test Logger
 *
 * @example
 * const logger = createSprint2Logger('idempotency-capital-calls');
 * logger.info('Starting test', { testName: 'duplicate request handling' });
 * logger.debug('Request sent', { idempotencyKey: 'abc123', status: 201 });
 * logger.warn('Unexpected response', { expected: 200, actual: 201 });
 * logger.error('Test failed', { error: err.message });
 */
export function createSprint2Logger(testSuite, options = {}) {
  const {
    minLevel = 'DEBUG',
    writeToFile = true,
    consoleOutput = true,
    includeTimestamp = true,
    includeStackTrace = false
  } = options;

  const minLevelValue = LOG_LEVELS[minLevel]?.value ?? 0;
  const logFile = path.join(LOGS_DIR, `${testSuite}.log`);
  const entries = [];
  const startTime = Date.now();

  // Initialize log file with header
  if (writeToFile) {
    const header = [
      '='.repeat(80),
      `Sprint 2 Test Log: ${testSuite}`,
      `Started: ${new Date().toISOString()}`,
      `Environment: ${process.env.NODE_ENV || 'test'}`,
      '='.repeat(80),
      ''
    ].join('\n');
    fs.writeFileSync(logFile, header);
  }

  function formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const elapsed = Date.now() - startTime;
    const levelInfo = LOG_LEVELS[level] || LOG_LEVELS.INFO;

    const entry = {
      timestamp,
      elapsed: `${elapsed}ms`,
      level: levelInfo.label,
      message,
      ...meta
    };

    // Console format (colored)
    const consoleMsg = [
      includeTimestamp ? `[${timestamp}]` : '',
      `[+${elapsed.toString().padStart(6)}ms]`,
      `${levelInfo.color}[${levelInfo.label.padEnd(8)}]${RESET_COLOR}`,
      message,
      Object.keys(meta).length > 0 ? JSON.stringify(meta) : ''
    ].filter(Boolean).join(' ');

    // File format (JSON lines)
    const fileMsg = JSON.stringify(entry);

    return { consoleMsg, fileMsg, entry };
  }

  function log(level, message, meta = {}) {
    const levelValue = LOG_LEVELS[level]?.value ?? 1;
    if (levelValue < minLevelValue) return;

    const { consoleMsg, fileMsg, entry } = formatMessage(level, message, meta);
    entries.push(entry);

    if (consoleOutput && process.env.SPRINT2_LOG_CONSOLE !== 'false') {
      console.log(consoleMsg);
    }

    if (writeToFile) {
      fs.appendFileSync(logFile, fileMsg + '\n');
    }
  }

  return {
    debug: (message, meta) => log('DEBUG', message, meta),
    info: (message, meta) => log('INFO', message, meta),
    warn: (message, meta) => log('WARN', message, meta),
    error: (message, meta) => log('ERROR', message, meta),
    critical: (message, meta) => log('CRITICAL', message, meta),

    /**
     * Log a test case start
     */
    testStart: (testName, context = {}) => {
      log('INFO', `TEST START: ${testName}`, {
        testName,
        ...context
      });
    },

    /**
     * Log a test case pass
     */
    testPass: (testName, duration = null) => {
      log('INFO', `TEST PASS: ${testName}`, {
        testName,
        result: 'PASS',
        ...(duration && { durationMs: duration })
      });
    },

    /**
     * Log a test case failure
     */
    testFail: (testName, error, context = {}) => {
      log('ERROR', `TEST FAIL: ${testName}`, {
        testName,
        result: 'FAIL',
        error: error?.message || String(error),
        ...(includeStackTrace && error?.stack && { stack: error.stack }),
        ...context
      });
    },

    /**
     * Log an idempotency operation
     */
    idempotency: (operation, details) => {
      log('DEBUG', `IDEMPOTENCY: ${operation}`, {
        operation,
        ...details
      });
    },

    /**
     * Log a circuit breaker state change
     */
    circuitBreaker: (service, fromState, toState, reason = null) => {
      log('INFO', `CIRCUIT: ${service} ${fromState} -> ${toState}`, {
        service,
        fromState,
        toState,
        ...(reason && { reason })
      });
    },

    /**
     * Log a backup operation
     */
    backup: (operation, details) => {
      log('INFO', `BACKUP: ${operation}`, {
        operation,
        ...details
      });
    },

    /**
     * Log an incident drill event
     */
    incidentDrill: (timeOffset, event, details = {}) => {
      log('INFO', `DRILL [T+${timeOffset}]: ${event}`, {
        drillTime: timeOffset,
        event,
        ...details
      });
    },

    /**
     * Get all log entries
     */
    getEntries: () => [...entries],

    /**
     * Get entries filtered by level
     */
    getEntriesByLevel: (level) => entries.filter(e => e.level === level),

    /**
     * Get entries filtered by pattern in message
     */
    search: (pattern) => entries.filter(e =>
      e.message.includes(pattern) || JSON.stringify(e).includes(pattern)
    ),

    /**
     * Get summary statistics
     */
    getSummary: () => {
      const levelCounts = {};
      Object.keys(LOG_LEVELS).forEach(l => levelCounts[l] = 0);
      entries.forEach(e => levelCounts[e.level]++);

      return {
        totalEntries: entries.length,
        byLevel: levelCounts,
        duration: `${Date.now() - startTime}ms`,
        logFile
      };
    },

    /**
     * Write summary to file
     */
    writeSummary: () => {
      const summary = {
        testSuite,
        completed: new Date().toISOString(),
        totalDuration: `${Date.now() - startTime}ms`,
        entries: entries.length,
        byLevel: {},
        errors: entries.filter(e => e.level === 'ERROR' || e.level === 'CRITICAL')
      };
      Object.keys(LOG_LEVELS).forEach(l => {
        summary.byLevel[l] = entries.filter(e => e.level === l).length;
      });

      const summaryFile = path.join(LOGS_DIR, `${testSuite}-summary.json`);
      fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));

      return summaryFile;
    },

    /**
     * Get the log file path
     */
    getLogFile: () => logFile
  };
}

/**
 * Create a test context tracker for complex test scenarios
 */
export function createTestContext(logger) {
  const context = {
    requests: [],
    responses: [],
    stateChanges: [],
    assertions: []
  };

  return {
    /**
     * Track an HTTP request
     */
    trackRequest: (method, url, body = null, headers = {}) => {
      const entry = {
        timestamp: new Date().toISOString(),
        method,
        url,
        body,
        headers: { ...headers, Authorization: headers.Authorization ? '[REDACTED]' : undefined }
      };
      context.requests.push(entry);
      logger.debug('Request tracked', entry);
      return entry;
    },

    /**
     * Track an HTTP response
     */
    trackResponse: (status, body, headers = {}) => {
      const entry = {
        timestamp: new Date().toISOString(),
        status,
        body,
        headers
      };
      context.responses.push(entry);
      logger.debug('Response tracked', { status, bodyKeys: Object.keys(body || {}) });
      return entry;
    },

    /**
     * Track a state change
     */
    trackStateChange: (entity, field, oldValue, newValue) => {
      const entry = {
        timestamp: new Date().toISOString(),
        entity,
        field,
        oldValue,
        newValue
      };
      context.stateChanges.push(entry);
      logger.debug('State change', entry);
      return entry;
    },

    /**
     * Track an assertion
     */
    trackAssertion: (description, expected, actual, passed) => {
      const entry = {
        timestamp: new Date().toISOString(),
        description,
        expected,
        actual,
        passed
      };
      context.assertions.push(entry);
      if (passed) {
        logger.debug('Assertion passed', { description });
      } else {
        logger.warn('Assertion failed', { description, expected, actual });
      }
      return entry;
    },

    /**
     * Get the full context
     */
    getContext: () => ({ ...context }),

    /**
     * Get failed assertions
     */
    getFailedAssertions: () => context.assertions.filter(a => !a.passed),

    /**
     * Reset context
     */
    reset: () => {
      context.requests = [];
      context.responses = [];
      context.stateChanges = [];
      context.assertions = [];
    }
  };
}

/**
 * Idempotency-specific test helpers
 */
export const IdempotencyTestHelpers = {
  /**
   * Generate a unique idempotency key
   */
  generateKey: () => {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `idem-${timestamp}-${random}`;
  },

  /**
   * Assert idempotent behavior
   */
  assertIdempotent: (firstResponse, secondResponse, logger) => {
    const checks = {
      sameId: firstResponse.body?.id === secondResponse.body?.id,
      firstCreated: firstResponse.status === 201,
      secondCached: secondResponse.status === 200,
      sameData: JSON.stringify(firstResponse.body) === JSON.stringify(secondResponse.body)
    };

    logger.idempotency('assertIdempotent', {
      firstStatus: firstResponse.status,
      secondStatus: secondResponse.status,
      checks
    });

    const passed = Object.values(checks).every(Boolean);
    if (!passed) {
      logger.warn('Idempotency assertion failed', checks);
    }

    return checks;
  }
};

/**
 * Circuit breaker test helpers
 */
export const CircuitBreakerTestHelpers = {
  /**
   * Simulate failures to trigger circuit open
   */
  simulateFailures: async (failureCount, failureFn, logger) => {
    logger.circuitBreaker('test', 'CLOSED', 'SIMULATING_FAILURES', `${failureCount} failures`);

    const results = [];
    for (let i = 0; i < failureCount; i++) {
      try {
        await failureFn();
        results.push({ index: i, success: true });
      } catch (error) {
        results.push({ index: i, success: false, error: error.message });
      }
    }

    logger.debug('Failure simulation complete', {
      total: failureCount,
      failed: results.filter(r => !r.success).length
    });

    return results;
  },

  /**
   * Wait for circuit to transition to half-open
   */
  waitForHalfOpen: async (resetTimeoutMs, logger) => {
    logger.circuitBreaker('test', 'OPEN', 'WAITING', `${resetTimeoutMs}ms timeout`);
    await new Promise(resolve => setTimeout(resolve, resetTimeoutMs + 100));
    logger.circuitBreaker('test', 'OPEN', 'HALF_OPEN', 'timeout elapsed');
  }
};

/**
 * Backup/restore test helpers
 */
export const BackupTestHelpers = {
  /**
   * Generate test metrics for comparison
   */
  captureMetrics: async (prisma, logger) => {
    const metrics = {
      timestamp: new Date().toISOString(),
      counts: {}
    };

    // Capture counts for key tables
    const tables = ['deal', 'organization', 'user', 'capitalCall', 'distribution'];
    for (const table of tables) {
      try {
        metrics.counts[table] = await prisma[table].count();
      } catch {
        metrics.counts[table] = 'N/A';
      }
    }

    logger.backup('captureMetrics', metrics);
    return metrics;
  },

  /**
   * Compare metrics before and after restore
   */
  compareMetrics: (before, after, logger) => {
    const comparison = {
      timestamp: new Date().toISOString(),
      matches: {},
      mismatches: []
    };

    for (const [table, beforeCount] of Object.entries(before.counts)) {
      const afterCount = after.counts[table];
      const match = beforeCount === afterCount;
      comparison.matches[table] = match;

      if (!match) {
        comparison.mismatches.push({
          table,
          before: beforeCount,
          after: afterCount,
          diff: afterCount - beforeCount
        });
      }
    }

    logger.backup('compareMetrics', {
      tablesChecked: Object.keys(comparison.matches).length,
      allMatch: comparison.mismatches.length === 0,
      mismatches: comparison.mismatches
    });

    return comparison;
  }
};

export default createSprint2Logger;
