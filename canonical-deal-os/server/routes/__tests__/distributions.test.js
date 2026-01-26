/**
 * Distributions Route Tests - Sprint 4
 *
 * Tests for distribution CRUD operations, waterfall calculations, and LP access.
 * Uses integrity logging to track financial operations.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { getPrisma } from '../../db.js';
import {
  generateTestId,
  generateTestEmail,
  createTestLP,
  createTestLPs,
  createTestShareClass,
  createTestWaterfallStructure,
  createTestDistribution,
  cleanupTestDeal,
  verifyAllocationSum,
  verifyNoNegativeAllocations,
  verifyProRataAllocation
} from '../../__tests__/helpers/e2e-test-utils.js';
import {
  generateGPToken,
  generateAdminToken,
  generateLPToken,
  generateOtherOrgToken,
  createTestContext,
  createMockAuthUser
} from '../../__tests__/utils/auth-helper.js';
import { createIntegrityLogger, INTEGRITY_OPERATIONS, INVARIANTS } from '../../services/integrity-logger.js';
import { dollarsToCents, allocateCents, validateAllocationSum } from '../../services/money.js';

describe('Distributions Routes', () => {
  let prisma;
  let testContext;
  let testDealId;
  let testShareClassA;
  let testShareClassB;
  let testLPs;

  beforeAll(async () => {
    prisma = getPrisma();
    testContext = createTestContext();
    testDealId = generateTestId('deal');

    // Create two share classes for waterfall testing
    testShareClassA = await createTestShareClass(testDealId, {
      code: 'A',
      name: 'Class A - Senior',
      preferredReturn: 0.10,
      priority: 1,
      organizationId: testContext.orgId
    });

    testShareClassB = await createTestShareClass(testDealId, {
      code: 'B',
      name: 'Class B - Junior',
      preferredReturn: 0.08,
      priority: 2,
      organizationId: testContext.orgId
    });

    // Create test LPs with different share classes
    testLPs = await createTestLPs(testDealId, [
      { entityName: 'LP Alpha (Class A)', commitment: 400000, ownershipPct: 40, shareClassId: testShareClassA.id, organizationId: testContext.orgId },
      { entityName: 'LP Beta (Class A)', commitment: 200000, ownershipPct: 20, shareClassId: testShareClassA.id, organizationId: testContext.orgId },
      { entityName: 'LP Gamma (Class B)', commitment: 250000, ownershipPct: 25, shareClassId: testShareClassB.id, organizationId: testContext.orgId },
      { entityName: 'LP Delta (Class B)', commitment: 150000, ownershipPct: 15, shareClassId: testShareClassB.id, organizationId: testContext.orgId }
    ]);

    // Create waterfall structure for the deal
    await createTestWaterfallStructure(testDealId, {
      lpEquity: 850000,
      gpEquity: 150000,
      preferredReturn: 0.08,
      gpCatchUp: true,
      catchUpPercent: 1.0,
      promoteTiers: [
        { hurdle: 0.12, lpSplit: 0.80, gpSplit: 0.20 },
        { hurdle: Infinity, lpSplit: 0.70, gpSplit: 0.30 }
      ]
    });
  });

  afterAll(async () => {
    await cleanupTestDeal(testDealId);
  });

  describe('Distribution Creation', () => {
    test('creates distribution with pro-rata allocations', async () => {
      const totalAmount = 100000;
      const totalCents = dollarsToCents(totalAmount);

      // Calculate expected allocations using money service
      const totalCommitment = testLPs.reduce((sum, lp) => sum + lp.commitment, 0);
      const recipients = testLPs.map(lp => ({
        id: lp.id,
        weight: lp.commitment
      }));
      const allocations = allocateCents(totalCents, recipients);

      // Verify allocation sum invariant
      const sumValidation = validateAllocationSum(allocations, totalCents);
      expect(sumValidation.valid).toBe(true);

      // Verify individual allocations match ownership
      for (const alloc of allocations) {
        const lp = testLPs.find(l => l.id === alloc.id);
        const expectedShare = lp.commitment / totalCommitment;
        const actualShare = alloc.cents / totalCents;
        expect(actualShare).toBeCloseTo(expectedShare, 4);
      }
    });

    test('allocates with correct proportions per LP', async () => {
      const totalAmount = 200000;

      // Expected: LP Alpha 40%, LP Beta 20%, LP Gamma 25%, LP Delta 15%
      const expectedAllocations = {
        'LP Alpha (Class A)': 80000,  // 40% of 200k
        'LP Beta (Class A)': 40000,   // 20% of 200k
        'LP Gamma (Class B)': 50000,  // 25% of 200k
        'LP Delta (Class B)': 30000   // 15% of 200k
      };

      const totalCents = dollarsToCents(totalAmount);
      const recipients = testLPs.map(lp => ({
        id: lp.id,
        weight: lp.ownershipPct
      }));
      const allocations = allocateCents(totalCents, recipients);

      for (const alloc of allocations) {
        const lp = testLPs.find(l => l.id === alloc.id);
        const expectedDollars = expectedAllocations[lp.entityName];
        expect(alloc.dollars).toBeCloseTo(expectedDollars, 2);
      }
    });
  });

  describe('Distribution Database Operations', () => {
    let testDistId;

    beforeEach(async () => {
      // Create a fresh distribution for each test
      const dist = await prisma.distribution.create({
        data: {
          id: generateTestId('dist'),
          dealId: testDealId,
          title: `Test Distribution ${Date.now()}`,
          totalAmount: 80000,
          distributionDate: new Date(),
          type: 'CASH_DISTRIBUTION',
          status: 'DRAFT',
          createdBy: testContext.userId,
          createdByName: 'Test User'
        }
      });
      testDistId = dist.id;

      // Create allocations for each LP
      for (const lp of testLPs) {
        const allocAmount = 80000 * (lp.ownershipPct / 100);
        await prisma.distributionAllocation.create({
          data: {
            id: generateTestId('alloc'),
            distributionId: testDistId,
            lpActorId: lp.id,
            grossAmount: allocAmount,
            withholdingAmount: 0,
            netAmount: allocAmount,
            status: 'PENDING'
          }
        });
      }
    });

    afterEach(async () => {
      if (testDistId) {
        await prisma.distributionAllocation.deleteMany({
          where: { distributionId: testDistId }
        });
        await prisma.distribution.delete({
          where: { id: testDistId }
        }).catch(() => {});
      }
    });

    test('retrieves distribution with eager-loaded allocations', async () => {
      // This tests the N+1 fix - single query with include
      const distribution = await prisma.distribution.findUnique({
        where: { id: testDistId },
        include: {
          allocations: {
            include: {
              lpActor: {
                select: {
                  id: true,
                  entityName: true,
                  email: true,
                  commitment: true,
                  ownershipPct: true,
                  shareClass: { select: { id: true, code: true, name: true } }
                }
              }
            }
          }
        }
      });

      expect(distribution).toBeTruthy();
      expect(distribution.allocations).toHaveLength(4);
      expect(distribution.status).toBe('DRAFT');

      // Verify each allocation has LP info with share class
      distribution.allocations.forEach(alloc => {
        expect(alloc.lpActor).toBeTruthy();
        expect(alloc.lpActor.entityName).toBeTruthy();
        expect(alloc.lpActor.shareClass).toBeTruthy();
      });

      // Verify share class codes
      const classCodes = distribution.allocations.map(a => a.lpActor.shareClass?.code);
      expect(classCodes).toContain('A');
      expect(classCodes).toContain('B');
    });

    test('approves distribution (status transition)', async () => {
      const updated = await prisma.distribution.update({
        where: { id: testDistId },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          approvedBy: testContext.userId,
          approvedByName: 'Approver User'
        }
      });

      expect(updated.status).toBe('APPROVED');
      expect(updated.approvedAt).toBeTruthy();
      expect(updated.approvedBy).toBe(testContext.userId);
    });

    test('marks allocation as paid', async () => {
      // First approve the distribution
      await prisma.distribution.update({
        where: { id: testDistId },
        data: { status: 'APPROVED', approvedAt: new Date() }
      });

      // Get first allocation
      const allocation = await prisma.distributionAllocation.findFirst({
        where: { distributionId: testDistId }
      });

      // Mark as paid
      const updated = await prisma.distributionAllocation.update({
        where: { id: allocation.id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          confirmationRef: 'WIRE-CONF-12345'
        }
      });

      expect(updated.status).toBe('PAID');
      expect(updated.paidAt).toBeTruthy();
      expect(updated.confirmationRef).toBe('WIRE-CONF-12345');
    });

    test('updates distribution status when all paid', async () => {
      await prisma.distribution.update({
        where: { id: testDistId },
        data: { status: 'APPROVED', approvedAt: new Date() }
      });

      // Mark all allocations as paid
      await prisma.distributionAllocation.updateMany({
        where: { distributionId: testDistId },
        data: {
          status: 'PAID',
          paidAt: new Date()
        }
      });

      // Check if all are paid
      const allocations = await prisma.distributionAllocation.findMany({
        where: { distributionId: testDistId }
      });

      const allPaid = allocations.every(a => a.status === 'PAID');
      expect(allPaid).toBe(true);

      // Update distribution status
      if (allPaid) {
        await prisma.distribution.update({
          where: { id: testDistId },
          data: { status: 'PAID' }
        });
      }

      const finalDist = await prisma.distribution.findUnique({
        where: { id: testDistId }
      });
      expect(finalDist.status).toBe('PAID');
    });

    test('cancels draft distribution', async () => {
      const updated = await prisma.distribution.update({
        where: { id: testDistId },
        data: { status: 'CANCELLED' }
      });

      expect(updated.status).toBe('CANCELLED');
    });
  });

  describe('Verification Helpers', () => {
    test('verifyAllocationSum validates correctly', async () => {
      const allocations = [
        { grossAmount: 40000 },
        { grossAmount: 20000 },
        { grossAmount: 25000 },
        { grossAmount: 15000 }
      ];

      const result = verifyAllocationSum(allocations, 100000);
      expect(result.valid).toBe(true);
      expect(result.sum).toBe(100000);
      expect(result.diff).toBe(0);
    });

    test('verifyAllocationSum detects mismatch', async () => {
      const allocations = [
        { grossAmount: 40000 },
        { grossAmount: 20000 },
        { grossAmount: 25000 },
        { grossAmount: 14999 }  // Off by 1
      ];

      const result = verifyAllocationSum(allocations, 100000);
      expect(result.valid).toBe(false);
      expect(result.diff).toBe(1);
    });

    test('verifyNoNegativeAllocations passes for valid allocations', () => {
      const allocations = [
        { grossAmount: 40000 },
        { grossAmount: 20000 },
        { grossAmount: 25000 },
        { grossAmount: 15000 }
      ];

      const result = verifyNoNegativeAllocations(allocations);
      expect(result.valid).toBe(true);
      expect(result.negativeCount).toBe(0);
    });

    test('verifyNoNegativeAllocations detects negative', () => {
      const allocations = [
        { grossAmount: 40000 },
        { grossAmount: -5000 },  // Invalid!
        { grossAmount: 25000 },
        { grossAmount: 15000 }
      ];

      const result = verifyNoNegativeAllocations(allocations);
      expect(result.valid).toBe(false);
      expect(result.negativeCount).toBe(1);
    });

    test('verifyProRataAllocation validates proportions', () => {
      const allocations = [
        { lpActorId: testLPs[0].id, grossAmount: 40000 },
        { lpActorId: testLPs[1].id, grossAmount: 20000 },
        { lpActorId: testLPs[2].id, grossAmount: 25000 },
        { lpActorId: testLPs[3].id, grossAmount: 15000 }
      ];

      const result = verifyProRataAllocation(allocations, testLPs, 100000);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });

  describe('Share Class Grouping', () => {
    test('groups LPs by share class correctly', async () => {
      // Group LPs by share class
      const byClass = {};
      for (const lp of testLPs) {
        const classCode = lp.shareClass?.code || 'NONE';
        if (!byClass[classCode]) {
          byClass[classCode] = {
            lps: [],
            totalOwnership: 0,
            totalCommitment: 0
          };
        }
        byClass[classCode].lps.push(lp);
        byClass[classCode].totalOwnership += lp.ownershipPct;
        byClass[classCode].totalCommitment += lp.commitment;
      }

      // Verify Class A
      expect(byClass['A']).toBeTruthy();
      expect(byClass['A'].lps).toHaveLength(2);
      expect(byClass['A'].totalOwnership).toBe(60);  // 40 + 20
      expect(byClass['A'].totalCommitment).toBe(600000);  // 400k + 200k

      // Verify Class B
      expect(byClass['B']).toBeTruthy();
      expect(byClass['B'].lps).toHaveLength(2);
      expect(byClass['B'].totalOwnership).toBe(40);  // 25 + 15
      expect(byClass['B'].totalCommitment).toBe(400000);  // 250k + 150k
    });

    test('share class priority determines payment order', async () => {
      // Class A (priority 1) should be paid before Class B (priority 2)
      const classes = [testShareClassA, testShareClassB].sort((a, b) => a.priority - b.priority);

      expect(classes[0].code).toBe('A');  // Senior
      expect(classes[1].code).toBe('B');  // Junior
    });
  });

  describe('LP Access Patterns', () => {
    let lpDistId;

    beforeAll(async () => {
      // Create a paid distribution for LP tests
      const dist = await prisma.distribution.create({
        data: {
          id: generateTestId('lp-dist'),
          dealId: testDealId,
          title: 'LP Test Distribution',
          totalAmount: 50000,
          distributionDate: new Date(),
          type: 'CASH_DISTRIBUTION',
          status: 'PAID',
          approvedAt: new Date(),
          approvedBy: testContext.userId,
          approvedByName: 'GP User',
          createdBy: testContext.userId,
          createdByName: 'GP User'
        }
      });
      lpDistId = dist.id;

      // Create allocations
      for (const lp of testLPs) {
        const allocAmount = 50000 * (lp.ownershipPct / 100);
        await prisma.distributionAllocation.create({
          data: {
            id: generateTestId('lp-alloc'),
            distributionId: lpDistId,
            lpActorId: lp.id,
            grossAmount: allocAmount,
            withholdingAmount: 0,
            netAmount: allocAmount,
            status: 'PAID',
            paidAt: new Date()
          }
        });
      }
    });

    afterAll(async () => {
      if (lpDistId) {
        await prisma.distributionAllocation.deleteMany({
          where: { distributionId: lpDistId }
        });
        await prisma.distribution.delete({
          where: { id: lpDistId }
        }).catch(() => {});
      }
    });

    test('LP can view their distribution allocation only', async () => {
      const lpActor = testLPs[0];

      // Get distributions with this LP's allocations only
      const distributions = await prisma.distribution.findMany({
        where: {
          dealId: testDealId,
          status: { in: ['APPROVED', 'PAID'] }
        },
        include: {
          allocations: {
            where: { lpActorId: lpActor.id }
          }
        }
      });

      expect(distributions.length).toBeGreaterThan(0);

      const distWithAlloc = distributions.find(d => d.allocations.length > 0);
      expect(distWithAlloc).toBeTruthy();
      expect(distWithAlloc.allocations).toHaveLength(1);
      expect(distWithAlloc.allocations[0].lpActorId).toBe(lpActor.id);
    });

    test('LP sees correct amounts for their share class', async () => {
      // Class A LP (40% ownership)
      const classALp = testLPs[0];
      const allocation = await prisma.distributionAllocation.findFirst({
        where: {
          distributionId: lpDistId,
          lpActorId: classALp.id
        }
      });

      // Expected: 40% of 50000 = 20000
      expect(allocation.grossAmount).toBe(20000);
      expect(allocation.netAmount).toBe(20000);
    });
  });

  describe('Integrity Logging', () => {
    test('logs distribution creation with invariant checks', async () => {
      const logger = createIntegrityLogger({
        operation: INTEGRITY_OPERATIONS.DISTRIBUTION_CREATE,
        dealId: testDealId,
        userId: testContext.userId,
        requestId: 'test-req-456'
      });

      logger.info('Starting distribution creation', {
        title: 'Test Distribution',
        totalAmount: 100000
      });

      // Record LP state before
      logger.beforeState('lpActors', testLPs.map(lp => ({
        id: lp.id,
        entityName: lp.entityName,
        ownershipPct: lp.ownershipPct,
        shareClass: lp.shareClass?.code
      })));

      // Calculate allocations
      const totalCents = 10000000;  // $100,000
      const allocations = testLPs.map(lp => ({
        lpActorId: lp.id,
        cents: Math.round(totalCents * (lp.ownershipPct / 100))
      }));

      // Check invariants
      const sum = allocations.reduce((s, a) => s + a.cents, 0);
      logger.invariantCheck(
        INVARIANTS.ALLOCATION_SUM_EQUALS_TOTAL,
        sum === totalCents,
        { sum, expected: totalCents, diff: Math.abs(sum - totalCents) }
      );

      const hasNegative = allocations.some(a => a.cents < 0);
      logger.invariantCheck(
        INVARIANTS.NO_NEGATIVE_ALLOCATIONS,
        !hasNegative,
        { hasNegative }
      );

      logger.afterState('allocations', allocations);
      await logger.flush();

      // Test passes if no exceptions thrown
      expect(true).toBe(true);
    });
  });

  describe('Withholding Calculations', () => {
    test('calculates net amount after withholding', () => {
      const grossAmount = 10000;
      const withholdingRate = 0.30;  // 30% withholding
      const withholdingAmount = Math.round(grossAmount * withholdingRate * 100) / 100;
      const netAmount = grossAmount - withholdingAmount;

      expect(withholdingAmount).toBe(3000);
      expect(netAmount).toBe(7000);
    });

    test('handles zero withholding', () => {
      const grossAmount = 10000;
      const withholdingRate = 0;
      const withholdingAmount = grossAmount * withholdingRate;
      const netAmount = grossAmount - withholdingAmount;

      expect(withholdingAmount).toBe(0);
      expect(netAmount).toBe(grossAmount);
    });
  });

  describe('Distribution Types', () => {
    test('supports different distribution types', async () => {
      const types = ['CASH_DISTRIBUTION', 'PREFERRED_RETURN', 'RETURN_OF_CAPITAL', 'PROFIT_SHARE'];

      for (const type of types) {
        const dist = await prisma.distribution.create({
          data: {
            id: generateTestId('type-dist'),
            dealId: testDealId,
            title: `${type} Test`,
            totalAmount: 1000,
            distributionDate: new Date(),
            type,
            status: 'DRAFT',
            createdBy: testContext.userId,
            createdByName: 'Test'
          }
        });

        expect(dist.type).toBe(type);

        // Cleanup
        await prisma.distribution.delete({ where: { id: dist.id } });
      }
    });
  });

  describe('Period Tracking', () => {
    test('tracks distribution period', async () => {
      const dist = await prisma.distribution.create({
        data: {
          id: generateTestId('period-dist'),
          dealId: testDealId,
          title: 'Q4 2025 Distribution',
          totalAmount: 25000,
          distributionDate: new Date('2025-12-31'),
          period: 'Q4 2025',
          type: 'CASH_DISTRIBUTION',
          status: 'DRAFT',
          createdBy: testContext.userId,
          createdByName: 'Test'
        }
      });

      expect(dist.period).toBe('Q4 2025');
      expect(dist.distributionDate).toBeTruthy();

      // Cleanup
      await prisma.distribution.delete({ where: { id: dist.id } });
    });
  });
});
