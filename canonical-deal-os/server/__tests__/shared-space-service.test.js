import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as sharedSpaceService from '../services/shared-space-service.js';

// Mock prisma
let mockPrisma;
jest.unstable_mockModule('../kernel.js', () => ({
  prisma: mockPrisma
}));

describe('Shared Space Service', () => {
  beforeEach(() => {
    mockPrisma = {
      legalSharedSpace: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      legalSharedSpaceMember: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      legalSharedSpaceDocument: {
        create: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      legalSharedSpaceMessage: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };
  });

  describe('createSharedSpace', () => {
    it('should create a shared space with creator as owner', async () => {
      const mockSpace = {
        id: 'space-123',
        organizationId: 'org-1',
        name: 'Test Space',
        description: 'Test description',
        createdBy: 'user-1',
        members: [{
          userId: 'user-1',
          role: 'OWNER',
        }],
      };

      mockPrisma.legalSharedSpace.create.mockResolvedValue(mockSpace);

      const result = await sharedSpaceService.createSharedSpace(
        'org-1',
        { name: 'Test Space', description: 'Test description' },
        'user-1'
      );

      expect(result).toEqual(mockSpace);
      expect(mockPrisma.legalSharedSpace.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          name: 'Test Space',
          createdBy: 'user-1',
          members: {
            create: {
              userId: 'user-1',
              role: 'OWNER',
              invitedBy: 'user-1',
            },
          },
        }),
        include: expect.any(Object),
      });
    });
  });

  describe('generateExternalAccessToken', () => {
    it('should generate a 64-character hex token', () => {
      const token = sharedSpaceService.generateExternalAccessToken();

      expect(typeof token).toBe('string');
      expect(token.length).toBe(64);
      expect(token).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate unique tokens', () => {
      const token1 = sharedSpaceService.generateExternalAccessToken();
      const token2 = sharedSpaceService.generateExternalAccessToken();

      expect(token1).not.toBe(token2);
    });
  });

  describe('validateExternalToken', () => {
    it('should return null for invalid token', async () => {
      mockPrisma.legalSharedSpaceMember.findFirst.mockResolvedValue(null);

      const result = await sharedSpaceService.validateExternalToken('invalid-token');

      expect(result).toBeNull();
    });

    it('should return null for inactive space', async () => {
      mockPrisma.legalSharedSpaceMember.findFirst.mockResolvedValue({
        id: 'member-1',
        space: { isActive: false },
      });

      const result = await sharedSpaceService.validateExternalToken('valid-token');

      expect(result).toBeNull();
    });

    it('should return null for expired space', async () => {
      const pastDate = new Date('2020-01-01');
      mockPrisma.legalSharedSpaceMember.findFirst.mockResolvedValue({
        id: 'member-1',
        space: { isActive: true, expiresAt: pastDate },
      });

      const result = await sharedSpaceService.validateExternalToken('valid-token');

      expect(result).toBeNull();
    });

    it('should return member for valid token', async () => {
      const mockMember = {
        id: 'member-1',
        space: {
          id: 'space-1',
          isActive: true,
          expiresAt: null,
        },
      };
      mockPrisma.legalSharedSpaceMember.findFirst.mockResolvedValue(mockMember);

      const result = await sharedSpaceService.validateExternalToken('valid-token');

      expect(result).toEqual(mockMember);
    });
  });

  describe('inviteInternalMember', () => {
    it('should throw error if member already exists', async () => {
      mockPrisma.legalSharedSpaceMember.findFirst.mockResolvedValue({
        id: 'existing-member',
      });

      await expect(
        sharedSpaceService.inviteInternalMember('space-1', 'user-2', 'COLLABORATOR', 'user-1')
      ).rejects.toThrow('already a member');
    });

    it('should create internal member', async () => {
      mockPrisma.legalSharedSpaceMember.findFirst.mockResolvedValue(null);
      mockPrisma.legalSharedSpaceMember.create.mockResolvedValue({
        id: 'member-2',
        userId: 'user-2',
        role: 'COLLABORATOR',
      });

      const result = await sharedSpaceService.inviteInternalMember(
        'space-1',
        'user-2',
        'COLLABORATOR',
        'user-1'
      );

      expect(result.userId).toBe('user-2');
      expect(result.role).toBe('COLLABORATOR');
    });
  });

  describe('inviteExternalMember', () => {
    it('should throw error if external email already invited', async () => {
      mockPrisma.legalSharedSpaceMember.findFirst.mockResolvedValue({
        id: 'existing-member',
        externalEmail: 'external@example.com',
      });

      await expect(
        sharedSpaceService.inviteExternalMember(
          'space-1',
          'external@example.com',
          'External User',
          'VIEWER',
          null,
          'user-1'
        )
      ).rejects.toThrow('already invited');
    });

    it('should create external member with access token', async () => {
      mockPrisma.legalSharedSpaceMember.findFirst.mockResolvedValue(null);
      mockPrisma.legalSharedSpaceMember.create.mockResolvedValue({
        id: 'member-3',
        externalEmail: 'external@example.com',
        externalName: 'External User',
        role: 'VIEWER',
        accessToken: expect.any(String),
      });

      const result = await sharedSpaceService.inviteExternalMember(
        'space-1',
        'external@example.com',
        'External User',
        'VIEWER',
        null,
        'user-1'
      );

      expect(result.externalEmail).toBe('external@example.com');
      expect(result.role).toBe('VIEWER');
    });
  });

  describe('addDocumentToSpace', () => {
    it('should add document to space', async () => {
      const mockDoc = {
        id: 'doc-1',
        spaceId: 'space-1',
        title: 'Test Document',
      };
      mockPrisma.legalSharedSpaceDocument.create.mockResolvedValue(mockDoc);

      const result = await sharedSpaceService.addDocumentToSpace(
        'space-1',
        { title: 'Test Document', documentUrl: 'https://example.com/doc.pdf' },
        'user-1'
      );

      expect(result).toEqual(mockDoc);
      expect(mockPrisma.legalSharedSpaceDocument.create).toHaveBeenCalled();
    });
  });

  describe('sendSpaceMessage', () => {
    it('should create message as internal user', async () => {
      const mockMessage = {
        id: 'msg-1',
        spaceId: 'space-1',
        content: 'Hello',
        authorId: 'user-1',
        authorName: 'User One',
        isExternal: false,
      };
      mockPrisma.legalSharedSpaceMessage.create.mockResolvedValue(mockMessage);

      const result = await sharedSpaceService.sendSpaceMessage(
        'space-1',
        'Hello',
        { id: 'user-1', name: 'User One', email: 'user@example.com' },
        false,
        null
      );

      expect(result.isExternal).toBe(false);
      expect(result.authorId).toBe('user-1');
    });

    it('should create message as external user', async () => {
      const mockMessage = {
        id: 'msg-2',
        spaceId: 'space-1',
        content: 'Hello from external',
        authorId: null,
        authorName: 'External User',
        isExternal: true,
      };
      mockPrisma.legalSharedSpaceMessage.create.mockResolvedValue(mockMessage);

      const result = await sharedSpaceService.sendSpaceMessage(
        'space-1',
        'Hello from external',
        { id: 'member-1', name: 'External User', email: 'external@example.com' },
        true,
        null
      );

      expect(result.isExternal).toBe(true);
      expect(result.authorId).toBeNull();
    });
  });

  describe('getSpaceMessages', () => {
    it('should get messages without cursor', async () => {
      const mockMessages = [
        { id: 'msg-1', content: 'Message 1' },
        { id: 'msg-2', content: 'Message 2' },
      ];
      mockPrisma.legalSharedSpaceMessage.findMany.mockResolvedValue(mockMessages);

      const result = await sharedSpaceService.getSpaceMessages('space-1');

      expect(result).toEqual(mockMessages);
      expect(mockPrisma.legalSharedSpaceMessage.findMany).toHaveBeenCalledWith({
        where: { spaceId: 'space-1' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    });

    it('should get messages with cursor for pagination', async () => {
      const cursor = new Date('2024-01-15').toISOString();
      mockPrisma.legalSharedSpaceMessage.findMany.mockResolvedValue([]);

      await sharedSpaceService.getSpaceMessages('space-1', cursor, 20);

      expect(mockPrisma.legalSharedSpaceMessage.findMany).toHaveBeenCalledWith({
        where: {
          spaceId: 'space-1',
          createdAt: { lt: new Date(cursor) },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
    });
  });
});
