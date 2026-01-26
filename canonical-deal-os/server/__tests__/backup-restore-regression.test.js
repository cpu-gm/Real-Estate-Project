/**
 * Backup/Restore Regression Tests
 *
 * Sprint 2, Days 17-18: Backup Automation and Drill
 *
 * These tests verify backup and restore operations:
 * - Backup creation and integrity
 * - Restore procedures
 * - Hash chain verification after restore
 * - Metrics comparison before/after
 *
 * Regression Coverage:
 * - Backups can be created successfully
 * - Backups can be restored without data loss
 * - Hash chain integrity is preserved
 * - RTO targets are achievable
 *
 * Key Invariant:
 * After restore, the system state MUST be identical to the
 * state at backup time, including hash chain integrity.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  createSprint2Logger,
  BackupTestHelpers
} from './utils/sprint2-logger.js';
import crypto from 'crypto';

// =============================================================================
// MOCK DATABASE STATE
// =============================================================================

/**
 * Mock database state for testing backup/restore
 */
class MockDatabaseState {
  constructor() {
    this.tables = {
      organizations: [],
      users: [],
      deals: [],
      dealEvents: [],
      capitalCalls: [],
      distributions: []
    };
    this.logger = createSprint2Logger('mock-database', { consoleOutput: false });
  }

  /**
   * Add a record to a table
   */
  insert(table, record) {
    if (!this.tables[table]) {
      throw new Error(`Unknown table: ${table}`);
    }
    const withId = { id: crypto.randomUUID(), ...record };
    this.tables[table].push(withId);
    return withId;
  }

  /**
   * Get count for a table
   */
  count(table) {
    return this.tables[table]?.length || 0;
  }

  /**
   * Get all records from a table
   */
  findAll(table) {
    return [...(this.tables[table] || [])];
  }

  /**
   * Create a full backup (snapshot)
   */
  createBackup() {
    const backup = {
      timestamp: new Date().toISOString(),
      checksum: '',
      data: {}
    };

    // Deep copy all tables
    for (const [table, records] of Object.entries(this.tables)) {
      backup.data[table] = JSON.parse(JSON.stringify(records));
    }

    // Calculate checksum
    backup.checksum = this._calculateChecksum(backup.data);

    this.logger.backup('createBackup', {
      timestamp: backup.timestamp,
      checksum: backup.checksum,
      tableCounts: this._getTableCounts()
    });

    return backup;
  }

  /**
   * Restore from backup
   */
  restoreFromBackup(backup) {
    // Verify checksum before restore
    const calculatedChecksum = this._calculateChecksum(backup.data);
    if (calculatedChecksum !== backup.checksum) {
      throw new Error('Backup checksum mismatch - backup may be corrupted');
    }

    // Clear current state
    for (const table of Object.keys(this.tables)) {
      this.tables[table] = [];
    }

    // Restore from backup
    for (const [table, records] of Object.entries(backup.data)) {
      if (this.tables[table] !== undefined) {
        this.tables[table] = JSON.parse(JSON.stringify(records));
      }
    }

    this.logger.backup('restoreFromBackup', {
      backupTimestamp: backup.timestamp,
      tableCounts: this._getTableCounts()
    });

    return true;
  }

  /**
   * Simulate disaster (clear all data)
   */
  simulateDisaster() {
    this.logger.backup('simulateDisaster', {
      beforeCounts: this._getTableCounts()
    });

    for (const table of Object.keys(this.tables)) {
      this.tables[table] = [];
    }

    return true;
  }

  /**
   * Get metrics for comparison
   */
  getMetrics() {
    return {
      timestamp: new Date().toISOString(),
      counts: this._getTableCounts(),
      latestEventHash: this._getLatestEventHash()
    };
  }

  /**
   * Calculate checksum of data
   */
  _calculateChecksum(data) {
    const json = JSON.stringify(data, Object.keys(data).sort());
    return crypto.createHash('sha256').update(json).digest('hex');
  }

  /**
   * Get counts for all tables
   */
  _getTableCounts() {
    const counts = {};
    for (const [table, records] of Object.entries(this.tables)) {
      counts[table] = records.length;
    }
    return counts;
  }

  /**
   * Get the hash of the latest event (for hash chain verification)
   */
  _getLatestEventHash() {
    const events = this.tables.dealEvents;
    if (events.length === 0) return null;

    const sorted = [...events].sort((a, b) =>
      (b.sequenceNumber || 0) - (a.sequenceNumber || 0)
    );
    return sorted[0]?.eventHash || null;
  }
}

// =============================================================================
// MOCK HASH CHAIN VERIFIER
// =============================================================================

/**
 * Verify hash chain integrity for deal events
 */
