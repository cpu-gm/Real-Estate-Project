/**
 * Authority Enforcement Tests
 *
 * Sprint 1, Day 2: Production Readiness
 *
 * These tests verify that authority gates are properly enforced:
 * - Role-based access control
 * - Truth class requirements (DOC > HUMAN > AI)
 * - Material requirements for gated actions
 * - Approval thresholds
 *
 * Key Invariants:
 * - Kernel is authoritative for deal state
 * - DOC truth can override HUMAN, HUMAN can override AI
 * - Gated actions require specific approvals and materials
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { createTestDataFactory } from './utils/TestDataFactory.js';
import {
  assertRoleDenied,
  assertAuthRequired,
  createTestLogger
} from './utils/security-assertions.js';

// Mock kernel client for isolated testing
const mockKernelClient = {
  deals: new Map(),
  events: new Map(),
  materials: new Map(),
  actors: new Map(),

  reset() {
    this.deals.clear();
    this.events.clear();
    this.materials.clear();
    this.actors.clear();
  },

  createDeal(name) {
    const id = crypto.randomUUID();
    const deal = {
      id,
      name,
      state: 'Draft',
      stressMode: 'SM-0',
      createdAt: new Date().toISOString()
    };
    this.deals.set(id, deal);
    return deal;
  },

  getDeal(id) {
    return this.deals.get(id);
  },

  createActor(dealId, name, type, role) {
    const id = crypto.randomUUID();
    const actor = { id, dealId, name, type, role };
    if (!this.actors.has(dealId)) {
      this.actors.set(dealId, []);
    }
    this.actors.get(dealId).push(actor);
    return actor;
  },

  getActors(dealId) {
    return this.actors.get(dealId) || [];
  },

  createMaterial(dealId, type, truthClass) {
    const id = crypto.randomUUID();
    const material = { id, dealId, type, truthClass, createdAt: new Date().toISOString() };
    if (!this.materials.has(dealId)) {
      this.materials.set(dealId, []);
    }
    this.materials.get(dealId).push(material);
    return material;
  },

  getMaterials(dealId, type = null) {
    const mats = this.materials.get(dealId) || [];
    return type ? mats.filter(m => m.type === type) : mats;
  }
};

// Authority rules from Kernel
const AUTHORITY_RULES = {
  OPEN_REVIEW: { rolesAllowed: ['GP'], threshold: 1 },
  APPROVE_DEAL: { rolesAllowed: ['GP'], threshold: 2 },
  ATTEST_READY_TO_CLOSE: { rolesAllowed: ['GP'], threshold: 2 },
  FINALIZE_CLOSING: { rolesAllowed: ['GP'], threshold: 1 },
  ACTIVATE_OPERATIONS: { rolesAllowed: ['GP'], threshold: 1 },
  DECLARE_DISTRESS: { rolesAllowed: ['GP'], threshold: 1 },
  RESOLVE_DISTRESS: { rolesAllowed: ['GP'], threshold: 2 },
  IMPOSE_FREEZE: { rolesAllowed: ['Regulator', 'Counsel', 'GP'], threshold: 1 },
  LIFT_FREEZE: { rolesAllowed: ['Regulator', 'Counsel'], threshold: 1 },
  FINALIZE_EXIT: { rolesAllowed: ['GP'], threshold: 1 },
  TERMINATE_DEAL: { rolesAllowed: ['GP'], threshold: 1 }
};

// Material requirements from Kernel
const MATERIAL_REQUIREMENTS = {
  APPROVE_DEAL: [{ type: 'UnderwritingSummary', requiredTruth: 'HUMAN' }],
  ATTEST_READY_TO_CLOSE: [
    { type: 'FinalUnderwriting', requiredTruth: 'DOC' },
    { type: 'SourcesAndUses', requiredTruth: 'DOC' }
  ],
  FINALIZE_CLOSING: [
    { type: 'WireConfirmation', requiredTruth: 'DOC' },
    { type: 'EntityFormationDocs', requiredTruth: 'DOC' }
  ],
  ACTIVATE_OPERATIONS: [{ type: 'PropertyManagementAgreement', requiredTruth: 'DOC' }]
};

// Truth class hierarchy
const TRUTH_RANK = { AI: 1, HUMAN: 2, DOC: 3 };

function isTruthSufficient(currentTruth, requiredTruth) {
  if (!currentTruth) return false;
  if (requiredTruth === 'DOC') return currentTruth === 'DOC';
  return TRUTH_RANK[currentTruth] >= TRUTH_RANK[requiredTruth];
}

/**
 * Check if an action is allowed given approvals and materials
 */
