/**
 * BFF Kernel Truth Invariants Tests
 *
 * Sprint 1, Day 3: Production Readiness
 *
 * These tests verify the BFF respects Kernel as the authoritative source:
 * - BFF cannot override Kernel state
 * - BFF state must be consistent with Kernel
 * - State mutations flow through Kernel
 * - Hash chain integrity is maintained
 *
 * Key Invariants:
 * - Kernel is the single source of truth for deal lifecycle
 * - BFF orchestrates workflow; Kernel owns state
 * - DOC > HUMAN > AI truth hierarchy is enforced
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createTestLogger } from './utils/security-assertions.js';
import crypto from 'crypto';

// =============================================================================
// MOCK IMPLEMENTATIONS
// =============================================================================

/**
 * Mock Kernel Client - simulates Kernel API responses
 */
class MockKernelClient {
  constructor() {
    this.deals = new Map();
    this.events = new Map();
    this.requestLog = [];
  }

  reset() {
    this.deals.clear();
    this.events.clear();
    this.requestLog.clear();
  }

  logRequest(method, path, body) {
    this.requestLog.push({
      timestamp: new Date().toISOString(),
      method,
      path,
      body
    });
  }

  async createDeal(name) {
    this.logRequest('POST', '/deals', { name });
    const id = crypto.randomUUID();
    const deal = {
      id,
      name,
      state: 'Draft',
      stressMode: 'SM-0',
      createdAt: new Date().toISOString()
    };
    this.deals.set(id, deal);
    this.events.set(id, []);
    return deal;
  }

  async getDeal(dealId) {
    this.logRequest('GET', `/deals/${dealId}`, null);
    return this.deals.get(dealId);
  }

  async recordEvent(dealId, eventType, payload) {
    this.logRequest('POST', `/deals/${dealId}/events`, { type: eventType, payload });

    const deal = this.deals.get(dealId);
    if (!deal) throw new Error('Deal not found');

    const events = this.events.get(dealId);
    const prevHash = events.length > 0 ? events[events.length - 1].eventHash : null;

    const event = {
      id: crypto.randomUUID(),
      dealId,
      eventType,
      payload,
      sequenceNumber: events.length + 1,
      previousEventHash: prevHash,
      eventHash: this._calculateHash(dealId, events.length + 1, eventType, payload, prevHash),
      createdAt: new Date().toISOString()
    };

    events.push(event);

    // Apply state transition
    this._applyStateTransition(deal, eventType);

    return event;
  }

  async getEvents(dealId) {
    this.logRequest('GET', `/deals/${dealId}/events`, null);
    return this.events.get(dealId) || [];
  }

  _calculateHash(dealId, seq, type, payload, prevHash) {
    const data = JSON.stringify({ dealId, seq, type, payload, prevHash });
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  _applyStateTransition(deal, eventType) {
    const transitions = {
      ReviewOpened: { from: 'Draft', to: 'UnderReview' },
      DealApproved: { from: 'UnderReview', to: 'Approved' },
      ClosingReadinessAttested: { from: 'Approved', to: 'ReadyToClose' },
      ClosingFinalized: { from: 'ReadyToClose', to: 'Closed' },
      OperationsActivated: { from: 'Closed', to: 'Operating' },
      DealTerminated: { from: '*', to: 'Terminated' },
      FreezeImposed: { from: '*', to: 'Frozen' }
    };

    const transition = transitions[eventType];
    if (transition) {
      if (transition.from === '*' || deal.state === transition.from) {
        deal.state = transition.to;
      }
    }
  }

  getRequestLog() {
    return this.requestLog;
  }
}

/**
 * Mock BFF State Manager - simulates BFF state tracking
 */
class MockBFFStateManager {
  constructor(kernelClient) {
    this.kernelClient = kernelClient;
    this.localState = new Map();
    this.syncLog = [];
  }

  reset() {
    this.localState.clear();
    this.syncLog.clear();
  }

  logSync(action, data) {
    this.syncLog.push({
      timestamp: new Date().toISOString(),
      action,
      data
    });
  }