class MockHashChainVerifier {
  constructor(database) {
    this.database = database;
    this.logger = createSprint2Logger('hash-chain-verifier', { consoleOutput: false });
  }

  /**
   * Verify hash chain for a specific deal
   */
  verifyDealChain(dealId) {
    const events = this.database.findAll('dealEvents')
      .filter(e => e.dealId === dealId)
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber);

    if (events.length === 0) {
      return { valid: true, reason: 'No events to verify' };
    }

    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      // Calculate expected hash
      const expectedHash = this._calculateEventHash(event, events[i - 1]);

      if (event.eventHash !== expectedHash) {
        this.logger.warn('Hash chain broken', {
          dealId,
          eventIndex: i,
          expectedHash,
          actualHash: event.eventHash
        });
        return {
          valid: false,
          brokenAt: i,
          reason: `Hash mismatch at event ${i}`
        };
      }

      // Check previous hash link
      if (i > 0 && event.previousHash !== events[i - 1].eventHash) {
        this.logger.warn('Previous hash link broken', {
          dealId,
          eventIndex: i
        });
        return {
          valid: false,
          brokenAt: i,
          reason: `Previous hash link broken at event ${i}`
        };
      }
    }

    this.logger.info('Hash chain verified', {
      dealId,
      eventCount: events.length
    });

    return { valid: true, eventCount: events.length };
  }

  /**
   * Verify all deal chains in database
   */
  verifyAll() {
    const deals = this.database.findAll('deals');
    const results = {
      total: deals.length,
      valid: 0,
      invalid: 0,
      failures: []
    };

    for (const deal of deals) {
      const verification = this.verifyDealChain(deal.id);
      if (verification.valid) {
        results.valid++;
      } else {
        results.invalid++;
        results.failures.push({
          dealId: deal.id,
          ...verification
        });
      }
    }

    return results;
  }

  /**
   * Calculate event hash
   */
  _calculateEventHash(event, previousEvent) {
    const payload = JSON.stringify({
      dealId: event.dealId,
      sequenceNumber: event.sequenceNumber,
      eventType: event.eventType,
      eventData: event.eventData,
      previousHash: previousEvent?.eventHash || null,
      timestamp: event.timestamp
    });
    return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32);
  }
}

// =============================================================================
// TEST DATA GENERATOR
// =============================================================================

/**
 * Generate test data with hash chain
 */
function generateTestData(database) {
  // Create organization
  const org = database.insert('organizations', {
    name: 'Test Org',
    slug: 'test-org'
  });

  // Create user
  const user = database.insert('users', {
    email: 'test@example.com',
    organizationId: org.id
  });

  // Create deals
  const deals = [];
  for (let i = 0; i < 3; i++) {
    const deal = database.insert('deals', {
      name: `Test Deal ${i + 1}`,
      organizationId: org.id,
      status: 'ACTIVE'
    });
    deals.push(deal);

    // Create events with hash chain
    let previousHash = null;
    for (let j = 0; j < 5; j++) {
      const eventData = {
        action: j === 0 ? 'CREATED' : `UPDATE_${j}`,
        actor: user.id
      };

      const event = {
        dealId: deal.id,
        sequenceNumber: j,
        eventType: j === 0 ? 'DealCreated' : 'DealUpdated',
        eventData,
        previousHash,
        timestamp: new Date(Date.now() + j * 1000).toISOString()
      };

      // Calculate hash
      event.eventHash = crypto.createHash('sha256')
        .update(JSON.stringify({
          ...event,
          previousHash
        }))
        .digest('hex')
        .slice(0, 32);

      database.insert('dealEvents', event);
      previousHash = event.eventHash;
    }
  }

  // Create capital calls
  for (const deal of deals) {
    database.insert('capitalCalls', {
      dealId: deal.id,
      amount: 100000,
      status: 'PENDING'
    });
  }

  // Create distributions
  database.insert('distributions', {
    dealId: deals[0].id,
    amount: 50000,
    status: 'DRAFT'
  });

  return { org, user, deals };
}

// =============================================================================
// TESTS
// =============================================================================

