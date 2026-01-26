/**
 * Tests for OnboardingEmailForwarderService
 *
 * Covers:
 * - Forwarder creation
 * - Sender validation (allowlist/blocklist)
 * - Inbound email processing
 * - Attachment handling
 * - Email log management
 * - Stats and queries
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  OnboardingEmailForwarderService,
  createOnboardingEmailForwarderService,
  REJECTION_REASONS,
  EMAIL_INTAKE_DOMAIN
} from '../services/onboarding-email-forwarder.js';

// =============================================================================
// MOCK SETUP
// =============================================================================

const mockPrisma = {
  onboardingEmailForwarder: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  },
  onboardingEmailLog: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    groupBy: jest.fn(),
    count: jest.fn()
  },
  onboardingIntakeSource: {
    create: jest.fn()
  },
  onboardingSession: {
    findFirst: jest.fn()
  },
  onboardingProcessingLog: {
    create: jest.fn()
  }
};

// =============================================================================
// TEST FIXTURES
// =============================================================================

const TEST_SESSION_ID = 'session-123';
const TEST_ORG_ID = 'org-456';
const TEST_FORWARDER_ID = 'forwarder-789';

const mockForwarder = {
  id: TEST_FORWARDER_ID,
  sessionId: TEST_SESSION_ID,
  organizationId: TEST_ORG_ID,
  inboundEmail: `import-abc123@${EMAIL_INTAKE_DOMAIN}`,
  forwardingEnabled: true,
  allowedSenders: null,
  blockedSenders: null,
  autoClassify: true,
  extractAttachments: true,
  extractBodyContent: false,
  emailsReceived: 10,
  emailsProcessed: 8,
  emailsRejected: 2,
  attachmentsProcessed: 15,
  status: 'ACTIVE'
};

const mockEmailPayload = {
  to: `import-abc123@${EMAIL_INTAKE_DOMAIN}`,
  from: 'John Doe <john@acme.com>',
  subject: 'Rent roll for 123 Main St',
  text: 'Please find the rent roll attached.',
  attachments: '2',
  attachment1: {
    filename: 'rentroll.xlsx',
    'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    content: 'base64encodedcontent'
  },
  attachment2: {
    filename: 'photos.zip',
    'content-type': 'application/zip',
    content: 'base64encodedcontent'
  },
  'message-id': '<msg-12345@acme.com>'
};

// =============================================================================
// FORWARDER CREATION TESTS
// =============================================================================

describe('OnboardingEmailForwarderService', () => {
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    service = createOnboardingEmailForwarderService(mockPrisma);
  });

  describe('createForwarder', () => {
    it('should create a new forwarder with unique email address', async () => {
      mockPrisma.onboardingEmailForwarder.findUnique.mockResolvedValue(null);
      mockPrisma.onboardingEmailForwarder.create.mockResolvedValue({
        ...mockForwarder,
        id: 'new-forwarder-id'
      });

      const result = await service.createForwarder(TEST_SESSION_ID, TEST_ORG_ID);

      expect(result.error).toBeUndefined();
      expect(result.forwarder).toBeDefined();

      expect(mockPrisma.onboardingEmailForwarder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sessionId: TEST_SESSION_ID,
          organizationId: TEST_ORG_ID,
          inboundEmail: expect.stringMatching(new RegExp(`^import-[a-f0-9]+@${EMAIL_INTAKE_DOMAIN}$`)),
          forwardingEnabled: true,
          status: 'ACTIVE'
        })
      });
    });

    it('should return existing forwarder if already exists', async () => {
      mockPrisma.onboardingEmailForwarder.findUnique.mockResolvedValue(mockForwarder);

      const result = await service.createForwarder(TEST_SESSION_ID, TEST_ORG_ID);

      expect(result.forwarder).toEqual(mockForwarder);
      expect(mockPrisma.onboardingEmailForwarder.create).not.toHaveBeenCalled();
    });

    it('should create forwarder with custom options', async () => {
      mockPrisma.onboardingEmailForwarder.findUnique.mockResolvedValue(null);
      mockPrisma.onboardingEmailForwarder.create.mockResolvedValue(mockForwarder);

      const options = {
        allowedSenders: ['@acme.com', 'partner@external.com'],
        blockedSenders: ['spam@bad.com'],
        autoClassify: false,
        extractBodyContent: true
      };

      await service.createForwarder(TEST_SESSION_ID, TEST_ORG_ID, options);

      expect(mockPrisma.onboardingEmailForwarder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          allowedSenders: JSON.stringify(options.allowedSenders),
          blockedSenders: JSON.stringify(options.blockedSenders),
          autoClassify: false,
          extractBodyContent: true
        })
      });
    });
  });

  // ===========================================================================
  // SENDER VALIDATION TESTS
  // ===========================================================================

  describe('validateSender', () => {
    it('should allow any sender when no restrictions set', () => {
      const forwarder = { ...mockForwarder };

      const result = service.validateSender(forwarder, 'anyone@anywhere.com');

      expect(result.allowed).toBe(true);
    });

    it('should block sender on blocklist (exact match)', () => {
      const forwarder = {
        ...mockForwarder,
        blockedSenders: JSON.stringify(['spam@bad.com', 'blocked@evil.com'])
      };

      const result = service.validateSender(forwarder, 'spam@bad.com');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe(REJECTION_REASONS.SENDER_BLOCKED);
    });

    it('should block sender on blocklist (domain match)', () => {
      const forwarder = {
        ...mockForwarder,
        blockedSenders: JSON.stringify(['@evil.com'])
      };

      const result = service.validateSender(forwarder, 'anyone@evil.com');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe(REJECTION_REASONS.SENDER_BLOCKED);
    });

    it('should allow sender on allowlist (exact match)', () => {
      const forwarder = {
        ...mockForwarder,
        allowedSenders: JSON.stringify(['trusted@partner.com'])
      };

      const result = service.validateSender(forwarder, 'trusted@partner.com');

      expect(result.allowed).toBe(true);
    });

    it('should allow sender on allowlist (domain match)', () => {
      const forwarder = {
        ...mockForwarder,
        allowedSenders: JSON.stringify(['@acme.com'])
      };

      const result = service.validateSender(forwarder, 'anyone@acme.com');

      expect(result.allowed).toBe(true);
    });

    it('should allow sender on allowlist (wildcard match)', () => {
      const forwarder = {
        ...mockForwarder,
        allowedSenders: JSON.stringify(['*@partner.com'])
      };

      const result = service.validateSender(forwarder, 'john.doe@partner.com');

      expect(result.allowed).toBe(true);
    });

    it('should reject sender not on allowlist', () => {
      const forwarder = {
        ...mockForwarder,
        allowedSenders: JSON.stringify(['@acme.com', 'trusted@partner.com'])
      };

      const result = service.validateSender(forwarder, 'random@external.com');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe(REJECTION_REASONS.SENDER_NOT_ALLOWED);
    });

    it('should prioritize blocklist over allowlist', () => {
      const forwarder = {
        ...mockForwarder,
        allowedSenders: JSON.stringify(['@acme.com']),
        blockedSenders: JSON.stringify(['blocked@acme.com'])
      };

      const result = service.validateSender(forwarder, 'blocked@acme.com');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe(REJECTION_REASONS.SENDER_BLOCKED);
    });

    it('should handle case-insensitive matching', () => {
      const forwarder = {
        ...mockForwarder,
        allowedSenders: JSON.stringify(['@ACME.COM'])
      };

      const result = service.validateSender(forwarder, 'John@acme.com');

      expect(result.allowed).toBe(true);
    });

    it('should reject null/empty email', () => {
      const result = service.validateSender(mockForwarder, null);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe(REJECTION_REASONS.INVALID_PAYLOAD);
    });
  });

  // ===========================================================================
  // INBOUND EMAIL PROCESSING TESTS
  // ===========================================================================

  describe('processInboundEmail', () => {
    beforeEach(() => {
      mockPrisma.onboardingEmailForwarder.findUnique.mockResolvedValue(mockForwarder);
      mockPrisma.onboardingEmailLog.findUnique.mockResolvedValue(null); // No duplicate
      mockPrisma.onboardingEmailLog.create.mockResolvedValue({
        id: 'email-log-1',
        messageId: mockEmailPayload['message-id'],
        status: 'PROCESSING'
      });
      mockPrisma.onboardingEmailLog.update.mockResolvedValue({});
      mockPrisma.onboardingEmailForwarder.update.mockResolvedValue({});
      mockPrisma.onboardingIntakeSource.create.mockResolvedValue({ id: 'intake-1' });
    });

    it('should process email with attachments successfully', async () => {
      const result = await service.processInboundEmail(mockEmailPayload);

      expect(result.success).toBe(true);
      expect(result.emailLogId).toBeDefined();
      expect(result.attachmentsProcessed).toBe(2);
      expect(result.intakeSourceIds).toHaveLength(2);

      // Verify email log was created
      expect(mockPrisma.onboardingEmailLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          forwarderId: TEST_FORWARDER_ID,
          sessionId: TEST_SESSION_ID,
          fromEmail: 'john@acme.com',
          subject: 'Rent roll for 123 Main St',
          attachmentCount: 2
        })
      });

      // Verify intake sources were created for attachments
      expect(mockPrisma.onboardingIntakeSource.create).toHaveBeenCalledTimes(2);
    });

    it('should reject email when forwarder not found', async () => {
      mockPrisma.onboardingEmailForwarder.findUnique.mockResolvedValue(null);

      const result = await service.processInboundEmail(mockEmailPayload);

      expect(result.success).toBe(false);
      expect(result.error).toBe(REJECTION_REASONS.FORWARDER_NOT_FOUND);
    });

    it('should reject email when forwarding is disabled', async () => {
      const disabledForwarder = { ...mockForwarder, forwardingEnabled: false };
      mockPrisma.onboardingEmailForwarder.findUnique.mockResolvedValue(disabledForwarder);

      const result = await service.processInboundEmail(mockEmailPayload);

      expect(result.success).toBe(false);
      expect(result.error).toBe(REJECTION_REASONS.FORWARDER_DISABLED);
    });

    it('should reject email from unauthorized sender', async () => {
      const restrictedForwarder = {
        ...mockForwarder,
        allowedSenders: JSON.stringify(['@trusted.com'])
      };
      mockPrisma.onboardingEmailForwarder.findUnique.mockResolvedValue(restrictedForwarder);

      const result = await service.processInboundEmail(mockEmailPayload);

      expect(result.success).toBe(false);
      expect(result.error).toBe(REJECTION_REASONS.SENDER_NOT_ALLOWED);

      // Verify rejection was logged
      expect(mockPrisma.onboardingEmailLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'REJECTED',
          rejectionReason: REJECTION_REASONS.SENDER_NOT_ALLOWED
        })
      });
    });

    it('should reject email without attachments when extraction required', async () => {
      const noAttachmentPayload = { ...mockEmailPayload, attachments: '0' };

      const result = await service.processInboundEmail(noAttachmentPayload);

      expect(result.success).toBe(false);
      expect(result.error).toBe(REJECTION_REASONS.NO_ATTACHMENTS);
    });

    it('should process email body when extractBodyContent is enabled', async () => {
      const bodyEnabledForwarder = { ...mockForwarder, extractBodyContent: true };
      mockPrisma.onboardingEmailForwarder.findUnique.mockResolvedValue(bodyEnabledForwarder);

      const noAttachmentPayload = {
        ...mockEmailPayload,
        attachments: '0',
        text: 'This is the email body content with some details...'
      };

      const result = await service.processInboundEmail(noAttachmentPayload);

      expect(result.success).toBe(true);
      expect(result.intakeSourceIds.length).toBeGreaterThan(0);

      // Should create intake source for body
      expect(mockPrisma.onboardingIntakeSource.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sourceType: 'EMAIL',
          fileName: expect.stringContaining('Email Body')
        })
      });
    });

    it('should handle duplicate emails gracefully', async () => {
      mockPrisma.onboardingEmailLog.findUnique.mockResolvedValue({
        id: 'existing-log',
        messageId: mockEmailPayload['message-id']
      });

      const result = await service.processInboundEmail(mockEmailPayload);

      expect(result.success).toBe(true);
      expect(result.duplicate).toBe(true);
      expect(result.emailLogId).toBe('existing-log');

      // Should not create new records
      expect(mockPrisma.onboardingEmailLog.create).not.toHaveBeenCalled();
    });

    it('should extract sender name from email format', async () => {
      await service.processInboundEmail(mockEmailPayload);

      expect(mockPrisma.onboardingEmailLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          fromEmail: 'john@acme.com',
          fromName: 'John Doe'
        })
      });
    });

    it('should handle email without name portion', async () => {
      const simplePayload = {
        ...mockEmailPayload,
        from: 'simple@example.com'
      };

      await service.processInboundEmail(simplePayload);

      expect(mockPrisma.onboardingEmailLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          fromEmail: 'simple@example.com',
          fromName: null
        })
      });
    });

    it('should update forwarder stats on successful processing', async () => {
      await service.processInboundEmail(mockEmailPayload);

      expect(mockPrisma.onboardingEmailForwarder.update).toHaveBeenCalledWith({
        where: { id: TEST_FORWARDER_ID },
        data: {
          emailsReceived: { increment: 1 }
        }
      });

      expect(mockPrisma.onboardingEmailForwarder.update).toHaveBeenCalledWith({
        where: { id: TEST_FORWARDER_ID },
        data: {
          emailsProcessed: { increment: 1 },
          attachmentsProcessed: { increment: 2 }
        }
      });
    });

    it('should return error for invalid payload', async () => {
      const result = await service.processInboundEmail(null);

      expect(result.success).toBe(false);
      expect(result.error).toBe(REJECTION_REASONS.INVALID_PAYLOAD);
    });

    it('should return error for payload without to field', async () => {
      const result = await service.processInboundEmail({ from: 'test@test.com' });

      expect(result.success).toBe(false);
      expect(result.error).toBe(REJECTION_REASONS.INVALID_PAYLOAD);
    });
  });

  // ===========================================================================
  // FORWARDER MANAGEMENT TESTS
  // ===========================================================================

  describe('updateForwarder', () => {
    it('should update forwarder settings', async () => {
      mockPrisma.onboardingEmailForwarder.findUnique.mockResolvedValue(mockForwarder);
      mockPrisma.onboardingEmailForwarder.update.mockResolvedValue({
        ...mockForwarder,
        forwardingEnabled: false
      });

      const result = await service.updateForwarder(TEST_FORWARDER_ID, {
        forwardingEnabled: false,
        allowedSenders: ['@newdomain.com']
      });

      expect(result.forwarder).toBeDefined();
      expect(mockPrisma.onboardingEmailForwarder.update).toHaveBeenCalledWith({
        where: { id: TEST_FORWARDER_ID },
        data: expect.objectContaining({
          forwardingEnabled: false,
          allowedSenders: JSON.stringify(['@newdomain.com'])
        })
      });
    });

    it('should return error for non-existent forwarder', async () => {
      mockPrisma.onboardingEmailForwarder.findUnique.mockResolvedValue(null);

      const result = await service.updateForwarder('nonexistent', { forwardingEnabled: false });

      expect(result.error).toBe('Forwarder not found');
    });
  });

  describe('getForwarderStats', () => {
    it('should return forwarder statistics', async () => {
      mockPrisma.onboardingEmailForwarder.findUnique.mockResolvedValue(mockForwarder);
      mockPrisma.onboardingEmailLog.groupBy.mockResolvedValue([
        { status: 'COMPLETED', _count: 8 },
        { status: 'REJECTED', _count: 2 }
      ]);

      const stats = await service.getForwarderStats(TEST_FORWARDER_ID);

      expect(stats).toEqual({
        emailsReceived: 10,
        emailsProcessed: 8,
        emailsRejected: 2,
        attachmentsProcessed: 15,
        byStatus: {
          COMPLETED: 8,
          REJECTED: 2
        }
      });
    });

    it('should return null for non-existent forwarder', async () => {
      mockPrisma.onboardingEmailForwarder.findUnique.mockResolvedValue(null);

      const stats = await service.getForwarderStats('nonexistent');

      expect(stats).toBeNull();
    });
  });

  describe('getEmailLogs', () => {
    it('should return paginated email logs', async () => {
      const mockLogs = [
        { id: 'log-1', subject: 'Test 1', status: 'COMPLETED' },
        { id: 'log-2', subject: 'Test 2', status: 'COMPLETED' }
      ];
      mockPrisma.onboardingEmailLog.findMany.mockResolvedValue(mockLogs);
      mockPrisma.onboardingEmailLog.count.mockResolvedValue(50);

      const result = await service.getEmailLogs(TEST_FORWARDER_ID, {
        status: 'COMPLETED',
        limit: 20,
        offset: 0
      });

      expect(result.emails).toEqual(mockLogs);
      expect(result.total).toBe(50);

      expect(mockPrisma.onboardingEmailLog.findMany).toHaveBeenCalledWith({
        where: { forwarderId: TEST_FORWARDER_ID, status: 'COMPLETED' },
        orderBy: { receivedAt: 'desc' },
        take: 20,
        skip: 0
      });
    });
  });
});

// =============================================================================
// EMAIL ADDRESS EXTRACTION TESTS
// =============================================================================

describe('Email Address Extraction', () => {
  let service;

  beforeEach(() => {
    service = createOnboardingEmailForwarderService(mockPrisma);
  });

  it('should extract email from "Name <email>" format', () => {
    const result = service._extractEmailAddress('John Doe <john@example.com>');
    expect(result).toBe('john@example.com');
  });

  it('should extract name from "Name <email>" format', () => {
    const result = service._extractEmailName('John Doe <john@example.com>');
    expect(result).toBe('John Doe');
  });

  it('should handle quoted names', () => {
    const result = service._extractEmailName('"John Doe" <john@example.com>');
    expect(result).toBe('John Doe');
  });

  it('should handle plain email address', () => {
    const email = service._extractEmailAddress('plain@example.com');
    const name = service._extractEmailName('plain@example.com');

    expect(email).toBe('plain@example.com');
    expect(name).toBeNull();
  });

  it('should handle null input', () => {
    expect(service._extractEmailAddress(null)).toBeNull();
    expect(service._extractEmailName(null)).toBeNull();
  });

  it('should normalize email to lowercase', () => {
    const result = service._extractEmailAddress('John@EXAMPLE.COM');
    expect(result).toBe('john@example.com');
  });
});

// =============================================================================
// REJECTION REASONS TESTS
// =============================================================================

describe('REJECTION_REASONS', () => {
  it('should have all required rejection reasons', () => {
    expect(REJECTION_REASONS.SENDER_NOT_ALLOWED).toBeDefined();
    expect(REJECTION_REASONS.SENDER_BLOCKED).toBeDefined();
    expect(REJECTION_REASONS.NO_ATTACHMENTS).toBeDefined();
    expect(REJECTION_REASONS.FORWARDER_DISABLED).toBeDefined();
    expect(REJECTION_REASONS.FORWARDER_NOT_FOUND).toBeDefined();
    expect(REJECTION_REASONS.INVALID_PAYLOAD).toBeDefined();
  });
});

// =============================================================================
// EMAIL INTAKE DOMAIN TESTS
// =============================================================================

describe('EMAIL_INTAKE_DOMAIN', () => {
  it('should have a valid domain configured', () => {
    expect(EMAIL_INTAKE_DOMAIN).toBeDefined();
    expect(typeof EMAIL_INTAKE_DOMAIN).toBe('string');
    expect(EMAIL_INTAKE_DOMAIN.length).toBeGreaterThan(0);
  });
});
