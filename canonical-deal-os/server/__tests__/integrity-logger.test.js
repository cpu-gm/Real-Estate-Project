/**
 * P1 Data Integrity Sprint - Integrity Logger Tests
 *
 * Tests for Task 0: Logging Infrastructure
 * - createIntegrityLogger() creation and basic methods
 * - beforeState/afterState logging
 * - invariantCheck logging and violation writing
 * - computedValue logging
 * - flush() with persistence
 */

import { jest } from '@jest/globals';

// Mock Prisma
const mockPrisma = {
  integrityLog: {
    create: jest.fn().mockResolvedValue({ id: 'test-log-id' })
  },
  integrityViolation: {
    create: jest.fn().mockResolvedValue({ id: 'test-violation-id' })
  }
};

jest.unstable_mockModule('../db.js', () => ({
  getPrisma: () => mockPrisma
}));

// Import after mocking
const { createIntegrityLogger, INTEGRITY_OPERATIONS, INVARIANTS } = await import('../services/integrity-logger.js');

describe('Task 0: Integrity Logger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Capture console output
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createIntegrityLogger', () => {
    it('creates logger with context', () => {
      const logger = createIntegrityLogger({
        operation: 'TEST_OPERATION',
        dealId: 'deal-123',
        userId: 'user-456',
        requestId: 'req-789'
      });

      expect(logger).toBeDefined();
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.critical).toBe('function');
      expect(typeof logger.beforeState).toBe('function');
      expect(typeof logger.afterState).toBe('function');
      expect(typeof logger.invariantCheck).toBe('function');
      expect(typeof logger.computedValue).toBe('function');
      expect(typeof logger.flush).toBe('function');
    });

    it('accumulates log entries', async () => {
      const logger = createIntegrityLogger({
        operation: 'TEST_OPERATION',
        dealId: 'deal-123'
      });

      logger.info('Test message 1', { key: 'value1' });
      logger.debug('Test message 2', { key: 'value2' });

      const logs = logger.getLogs();
      expect(logs.length).toBe(2);
      expect(logs[0].message).toBe('Test message 1');
      expect(logs[1].message).toBe('Test message 2');
    });
  });

  describe('beforeState and afterState', () => {
    it('logs state with entity name', () => {
      const logger = createIntegrityLogger({
        operation: 'TEST_OPERATION',
        dealId: 'deal-123'
      });

      const stateBefore = { id: 'alloc-1', amount: 50000 };
      const stateAfter = { id: 'alloc-1', amount: 50000, status: 'FUNDED' };

      logger.beforeState('allocation', stateBefore);
      logger.afterState('allocation', stateAfter);

      const logs = logger.getLogs();
      expect(logs.length).toBe(2);
      expect(logs[0].message).toBe('BEFORE_STATE:allocation');
      expect(logs[0].data).toEqual(stateBefore);
      expect(logs[1].message).toBe('AFTER_STATE:allocation');
      expect(logs[1].data).toEqual(stateAfter);
    });
  });

  describe('invariantCheck', () => {
    it('returns true and logs INFO when invariant passes', async () => {
      const logger = createIntegrityLogger({
        operation: 'TEST_OPERATION',
        dealId: 'deal-123'
      });

      const result = logger.invariantCheck('SUM_EQUALS_TOTAL', true, {
        sum: 100000,
        total: 100000
      });

      expect(result).toBe(true);

      const logs = logger.getLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].level).toBe('INFO');
      expect(logs[0].message).toBe('INVARIANT:SUM_EQUALS_TOTAL');
      expect(logs[0].data.passed).toBe(true);

      // Should NOT write violation
      expect(mockPrisma.integrityViolation.create).not.toHaveBeenCalled();
    });

    it('returns false and logs CRITICAL when invariant fails', async () => {
      const logger = createIntegrityLogger({
        operation: 'TEST_OPERATION',
        dealId: 'deal-123',
        userId: 'user-456'
      });

      const result = logger.invariantCheck('SUM_EQUALS_TOTAL', false, {
        sum: 99999,
        total: 100000,
        diff: -1
      });

      expect(result).toBe(false);

      const logs = logger.getLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].level).toBe('CRITICAL');
      expect(logs[0].message).toBe('INVARIANT:SUM_EQUALS_TOTAL');
      expect(logs[0].data.passed).toBe(false);

      // Should warn to console
      expect(console.warn).toHaveBeenCalled();

      // Give async writeViolation time to execute
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should write violation
      expect(mockPrisma.integrityViolation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          invariantName: 'SUM_EQUALS_TOTAL',
          operation: 'TEST_OPERATION',
          dealId: 'deal-123',
          userId: 'user-456'
        })
      });
    });
  });

  describe('computedValue', () => {
    it('logs computed value with inputs', () => {
      const logger = createIntegrityLogger({
        operation: 'TEST_OPERATION',
        dealId: 'deal-123'
      });

      logger.computedValue('capitalContributed', 60000, {
        fundedAllocations: 3,
        allocations: [20000, 20000, 20000]
      });

      const logs = logger.getLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].message).toBe('COMPUTED:capitalContributed');
      expect(logs[0].data.value).toBe(60000);
      expect(logs[0].data.inputs.fundedAllocations).toBe(3);
    });
  });

  describe('flush', () => {
    it('outputs structured JSON to console', async () => {
      const logger = createIntegrityLogger({
        operation: 'TEST_OPERATION',
        dealId: 'deal-123',
        userId: 'user-456',
        requestId: 'req-789'
      });

      logger.info('Test message');
      await logger.flush();

      expect(console.log).toHaveBeenCalled();
      const logCall = console.log.mock.calls[0][0];
      const parsed = JSON.parse(logCall);

      expect(parsed.type).toBe('INTEGRITY_LOG');
      expect(parsed.operation).toBe('TEST_OPERATION');
      expect(parsed.dealId).toBe('deal-123');
      expect(parsed.logCount).toBe(1);
      expect(parsed.logs).toHaveLength(1);
    });

    it('persists critical logs to database', async () => {
      const logger = createIntegrityLogger({
        operation: 'TEST_OPERATION',
        dealId: 'deal-123'
      });

      logger.warn('Warning message', { detail: 'important' });
      await logger.flush();

      expect(mockPrisma.integrityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          operation: 'TEST_OPERATION',
          dealId: 'deal-123'
        })
      });
    });

    it('does NOT persist non-critical logs to database', async () => {
      const logger = createIntegrityLogger({
        operation: 'TEST_OPERATION',
        dealId: 'deal-123'
      });

      logger.info('Info message');
      logger.debug('Debug message');
      await logger.flush();

      // Only console output, no DB persistence
      expect(mockPrisma.integrityLog.create).not.toHaveBeenCalled();
    });

    it('returns summary with hasErrors and hasWarnings flags', async () => {
      const logger = createIntegrityLogger({
        operation: 'TEST_OPERATION',
        dealId: 'deal-123'
      });

      logger.info('Info');
      logger.warn('Warning');

      const summary = await logger.flush();

      expect(summary.operation).toBe('TEST_OPERATION');
      expect(summary.hasWarnings).toBe(true);
      expect(summary.hasErrors).toBe(false);
      expect(summary.logCount).toBe(2);
      expect(summary.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('INTEGRITY_OPERATIONS constants', () => {
    it('exports standard operation names', () => {
      expect(INTEGRITY_OPERATIONS.CAPITAL_CALL_CREATE).toBe('CAPITAL_CALL_CREATE');
      expect(INTEGRITY_OPERATIONS.DISTRIBUTION_CREATE).toBe('DISTRIBUTION_CREATE');
      expect(INTEGRITY_OPERATIONS.LP_POSITION_COMPUTE).toBe('LP_POSITION_COMPUTE');
    });
  });

  describe('INVARIANTS constants', () => {
    it('exports standard invariant names', () => {
      expect(INVARIANTS.ALLOCATION_SUM_EQUALS_TOTAL).toBe('ALLOCATION_SUM_EQUALS_TOTAL');
      expect(INVARIANTS.CAPITAL_CONTRIBUTED_NON_NEGATIVE).toBe('CAPITAL_CONTRIBUTED_NON_NEGATIVE');
    });
  });
});
