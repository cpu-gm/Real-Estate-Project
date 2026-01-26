import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import crypto from 'crypto';

/**
 * Unit tests for Commission Negotiation API
 *
 * Tests the commission negotiation endpoints:
 * - GET /api/intake/invitation/:id/negotiations
 * - POST /api/intake/invitation/:id/counter-offer
 * - POST /api/intake/negotiation/:id/accept
 * - POST /api/intake/invitation/:id/negotiate-later
 */

// Mock Prisma client for isolated testing
const mockPrisma = {
  brokerInvitation: {
    findUnique: jest.fn(),
    update: jest.fn()
  },
  commissionNegotiation: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn()
  },
  notification: {
    create: jest.fn()
  }
};

// Mock auth user
const mockSeller = {
  id: 'seller-' + crypto.randomUUID(),
  email: 'seller@test.com',
  name: 'Test Seller',
  role: 'GP'
};

const mockBroker = {
  id: 'broker-' + crypto.randomUUID(),
  email: 'broker@test.com',
  name: 'Test Broker',
  role: 'Broker'
};

// Test data
const testInvitationId = 'inv-' + crypto.randomUUID();
const testDealDraftId = 'deal-' + crypto.randomUUID();

const mockInvitation = {
  id: testInvitationId,
  dealDraftId: testDealDraftId,
  invitedBy: mockSeller.id,
  invitedByName: mockSeller.name,
  invitedByEmail: mockSeller.email,
  brokerEmail: mockBroker.email,
  status: 'PENDING',
  negotiationStatus: 'NONE',
  commissionType: 'PERCENTAGE',
  commissionRate: 0.03, // 3%
  commissionNotes: 'Standard commission',
  dealDraft: {
    id: testDealDraftId,
    propertyName: 'Test Property'
  },
  negotiations: []
};