function checkActionAllowed(action, approvals, materials) {
  const rule = AUTHORITY_RULES[action];
  if (!rule) {
    return { allowed: false, reason: 'Unknown action' };
  }

  // Check role-based approvals
  const validApprovals = approvals.filter(a => rule.rolesAllowed.includes(a.role));
  if (validApprovals.length < rule.threshold) {
    return {
      allowed: false,
      reason: `Insufficient approvals: need ${rule.threshold} from ${rule.rolesAllowed.join(', ')}, got ${validApprovals.length}`,
      type: 'APPROVAL_THRESHOLD'
    };
  }

  // Check material requirements
  const requirements = MATERIAL_REQUIREMENTS[action] || [];
  for (const req of requirements) {
    const matching = materials.filter(m => m.type === req.type);
    if (matching.length === 0) {
      return {
        allowed: false,
        reason: `Missing required material: ${req.type}`,
        type: 'MISSING_MATERIAL'
      };
    }

    const best = matching.reduce((a, b) =>
      TRUTH_RANK[a.truthClass] > TRUTH_RANK[b.truthClass] ? a : b
    );

    if (!isTruthSufficient(best.truthClass, req.requiredTruth)) {
      return {
        allowed: false,
        reason: `Insufficient truth for ${req.type}: need ${req.requiredTruth}, got ${best.truthClass}`,
        type: 'INSUFFICIENT_TRUTH'
      };
    }
  }

  return { allowed: true };
}