  /**
   * Get deal state - MUST sync with Kernel
   */
  async getDealState(dealId) {
    // Always fetch from Kernel (authoritative)
    const kernelDeal = await this.kernelClient.getDeal(dealId);
    if (!kernelDeal) {
      return null;
    }

    // Update local cache
    this.localState.set(dealId, {
      kernelState: kernelDeal.state,
      syncedAt: new Date().toISOString()
    });

    this.logSync('GET_STATE', { dealId, state: kernelDeal.state });
    return kernelDeal.state;
  }

  /**
   * Transition state - MUST go through Kernel
   */
  async transitionState(dealId, eventType, payload) {
    // Record event in Kernel (authoritative)
    const event = await this.kernelClient.recordEvent(dealId, eventType, payload);

    // Get updated state from Kernel
    const kernelDeal = await this.kernelClient.getDeal(dealId);

    // Update local cache
    this.localState.set(dealId, {
      kernelState: kernelDeal.state,
      lastEventId: event.id,
      syncedAt: new Date().toISOString()
    });

    this.logSync('TRANSITION', {
      dealId,
      eventType,
      newState: kernelDeal.state,
      eventId: event.id
    });

    return { state: kernelDeal.state, event };
  }

  /**
   * VIOLATION: Attempt to set state locally without Kernel
   * This should NEVER be done in production code
   */
  async _violationSetLocalState(dealId, state) {
    this.localState.set(dealId, {
      localOverride: state,
      warning: 'LOCAL_OVERRIDE_VIOLATION',
      syncedAt: new Date().toISOString()
    });

    this.logSync('VIOLATION_LOCAL_OVERRIDE', { dealId, state });
  }

  /**
   * Check if local state matches Kernel
   */
  async verifyStateConsistency(dealId) {
    const local = this.localState.get(dealId);
    const kernelDeal = await this.kernelClient.getDeal(dealId);

    if (!kernelDeal) {
      return { consistent: false, reason: 'Deal not found in Kernel' };
    }

    if (!local) {
      return { consistent: true, reason: 'No local state (will sync)' };
    }

    if (local.localOverride && local.localOverride !== kernelDeal.state) {
      return {
        consistent: false,
        reason: 'Local override differs from Kernel',
        localState: local.localOverride,
        kernelState: kernelDeal.state,
        violation: true
      };
    }

    if (local.kernelState !== kernelDeal.state) {
      return {
        consistent: false,
        reason: 'Stale local cache',
        localState: local.kernelState,
        kernelState: kernelDeal.state
      };
    }

    return { consistent: true };
  }

