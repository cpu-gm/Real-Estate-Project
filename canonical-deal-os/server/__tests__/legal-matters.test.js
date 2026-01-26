/**
 * Unit tests for Legal Matters API routes
 *
 * Tests cover:
 * - Authentication and authorization
 * - CRUD operations for legal matters
 * - Kanban stage changes
 * - Activity logging
 * - Org isolation
 */

import { jest } from '@jest/globals';

// Mock the auth middleware
const mockRequireGPCounsel = jest.fn();
const mockRequireGeneralCounsel = jest.fn();
const mockSendJson = jest.fn();
const mockSendError = jest.fn();
const mockLogPermissionAction = jest.fn();

// Mock the database
const mockPrisma = {
  legalMatter: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn()
  },
  legalMatterActivity: {
    findMany: jest.fn(),
    create: jest.fn(),
    count: jest.fn()
  }
};

jest.unstable_mockModule('../middleware/auth.js', () => ({
  requireGPCounsel: mockRequireGPCounsel,
  requireGeneralCounsel: mockRequireGeneralCounsel,
  sendJson: mockSendJson,
  sendError: mockSendError,
  logPermissionAction: mockLogPermissionAction
}));

jest.unstable_mockModule('../db.js', () => ({
  getPrisma: () => mockPrisma
}));

// Import the module under test after mocking
const {
  handleListMatters,
  handleCreateMatter,
  handleGetMatter,
  handleUpdateMatter,
  handleChangeMatterStage,
  handleAssignMatter,
  handleSignOff,
  handleGetActivities,
  handleAddActivity
} = await import('../routes/legal-matters.js');

