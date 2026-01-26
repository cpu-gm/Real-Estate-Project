/**
 * P1 Data Integrity Sprint - Audit Logging Tests
 *
 * Tests for Task 10: Comprehensive Audit Logging
 * - AUDIT_ACTIONS constants
 * - logPermissionAction with resourceType, resourceId, metadata
 * - Audit trail for capital calls and distributions
 */

import { jest } from '@jest/globals';

// Mock prisma
const mockAuditLogs = [];
const mockPrisma = {
  permissionAuditLog: {
    create: jest.fn().mockImplementation(({ data }) => {
      const log = {
        id: `log-${Date.now()}`,
        ...data,
        createdAt: new Date()
      };
      mockAuditLogs.push(log);
      return log;
    }),
    findMany: jest.fn().mockImplementation(({ where }) => {
      return mockAuditLogs.filter(log => {
        if (where?.actorId && log.actorId !== where.actorId) return false;
        if (where?.action && log.action !== where.action) return false;
        if (where?.resourceType && log.resourceType !== where.resourceType) return false;
        if (where?.metadata?.contains) {
          const metaStr = typeof log.metadata === 'string' ? log.metadata : JSON.stringify(log.metadata);
          if (!metaStr.includes(where.metadata.contains)) return false;
        }
        return true;
      });
    })
  }
};

jest.unstable_mockModule('../db.js', () => ({
  getPrisma: () => mockPrisma
}));

// Import after mocking
const { logPermissionAction, AUDIT_ACTIONS } = await import('../middleware/auth.js');