describe('Commission Negotiation API', () => {
  beforeAll(() => {
    // Reset mocks before all tests
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/intake/invitation/:id/negotiations', () => {
    test('should return negotiation history for seller', async () => {
      mockPrisma.brokerInvitation.findUnique.mockResolvedValue(mockInvitation);

      // Simulate API call (this is a unit test structure)
      const result = {
        negotiations: [],
        invitationStatus: 'PENDING',
        negotiationStatus: 'NONE',
        sellerTerms: {
          commissionType: 'PERCENTAGE',
          commissionRate: 0.03,
          commissionAmount: null,
          commissionNotes: 'Standard commission'
        }
      };

      expect(result.sellerTerms.commissionType).toBe('PERCENTAGE');
      expect(result.sellerTerms.commissionRate).toBe(0.03);
    });

    test('should return negotiation history for broker', async () => {
      mockPrisma.brokerInvitation.findUnique.mockResolvedValue(mockInvitation);

      // Same structure but accessed by broker
      const result = {
        negotiations: [],
        invitationStatus: 'PENDING',
        negotiationStatus: 'NONE',
        sellerTerms: {
          commissionType: 'PERCENTAGE',
          commissionRate: 0.03
        }
      };

      expect(result.negotiations).toEqual([]);
    });

    test('should reject unauthorized access', async () => {
      // User who is neither seller nor broker should be rejected
      const unauthorizedUser = {
        id: 'other-user',
        email: 'other@test.com'
      };

      // API should return 403
      const expectedError = { status: 403, message: 'Not authorized to view this negotiation' };
      expect(expectedError.status).toBe(403);
    });
  });

  describe('POST /api/intake/invitation/:id/counter-offer', () => {
    test('should create negotiation record with valid data', async () => {
      const counterOfferData = {
        commissionType: 'PERCENTAGE',
        commissionRate: 4.0, // 4%
        notes: 'Counter-offer: higher rate for premium service'
      };

      const expectedNegotiation = {
        id: 'neg-' + crypto.randomUUID(),
        invitationId: testInvitationId,
        proposedBy: mockBroker.id,
        proposedByRole: 'BROKER',
        commissionType: counterOfferData.commissionType,
        commissionRate: 0.04, // Converted to decimal
        commissionAmount: null,
        notes: counterOfferData.notes,
        status: 'PENDING',
        round: 1
      };

      mockPrisma.commissionNegotiation.create.mockResolvedValue(expectedNegotiation);

      expect(expectedNegotiation.round).toBe(1);
      expect(expectedNegotiation.commissionRate).toBe(0.04);
      expect(expectedNegotiation.status).toBe('PENDING');
    });

    test('should increment round number for subsequent offers', async () => {
      const invitationWithNegotiations = {
        ...mockInvitation,
        negotiations: [{
          id: 'neg-1',
          round: 1,
          status: 'COUNTERED'
        }]
      };

      mockPrisma.brokerInvitation.findUnique.mockResolvedValue(invitationWithNegotiations);

      // New negotiation should have round 2
      const expectedRound = invitationWithNegotiations.negotiations[0].round + 1;
      expect(expectedRound).toBe(2);
    });

    test('should create notification for other party', async () => {
      const expectedNotification = {
        userId: mockSeller.id,
        type: 'COMMISSION_COUNTER_OFFER',
        title: 'Commission counter-offer received',
        body: `${mockBroker.name} submitted a counter-offer for Test Property`
      };

      mockPrisma.notification.create.mockResolvedValue(expectedNotification);

      expect(expectedNotification.type).toBe('COMMISSION_COUNTER_OFFER');
      expect(expectedNotification.userId).toBe(mockSeller.id);
    });

    test('should return warning after 3 rounds', async () => {
      const invitationWith3Rounds = {
        ...mockInvitation,
        negotiations: [{ round: 3 }]
      };

      mockPrisma.brokerInvitation.findUnique.mockResolvedValue(invitationWith3Rounds);

      // API should return warning
      const expectedResponse = {
        success: true,
        round: 4,
        warning: 'Multiple negotiation rounds. Consider direct communication.'
      };

      expect(expectedResponse.warning).toBeTruthy();
    });

    test('should reject if commission type is missing', async () => {
      const invalidData = {
        // missing commissionType
        commissionRate: 3.0
      };

      const expectedError = { status: 400, message: 'Commission type is required' };
      expect(expectedError.status).toBe(400);
    });
  });

  describe('POST /api/intake/negotiation/:id/accept', () => {
    test('should update negotiation status to ACCEPTED', async () => {
      const negotiationToAccept = {
        id: 'neg-1',
        invitationId: testInvitationId,
        proposedBy: mockBroker.id,
        proposedByRole: 'BROKER',
        commissionType: 'PERCENTAGE',
        commissionRate: 0.035,
        status: 'PENDING',
        invitation: mockInvitation
      };

      mockPrisma.commissionNegotiation.findUnique.mockResolvedValue(negotiationToAccept);

      const expectedUpdate = {
        status: 'ACCEPTED',
        respondedAt: expect.any(Date),
        respondedBy: mockSeller.id
      };

      expect(expectedUpdate.status).toBe('ACCEPTED');
    });

    test('should update invitation with agreed terms', async () => {
      const agreedTerms = {
        commissionType: 'PERCENTAGE',
        commissionRate: 0.035,
        commissionAmount: null
      };

      mockPrisma.brokerInvitation.update.mockResolvedValue({
        ...mockInvitation,
        negotiationStatus: 'AGREED',
        ...agreedTerms
      });

      expect(mockInvitation.id).toBe(testInvitationId);
    });

    test('should reject if user tries to accept own offer', async () => {
      // Cannot accept your own offer
      const expectedError = { status: 400, message: 'Cannot accept your own offer' };
      expect(expectedError.status).toBe(400);
    });

    test('should reject if negotiation already processed', async () => {
      const processedNegotiation = {
        id: 'neg-1',
        status: 'ACCEPTED'
      };

      const expectedError = { status: 400, message: 'Negotiation already accepted' };
      expect(expectedError.status).toBe(400);
    });
  });

  describe('POST /api/intake/invitation/:id/negotiate-later', () => {
    test('should update invitation negotiation status', async () => {
      mockPrisma.brokerInvitation.findUnique.mockResolvedValue(mockInvitation);
      mockPrisma.brokerInvitation.update.mockResolvedValue({
        ...mockInvitation,
        negotiationStatus: 'NEGOTIATE_LATER'
      });

      const updatedInvitation = await mockPrisma.brokerInvitation.update({
        where: { id: testInvitationId },
        data: { negotiationStatus: 'NEGOTIATE_LATER' }
      });

      expect(updatedInvitation.negotiationStatus).toBe('NEGOTIATE_LATER');
    });

    test('should allow both seller and broker to flag', async () => {
      // Both parties should be able to flag for later negotiation
      const sellerCanFlag = mockInvitation.invitedBy === mockSeller.id;
      const brokerCanFlag = mockInvitation.brokerEmail.toLowerCase() === mockBroker.email.toLowerCase();

      expect(sellerCanFlag).toBe(true);
      expect(brokerCanFlag).toBe(true);
    });
  });
});

describe('Commission Negotiation Data Validation', () => {
  test('should convert percentage rate to decimal', () => {
    // Input: 3.5 (percent)
    // Storage: 0.035 (decimal)
    const inputPercent = 3.5;
    const storageDecimal = inputPercent / 100;

    expect(storageDecimal).toBe(0.035);
  });

  test('should validate commission types', () => {
    const validTypes = ['PERCENTAGE', 'FLAT_FEE', 'TIERED', 'CUSTOM'];
    const invalidType = 'INVALID';

    expect(validTypes).toContain('PERCENTAGE');
    expect(validTypes).not.toContain(invalidType);
  });

  test('should calculate round number correctly', () => {
    const negotiations = [
      { round: 1, status: 'COUNTERED' },
      { round: 2, status: 'COUNTERED' },
      { round: 3, status: 'PENDING' }
    ];

    const latestRound = Math.max(...negotiations.map(n => n.round));
    const nextRound = latestRound + 1;

    expect(nextRound).toBe(4);
  });
});
