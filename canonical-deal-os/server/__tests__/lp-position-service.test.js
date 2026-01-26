/**
 * P1 Data Integrity Sprint - LP Position Service Tests
 *
 * Tests for Task 3: LP Position Service
 * - computeLPPosition() from funded allocations
 * - computeAllLPPositions() for deal
 * - validatePosition() for reconciliation
 * - getLPPositionsForWaterfall() compatibility
 */

import { jest } from '@jest/globals';

// Mock data
const mockLPActor = {
  id: 'lp-123',
  dealId: 'deal-456',
  entityName: 'Test LP',
  email: 'lp@test.com',
  commitment: 100000,
  ownershipPct: 50,
  status: 'ACTIVE',
  shareClass: {
    id: 'class-1',
    code: 'A',
    name: 'Class A',
    preferredReturn: 8
  }
};

const mockFundedAllocations = [
  { id: 'alloc-1', capitalCallId: 'cc-1', lpActorId: 'lp-123', amount: 30000, fundedAmount: 30000, status: 'FUNDED' },
  { id: 'alloc-2', capitalCallId: 'cc-2', lpActorId: 'lp-123', amount: 20000, fundedAmount: 20000, status: 'FUNDED' }
];

const mockPendingAllocation = {
  id: 'alloc-3', capitalCallId: 'cc-3', lpActorId: 'lp-123', amount: 25000, fundedAmount: 0, status: 'PENDING'
};

const mockPaidDistributions = [
  { id: 'dist-1', distributionId: 'd-1', lpActorId: 'lp-123', grossAmount: 5000, netAmount: 4500, status: 'PAID' }
];

const mockCompletedTransferIn = {
  id: 'transfer-1', fromLpActorId: 'lp-other', toLpActorId: 'lp-123', transferAmount: 10000, status: 'COMPLETED'
};

const mockPendingTransferOut = {
  id: 'transfer-2', fromLpActorId: 'lp-123', toLpActorId: 'lp-other2', transferAmount: 5000, status: 'PENDING'
};

// Mock Prisma
const mockPrisma = {
  lPActor: {
    findUnique: jest.fn(),
    findMany: jest.fn()
  },
  capitalCallAllocation: {
    findMany: jest.fn()
  },
  distributionAllocation: {
    findMany: jest.fn()
  },
  lPTransfer: {
    findMany: jest.fn()
  },
  integrityLog: {
    create: jest.fn().mockResolvedValue({ id: 'log-id' })
  },
  integrityViolation: {
    create: jest.fn().mockResolvedValue({ id: 'violation-id' })
  }
};

jest.unstable_mockModule('../db.js', () => ({
  getPrisma: () => mockPrisma
}));

// Import after mocking
const {
  computeLPPosition,
  computeAllLPPositions,
  validatePosition,
  getLPPositionsForWaterfall
} = await import('../services/lp-position-service.js');

