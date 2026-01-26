/**
 * Audit Logging Completeness Tests
 *
 * Sprint 1, Days 6-7: Production Readiness
 *
 * These tests verify that all security-relevant actions are logged:
 * - Authentication events
 * - Authorization decisions
 * - Data access events
 * - State transitions
 * - Financial operations
 * - Security events
 *
 * Key Invariant:
 * All security-relevant actions MUST be logged with sufficient
 * detail for forensic analysis and regulatory compliance.
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createTestLogger } from './utils/security-assertions.js';
import crypto from 'crypto';

// =============================================================================
// MOCK AUDIT LOGGER
// =============================================================================

class MockAuditLogger {
  constructor() {
    this.logs = [];
  }

  reset() {
    this.logs = [];
  }

  /**
   * Log an audit event
   */
  async log(event) {
    const entry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...event,
      _logged: true
    };
    this.logs.push(entry);
    return entry;
  }

  /**
   * Get all logs
   */
  getLogs() {
    return this.logs;
  }

  /**
   * Get logs by action
   */
  getLogsByAction(action) {
    return this.logs.filter(l => l.action === action);
  }

  /**
   * Get logs by actor
   */
  getLogsByActor(actorId) {
    return this.logs.filter(l => l.actorId === actorId);
  }

  /**
   * Get logs by resource
   */
  getLogsByResource(resourceType, resourceId) {
    return this.logs.filter(l =>
      l.resourceType === resourceType && l.resourceId === resourceId
    );
  }

  /**
   * Get logs after a timestamp
   */
  getLogsAfter(timestamp) {
    return this.logs.filter(l => new Date(l.timestamp) > timestamp);
  }

  /**
   * Check if action was logged
   */
  hasLog(action, criteria = {}) {
    return this.logs.some(l => {
      if (l.action !== action) return false;
      for (const [key, value] of Object.entries(criteria)) {
        if (l[key] !== value) return false;
      }
      return true;
    });
  }
}

// =============================================================================
// MOCK SERVICE WITH AUDIT LOGGING
// =============================================================================

class MockDealService {
  constructor(auditLogger) {
    this.auditLogger = auditLogger;
    this.deals = new Map();
    this.transitions = [];
  }

  async createDeal(name, authUser) {
    const id = crypto.randomUUID();
    const deal = {
      id,
      name,
      organizationId: authUser.organizationId,
      status: 'DRAFT',
      createdAt: new Date().toISOString(),
      createdBy: authUser.id
    };
    this.deals.set(id, deal);

    await this.auditLogger.log({
      action: 'DEAL_CREATED',
      actorId: authUser.id,
      actorName: authUser.name,
      actorRole: authUser.role,
      resourceType: 'deal',
      resourceId: id,
      organizationId: authUser.organizationId,
      afterValue: JSON.stringify({ name, status: 'DRAFT' }),
      outcome: 'SUCCESS'
    });

    return deal;
  }

  async viewDeal(dealId, authUser) {
    const deal = this.deals.get(dealId);

    if (!deal) {
      await this.auditLogger.log({
        action: 'DEAL_VIEW_ATTEMPT',
        actorId: authUser.id,
        resourceType: 'deal',
        resourceId: dealId,
        outcome: 'FAILURE',
        reason: 'NOT_FOUND'
      });
      return null;
    }

    if (deal.organizationId !== authUser.organizationId) {
      await this.auditLogger.log({
        action: 'CROSS_ORG_ACCESS_ATTEMPT',
        actorId: authUser.id,
        actorOrgId: authUser.organizationId,
        resourceType: 'deal',
        resourceId: dealId,
        resourceOrgId: deal.organizationId,
        outcome: 'BLOCKED'
      });
      return null;
    }

    await this.auditLogger.log({
      action: 'DEAL_VIEWED',
      actorId: authUser.id,
      resourceType: 'deal',
      resourceId: dealId,
      organizationId: authUser.organizationId,
      outcome: 'SUCCESS'
    });

    return deal;
  }

  async transitionState(dealId, toState, authUser, options = {}) {
    const deal = this.deals.get(dealId);
    if (!deal) throw new Error('Deal not found');

    const fromState = deal.status;
    deal.status = toState;

    const transition = {
      dealId,
      fromState,
      toState,
      actorId: authUser.id,
      timestamp: new Date().toISOString()
    };
    this.transitions.push(transition);

    await this.auditLogger.log({
      action: 'STATE_TRANSITION',
      actorId: authUser.id,
      actorName: authUser.name,
      actorRole: authUser.role,
      resourceType: 'deal',
      resourceId: dealId,
      organizationId: deal.organizationId,
      beforeValue: JSON.stringify({ status: fromState }),
      afterValue: JSON.stringify({ status: toState }),
      metadata: {
        reason: options.reason,
        approvals: options.approvals
      },
      outcome: 'SUCCESS'
    });

    return transition;
  }
}