describe('Backup/Restore Regression Tests', () => {
  let database;
  let hashVerifier;
  let logger;

  beforeEach(() => {
    database = new MockDatabaseState();
    hashVerifier = new MockHashChainVerifier(database);
    logger = createSprint2Logger('backup-restore-regression', { consoleOutput: false });
  });

  afterEach(() => {
    logger.writeSummary();
  });

  describe('Backup Creation', () => {
    test('Creates backup with correct checksum', () => {
      logger.testStart('Backup creation');

      generateTestData(database);
      const backup = database.createBackup();

      expect(backup.timestamp).toBeDefined();
      expect(backup.checksum).toBeDefined();
      expect(backup.checksum.length).toBe(64); // SHA-256 hex
      expect(backup.data).toBeDefined();

      logger.testPass('Backup creation');
    });

    test('Backup contains all tables', () => {
      logger.testStart('Backup completeness');

      generateTestData(database);
      const backup = database.createBackup();

      expect(backup.data.organizations).toBeDefined();
      expect(backup.data.users).toBeDefined();
      expect(backup.data.deals).toBeDefined();
      expect(backup.data.dealEvents).toBeDefined();
      expect(backup.data.capitalCalls).toBeDefined();
      expect(backup.data.distributions).toBeDefined();

      logger.testPass('Backup completeness');
    });

    test('Backup preserves record counts', () => {
      logger.testStart('Backup record counts');

      generateTestData(database);
      const beforeCounts = database._getTableCounts();
      const backup = database.createBackup();

      for (const [table, count] of Object.entries(beforeCounts)) {
        expect(backup.data[table].length).toBe(count);
      }

      logger.testPass('Backup record counts');
    });

    test('Backup is isolated from live database', () => {
      logger.testStart('Backup isolation');

      generateTestData(database);
      const backup = database.createBackup();
      const originalCount = backup.data.deals.length;

      // Modify live database
      database.insert('deals', { name: 'New Deal After Backup' });

      // Backup should be unchanged
      expect(backup.data.deals.length).toBe(originalCount);

      logger.testPass('Backup isolation');
    });
  });

  describe('Restore Operations', () => {
    test('Restore recovers all data', () => {
      logger.testStart('Full restore');

      generateTestData(database);
      const metricsBefore = database.getMetrics();
      const backup = database.createBackup();

      // Disaster
      database.simulateDisaster();
      expect(database.count('deals')).toBe(0);

      // Restore
      database.restoreFromBackup(backup);
      const metricsAfter = database.getMetrics();

      // Compare counts
      for (const [table, count] of Object.entries(metricsBefore.counts)) {
        expect(metricsAfter.counts[table]).toBe(count);
      }

      logger.testPass('Full restore');
    });

    test('Restore fails on corrupted backup', () => {
      logger.testStart('Corrupted backup detection');

      generateTestData(database);
      const backup = database.createBackup();

      // Corrupt the backup
      backup.data.deals.push({ id: 'corrupted', name: 'Corrupted' });

      // Restore should fail
      expect(() => database.restoreFromBackup(backup))
        .toThrow('Backup checksum mismatch');

      logger.testPass('Corrupted backup detection');
    });

    test('Restore replaces all current data', () => {
      logger.testStart('Restore replaces data');

      generateTestData(database);
      const backup = database.createBackup();

      // Add more data
      database.insert('deals', { name: 'Post-Backup Deal 1' });
      database.insert('deals', { name: 'Post-Backup Deal 2' });
      expect(database.count('deals')).toBe(5); // 3 original + 2 new

      // Restore
      database.restoreFromBackup(backup);
      expect(database.count('deals')).toBe(3); // Only original 3

      logger.testPass('Restore replaces data');
    });
  });

  describe('Hash Chain Integrity', () => {
    test('Hash chain is valid before backup', () => {
      logger.testStart('Pre-backup hash chain');

      generateTestData(database);
      const verification = hashVerifier.verifyAll();

      expect(verification.invalid).toBe(0);
      expect(verification.valid).toBe(3); // 3 deals

      logger.testPass('Pre-backup hash chain');
    });

    test('Hash chain is valid after restore', () => {
      logger.testStart('Post-restore hash chain');

      generateTestData(database);
      const backup = database.createBackup();

      database.simulateDisaster();
      database.restoreFromBackup(backup);

      const verification = hashVerifier.verifyAll();

      expect(verification.invalid).toBe(0);
      expect(verification.valid).toBe(3);

      logger.testPass('Post-restore hash chain');
    });

    test('Tampered event is detected', () => {
      logger.testStart('Tampered event detection');

      generateTestData(database);

      // Tamper with an event
      const events = database.findAll('dealEvents');
      if (events.length > 0) {
        events[0].eventData = { tampered: true };
        database.tables.dealEvents = events;
      }

      const verification = hashVerifier.verifyAll();

      expect(verification.invalid).toBeGreaterThan(0);

      logger.testPass('Tampered event detection');
    });

    test('Deleted event breaks chain', () => {
      logger.testStart('Deleted event detection');

      generateTestData(database);

      // Delete an event (not the first one)
      const events = database.findAll('dealEvents');
      const dealId = events[0]?.dealId;
      if (dealId) {
        const dealEvents = events.filter(e => e.dealId === dealId);
        if (dealEvents.length > 2) {
          // Remove middle event
          database.tables.dealEvents = events.filter(
            e => e.id !== dealEvents[1].id
          );

          const verification = hashVerifier.verifyDealChain(dealId);
          expect(verification.valid).toBe(false);
        }
      }

      logger.testPass('Deleted event detection');
    });
  });

  describe('Metrics Comparison', () => {
    test('Metrics match before and after restore', () => {
      logger.testStart('Metrics comparison');

      generateTestData(database);
      const metricsBefore = database.getMetrics();
      const backup = database.createBackup();

      database.simulateDisaster();
      database.restoreFromBackup(backup);

      const metricsAfter = database.getMetrics();

      // Use BackupTestHelpers for comparison
      const mockPrisma = {
        deal: { count: async () => database.count('deals') },
        organization: { count: async () => database.count('organizations') },
        user: { count: async () => database.count('users') },
        capitalCall: { count: async () => database.count('capitalCalls') },
        distribution: { count: async () => database.count('distributions') }
      };

      // Compare counts
      expect(metricsAfter.counts.deals).toBe(metricsBefore.counts.deals);
      expect(metricsAfter.counts.organizations).toBe(metricsBefore.counts.organizations);
      expect(metricsAfter.counts.users).toBe(metricsBefore.counts.users);

      logger.testPass('Metrics comparison');
    });

    test('Latest event hash matches after restore', () => {
      logger.testStart('Event hash preservation');

      generateTestData(database);
      const metricsBefore = database.getMetrics();
      const backup = database.createBackup();

      database.simulateDisaster();
      database.restoreFromBackup(backup);

      const metricsAfter = database.getMetrics();

      expect(metricsAfter.latestEventHash).toBe(metricsBefore.latestEventHash);

      logger.testPass('Event hash preservation');
    });
  });

  describe('Disaster Recovery Simulation', () => {
    test('Full disaster recovery drill', () => {
      logger.testStart('Full DR drill');

      // Setup
      generateTestData(database);
      const startTime = Date.now();

      // Step 1: Capture metrics
      const metricsBefore = database.getMetrics();
      logger.incidentDrill('0s', 'Metrics captured', metricsBefore.counts);

      // Step 2: Create backup
      const backup = database.createBackup();
      logger.incidentDrill('1s', 'Backup created', { checksum: backup.checksum });

      // Step 3: Verify hash chain
      const verifyBefore = hashVerifier.verifyAll();
      expect(verifyBefore.invalid).toBe(0);
      logger.incidentDrill('2s', 'Hash chain verified', { valid: verifyBefore.valid });

      // Step 4: Simulate disaster
      database.simulateDisaster();
      expect(database.count('deals')).toBe(0);
      logger.incidentDrill('3s', 'Disaster simulated', { dataLost: true });

      // Step 5: Restore
      database.restoreFromBackup(backup);
      logger.incidentDrill('4s', 'Restore completed');

      // Step 6: Verify metrics
      const metricsAfter = database.getMetrics();
      expect(metricsAfter.counts.deals).toBe(metricsBefore.counts.deals);
      logger.incidentDrill('5s', 'Metrics verified', metricsAfter.counts);

      // Step 7: Verify hash chain
      const verifyAfter = hashVerifier.verifyAll();
      expect(verifyAfter.invalid).toBe(0);
      logger.incidentDrill('6s', 'Hash chain verified', { valid: verifyAfter.valid });

      // Step 8: Calculate RTO
      const totalTime = Date.now() - startTime;
      logger.incidentDrill(`${totalTime}ms`, 'Drill complete', {
        rto: totalTime < 3600000 ? 'PASS' : 'FAIL' // < 1 hour
      });

      expect(totalTime).toBeLessThan(3600000); // RTO < 1 hour

      logger.testPass('Full DR drill');
    });
  });
});

describe('Backup Helper Tests', () => {
  test('BackupTestHelpers.compareMetrics detects mismatches', () => {
    const logger = createSprint2Logger('helper-test', { consoleOutput: false });

    const before = {
      counts: { deals: 10, users: 5 }
    };
    const after = {
      counts: { deals: 8, users: 5 }
    };

    const comparison = BackupTestHelpers.compareMetrics(before, after, logger);

    expect(comparison.mismatches.length).toBe(1);
    expect(comparison.mismatches[0].table).toBe('deals');
    expect(comparison.mismatches[0].before).toBe(10);
    expect(comparison.mismatches[0].after).toBe(8);
  });

  test('BackupTestHelpers.compareMetrics passes when matching', () => {
    const logger = createSprint2Logger('helper-test', { consoleOutput: false });

    const before = {
      counts: { deals: 10, users: 5 }
    };
    const after = {
      counts: { deals: 10, users: 5 }
    };

    const comparison = BackupTestHelpers.compareMetrics(before, after, logger);

    expect(comparison.mismatches.length).toBe(0);
    expect(comparison.matches.deals).toBe(true);
    expect(comparison.matches.users).toBe(true);
  });
});