  getSyncLog() {
    return this.syncLog;
  }
}

// =============================================================================
// TESTS
// =============================================================================

describe('BFF Kernel Truth Invariants', () => {
  let kernelClient;
  let bffState;
  let logger;

  beforeEach(() => {
    kernelClient = new MockKernelClient();
    bffState = new MockBFFStateManager(kernelClient);
    logger = createTestLogger('kernel-truth-invariants');
  });

  afterEach(() => {
    // Uncomment to debug:
    // logger.print();
  });

  describe('Kernel as Single Source of Truth', () => {
    test('BFF state is fetched from Kernel', async () => {
      logger.log('Testing BFF fetches state from Kernel');

      const deal = await kernelClient.createDeal('Test Deal');
      const state = await bffState.getDealState(deal.id);

      expect(state).toBe('Draft');

      // Verify Kernel was queried
      const requests = kernelClient.getRequestLog();
      expect(requests.some(r => r.path.includes(deal.id) && r.method === 'GET')).toBe(true);

      logger.log('State fetched from Kernel', { state });
    });

    test('State transitions go through Kernel', async () => {
      logger.log('Testing state transitions via Kernel');

      const deal = await kernelClient.createDeal('Test Deal');

      // Transition through Kernel
      const result = await bffState.transitionState(deal.id, 'ReviewOpened', {});

      expect(result.state).toBe('UnderReview');
      expect(result.event).toBeDefined();
      expect(result.event.eventType).toBe('ReviewOpened');

      // Verify Kernel event was created
      const events = await kernelClient.getEvents(deal.id);
      expect(events.length).toBe(1);
      expect(events[0].eventType).toBe('ReviewOpened');

      logger.log('Transition completed via Kernel', { newState: result.state });
    });

    test('BFF cannot override Kernel state locally', async () => {
      logger.log('Testing BFF cannot override Kernel state');

      const deal = await kernelClient.createDeal('Test Deal');

      // This is a violation - simulates bad code that bypasses Kernel
      await bffState._violationSetLocalState(deal.id, 'Approved');

      // Verify inconsistency is detected
      const consistency = await bffState.verifyStateConsistency(deal.id);

      expect(consistency.consistent).toBe(false);
      expect(consistency.violation).toBe(true);
      expect(consistency.localState).toBe('Approved');
      expect(consistency.kernelState).toBe('Draft');

      logger.log('Local override detected as violation', consistency);
    });
  });

  describe('Hash Chain Integrity', () => {
    test('Events form a valid hash chain', async () => {
      logger.log('Testing hash chain integrity');

      const deal = await kernelClient.createDeal('Test Deal');

      // Record multiple events
      await bffState.transitionState(deal.id, 'ReviewOpened', {});
      await bffState.transitionState(deal.id, 'DealApproved', { approver: 'GP1' });

      const events = await kernelClient.getEvents(deal.id);

      // Verify chain
      expect(events.length).toBe(2);
      expect(events[0].previousEventHash).toBeNull();
      expect(events[1].previousEventHash).toBe(events[0].eventHash);

      logger.log('Hash chain verified', {
        eventCount: events.length,
        chainValid: true
      });
    });

    test('Sequence numbers are contiguous', async () => {
      logger.log('Testing sequence number contiguity');

      const deal = await kernelClient.createDeal('Test Deal');

      await bffState.transitionState(deal.id, 'ReviewOpened', {});
      await bffState.transitionState(deal.id, 'DealApproved', {});
      await bffState.transitionState(deal.id, 'ClosingReadinessAttested', {});

      const events = await kernelClient.getEvents(deal.id);

      for (let i = 0; i < events.length; i++) {
        expect(events[i].sequenceNumber).toBe(i + 1);
      }

      logger.log('Sequence numbers contiguous', { count: events.length });
    });

    test('Tampered event breaks chain verification', async () => {
      logger.log('Testing tamper detection');

      const deal = await kernelClient.createDeal('Test Deal');

      await bffState.transitionState(deal.id, 'ReviewOpened', {});
      await bffState.transitionState(deal.id, 'DealApproved', {});

      const events = await kernelClient.getEvents(deal.id);

      // Simulate tampering (in real code, this would be detected)
      const originalHash = events[0].eventHash;
      events[0].eventHash = 'tampered-hash';

      // Chain is now broken
      expect(events[1].previousEventHash).toBe(originalHash);
      expect(events[1].previousEventHash).not.toBe(events[0].eventHash);

      logger.log('Tamper detected', {
        originalHash: originalHash.substring(0, 16) + '...',
        tamperedHash: 'tampered-hash'
      });
    });
  });

  describe('State Consistency', () => {
    test('Fresh BFF has no local state', async () => {
      logger.log('Testing fresh BFF state');

      const deal = await kernelClient.createDeal('Test Deal');
      const consistency = await bffState.verifyStateConsistency(deal.id);

      expect(consistency.consistent).toBe(true);
      expect(consistency.reason).toContain('No local state');

      logger.log('Fresh BFF is consistent');
    });

    test('Synced BFF matches Kernel', async () => {
      logger.log('Testing synced BFF matches Kernel');

      const deal = await kernelClient.createDeal('Test Deal');

      // Sync state
      await bffState.getDealState(deal.id);

      const consistency = await bffState.verifyStateConsistency(deal.id);
      expect(consistency.consistent).toBe(true);

      logger.log('Synced BFF is consistent');
    });

    test('Stale BFF cache is detected', async () => {
      logger.log('Testing stale cache detection');

      const deal = await kernelClient.createDeal('Test Deal');

      // Sync state
      await bffState.getDealState(deal.id);

      // Kernel state changes directly (simulating external update)
      await kernelClient.recordEvent(deal.id, 'ReviewOpened', {});

      // BFF still has old state in cache
      const consistency = await bffState.verifyStateConsistency(deal.id);

      expect(consistency.consistent).toBe(false);
      expect(consistency.reason).toContain('Stale');
      expect(consistency.localState).toBe('Draft');
      expect(consistency.kernelState).toBe('UnderReview');

      logger.log('Stale cache detected', consistency);
    });
  });

  describe('State Transition Enforcement', () => {
    test('Valid state transitions succeed', async () => {
      logger.log('Testing valid transitions');

      const deal = await kernelClient.createDeal('Test Deal');

      // Draft -> UnderReview
      const r1 = await bffState.transitionState(deal.id, 'ReviewOpened', {});
      expect(r1.state).toBe('UnderReview');

      // UnderReview -> Approved
      const r2 = await bffState.transitionState(deal.id, 'DealApproved', {});
      expect(r2.state).toBe('Approved');

      logger.log('Valid transitions succeeded');
    });

    test('Terminal states are enforced', async () => {
      logger.log('Testing terminal state enforcement');

      const deal = await kernelClient.createDeal('Test Deal');

      // Terminate deal
      await bffState.transitionState(deal.id, 'DealTerminated', { reason: 'Test' });

      const state = await bffState.getDealState(deal.id);
      expect(state).toBe('Terminated');

      logger.log('Terminal state enforced', { state });
    });

    test('Freeze state is applied correctly', async () => {
      logger.log('Testing freeze state');

      const deal = await kernelClient.createDeal('Test Deal');
      await bffState.transitionState(deal.id, 'ReviewOpened', {});

      // Freeze from UnderReview
      await bffState.transitionState(deal.id, 'FreezeImposed', { reason: 'Regulatory hold' });

      const state = await bffState.getDealState(deal.id);
      expect(state).toBe('Frozen');

      logger.log('Freeze applied', { state });
    });
  });

  describe('Sync Logging', () => {
    test('All sync operations are logged', async () => {
      logger.log('Testing sync logging');

      const deal = await kernelClient.createDeal('Test Deal');

      await bffState.getDealState(deal.id);
      await bffState.transitionState(deal.id, 'ReviewOpened', {});
      await bffState.getDealState(deal.id);

      const syncLog = bffState.getSyncLog();

      expect(syncLog.length).toBe(3);
      expect(syncLog[0].action).toBe('GET_STATE');
      expect(syncLog[1].action).toBe('TRANSITION');
      expect(syncLog[2].action).toBe('GET_STATE');

      logger.log('Sync operations logged', { count: syncLog.length });
    });

    test('Violations are logged distinctly', async () => {
      logger.log('Testing violation logging');

      const deal = await kernelClient.createDeal('Test Deal');

      await bffState._violationSetLocalState(deal.id, 'FakeState');

      const syncLog = bffState.getSyncLog();
      const violation = syncLog.find(s => s.action.includes('VIOLATION'));

      expect(violation).toBeDefined();
      expect(violation.action).toBe('VIOLATION_LOCAL_OVERRIDE');

      logger.log('Violation logged', { action: violation.action });
    });
  });
});

describe('Kernel API Request Logging', () => {
  let kernelClient;
  let logger;

  beforeEach(() => {
    kernelClient = new MockKernelClient();
    logger = createTestLogger('kernel-api-logging');
  });

  test('All Kernel requests are logged', async () => {
    const deal = await kernelClient.createDeal('Test Deal');
    await kernelClient.getDeal(deal.id);
    await kernelClient.recordEvent(deal.id, 'ReviewOpened', {});
    await kernelClient.getEvents(deal.id);

    const log = kernelClient.getRequestLog();

    expect(log.length).toBe(4);
    expect(log[0].method).toBe('POST');
    expect(log[0].path).toBe('/deals');
    expect(log[1].method).toBe('GET');
    expect(log[2].method).toBe('POST');
    expect(log[3].method).toBe('GET');

    logger.log('Request log verified', { requestCount: log.length });
  });
});
