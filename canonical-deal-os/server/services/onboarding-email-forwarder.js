/**
 * OnboardingEmailForwarderService - Email intake for onboarding
 *
 * Supports:
 * - Unique inbound email addresses per organization
 * - Sender validation (allowlist/blocklist)
 * - Attachment extraction and processing
 * - Integration with SendGrid Inbound Parse
 *
 * Flow:
 * 1. Create forwarder with unique email address
 * 2. User forwards emails to the address
 * 3. SendGrid webhook delivers to /api/onboarding/email/webhook
 * 4. Service validates sender, extracts attachments, creates intake sources
 */

import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { createOnboardingLogger } from './onboarding-logger.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

const EMAIL_INTAKE_DOMAIN = process.env.BFF_EMAIL_INTAKE_DOMAIN || 'import.canonical.com';

// Rejection reasons
const REJECTION_REASONS = {
  SENDER_NOT_ALLOWED: 'Sender not in allowed list',
  SENDER_BLOCKED: 'Sender is blocked',
  NO_ATTACHMENTS: 'Email has no attachments to process',
  FORWARDER_DISABLED: 'Email forwarding is disabled',
  FORWARDER_NOT_FOUND: 'No forwarder found for this address',
  INVALID_PAYLOAD: 'Invalid webhook payload'
};

// =============================================================================
// LOGGING COMPONENTS (Phase 4)
// =============================================================================

const PHASE4_EMAIL_COMPONENTS = {
  EMAIL_FORWARDER: 'EMAIL_FORWARDER',
  EMAIL_INTAKE: 'EMAIL_INTAKE',
  EMAIL_CLASSIFY: 'EMAIL_CLASSIFY'
};

// =============================================================================
// MAIN SERVICE CLASS
// =============================================================================

class OnboardingEmailForwarderService {
  constructor(prisma, options = {}) {
    this.prisma = prisma;
    this.logger = options.logger || null;
  }

  /**
   * Create a logger instance for a session
   */
  _getLogger(sessionId) {
    if (this.logger) return this.logger;
    return createOnboardingLogger(this.prisma, sessionId);
  }

  // ===========================================================================
  // FORWARDER MANAGEMENT
  // ===========================================================================

  /**
   * Create a new email forwarder for an organization
   *
   * @param {string} sessionId - Onboarding session ID
   * @param {string} organizationId - Organization ID
   * @param {object} options - Configuration options
   * @returns {{ forwarder: object } | { error: string }}
   */
  async createForwarder(sessionId, organizationId, options = {}) {
    const timer = { start: Date.now() };
    const logger = this._getLogger(sessionId);

    try {
      // Check if forwarder already exists
      const existing = await this.prisma.onboardingEmailForwarder.findUnique({
        where: { organizationId }
      });

      if (existing) {
        return { forwarder: existing };
      }

      // Generate unique email address
      const uniqueId = crypto.randomBytes(6).toString('hex');
      const inboundEmail = `import-${uniqueId}@${EMAIL_INTAKE_DOMAIN}`;

      // Create forwarder
      const forwarder = await this.prisma.onboardingEmailForwarder.create({
        data: {
          sessionId,
          organizationId,
          inboundEmail,
          forwardingEnabled: true,
          allowedSenders: options.allowedSenders
            ? JSON.stringify(options.allowedSenders)
            : null,
          blockedSenders: options.blockedSenders
            ? JSON.stringify(options.blockedSenders)
            : null,
          autoClassify: options.autoClassify !== false,
          extractAttachments: options.extractAttachments !== false,
          extractBodyContent: options.extractBodyContent || false,
          status: 'ACTIVE'
        }
      });

      await logger.info(PHASE4_EMAIL_COMPONENTS.EMAIL_FORWARDER, `Email forwarder created`, {
        forwarderId: forwarder.id,
        inboundEmail: forwarder.inboundEmail,
        organizationId,
        duration: Date.now() - timer.start
      });

      return { forwarder };

    } catch (err) {
      await logger.error(PHASE4_EMAIL_COMPONENTS.EMAIL_FORWARDER, `Failed to create forwarder`, {
        organizationId,
        error: err.message,
        stack: err.stack
      });
      return { error: err.message };
    }
  }