describe('Task 10: Audit Logging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuditLogs.length = 0;
  });

  describe('AUDIT_ACTIONS constants', () => {
    it('defines capital call actions', () => {
      expect(AUDIT_ACTIONS.CAPITAL_CALL_CREATED).toBe('CAPITAL_CALL_CREATED');
      expect(AUDIT_ACTIONS.CAPITAL_CALL_ISSUED).toBe('CAPITAL_CALL_ISSUED');
      expect(AUDIT_ACTIONS.CAPITAL_CALL_ALLOCATION_FUNDED).toBe('CAPITAL_CALL_ALLOCATION_FUNDED');
      expect(AUDIT_ACTIONS.CAPITAL_CALL_CANCELLED).toBe('CAPITAL_CALL_CANCELLED');
    });

    it('defines distribution actions', () => {
      expect(AUDIT_ACTIONS.DISTRIBUTION_CREATED).toBe('DISTRIBUTION_CREATED');
      expect(AUDIT_ACTIONS.DISTRIBUTION_APPROVED).toBe('DISTRIBUTION_APPROVED');
      expect(AUDIT_ACTIONS.DISTRIBUTION_ALLOCATION_PAID).toBe('DISTRIBUTION_ALLOCATION_PAID');
      expect(AUDIT_ACTIONS.DISTRIBUTION_CANCELLED).toBe('DISTRIBUTION_CANCELLED');
    });

    it('defines LP actions', () => {
      expect(AUDIT_ACTIONS.LP_INVITED).toBe('LP_INVITED');
      expect(AUDIT_ACTIONS.LP_ONBOARDED).toBe('LP_ONBOARDED');
      expect(AUDIT_ACTIONS.LP_TRANSFER_INITIATED).toBe('LP_TRANSFER_INITIATED');
      expect(AUDIT_ACTIONS.LP_TRANSFER_COMPLETED).toBe('LP_TRANSFER_COMPLETED');
    });
  });

  describe('logPermissionAction', () => {
    it('creates audit log entry with all fields', async () => {
      await logPermissionAction({
        actorId: 'user-123',
        action: AUDIT_ACTIONS.CAPITAL_CALL_ISSUED,
        resourceType: 'CapitalCall',
        resourceId: 'cc-456',
        beforeValue: { status: 'DRAFT' },
        afterValue: { status: 'ISSUED', totalAmount: 100000 },
        metadata: { dealId: 'deal-789' },
        ipAddress: '192.168.1.1'
      });

      expect(mockPrisma.permissionAuditLog.create).toHaveBeenCalled();
      const createCall = mockPrisma.permissionAuditLog.create.mock.calls[0][0];

      expect(createCall.data.actorId).toBe('user-123');
      expect(createCall.data.action).toBe('CAPITAL_CALL_ISSUED');
      expect(createCall.data.ipAddress).toBe('192.168.1.1');

      // Verify JSON serialization
      const beforeValue = JSON.parse(createCall.data.beforeValue);
      const afterValue = JSON.parse(createCall.data.afterValue);

      expect(beforeValue).toEqual({ status: 'DRAFT' });
      expect(afterValue.status).toBe('ISSUED');
      expect(afterValue.totalAmount).toBe(100000);
      // resourceType/resourceId/metadata are merged into afterValue
      expect(afterValue._resourceType).toBe('CapitalCall');
      expect(afterValue._resourceId).toBe('cc-456');
      expect(afterValue.dealId).toBe('deal-789');
    });

    it('handles null optional fields gracefully', async () => {
      await logPermissionAction({
        actorId: 'user-123',
        action: 'TEST_ACTION'
      });

      expect(mockPrisma.permissionAuditLog.create).toHaveBeenCalled();
      const createCall = mockPrisma.permissionAuditLog.create.mock.calls[0][0];

      expect(createCall.data.actorId).toBe('user-123');
      expect(createCall.data.action).toBe('TEST_ACTION');
      expect(createCall.data.beforeValue).toBeNull();
      expect(createCall.data.afterValue).toBeNull();
    });

    it('handles errors gracefully without throwing', async () => {
      mockPrisma.permissionAuditLog.create.mockRejectedValueOnce(new Error('DB error'));

      // Should not throw
      await logPermissionAction({
        actorId: 'user-123',
        action: 'TEST_ACTION'
      });

      // Verify it attempted to create
      expect(mockPrisma.permissionAuditLog.create).toHaveBeenCalled();
    });

    it('includes timestamp in created log', async () => {
      await logPermissionAction({
        actorId: 'user-123',
        action: AUDIT_ACTIONS.DISTRIBUTION_CREATED
      });

      expect(mockAuditLogs.length).toBe(1);
      expect(mockAuditLogs[0].createdAt).toBeInstanceOf(Date);
    });
  });

  describe('audit log queries', () => {
    beforeEach(async () => {
      // Create some test logs
      await logPermissionAction({
        actorId: 'user-1',
        action: AUDIT_ACTIONS.CAPITAL_CALL_CREATED,
        resourceType: 'CapitalCall',
        resourceId: 'cc-1',
        metadata: { dealId: 'deal-123' }
      });
      await logPermissionAction({
        actorId: 'user-1',
        action: AUDIT_ACTIONS.DISTRIBUTION_CREATED,
        resourceType: 'Distribution',
        resourceId: 'dist-1',
        metadata: { dealId: 'deal-123' }
      });
      await logPermissionAction({
        actorId: 'user-2',
        action: AUDIT_ACTIONS.CAPITAL_CALL_CREATED,
        resourceType: 'CapitalCall',
        resourceId: 'cc-2',
        metadata: { dealId: 'deal-456' }
      });
    });

    it('can query by actorId', async () => {
      const logs = await mockPrisma.permissionAuditLog.findMany({
        where: { actorId: 'user-1' }
      });
      expect(logs.length).toBe(2);
    });

    it('can query by action', async () => {
      const logs = await mockPrisma.permissionAuditLog.findMany({
        where: { action: AUDIT_ACTIONS.CAPITAL_CALL_CREATED }
      });
      expect(logs.length).toBe(2);
    });

    it('can query by action type', async () => {
      const logs = await mockPrisma.permissionAuditLog.findMany({
        where: { action: AUDIT_ACTIONS.DISTRIBUTION_CREATED }
      });
      expect(logs.length).toBe(1);
    });
  });

  describe('financial mutation audit trail', () => {
    it('capital call create includes allocation count', async () => {
      await logPermissionAction({
        actorId: 'gp-user',
        action: AUDIT_ACTIONS.CAPITAL_CALL_CREATED,
        resourceType: 'CapitalCall',
        resourceId: 'cc-test',
        afterValue: {
          totalAmount: 100000,
          allocationCount: 5,
          status: 'DRAFT'
        },
        metadata: { dealId: 'deal-123' }
      });

      const logs = await mockPrisma.permissionAuditLog.findMany({
        where: { action: AUDIT_ACTIONS.CAPITAL_CALL_CREATED }
      });

      expect(logs.length).toBe(1);
      const afterValue = JSON.parse(logs[0].afterValue);
      expect(afterValue.totalAmount).toBe(100000);
      expect(afterValue.allocationCount).toBe(5);
    });

    it('funding includes version for optimistic concurrency', async () => {
      await logPermissionAction({
        actorId: 'gp-user',
        action: AUDIT_ACTIONS.CAPITAL_CALL_ALLOCATION_FUNDED,
        resourceType: 'CapitalCallAllocation',
        resourceId: 'alloc-test',
        beforeValue: { status: 'PENDING', fundedAmount: 0, version: 1 },
        afterValue: { status: 'FUNDED', fundedAmount: 50000, version: 2 },
        metadata: { capitalCallId: 'cc-123', lpActorId: 'lp-456' }
      });

      const logs = await mockPrisma.permissionAuditLog.findMany({
        where: { action: AUDIT_ACTIONS.CAPITAL_CALL_ALLOCATION_FUNDED }
      });

      expect(logs.length).toBe(1);
      const beforeValue = JSON.parse(logs[0].beforeValue);
      const afterValue = JSON.parse(logs[0].afterValue);
      expect(beforeValue.version).toBe(1);
      expect(afterValue.version).toBe(2);
    });

    it('distribution approval includes before/after status', async () => {
      await logPermissionAction({
        actorId: 'approver-user',
        action: AUDIT_ACTIONS.DISTRIBUTION_APPROVED,
        resourceType: 'Distribution',
        resourceId: 'dist-test',
        beforeValue: { status: 'PENDING' },
        afterValue: { status: 'PROCESSING', totalAmount: 50000 },
        metadata: { dealId: 'deal-789' }
      });

      const logs = await mockPrisma.permissionAuditLog.findMany({
        where: { action: AUDIT_ACTIONS.DISTRIBUTION_APPROVED }
      });

      expect(logs.length).toBe(1);
      const beforeValue = JSON.parse(logs[0].beforeValue);
      const afterValue = JSON.parse(logs[0].afterValue);
      expect(beforeValue.status).toBe('PENDING');
      expect(afterValue.status).toBe('PROCESSING');
    });
  });
});