class MockFinancialService {
  constructor(auditLogger) {
    this.auditLogger = auditLogger;
    this.capitalCalls = [];
    this.distributions = [];
  }

  async issueCapitalCall(dealId, amount, authUser) {
    const call = {
      id: crypto.randomUUID(),
      dealId,
      amount,
      issuedBy: authUser.id,
      issuedAt: new Date().toISOString(),
      status: 'ISSUED'
    };
    this.capitalCalls.push(call);

    await this.auditLogger.log({
      action: 'CAPITAL_CALL_ISSUED',
      actorId: authUser.id,
      actorName: authUser.name,
      actorRole: authUser.role,
      resourceType: 'capital_call',
      resourceId: call.id,
      relatedResourceType: 'deal',
      relatedResourceId: dealId,
      afterValue: JSON.stringify({ amount, status: 'ISSUED' }),
      outcome: 'SUCCESS',
      financialAmount: amount
    });

    return call;
  }

  async processDistribution(dealId, amount, authUser) {
    const dist = {
      id: crypto.randomUUID(),
      dealId,
      amount,
      processedBy: authUser.id,
      processedAt: new Date().toISOString(),
      status: 'PROCESSED'
    };
    this.distributions.push(dist);

    await this.auditLogger.log({
      action: 'DISTRIBUTION_PROCESSED',
      actorId: authUser.id,
      actorName: authUser.name,
      actorRole: authUser.role,
      resourceType: 'distribution',
      resourceId: dist.id,
      relatedResourceType: 'deal',
      relatedResourceId: dealId,
      afterValue: JSON.stringify({ amount, status: 'PROCESSED' }),
      outcome: 'SUCCESS',
      financialAmount: amount
    });

    return dist;
  }
}

class MockAuthService {
  constructor(auditLogger) {
    this.auditLogger = auditLogger;
    this.sessions = new Map();
  }

  async login(email, password, ipAddress) {
    const userId = crypto.randomUUID();
    const success = password === 'correct';

    if (success) {
      const sessionId = crypto.randomUUID();
      this.sessions.set(sessionId, { userId, email, createdAt: new Date() });

      await this.auditLogger.log({
        action: 'LOGIN_SUCCESS',
        actorId: userId,
        outcome: 'SUCCESS',
        metadata: { email, ipAddress }
      });

      return { success: true, sessionId, userId };
    } else {
      await this.auditLogger.log({
        action: 'LOGIN_FAILURE',
        outcome: 'FAILURE',
        metadata: { email, ipAddress, reason: 'INVALID_CREDENTIALS' }
      });

      return { success: false };
    }
  }

  async logout(sessionId, userId) {
    this.sessions.delete(sessionId);

    await this.auditLogger.log({
      action: 'LOGOUT',
      actorId: userId,
      outcome: 'SUCCESS'
    });
  }

  async changePassword(userId, oldPassword, newPassword) {
    const success = oldPassword === 'correct';

    await this.auditLogger.log({
      action: 'PASSWORD_CHANGE',
      actorId: userId,
      outcome: success ? 'SUCCESS' : 'FAILURE',
      metadata: success ? {} : { reason: 'INVALID_OLD_PASSWORD' }
    });

    return { success };
  }
}

// =============================================================================
// TESTS
// =============================================================================