  /**
   * Get forwarder for an organization
   */
  async getForwarder(organizationId) {
    return await this.prisma.onboardingEmailForwarder.findUnique({
      where: { organizationId }
    });
  }

  /**
   * Get forwarder by email address
   */
  async getForwarderByEmail(inboundEmail) {
    return await this.prisma.onboardingEmailForwarder.findUnique({
      where: { inboundEmail }
    });
  }

  /**
   * Update forwarder settings
   */
  async updateForwarder(forwarderId, updates) {
    const forwarder = await this.prisma.onboardingEmailForwarder.findUnique({
      where: { id: forwarderId }
    });

    if (!forwarder) {
      return { error: 'Forwarder not found' };
    }

    const logger = this._getLogger(forwarder.sessionId);

    const updateData = {};

    if (updates.forwardingEnabled !== undefined) {
      updateData.forwardingEnabled = updates.forwardingEnabled;
    }
    if (updates.allowedSenders !== undefined) {
      updateData.allowedSenders = updates.allowedSenders
        ? JSON.stringify(updates.allowedSenders)
        : null;
    }
    if (updates.blockedSenders !== undefined) {
      updateData.blockedSenders = updates.blockedSenders
        ? JSON.stringify(updates.blockedSenders)
        : null;
    }
    if (updates.autoClassify !== undefined) {
      updateData.autoClassify = updates.autoClassify;
    }
    if (updates.extractAttachments !== undefined) {
      updateData.extractAttachments = updates.extractAttachments;
    }
    if (updates.extractBodyContent !== undefined) {
      updateData.extractBodyContent = updates.extractBodyContent;
    }
    if (updates.status !== undefined) {
      updateData.status = updates.status;
    }

    const updated = await this.prisma.onboardingEmailForwarder.update({
      where: { id: forwarderId },
      data: updateData
    });

    await logger.info(PHASE4_EMAIL_COMPONENTS.EMAIL_FORWARDER, `Forwarder updated`, {
      forwarderId,
      updates: Object.keys(updateData)
    });

    return { forwarder: updated };
  }

  // ===========================================================================
  // SENDER VALIDATION
  // ===========================================================================