describe('Legal Matters API', () => {
  const mockAuthUser = {
    id: 'user-123',
    email: 'counsel@test.com',
    name: 'Test Counsel',
    role: 'GP Counsel',
    organizationId: 'org-123'
  };

  const mockGCUser = {
    id: 'user-456',
    email: 'gc@test.com',
    name: 'General Counsel',
    role: 'General Counsel',
    organizationId: 'org-123'
  };

  const mockMatter = {
    id: 'matter-123',
    organizationId: 'org-123',
    matterNumber: 'ORG-2026-0001',
    title: 'Test Matter',
    description: 'Test description',
    matterType: 'DEAL_SPECIFIC',
    stage: 'NEW',
    priority: 'NORMAL',
    dueDate: new Date('2026-02-15'),
    createdBy: 'user-123',
    createdAt: new Date()
  };

  let mockReq;
  let mockRes;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      method: 'GET',
      url: 'http://localhost/api/legal/matters',
      headers: { host: 'localhost' },
      body: null
    };

    mockRes = {
      writeHead: jest.fn(),
      end: jest.fn()
    };

    // Default: GP Counsel is authenticated
    mockRequireGPCounsel.mockResolvedValue(mockAuthUser);
    mockRequireGeneralCounsel.mockResolvedValue(mockGCUser);
  });

  describe('handleListMatters', () => {
    it('should return matters for the user organization', async () => {
      mockPrisma.legalMatter.findMany.mockResolvedValue([mockMatter]);
      mockPrisma.legalMatter.count.mockResolvedValue(1);

      await handleListMatters(mockReq, mockRes);

      expect(mockRequireGPCounsel).toHaveBeenCalledWith(mockReq, mockRes);
      expect(mockPrisma.legalMatter.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-123'
          })
        })
      );
      expect(mockSendJson).toHaveBeenCalledWith(mockRes, 200, expect.objectContaining({
        matters: expect.any(Array),
        total: 1
      }));
    });

    it('should filter by stage when provided', async () => {
      mockReq.url = 'http://localhost/api/legal/matters?stage=IN_PROGRESS';
      mockPrisma.legalMatter.findMany.mockResolvedValue([]);
      mockPrisma.legalMatter.count.mockResolvedValue(0);

      await handleListMatters(mockReq, mockRes);

      expect(mockPrisma.legalMatter.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            stage: 'IN_PROGRESS'
          })
        })
      );
    });

    it('should return 401 if not authenticated', async () => {
      mockRequireGPCounsel.mockResolvedValue(null);

      await handleListMatters(mockReq, mockRes);

      expect(mockPrisma.legalMatter.findMany).not.toHaveBeenCalled();
    });
  });

  describe('handleCreateMatter', () => {
    it('should create a matter with valid data', async () => {
      mockReq.method = 'POST';
      mockReq.body = JSON.stringify({
        title: 'New Legal Matter',
        matterType: 'DEAL_SPECIFIC',
        priority: 'HIGH',
        description: 'Important legal work'
      });

      mockPrisma.legalMatter.count.mockResolvedValue(0); // For matter number generation
      mockPrisma.legalMatter.create.mockResolvedValue({
        ...mockMatter,
        title: 'New Legal Matter',
        priority: 'HIGH'
      });
      mockPrisma.legalMatterActivity.create.mockResolvedValue({});

      await handleCreateMatter(mockReq, mockRes);

      expect(mockPrisma.legalMatter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'New Legal Matter',
            matterType: 'DEAL_SPECIFIC',
            priority: 'HIGH',
            organizationId: 'org-123',
            createdBy: 'user-123'
          })
        })
      );
      expect(mockSendJson).toHaveBeenCalledWith(mockRes, 201, expect.any(Object));
    });

    it('should reject missing title', async () => {
      mockReq.method = 'POST';
      mockReq.body = JSON.stringify({
        matterType: 'DEAL_SPECIFIC'
      });

      await handleCreateMatter(mockReq, mockRes);

      expect(mockSendError).toHaveBeenCalledWith(mockRes, 400, 'Title is required');
      expect(mockPrisma.legalMatter.create).not.toHaveBeenCalled();
    });

    it('should reject invalid matter type', async () => {
      mockReq.method = 'POST';
      mockReq.body = JSON.stringify({
        title: 'Test',
        matterType: 'INVALID_TYPE'
      });

      await handleCreateMatter(mockReq, mockRes);

      expect(mockSendError).toHaveBeenCalledWith(
        mockRes, 400,
        expect.stringContaining('Invalid matterType')
      );
    });
  });

  describe('handleGetMatter', () => {
    it('should return matter by ID for same org', async () => {
      mockPrisma.legalMatter.findUnique.mockResolvedValue({
        ...mockMatter,
        activities: []
      });

      await handleGetMatter(mockReq, mockRes, 'matter-123');

      expect(mockPrisma.legalMatter.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'matter-123' }
        })
      );
      expect(mockSendJson).toHaveBeenCalledWith(mockRes, 200, expect.objectContaining({
        matter: expect.objectContaining({
          id: 'matter-123'
        })
      }));
    });

    it('should return 404 for non-existent matter', async () => {
      mockPrisma.legalMatter.findUnique.mockResolvedValue(null);

      await handleGetMatter(mockReq, mockRes, 'nonexistent');

      expect(mockSendError).toHaveBeenCalledWith(mockRes, 404, 'Matter not found');
    });

    it('should return 403 for different org matter', async () => {
      mockPrisma.legalMatter.findUnique.mockResolvedValue({
        ...mockMatter,
        organizationId: 'different-org'
      });

      await handleGetMatter(mockReq, mockRes, 'matter-123');

      expect(mockSendError).toHaveBeenCalledWith(
        mockRes, 403,
        expect.stringContaining('different organization')
      );
    });
  });

  describe('handleChangeMatterStage', () => {
    it('should change stage for valid transition', async () => {
      mockReq.method = 'POST';
      mockReq.body = JSON.stringify({ stage: 'IN_PROGRESS' });

      mockPrisma.legalMatter.findUnique.mockResolvedValue(mockMatter);
      mockPrisma.legalMatter.update.mockResolvedValue({
        ...mockMatter,
        stage: 'IN_PROGRESS'
      });
      mockPrisma.legalMatterActivity.create.mockResolvedValue({});

      await handleChangeMatterStage(mockReq, mockRes, 'matter-123');

      expect(mockPrisma.legalMatter.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'matter-123' },
          data: expect.objectContaining({
            stage: 'IN_PROGRESS'
          })
        })
      );
      expect(mockPrisma.legalMatterActivity.create).toHaveBeenCalled();
      expect(mockLogPermissionAction).toHaveBeenCalled();
    });

    it('should reject invalid stage', async () => {
      mockReq.method = 'POST';
      mockReq.body = JSON.stringify({ stage: 'INVALID' });

      await handleChangeMatterStage(mockReq, mockRes, 'matter-123');

      expect(mockSendError).toHaveBeenCalledWith(
        mockRes, 400,
        expect.stringContaining('Invalid stage')
      );
    });

    it('should set closedAt when moving to COMPLETE', async () => {
      mockReq.method = 'POST';
      mockReq.body = JSON.stringify({ stage: 'COMPLETE' });

      mockPrisma.legalMatter.findUnique.mockResolvedValue({
        ...mockMatter,
        stage: 'IN_PROGRESS'
      });
      mockPrisma.legalMatter.update.mockResolvedValue({
        ...mockMatter,
        stage: 'COMPLETE',
        closedAt: new Date()
      });
      mockPrisma.legalMatterActivity.create.mockResolvedValue({});

      await handleChangeMatterStage(mockReq, mockRes, 'matter-123');

      expect(mockPrisma.legalMatter.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            stage: 'COMPLETE',
            closedAt: expect.any(Date)
          })
        })
      );
    });
  });

  describe('handleAssignMatter', () => {
    it('should allow GP Counsel to assign to self', async () => {
      mockReq.method = 'POST';
      mockReq.body = JSON.stringify({
        assignedTo: 'user-123',
        assignedToName: 'Test Counsel'
      });

      mockPrisma.legalMatter.findUnique.mockResolvedValue(mockMatter);
      mockPrisma.legalMatter.update.mockResolvedValue({
        ...mockMatter,
        assignedTo: 'user-123',
        assignedToName: 'Test Counsel'
      });
      mockPrisma.legalMatterActivity.create.mockResolvedValue({});

      await handleAssignMatter(mockReq, mockRes, 'matter-123');

      expect(mockPrisma.legalMatter.update).toHaveBeenCalled();
      expect(mockSendJson).toHaveBeenCalledWith(mockRes, 200, expect.any(Object));
    });

    it('should reject GP Counsel assigning to others', async () => {
      mockReq.method = 'POST';
      mockReq.body = JSON.stringify({
        assignedTo: 'other-user',
        assignedToName: 'Other Person'
      });

      await handleAssignMatter(mockReq, mockRes, 'matter-123');

      expect(mockSendError).toHaveBeenCalledWith(
        mockRes, 403,
        expect.stringContaining('General Counsel required')
      );
    });

    it('should allow General Counsel to assign to anyone', async () => {
      mockRequireGPCounsel.mockResolvedValue(mockGCUser);

      mockReq.method = 'POST';
      mockReq.body = JSON.stringify({
        assignedTo: 'other-user',
        assignedToName: 'Other Person'
      });

      mockPrisma.legalMatter.findUnique.mockResolvedValue(mockMatter);
      mockPrisma.legalMatter.update.mockResolvedValue({
        ...mockMatter,
        assignedTo: 'other-user'
      });
      mockPrisma.legalMatterActivity.create.mockResolvedValue({});

      await handleAssignMatter(mockReq, mockRes, 'matter-123');

      expect(mockPrisma.legalMatter.update).toHaveBeenCalled();
      expect(mockSendJson).toHaveBeenCalledWith(mockRes, 200, expect.any(Object));
    });
  });

  describe('handleSignOff', () => {
    it('should sign off on matter', async () => {
      mockReq.method = 'POST';
      mockReq.body = JSON.stringify({ signOffType: 'SIMPLE' });

      mockPrisma.legalMatter.findUnique.mockResolvedValue(mockMatter);
      mockPrisma.legalMatter.update.mockResolvedValue({
        ...mockMatter,
        signOffStatus: 'APPROVED',
        signOffBy: 'user-123'
      });
      mockPrisma.legalMatterActivity.create.mockResolvedValue({});

      await handleSignOff(mockReq, mockRes, 'matter-123');

      expect(mockPrisma.legalMatter.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            signOffStatus: 'APPROVED',
            signOffType: 'SIMPLE'
          })
        })
      );
      expect(mockLogPermissionAction).toHaveBeenCalled();
    });

    it('should require GC for gcReviewRequired matters', async () => {
      mockReq.method = 'POST';
      mockReq.body = JSON.stringify({ signOffType: 'SIMPLE' });

      mockPrisma.legalMatter.findUnique.mockResolvedValue({
        ...mockMatter,
        gcReviewRequired: true
      });

      await handleSignOff(mockReq, mockRes, 'matter-123');

      expect(mockSendError).toHaveBeenCalledWith(
        mockRes, 403,
        expect.stringContaining('General Counsel sign-off')
      );
    });
  });

  describe('handleAddActivity', () => {
    it('should add comment to matter', async () => {
      mockReq.method = 'POST';
      mockReq.body = JSON.stringify({
        content: 'This is a comment',
        activityType: 'COMMENT'
      });

      mockPrisma.legalMatter.findUnique.mockResolvedValue({
        organizationId: 'org-123'
      });
      mockPrisma.legalMatterActivity.create.mockResolvedValue({
        id: 'activity-123',
        content: 'This is a comment',
        activityType: 'COMMENT'
      });

      await handleAddActivity(mockReq, mockRes, 'matter-123');

      expect(mockPrisma.legalMatterActivity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            matterId: 'matter-123',
            content: 'This is a comment',
            activityType: 'COMMENT',
            createdBy: 'user-123'
          })
        })
      );
      expect(mockSendJson).toHaveBeenCalledWith(mockRes, 201, expect.any(Object));
    });

    it('should reject empty content', async () => {
      mockReq.method = 'POST';
      mockReq.body = JSON.stringify({
        content: '',
        activityType: 'COMMENT'
      });

      await handleAddActivity(mockReq, mockRes, 'matter-123');

      expect(mockSendError).toHaveBeenCalledWith(mockRes, 400, 'Content is required');
    });
  });

  describe('Aging color calculation', () => {
    it('should return red for overdue matters', async () => {
      const overdueMatter = {
        ...mockMatter,
        dueDate: new Date('2025-01-01') // Past date
      };
      mockPrisma.legalMatter.findUnique.mockResolvedValue({
        ...overdueMatter,
        activities: []
      });

      await handleGetMatter(mockReq, mockRes, 'matter-123');

      expect(mockSendJson).toHaveBeenCalledWith(
        mockRes, 200,
        expect.objectContaining({
          matter: expect.objectContaining({
            agingColor: 'red'
          })
        })
      );
    });

    it('should return green for matters due > 7 days', async () => {
      const futureMatter = {
        ...mockMatter,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      };
      mockPrisma.legalMatter.findUnique.mockResolvedValue({
        ...futureMatter,
        activities: []
      });

      await handleGetMatter(mockReq, mockRes, 'matter-123');

      expect(mockSendJson).toHaveBeenCalledWith(
        mockRes, 200,
        expect.objectContaining({
          matter: expect.objectContaining({
            agingColor: 'green'
          })
        })
      );
    });
  });
});