describe('Task 3: LP Position Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('computeLPPosition', () => {
    it('returns capitalContributed from FUNDED allocations only', async () => {
      mockPrisma.lPActor.findUnique.mockResolvedValue(mockLPActor);
      mockPrisma.capitalCallAllocation.findMany.mockResolvedValue(mockFundedAllocations);
      mockPrisma.distributionAllocation.findMany.mockResolvedValue([]);
      mockPrisma.lPTransfer.findMany.mockResolvedValue([]);

      const position = await computeLPPosition('lp-123', 'deal-456');

      expect(position).not.toBeNull();
      expect(position.capitalContributed).toBe(50000);  // 30000 + 20000 from FUNDED
      expect(position.capitalRemaining).toBe(50000);    // 100000 - 50000

      // Verify only FUNDED status queried
      expect(mockPrisma.capitalCallAllocation.findMany).toHaveBeenCalledWith({
        where: {
          lpActorId: 'lp-123',
          status: 'FUNDED'
        }
      });
    });

    it('returns totalDistributed from PAID allocations only', async () => {
      mockPrisma.lPActor.findUnique.mockResolvedValue(mockLPActor);
      mockPrisma.capitalCallAllocation.findMany.mockResolvedValue([]);
      mockPrisma.distributionAllocation.findMany.mockResolvedValue(mockPaidDistributions);
      mockPrisma.lPTransfer.findMany.mockResolvedValue([]);

      const position = await computeLPPosition('lp-123', 'deal-456');

      expect(position.totalDistributed).toBe(4500);  // netAmount from PAID

      // Verify only PAID status queried
      expect(mockPrisma.distributionAllocation.findMany).toHaveBeenCalledWith({
        where: {
          lpActorId: 'lp-123',
          status: 'PAID'
        }
      });
    });

    it('calculates netTransfers from COMPLETED transfers', async () => {
      mockPrisma.lPActor.findUnique.mockResolvedValue(mockLPActor);
      mockPrisma.capitalCallAllocation.findMany.mockResolvedValue([]);
      mockPrisma.distributionAllocation.findMany.mockResolvedValue([]);

      // First call: transfers out (empty)
      // Second call: transfers in (mockCompletedTransferIn)
      mockPrisma.lPTransfer.findMany
        .mockResolvedValueOnce([])  // transfers out
        .mockResolvedValueOnce([mockCompletedTransferIn]);  // transfers in

      const position = await computeLPPosition('lp-123', 'deal-456');

      expect(position.netTransfers).toBe(10000);  // 10000 in - 0 out

      // Verify COMPLETED status queried
      expect(mockPrisma.lPTransfer.findMany).toHaveBeenCalledWith({
        where: { fromLpActorId: 'lp-123', status: 'COMPLETED' }
      });
      expect(mockPrisma.lPTransfer.findMany).toHaveBeenCalledWith({
        where: { toLpActorId: 'lp-123', status: 'COMPLETED' }
      });
    });

    it('returns null for non-existent LP', async () => {
      mockPrisma.lPActor.findUnique.mockResolvedValue(null);

      const position = await computeLPPosition('non-existent', 'deal-456');

      expect(position).toBeNull();
    });

    it('returns null for LP in different deal', async () => {
      mockPrisma.lPActor.findUnique.mockResolvedValue({
        ...mockLPActor,
        dealId: 'different-deal'
      });

      const position = await computeLPPosition('lp-123', 'deal-456');

      expect(position).toBeNull();
    });

    it('includes shareClass data', async () => {
      mockPrisma.lPActor.findUnique.mockResolvedValue(mockLPActor);
      mockPrisma.capitalCallAllocation.findMany.mockResolvedValue([]);
      mockPrisma.distributionAllocation.findMany.mockResolvedValue([]);
      mockPrisma.lPTransfer.findMany.mockResolvedValue([]);

      const position = await computeLPPosition('lp-123', 'deal-456');

      expect(position.shareClass).toBeDefined();
      expect(position.shareClass.code).toBe('A');
      expect(position.shareClass.preferredReturn).toBe(8);
    });

    it('calculates netPosition correctly', async () => {
      mockPrisma.lPActor.findUnique.mockResolvedValue(mockLPActor);
      mockPrisma.capitalCallAllocation.findMany.mockResolvedValue(mockFundedAllocations);  // 50000 contributed
      mockPrisma.distributionAllocation.findMany.mockResolvedValue(mockPaidDistributions);  // 4500 distributed
      mockPrisma.lPTransfer.findMany.mockResolvedValue([]);

      const position = await computeLPPosition('lp-123', 'deal-456');

      expect(position.netPosition).toBe(45500);  // 50000 - 4500
    });
  });

  describe('computeAllLPPositions', () => {
    const mockLPActor2 = {
      ...mockLPActor,
      id: 'lp-456',
      entityName: 'Test LP 2',
      commitment: 50000,
      ownershipPct: 25
    };

    it('returns positions for all active LPs in deal', async () => {
      mockPrisma.lPActor.findMany.mockResolvedValue([
        { id: 'lp-123' },
        { id: 'lp-456' }
      ]);
      mockPrisma.lPActor.findUnique
        .mockResolvedValueOnce(mockLPActor)
        .mockResolvedValueOnce(mockLPActor2);
      mockPrisma.capitalCallAllocation.findMany.mockResolvedValue([]);
      mockPrisma.distributionAllocation.findMany.mockResolvedValue([]);
      mockPrisma.lPTransfer.findMany.mockResolvedValue([]);

      const positions = await computeAllLPPositions('deal-456');

      expect(positions.length).toBe(2);
      expect(positions.map(p => p.lpActorId)).toContain('lp-123');
      expect(positions.map(p => p.lpActorId)).toContain('lp-456');
    });

    it('only includes ACTIVE LPs by default', async () => {
      mockPrisma.lPActor.findMany.mockResolvedValue([{ id: 'lp-123' }]);
      mockPrisma.lPActor.findUnique.mockResolvedValue(mockLPActor);
      mockPrisma.capitalCallAllocation.findMany.mockResolvedValue([]);
      mockPrisma.distributionAllocation.findMany.mockResolvedValue([]);
      mockPrisma.lPTransfer.findMany.mockResolvedValue([]);

      await computeAllLPPositions('deal-456');

      expect(mockPrisma.lPActor.findMany).toHaveBeenCalledWith({
        where: { dealId: 'deal-456', status: 'ACTIVE' },
        select: { id: true }
      });
    });

    it('includes inactive LPs when option set', async () => {
      mockPrisma.lPActor.findMany.mockResolvedValue([{ id: 'lp-123' }]);
      mockPrisma.lPActor.findUnique.mockResolvedValue(mockLPActor);
      mockPrisma.capitalCallAllocation.findMany.mockResolvedValue([]);
      mockPrisma.distributionAllocation.findMany.mockResolvedValue([]);
      mockPrisma.lPTransfer.findMany.mockResolvedValue([]);

      await computeAllLPPositions('deal-456', { includeInactive: true });

      expect(mockPrisma.lPActor.findMany).toHaveBeenCalledWith({
        where: { dealId: 'deal-456' },
        select: { id: true }
      });
    });
  });

  describe('validatePosition', () => {
    it('returns valid:true when position matches', async () => {
      mockPrisma.lPActor.findUnique.mockResolvedValue(mockLPActor);
      mockPrisma.capitalCallAllocation.findMany.mockResolvedValue(mockFundedAllocations);
      mockPrisma.distributionAllocation.findMany.mockResolvedValue([]);
      mockPrisma.lPTransfer.findMany.mockResolvedValue([]);

      const expectedPosition = {
        capitalContributed: 50000,
        totalDistributed: 0,
        capitalRemaining: 50000
      };

      const result = await validatePosition('lp-123', 'deal-456', expectedPosition);

      expect(result.valid).toBe(true);
      expect(result.mismatches).toHaveLength(0);
    });

    it('returns valid:false with mismatches when position differs', async () => {
      mockPrisma.lPActor.findUnique.mockResolvedValue(mockLPActor);
      mockPrisma.capitalCallAllocation.findMany.mockResolvedValue(mockFundedAllocations);
      mockPrisma.distributionAllocation.findMany.mockResolvedValue([]);
      mockPrisma.lPTransfer.findMany.mockResolvedValue([]);

      const wrongPosition = {
        capitalContributed: 99999,  // Wrong!
        totalDistributed: 0,
        capitalRemaining: 1
      };

      const result = await validatePosition('lp-123', 'deal-456', wrongPosition);

      expect(result.valid).toBe(false);
      expect(result.mismatches.length).toBeGreaterThan(0);
      expect(result.mismatches.some(m => m.field === 'capitalContributed')).toBe(true);
    });

    it('returns valid:false reason when LP not found', async () => {
      mockPrisma.lPActor.findUnique.mockResolvedValue(null);

      const result = await validatePosition('non-existent', 'deal-456', {});

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('LP not found');
    });
  });

  describe('getLPPositionsForWaterfall', () => {
    it('returns positions formatted for waterfall calculator', async () => {
      mockPrisma.lPActor.findMany.mockResolvedValue([{ id: 'lp-123' }]);
      mockPrisma.lPActor.findUnique.mockResolvedValue(mockLPActor);
      mockPrisma.capitalCallAllocation.findMany.mockResolvedValue(mockFundedAllocations);
      mockPrisma.distributionAllocation.findMany.mockResolvedValue([]);
      mockPrisma.lPTransfer.findMany.mockResolvedValue([]);

      const positions = await getLPPositionsForWaterfall('deal-456');

      expect(positions.length).toBe(1);
      expect(positions[0]).toEqual({
        lpActorId: 'lp-123',
        entityName: 'Test LP',
        ownershipPct: 50,
        commitment: 100000,
        capitalContributed: 50000,  // Should be 50000, NOT undefined!
        capitalRemaining: 50000,     // Should be 50000, NOT undefined!
        shareClass: mockLPActor.shareClass
      });
    });

    it('capitalContributed is NEVER undefined', async () => {
      mockPrisma.lPActor.findMany.mockResolvedValue([{ id: 'lp-123' }]);
      mockPrisma.lPActor.findUnique.mockResolvedValue(mockLPActor);
      mockPrisma.capitalCallAllocation.findMany.mockResolvedValue([]);  // No allocations
      mockPrisma.distributionAllocation.findMany.mockResolvedValue([]);
      mockPrisma.lPTransfer.findMany.mockResolvedValue([]);

      const positions = await getLPPositionsForWaterfall('deal-456');

      expect(positions[0].capitalContributed).toBeDefined();
      expect(positions[0].capitalContributed).toBe(0);  // Zero, not undefined
      expect(positions[0].capitalRemaining).toBe(100000);  // Full commitment remains
    });
  });
});