  /**
   * Validate if sender is allowed
   *
   * @param {object} forwarder - Forwarder record
   * @param {string} fromEmail - Sender email address
   * @returns {{ allowed: boolean, reason?: string }}
   */
  validateSender(forwarder, fromEmail) {
    if (!fromEmail) {
      return { allowed: false, reason: REJECTION_REASONS.INVALID_PAYLOAD };
    }

    const email = fromEmail.toLowerCase().trim();

    // Check blocked list first
    if (forwarder.blockedSenders) {
      const blocked = JSON.parse(forwarder.blockedSenders);
      for (const pattern of blocked) {
        if (this._matchEmailPattern(email, pattern)) {
          return { allowed: false, reason: REJECTION_REASONS.SENDER_BLOCKED };
        }
      }
    }

    // Check allowed list (if specified)
    if (forwarder.allowedSenders) {
      const allowed = JSON.parse(forwarder.allowedSenders);
      if (allowed.length > 0) {
        const isAllowed = allowed.some(pattern =>
          this._matchEmailPattern(email, pattern)
        );
        if (!isAllowed) {
          return { allowed: false, reason: REJECTION_REASONS.SENDER_NOT_ALLOWED };
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Match email against pattern
   * Supports: exact match, domain match (@domain.com), wildcard (*@domain.com)
   */
  _matchEmailPattern(email, pattern) {
    const p = pattern.toLowerCase().trim();

    // Domain match (e.g., "@acme.com")
    if (p.startsWith('@')) {
      return email.endsWith(p);
    }

    // Wildcard match (e.g., "*@acme.com")
    if (p.startsWith('*@')) {
      return email.endsWith(p.slice(1));
    }

    // Exact match
    return email === p;
  }

  // ===========================================================================
  // INBOUND EMAIL PROCESSING
  // ===========================================================================

  /**
   * Process inbound email from webhook
   *
   * Expected payload structure (SendGrid Inbound Parse):
   * {
   *   to: 'import-abc123@import.canonical.com',
   *   from: 'John Doe <john@acme.com>',
   *   subject: 'Rent roll for 123 Main St',
   *   text: 'Please find attached...',
   *   html: '<p>Please find attached...</p>',
   *   attachments: number,
   *   attachment1: { filename, content (base64), ... },
   *   ...
   * }
   */
  async processInboundEmail(payload) {
    const timer = { start: Date.now() };

    // Validate payload
    if (!payload || !payload.to) {
      return {
        success: false,
        error: REJECTION_REASONS.INVALID_PAYLOAD
      };
    }

    // Extract target email address
    const toEmail = this._extractEmailAddress(payload.to);

    // Find forwarder
    const forwarder = await this.getForwarderByEmail(toEmail);

    if (!forwarder) {
      return {
        success: false,
        error: REJECTION_REASONS.FORWARDER_NOT_FOUND
      };
    }

    const logger = this._getLogger(forwarder.sessionId);

    // Check if forwarding is enabled
    if (!forwarder.forwardingEnabled || forwarder.status !== 'ACTIVE') {
      await this._createEmailLog(forwarder, payload, 'REJECTED', REJECTION_REASONS.FORWARDER_DISABLED);
      return {
        success: false,
        error: REJECTION_REASONS.FORWARDER_DISABLED
      };
    }

    // Extract sender email
    const fromEmail = this._extractEmailAddress(payload.from);
    const fromName = this._extractEmailName(payload.from);

    // Validate sender
    const senderValidation = this.validateSender(forwarder, fromEmail);
    if (!senderValidation.allowed) {
      await this._createEmailLog(forwarder, payload, 'REJECTED', senderValidation.reason);
      await logger.warn(PHASE4_EMAIL_COMPONENTS.EMAIL_INTAKE, `Email rejected: ${senderValidation.reason}`, {
        forwarderId: forwarder.id,
        fromEmail,
        reason: senderValidation.reason
      });
      return {
        success: false,
        error: senderValidation.reason
      };
    }

    // Check for attachments
    const attachmentCount = parseInt(payload.attachments) || 0;
    if (forwarder.extractAttachments && attachmentCount === 0 && !forwarder.extractBodyContent) {
      await this._createEmailLog(forwarder, payload, 'REJECTED', REJECTION_REASONS.NO_ATTACHMENTS);
      await logger.warn(PHASE4_EMAIL_COMPONENTS.EMAIL_INTAKE, `Email rejected: no attachments`, {
        forwarderId: forwarder.id,
        fromEmail
      });
      return {
        success: false,
        error: REJECTION_REASONS.NO_ATTACHMENTS
      };
    }

    // Generate message ID
    const messageId = payload['message-id'] || `gen-${uuidv4()}`;

    // Check for duplicate
    const existing = await this.prisma.onboardingEmailLog.findUnique({
      where: { messageId }
    });

    if (existing) {
      return { success: true, emailLogId: existing.id, duplicate: true };
    }

    // Create email log
    const emailLog = await this.prisma.onboardingEmailLog.create({
      data: {
        forwarderId: forwarder.id,
        sessionId: forwarder.sessionId,
        messageId,
        fromEmail,
        fromName,
        toEmail,
        subject: payload.subject || '(no subject)',
        receivedAt: new Date(),
        status: 'PROCESSING',
        attachmentCount,
        attachmentNames: this._extractAttachmentNames(payload, attachmentCount),
        bodySnippet: forwarder.extractBodyContent
          ? (payload.text || '').slice(0, 500)
          : null
      }
    });

    // Update forwarder stats
    await this.prisma.onboardingEmailForwarder.update({
      where: { id: forwarder.id },
      data: {
        emailsReceived: { increment: 1 }
      }
    });

    await logger.info(PHASE4_EMAIL_COMPONENTS.EMAIL_INTAKE, `Email received`, {
      emailLogId: emailLog.id,
      forwarderId: forwarder.id,
      fromEmail,
      subject: emailLog.subject,
      attachmentCount
    });

    // Process attachments
    const intakeSourceIds = [];
    let attachmentsProcessed = 0;
    let claimsExtracted = 0;

    if (forwarder.extractAttachments && attachmentCount > 0) {
      for (let i = 1; i <= attachmentCount; i++) {
        const attachment = payload[`attachment${i}`];
        if (!attachment) continue;

        try {
          // Create intake source for attachment
          const intakeSource = await this.prisma.onboardingIntakeSource.create({
            data: {
              sessionId: forwarder.sessionId,
              sourceType: 'EMAIL',
              fileName: attachment.filename || `attachment-${i}`,
              fileSize: attachment.content ? Buffer.from(attachment.content, 'base64').length : 0,
              mimeType: attachment['content-type'] || 'application/octet-stream',
              emailAddress: forwarder.inboundEmail,
              emailMessageId: messageId,
              emailSubject: emailLog.subject,
              emailFrom: fromEmail,
              status: 'PENDING'
            }
          });

          intakeSourceIds.push(intakeSource.id);
          attachmentsProcessed++;

          await logger.debug(PHASE4_EMAIL_COMPONENTS.EMAIL_INTAKE, `Attachment queued for processing`, {
            emailLogId: emailLog.id,
            intakeSourceId: intakeSource.id,
            fileName: attachment.filename
          });

        } catch (err) {
          await logger.error(PHASE4_EMAIL_COMPONENTS.EMAIL_INTAKE, `Failed to process attachment`, {
            emailLogId: emailLog.id,
            attachmentIndex: i,
            error: err.message
          });
        }
      }
    }

    // Process body content if enabled
    if (forwarder.extractBodyContent && (payload.text || payload.html)) {
      try {
        const intakeSource = await this.prisma.onboardingIntakeSource.create({
          data: {
            sessionId: forwarder.sessionId,
            sourceType: 'EMAIL',
            fileName: `Email Body: ${emailLog.subject}`,
            fileSize: (payload.text || '').length,
            mimeType: 'text/plain',
            emailAddress: forwarder.inboundEmail,
            emailMessageId: messageId,
            emailSubject: emailLog.subject,
            emailFrom: fromEmail,
            status: 'PENDING'
          }
        });

        intakeSourceIds.push(intakeSource.id);
      } catch (err) {
        await logger.error(PHASE4_EMAIL_COMPONENTS.EMAIL_INTAKE, `Failed to process body content`, {
          emailLogId: emailLog.id,
          error: err.message
        });
      }
    }

    // Update email log
    await this.prisma.onboardingEmailLog.update({
      where: { id: emailLog.id },
      data: {
        status: 'COMPLETED',
        processedAt: new Date(),
        attachmentsProcessed,
        claimsExtracted,
        intakeSourceIds: JSON.stringify(intakeSourceIds)
      }
    });

    // Update forwarder stats
    await this.prisma.onboardingEmailForwarder.update({
      where: { id: forwarder.id },
      data: {
        emailsProcessed: { increment: 1 },
        attachmentsProcessed: { increment: attachmentsProcessed }
      }
    });

    const duration = Date.now() - timer.start;

    await logger.info(PHASE4_EMAIL_COMPONENTS.EMAIL_INTAKE, `Email processed successfully`, {
      emailLogId: emailLog.id,
      attachmentsProcessed,
      intakeSourceCount: intakeSourceIds.length,
      duration
    });

    return {
      success: true,
      emailLogId: emailLog.id,
      intakeSourceIds,
      attachmentsProcessed
    };
  }

  /**
   * Create email log for rejected emails
   */
  async _createEmailLog(forwarder, payload, status, rejectionReason) {
    const fromEmail = this._extractEmailAddress(payload.from);
    const fromName = this._extractEmailName(payload.from);
    const messageId = payload['message-id'] || `gen-${uuidv4()}`;

    try {
      await this.prisma.onboardingEmailLog.create({
        data: {
          forwarderId: forwarder.id,
          sessionId: forwarder.sessionId,
          messageId,
          fromEmail: fromEmail || 'unknown',
          fromName,
          toEmail: this._extractEmailAddress(payload.to),
          subject: payload.subject || '(no subject)',
          receivedAt: new Date(),
          status,
          rejectionReason,
          attachmentCount: parseInt(payload.attachments) || 0
        }
      });

      // Update rejected count
      await this.prisma.onboardingEmailForwarder.update({
        where: { id: forwarder.id },
        data: {
          emailsReceived: { increment: 1 },
          emailsRejected: { increment: 1 }
        }
      });
    } catch (err) {
      console.error('[EmailForwarder] Failed to create email log:', err.message);
    }
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Extract email address from "Name <email>" format
   */
  _extractEmailAddress(emailString) {
    if (!emailString) return null;

    // Match email in angle brackets: "Name <email@domain.com>"
    const match = emailString.match(/<([^>]+)>/);
    if (match) {
      return match[1].toLowerCase().trim();
    }

    // No brackets, assume it's just the email
    return emailString.toLowerCase().trim();
  }

  /**
   * Extract name from "Name <email>" format
   */
  _extractEmailName(emailString) {
    if (!emailString) return null;

    // Extract name before angle brackets
    const match = emailString.match(/^([^<]+)</);
    if (match) {
      return match[1].trim().replace(/^["']|["']$/g, '');
    }

    return null;
  }

  /**
   * Extract attachment names from payload
   */
  _extractAttachmentNames(payload, attachmentCount) {
    const names = [];
    for (let i = 1; i <= attachmentCount; i++) {
      const attachment = payload[`attachment${i}`];
      if (attachment && attachment.filename) {
        names.push(attachment.filename);
      }
    }
    return names.length > 0 ? JSON.stringify(names) : null;
  }

  // ===========================================================================
  // EMAIL LOG QUERIES
  // ===========================================================================

  /**
   * Get email logs for a forwarder
   */
  async getEmailLogs(forwarderId, options = {}) {
    const { status, limit = 50, offset = 0 } = options;

    const where = { forwarderId };
    if (status) {
      where.status = status;
    }

    const [emails, total] = await Promise.all([
      this.prisma.onboardingEmailLog.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        take: limit,
        skip: offset
      }),
      this.prisma.onboardingEmailLog.count({ where })
    ]);

    return { emails, total };
  }

  /**
   * Get email log by ID
   */
  async getEmailLog(emailLogId) {
    return await this.prisma.onboardingEmailLog.findUnique({
      where: { id: emailLogId }
    });
  }

  /**
   * Get forwarder stats
   */
  async getForwarderStats(forwarderId) {
    const forwarder = await this.prisma.onboardingEmailForwarder.findUnique({
      where: { id: forwarderId }
    });

    if (!forwarder) {
      return null;
    }

    // Get recent email stats
    const recentEmails = await this.prisma.onboardingEmailLog.groupBy({
      by: ['status'],
      where: { forwarderId },
      _count: true
    });

    const statusCounts = {};
    for (const row of recentEmails) {
      statusCounts[row.status] = row._count;
    }

    return {
      emailsReceived: forwarder.emailsReceived,
      emailsProcessed: forwarder.emailsProcessed,
      emailsRejected: forwarder.emailsRejected,
      attachmentsProcessed: forwarder.attachmentsProcessed,
      byStatus: statusCounts
    };
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

function createOnboardingEmailForwarderService(prisma, options = {}) {
  return new OnboardingEmailForwarderService(prisma, options);
}

export {
  OnboardingEmailForwarderService,
  createOnboardingEmailForwarderService,
  REJECTION_REASONS,
  PHASE4_EMAIL_COMPONENTS,
  EMAIL_INTAKE_DOMAIN
};