describe('Authority Enforcement', () => {
  let logger;

  beforeEach(() => {
    mockKernelClient.reset();
    logger = createTestLogger('authority-enforcement');
  });

  afterEach(() => {
    // Uncomment to see logs on failure:
    // logger.print();
  });

  describe('Role-Based Access Control', () => {
    test('GP can open review', () => {
      logger.log('Testing GP can open review');

      const deal = mockKernelClient.createDeal('Test Deal');
      const gpActor = mockKernelClient.createActor(deal.id, 'GP User', 'HUMAN', 'GP');

      const result = checkActionAllowed('OPEN_REVIEW', [{ role: 'GP', actorId: gpActor.id }], []);

      expect(result.allowed).toBe(true);
      logger.log('GP open review allowed', { allowed: result.allowed });
    });

    test('Analyst cannot open review (requires GP)', () => {
      logger.log('Testing Analyst cannot open review');

      const deal = mockKernelClient.createDeal('Test Deal');
      const analystActor = mockKernelClient.createActor(deal.id, 'Analyst', 'HUMAN', 'Analyst');

      const result = checkActionAllowed('OPEN_REVIEW', [{ role: 'Analyst', actorId: analystActor.id }], []);

      expect(result.allowed).toBe(false);
      expect(result.type).toBe('APPROVAL_THRESHOLD');
      logger.log('Analyst open review denied', { reason: result.reason });
    });

    test('Approve deal requires 2 GP approvals', () => {
      logger.log('Testing approve deal requires 2 GP approvals');

      const deal = mockKernelClient.createDeal('Test Deal');
      const gp1 = mockKernelClient.createActor(deal.id, 'GP 1', 'HUMAN', 'GP');
      const gp2 = mockKernelClient.createActor(deal.id, 'GP 2', 'HUMAN', 'GP');

      // Add required material
      mockKernelClient.createMaterial(deal.id, 'UnderwritingSummary', 'HUMAN');

      // One approval - should fail
      const result1 = checkActionAllowed(
        'APPROVE_DEAL',
        [{ role: 'GP', actorId: gp1.id }],
        mockKernelClient.getMaterials(deal.id)
      );
      expect(result1.allowed).toBe(false);
      expect(result1.type).toBe('APPROVAL_THRESHOLD');
      logger.log('Single approval denied', { reason: result1.reason });

      // Two approvals - should pass
      const result2 = checkActionAllowed(
        'APPROVE_DEAL',
        [{ role: 'GP', actorId: gp1.id }, { role: 'GP', actorId: gp2.id }],
        mockKernelClient.getMaterials(deal.id)
      );
      expect(result2.allowed).toBe(true);
      logger.log('Two approvals allowed', { allowed: result2.allowed });
    });

    test('Only Regulator or Counsel can lift freeze', () => {
      logger.log('Testing freeze lift requires Regulator or Counsel');

      // GP cannot lift freeze
      const resultGP = checkActionAllowed('LIFT_FREEZE', [{ role: 'GP' }], []);
      expect(resultGP.allowed).toBe(false);
      logger.log('GP cannot lift freeze', { reason: resultGP.reason });

      // Regulator can lift freeze
      const resultReg = checkActionAllowed('LIFT_FREEZE', [{ role: 'Regulator' }], []);
      expect(resultReg.allowed).toBe(true);
      logger.log('Regulator can lift freeze');

      // Counsel can lift freeze
      const resultCounsel = checkActionAllowed('LIFT_FREEZE', [{ role: 'Counsel' }], []);
      expect(resultCounsel.allowed).toBe(true);
      logger.log('Counsel can lift freeze');
    });
  });

  describe('Truth Class Hierarchy (DOC > HUMAN > AI)', () => {
    test('DOC truth satisfies DOC requirement', () => {
      logger.log('Testing DOC satisfies DOC requirement');

      const deal = mockKernelClient.createDeal('Test Deal');
      mockKernelClient.createMaterial(deal.id, 'FinalUnderwriting', 'DOC');
      mockKernelClient.createMaterial(deal.id, 'SourcesAndUses', 'DOC');

      const result = checkActionAllowed(
        'ATTEST_READY_TO_CLOSE',
        [{ role: 'GP' }, { role: 'GP' }],
        mockKernelClient.getMaterials(deal.id)
      );

      expect(result.allowed).toBe(true);
      logger.log('DOC truth accepted', { allowed: result.allowed });
    });

    test('HUMAN truth does NOT satisfy DOC requirement', () => {
      logger.log('Testing HUMAN does NOT satisfy DOC requirement');

      const deal = mockKernelClient.createDeal('Test Deal');
      mockKernelClient.createMaterial(deal.id, 'FinalUnderwriting', 'HUMAN'); // Wrong truth class
      mockKernelClient.createMaterial(deal.id, 'SourcesAndUses', 'DOC');

      const result = checkActionAllowed(
        'ATTEST_READY_TO_CLOSE',
        [{ role: 'GP' }, { role: 'GP' }],
        mockKernelClient.getMaterials(deal.id)
      );

      expect(result.allowed).toBe(false);
      expect(result.type).toBe('INSUFFICIENT_TRUTH');
      expect(result.reason).toContain('FinalUnderwriting');
      logger.log('HUMAN truth rejected for DOC requirement', { reason: result.reason });
    });

    test('AI truth does NOT satisfy HUMAN requirement', () => {
      logger.log('Testing AI does NOT satisfy HUMAN requirement');

      const deal = mockKernelClient.createDeal('Test Deal');
      mockKernelClient.createMaterial(deal.id, 'UnderwritingSummary', 'AI'); // AI not sufficient

      const result = checkActionAllowed(
        'APPROVE_DEAL',
        [{ role: 'GP' }, { role: 'GP' }],
        mockKernelClient.getMaterials(deal.id)
      );

      expect(result.allowed).toBe(false);
      expect(result.type).toBe('INSUFFICIENT_TRUTH');
      logger.log('AI truth rejected for HUMAN requirement', { reason: result.reason });
    });

    test('HUMAN truth satisfies HUMAN requirement', () => {
      logger.log('Testing HUMAN satisfies HUMAN requirement');

      const deal = mockKernelClient.createDeal('Test Deal');
      mockKernelClient.createMaterial(deal.id, 'UnderwritingSummary', 'HUMAN');

      const result = checkActionAllowed(
        'APPROVE_DEAL',
        [{ role: 'GP' }, { role: 'GP' }],
        mockKernelClient.getMaterials(deal.id)
      );

      expect(result.allowed).toBe(true);
      logger.log('HUMAN truth accepted', { allowed: result.allowed });
    });

    test('DOC truth satisfies HUMAN requirement (DOC > HUMAN)', () => {
      logger.log('Testing DOC satisfies HUMAN requirement');

      const deal = mockKernelClient.createDeal('Test Deal');
      mockKernelClient.createMaterial(deal.id, 'UnderwritingSummary', 'DOC'); // DOC is stronger

      const result = checkActionAllowed(
        'APPROVE_DEAL',
        [{ role: 'GP' }, { role: 'GP' }],
        mockKernelClient.getMaterials(deal.id)
      );

      expect(result.allowed).toBe(true);
      logger.log('DOC truth accepted for HUMAN requirement', { allowed: result.allowed });
    });
  });

  describe('Material Requirements', () => {
    test('APPROVE_DEAL requires UnderwritingSummary', () => {
      logger.log('Testing APPROVE_DEAL material requirements');

      const deal = mockKernelClient.createDeal('Test Deal');
      // No materials added

      const result = checkActionAllowed(
        'APPROVE_DEAL',
        [{ role: 'GP' }, { role: 'GP' }],
        []
      );

      expect(result.allowed).toBe(false);
      expect(result.type).toBe('MISSING_MATERIAL');
      expect(result.reason).toContain('UnderwritingSummary');
      logger.log('Missing material blocked', { reason: result.reason });
    });

    test('FINALIZE_CLOSING requires WireConfirmation and EntityFormationDocs', () => {
      logger.log('Testing FINALIZE_CLOSING material requirements');

      const deal = mockKernelClient.createDeal('Test Deal');

      // Missing both
      const result1 = checkActionAllowed('FINALIZE_CLOSING', [{ role: 'GP' }], []);
      expect(result1.allowed).toBe(false);
      expect(result1.type).toBe('MISSING_MATERIAL');
      logger.log('Missing all materials blocked', { reason: result1.reason });

      // Add one material
      mockKernelClient.createMaterial(deal.id, 'WireConfirmation', 'DOC');
      const result2 = checkActionAllowed(
        'FINALIZE_CLOSING',
        [{ role: 'GP' }],
        mockKernelClient.getMaterials(deal.id)
      );
      expect(result2.allowed).toBe(false);
      expect(result2.type).toBe('MISSING_MATERIAL');
      expect(result2.reason).toContain('EntityFormationDocs');
      logger.log('Partial materials blocked', { reason: result2.reason });

      // Add second material
      mockKernelClient.createMaterial(deal.id, 'EntityFormationDocs', 'DOC');
      const result3 = checkActionAllowed(
        'FINALIZE_CLOSING',
        [{ role: 'GP' }],
        mockKernelClient.getMaterials(deal.id)
      );
      expect(result3.allowed).toBe(true);
      logger.log('All materials provided - allowed', { allowed: result3.allowed });
    });

    test('Actions without material requirements pass with only approvals', () => {
      logger.log('Testing actions without material requirements');

      // OPEN_REVIEW has no material requirements
      const result = checkActionAllowed('OPEN_REVIEW', [{ role: 'GP' }], []);
      expect(result.allowed).toBe(true);
      logger.log('Action without material requirements allowed');
    });
  });

  describe('Combined Authority Checks', () => {
    test('All requirements must be met for gated action', () => {
      logger.log('Testing combined authority requirements');

      const deal = mockKernelClient.createDeal('Test Deal');

      // Need: 2 GP approvals + UnderwritingSummary with HUMAN truth
      const scenarios = [
        {
          name: 'No approvals, no materials',
          approvals: [],
          materials: [],
          expectedAllowed: false,
          expectedType: 'APPROVAL_THRESHOLD'
        },
        {
          name: 'One approval, no materials',
          approvals: [{ role: 'GP' }],
          materials: [],
          expectedAllowed: false,
          expectedType: 'APPROVAL_THRESHOLD'
        },
        {
          name: 'Two approvals, no materials',
          approvals: [{ role: 'GP' }, { role: 'GP' }],
          materials: [],
          expectedAllowed: false,
          expectedType: 'MISSING_MATERIAL'
        },
        {
          name: 'Two approvals, AI material (insufficient)',
          approvals: [{ role: 'GP' }, { role: 'GP' }],
          materials: [{ type: 'UnderwritingSummary', truthClass: 'AI' }],
          expectedAllowed: false,
          expectedType: 'INSUFFICIENT_TRUTH'
        },
        {
          name: 'Two approvals, HUMAN material (sufficient)',
          approvals: [{ role: 'GP' }, { role: 'GP' }],
          materials: [{ type: 'UnderwritingSummary', truthClass: 'HUMAN' }],
          expectedAllowed: true
        }
      ];

      for (const scenario of scenarios) {
        const result = checkActionAllowed('APPROVE_DEAL', scenario.approvals, scenario.materials);
        expect(result.allowed).toBe(scenario.expectedAllowed);
        if (!scenario.expectedAllowed) {
          expect(result.type).toBe(scenario.expectedType);
        }
        logger.log(`Scenario: ${scenario.name}`, {
          allowed: result.allowed,
          reason: result.reason
        });
      }
    });
  });

  describe('Edge Cases', () => {
    test('Unknown action is rejected', () => {
      logger.log('Testing unknown action rejection');

      const result = checkActionAllowed('UNKNOWN_ACTION', [{ role: 'GP' }], []);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Unknown action');
      logger.log('Unknown action rejected');
    });

    test('Empty approvals array is handled', () => {
      logger.log('Testing empty approvals');

      const result = checkActionAllowed('OPEN_REVIEW', [], []);

      expect(result.allowed).toBe(false);
      expect(result.type).toBe('APPROVAL_THRESHOLD');
      logger.log('Empty approvals handled correctly');
    });

    test('Multiple materials of same type uses highest truth class', () => {
      logger.log('Testing multiple materials with same type');

      const deal = mockKernelClient.createDeal('Test Deal');
      // Add both AI and HUMAN versions of same material
      mockKernelClient.createMaterial(deal.id, 'UnderwritingSummary', 'AI');
      mockKernelClient.createMaterial(deal.id, 'UnderwritingSummary', 'HUMAN');

      const result = checkActionAllowed(
        'APPROVE_DEAL',
        [{ role: 'GP' }, { role: 'GP' }],
        mockKernelClient.getMaterials(deal.id)
      );

      // Should use HUMAN (higher rank) and pass
      expect(result.allowed).toBe(true);
      logger.log('Highest truth class used', { allowed: result.allowed });
    });
  });
});

describe('Truth Class Invariants', () => {
  test('TRUTH_RANK hierarchy is correct', () => {
    expect(TRUTH_RANK.DOC).toBeGreaterThan(TRUTH_RANK.HUMAN);
    expect(TRUTH_RANK.HUMAN).toBeGreaterThan(TRUTH_RANK.AI);
  });

  test('isTruthSufficient follows hierarchy', () => {
    // DOC requirement
    expect(isTruthSufficient('DOC', 'DOC')).toBe(true);
    expect(isTruthSufficient('HUMAN', 'DOC')).toBe(false);
    expect(isTruthSufficient('AI', 'DOC')).toBe(false);
    expect(isTruthSufficient(null, 'DOC')).toBe(false);

    // HUMAN requirement
    expect(isTruthSufficient('DOC', 'HUMAN')).toBe(true);
    expect(isTruthSufficient('HUMAN', 'HUMAN')).toBe(true);
    expect(isTruthSufficient('AI', 'HUMAN')).toBe(false);
    expect(isTruthSufficient(null, 'HUMAN')).toBe(false);
  });
});