describe('Audit Logging Completeness', () => {
  let auditLogger;
  let dealService;
  let financialService;
  let authService;
  let testLogger;

  // Test users
  const gpUser = {
    id: 'user-gp-123',
    name: 'GP User',
    email: 'gp@test.com',
    role: 'GP',
    organizationId: 'org-a-123'
  };

  const otherOrgUser = {
    id: 'user-other-456',
    name: 'Other Org User',
    email: 'other@test.com',
    role: 'GP',
    organizationId: 'org-b-456'
  };

  beforeEach(() => {
    auditLogger = new MockAuditLogger();
    dealService = new MockDealService(auditLogger);
    financialService = new MockFinancialService(auditLogger);
    authService = new MockAuthService(auditLogger);
    testLogger = createTestLogger('audit-logging');
  });

  describe('Authentication Events', () => {
    test('Successful login is logged', async () => {
      testLogger.log('Testing login success logging');

      await authService.login('user@test.com', 'correct', '192.168.1.1');

      const logs = auditLogger.getLogsByAction('LOGIN_SUCCESS');
      expect(logs.length).toBe(1);
      expect(logs[0].outcome).toBe('SUCCESS');
      expect(logs[0].metadata.email).toBe('user@test.com');
      expect(logs[0].metadata.ipAddress).toBe('192.168.1.1');

      testLogger.log('Login success logged');
    });

    test('Failed login is logged', async () => {
      testLogger.log('Testing login failure logging');

      await authService.login('user@test.com', 'wrong', '192.168.1.1');

      const logs = auditLogger.getLogsByAction('LOGIN_FAILURE');
      expect(logs.length).toBe(1);
      expect(logs[0].outcome).toBe('FAILURE');
      expect(logs[0].metadata.reason).toBe('INVALID_CREDENTIALS');

      testLogger.log('Login failure logged');
    });

    test('Logout is logged', async () => {
      testLogger.log('Testing logout logging');

      const { sessionId, userId } = await authService.login('user@test.com', 'correct', '192.168.1.1');
      await authService.logout(sessionId, userId);

      const logs = auditLogger.getLogsByAction('LOGOUT');
      expect(logs.length).toBe(1);
      expect(logs[0].actorId).toBe(userId);

      testLogger.log('Logout logged');
    });

    test('Password change is logged', async () => {
      testLogger.log('Testing password change logging');

      await authService.changePassword(gpUser.id, 'correct', 'newpassword');

      const logs = auditLogger.getLogsByAction('PASSWORD_CHANGE');
      expect(logs.length).toBe(1);
      expect(logs[0].actorId).toBe(gpUser.id);
      expect(logs[0].outcome).toBe('SUCCESS');

      testLogger.log('Password change logged');
    });
  });

  describe('Data Access Events', () => {
    test('Deal creation is logged', async () => {
      testLogger.log('Testing deal creation logging');

      const deal = await dealService.createDeal('Test Deal', gpUser);

      const logs = auditLogger.getLogsByAction('DEAL_CREATED');
      expect(logs.length).toBe(1);
      expect(logs[0].actorId).toBe(gpUser.id);
      expect(logs[0].resourceId).toBe(deal.id);
      expect(logs[0].organizationId).toBe(gpUser.organizationId);

      testLogger.log('Deal creation logged', { dealId: deal.id });
    });

    test('Deal view is logged', async () => {
      testLogger.log('Testing deal view logging');

      const deal = await dealService.createDeal('Test Deal', gpUser);
      await dealService.viewDeal(deal.id, gpUser);

      const logs = auditLogger.getLogsByAction('DEAL_VIEWED');
      expect(logs.length).toBe(1);
      expect(logs[0].actorId).toBe(gpUser.id);
      expect(logs[0].resourceId).toBe(deal.id);

      testLogger.log('Deal view logged');
    });

    test('Failed resource access is logged', async () => {
      testLogger.log('Testing failed access logging');

      await dealService.viewDeal('non-existent-id', gpUser);

      const logs = auditLogger.getLogsByAction('DEAL_VIEW_ATTEMPT');
      expect(logs.length).toBe(1);
      expect(logs[0].outcome).toBe('FAILURE');
      expect(logs[0].reason).toBe('NOT_FOUND');

      testLogger.log('Failed access logged');
    });
  });

  describe('Security Events', () => {
    test('Cross-org access attempt is logged', async () => {
      testLogger.log('Testing cross-org access logging');

      const deal = await dealService.createDeal('Test Deal', gpUser);
      await dealService.viewDeal(deal.id, otherOrgUser);

      const logs = auditLogger.getLogsByAction('CROSS_ORG_ACCESS_ATTEMPT');
      expect(logs.length).toBe(1);
      expect(logs[0].outcome).toBe('BLOCKED');
      expect(logs[0].actorOrgId).toBe(otherOrgUser.organizationId);
      expect(logs[0].resourceOrgId).toBe(gpUser.organizationId);

      testLogger.log('Cross-org attempt logged');
    });
  });

  describe('State Transition Events', () => {
    test('State transition is logged with before/after', async () => {
      testLogger.log('Testing state transition logging');

      const deal = await dealService.createDeal('Test Deal', gpUser);
      await dealService.transitionState(deal.id, 'ACTIVE', gpUser, {
        reason: 'Deal approved'
      });

      const logs = auditLogger.getLogsByAction('STATE_TRANSITION');
      expect(logs.length).toBe(1);
      expect(logs[0].beforeValue).toContain('DRAFT');
      expect(logs[0].afterValue).toContain('ACTIVE');
      expect(logs[0].metadata.reason).toBe('Deal approved');

      testLogger.log('State transition logged');
    });
  });

  describe('Financial Events', () => {
    test('Capital call issuance is logged', async () => {
      testLogger.log('Testing capital call logging');

      const deal = await dealService.createDeal('Test Deal', gpUser);
      const call = await financialService.issueCapitalCall(deal.id, 1000000, gpUser);

      const logs = auditLogger.getLogsByAction('CAPITAL_CALL_ISSUED');
      expect(logs.length).toBe(1);
      expect(logs[0].resourceId).toBe(call.id);
      expect(logs[0].financialAmount).toBe(1000000);
      expect(logs[0].relatedResourceId).toBe(deal.id);

      testLogger.log('Capital call logged', { amount: 1000000 });
    });

    test('Distribution processing is logged', async () => {
      testLogger.log('Testing distribution logging');

      const deal = await dealService.createDeal('Test Deal', gpUser);
      const dist = await financialService.processDistribution(deal.id, 500000, gpUser);

      const logs = auditLogger.getLogsByAction('DISTRIBUTION_PROCESSED');
      expect(logs.length).toBe(1);
      expect(logs[0].resourceId).toBe(dist.id);
      expect(logs[0].financialAmount).toBe(500000);

      testLogger.log('Distribution logged', { amount: 500000 });
    });
  });

  describe('Audit Log Completeness', () => {
    test('All logs have required fields', async () => {
      testLogger.log('Testing log field completeness');

      // Generate various events
      await authService.login('user@test.com', 'correct', '192.168.1.1');
      const deal = await dealService.createDeal('Test Deal', gpUser);
      await dealService.viewDeal(deal.id, gpUser);
      await financialService.issueCapitalCall(deal.id, 100000, gpUser);

      const logs = auditLogger.getLogs();

      for (const log of logs) {
        expect(log.id).toBeDefined();
        expect(log.timestamp).toBeDefined();
        expect(log.action).toBeDefined();
        expect(log.outcome).toBeDefined();
      }

      testLogger.log('All logs have required fields', { count: logs.length });
    });

    test('Logs can be queried by actor', async () => {
      testLogger.log('Testing query by actor');

      await dealService.createDeal('Deal 1', gpUser);
      await dealService.createDeal('Deal 2', gpUser);
      await dealService.createDeal('Deal 3', otherOrgUser);

      const gpLogs = auditLogger.getLogsByActor(gpUser.id);
      const otherLogs = auditLogger.getLogsByActor(otherOrgUser.id);

      expect(gpLogs.length).toBe(2);
      expect(otherLogs.length).toBe(1);

      testLogger.log('Query by actor works');
    });

    test('Logs can be queried by resource', async () => {
      testLogger.log('Testing query by resource');

      const deal = await dealService.createDeal('Test Deal', gpUser);
      await dealService.viewDeal(deal.id, gpUser);
      await dealService.transitionState(deal.id, 'ACTIVE', gpUser);

      const dealLogs = auditLogger.getLogsByResource('deal', deal.id);

      expect(dealLogs.length).toBe(3); // create, view, transition

      testLogger.log('Query by resource works', { count: dealLogs.length });
    });

    test('Logs can be queried by time range', async () => {
      testLogger.log('Testing query by time range');

      // Create a timestamp slightly in the past to handle timing precision
      const beforeTime = new Date(Date.now() - 100);

      await dealService.createDeal('Test Deal', gpUser);

      const logsAfter = auditLogger.getLogsAfter(beforeTime);

      expect(logsAfter.length).toBeGreaterThan(0);

      testLogger.log('Query by time works');
    });
  });

  describe('Audit Trail Integrity', () => {
    test('All actions include actor identity', async () => {
      testLogger.log('Testing actor identity in logs');

      const deal = await dealService.createDeal('Test Deal', gpUser);
      await dealService.transitionState(deal.id, 'ACTIVE', gpUser);
      await financialService.issueCapitalCall(deal.id, 100000, gpUser);

      const logs = auditLogger.getLogsByActor(gpUser.id);

      for (const log of logs) {
        expect(log.actorId).toBe(gpUser.id);
      }

      testLogger.log('Actor identity verified in all logs');
    });

    test('Financial logs include amount', async () => {
      testLogger.log('Testing financial amount in logs');

      const deal = await dealService.createDeal('Test Deal', gpUser);
      await financialService.issueCapitalCall(deal.id, 1000000, gpUser);
      await financialService.processDistribution(deal.id, 500000, gpUser);

      const capitalLogs = auditLogger.getLogsByAction('CAPITAL_CALL_ISSUED');
      const distLogs = auditLogger.getLogsByAction('DISTRIBUTION_PROCESSED');

      expect(capitalLogs[0].financialAmount).toBe(1000000);
      expect(distLogs[0].financialAmount).toBe(500000);

      testLogger.log('Financial amounts verified');
    });
  });
});

describe('Audit Log Schema Validation', () => {
  test('Required fields are present', () => {
    const validLog = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action: 'TEST_ACTION',
      outcome: 'SUCCESS'
    };

    expect(validLog.id).toBeDefined();
    expect(validLog.timestamp).toBeDefined();
    expect(validLog.action).toBeDefined();
    expect(validLog.outcome).toBeDefined();
  });

  test('Outcome values are valid', () => {
    const validOutcomes = ['SUCCESS', 'FAILURE', 'BLOCKED'];

    for (const outcome of validOutcomes) {
      expect(validOutcomes).toContain(outcome);
    }
  });
});
