/**
 * GC Oversight Service
 *
 * Provides GC approval queue, workload analytics, metrics
 *
 * Phase 5.1: Approval Queue functionality
 */

import { getPrisma } from '../../db.js';
const prisma = getPrisma();
import { createLogger } from '../../lib/logger.js';
import { sendEmail } from '../email-service.js';

const logger = createLogger('legal:gc-oversight-service');

const PUBLIC_BASE_URL = process.env.BFF_PUBLIC_URL || 'http://localhost:8787';

// ===== APPROVAL QUEUE =====

/**
 * Get all matters awaiting GC approval
 * @param {string} organizationId
 * @param {string} gcUserId (optional) - if provided, only matters assigned to this GC
 * @returns {Promise<Array>} Matters needing approval
 */
export async function getApprovalQueue(organizationId, gcUserId = null) {
  logger.info('Fetching GC approval queue', { organizationId, gcUserId });

  const where = {
    organizationId,
    gcReviewRequired: true,
    gcApprovalStatus: { in: [null, 'PENDING'] }
  };

  const matters = await prisma.legalMatter.findMany({
    where,
    orderBy: [
      { priority: 'desc' },
      { dueDate: 'asc' }
    ],
    include: {
      activities: {
        orderBy: { createdAt: 'desc' },
        take: 3
      }
    }
  });

  logger.info('Approval queue fetched', { count: matters.length, organizationId });
  return matters;
}

/**
 * Request GC review for a matter (triggers notifications)
 * @param {string} matterId
 * @param {string} requestedBy - User ID who requested review
 * @param {string} requestedByName - Name for logging
 * @param {string} notes - Optional notes for GC
 * @param {string} organizationId
 * @returns {Promise<void>}
 */
export async function requestGCReview(matterId, requestedBy, requestedByName, notes, organizationId) {
  logger.info('Requesting GC review', { matterId, requestedBy });

  // Get matter details
  const matter = await prisma.legalMatter.findFirst({
    where: {
      id: matterId,
      organizationId
    }
  });

  if (!matter) {
    throw new Error('Matter not found or does not belong to organization');
  }

  // Update matter
  await prisma.legalMatter.update({
    where: { id: matterId },
    data: {
      gcReviewRequired: true,
      gcApprovalStatus: 'PENDING'
    }
  });

  // Log activity
  await prisma.legalMatterActivity.create({
    data: {
      matterId,
      activityType: 'GC_REVIEW_REQUESTED',
      content: notes || 'GC review requested',
      createdBy: requestedBy
    }
  });

  // Send notifications to all General Counsel users
  await sendGCReviewNotifications(matter, requestedByName, notes, organizationId);

  logger.info('GC review requested', { matterId, requestedBy });
}

/**
 * Approve GC review for a matter
 * @param {string} matterId
 * @param {string} gcUserId
 * @param {string} gcUserName
 * @param {string} notes - Approval notes
 * @param {string} organizationId
 * @returns {Promise<object>} Updated matter
 */
export async function approveGCReview(matterId, gcUserId, gcUserName, notes, organizationId) {
  logger.info('Approving GC review', { matterId, gcUserId });

  const matter = await prisma.legalMatter.findFirst({
    where: {
      id: matterId,
      organizationId
    }
  });

  if (!matter) {
    throw new Error('Matter not found or does not belong to organization');
  }

  // Update matter
  const updated = await prisma.legalMatter.update({
    where: { id: matterId },
    data: {
      gcApprovalStatus: 'APPROVED'
    }
  });

  // Log activity
  await prisma.legalMatterActivity.create({
    data: {
      matterId,
      activityType: 'GC_APPROVAL',
      content: notes || 'GC review approved',
      createdBy: gcUserId
    }
  });

  // Notify the original requester (assignedTo)
  if (matter.assignedTo) {
    await sendGCDecisionNotification(matter, 'APPROVED', notes, gcUserName, matter.assignedTo);
  }

  logger.info('GC review approved', { matterId, gcUserId });
  return updated;
}

/**
 * Reject GC review for a matter
 * @param {string} matterId
 * @param {string} gcUserId
 * @param {string} gcUserName
 * @param {string} notes - Rejection reason (required)
 * @param {string} organizationId
 * @returns {Promise<object>} Updated matter
 */
export async function rejectGCReview(matterId, gcUserId, gcUserName, notes, organizationId) {
  logger.info('Rejecting GC review', { matterId, gcUserId });

  if (!notes || notes.trim().length === 0) {
    throw new Error('Rejection reason is required');
  }

  const matter = await prisma.legalMatter.findFirst({
    where: {
      id: matterId,
      organizationId
    }
  });

  if (!matter) {
    throw new Error('Matter not found or does not belong to organization');
  }

  // Update matter
  const updated = await prisma.legalMatter.update({
    where: { id: matterId },
    data: {
      gcApprovalStatus: 'REJECTED'
    }
  });

  // Log activity
  await prisma.legalMatterActivity.create({
    data: {
      matterId,
      activityType: 'GC_REJECTION',
      content: notes,
      createdBy: gcUserId
    }
  });

  // Notify the original requester
  if (matter.assignedTo) {
    await sendGCDecisionNotification(matter, 'REJECTED', notes, gcUserName, matter.assignedTo);
  }

  logger.info('GC review rejected', { matterId, gcUserId });
  return updated;
}

// ===== NOTIFICATIONS =====

/**
 * Send notifications to all General Counsel when review is requested
 * @private
 */
async function sendGCReviewNotifications(matter, requestedByName, notes, organizationId) {
  logger.debug('Sending GC review notifications', { matterId: matter.id });

  // Get all General Counsel users
  const gcUsers = await prisma.authUser.findMany({
    where: {
      organizationId,
      role: 'General Counsel',
      status: 'ACTIVE'
    },
    select: {
      id: true,
      name: true,
      email: true
    }
  });

  if (gcUsers.length === 0) {
    logger.warn('No General Counsel users found for notifications', { organizationId });
    return;
  }

  const matterUrl = `${PUBLIC_BASE_URL}/LegalMatterDetail/${matter.id}`;

  // Create in-app notifications
  for (const gcUser of gcUsers) {
    await prisma.notification.create({
      data: {
        userId: gcUser.id,
        type: 'GC_REVIEW_REQUIRED',
        title: `Review Required: ${matter.title}`,
        body: notes || `${requestedByName} has requested your review on this matter.`,
        isRead: false,
        dealId: matter.dealId || null
      }
    });
  }

  // Send emails
  for (const gcUser of gcUsers) {
    await sendGCReviewEmail({
      toEmail: gcUser.email,
      gcName: gcUser.name,
      matterTitle: matter.title,
      matterType: matter.matterType,
      requestedBy: requestedByName,
      notes,
      matterUrl,
      dueDate: matter.dueDate
    });
  }

  logger.info('GC review notifications sent', { count: gcUsers.length, matterId: matter.id });
}

/**
 * Send notification when GC approves/rejects
 * @private
 */
async function sendGCDecisionNotification(matter, decision, notes, gcName, recipientUserId) {
  logger.debug('Sending GC decision notification', { matterId: matter.id, decision });

  const isApproved = decision === 'APPROVED';
  const matterUrl = `${PUBLIC_BASE_URL}/LegalMatterDetail/${matter.id}`;

  // Create in-app notification
  await prisma.notification.create({
    data: {
      userId: recipientUserId,
      type: isApproved ? 'GC_APPROVED' : 'GC_REJECTED',
      title: `${matter.title} ${isApproved ? 'Approved' : 'Rejected'} by GC`,
      body: notes || (isApproved ? 'Your matter has been approved.' : 'Your matter needs revision.'),
      isRead: false,
      dealId: matter.dealId || null
    }
  });

  // Get recipient email
  const recipient = await prisma.authUser.findUnique({
    where: { id: recipientUserId },
    select: { email: true, name: true }
  });

  if (!recipient) {
    logger.warn('Recipient user not found for GC decision email', { recipientUserId });
    return;
  }

  // Send email
  await sendGCDecisionEmail({
    toEmail: recipient.email,
    recipientName: recipient.name,
    matterTitle: matter.title,
    decision,
    notes,
    gcName,
    matterUrl
  });

  logger.info('GC decision notification sent', { matterId: matter.id, decision, recipientUserId });
}

/**
 * Send email when GC review is requested
 * @private
 */
async function sendGCReviewEmail({
  toEmail,
  gcName,
  matterTitle,
  matterType,
  requestedBy,
  notes,
  matterUrl,
  dueDate
}) {
  const subject = `GC Review Required: ${matterTitle}`;

  const dueDateStr = dueDate ? new Date(dueDate).toLocaleDateString() : 'Not set';

  const textBody = `
Hello ${gcName || 'General Counsel'},

${requestedBy} has requested your review on a legal matter.

Matter: ${matterTitle}
Type: ${matterType || 'Not specified'}
Due Date: ${dueDateStr}

${notes ? `Notes from ${requestedBy}:\n${notes}\n` : ''}
Review the matter:
${matterUrl}

Please review and approve/reject as needed.

This is an automated notification from Canonical Deal OS.
`;

  const htmlBody = `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #171717;">⚖️ GC Review Required</h2>

  <p>Hello ${gcName || 'General Counsel'},</p>

  <p><strong>${requestedBy}</strong> has requested your review on a legal matter.</p>

  <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 4px; margin: 16px 0;">
    <p style="margin: 0;"><strong>Matter:</strong> ${matterTitle}</p>
    <p style="margin: 8px 0 0 0;"><strong>Type:</strong> ${matterType || 'Not specified'}</p>
    <p style="margin: 8px 0 0 0;"><strong>Due Date:</strong> ${dueDateStr}</p>
  </div>

  ${notes
    ? `<div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
         <p style="margin: 0; font-size: 14px; color: #525252;"><strong>Notes from ${requestedBy}:</strong></p>
         <p style="margin: 8px 0 0 0; font-size: 14px;">${notes}</p>
       </div>`
    : ''
  }

  <p>
    <a href="${matterUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
      Review Matter
    </a>
  </p>

  <p style="color: #737373; font-size: 12px; margin-top: 24px;">
    Please review and approve/reject as needed. Your team is waiting for your decision.
  </p>

  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 32px 0;">

  <p style="color: #a3a3a3; font-size: 11px;">
    Powered by Canonical Deal OS
  </p>
</div>
`;

  return sendEmail({
    to: toEmail,
    subject,
    text: textBody.trim(),
    html: htmlBody.trim(),
    metadata: {
      event: 'GC_REVIEW_REQUIRED',
      matterTitle,
      requestedBy
    }
  });
}

/**
 * Send email when GC approves/rejects
 * @private
 */
async function sendGCDecisionEmail({
  toEmail,
  recipientName,
  matterTitle,
  decision,
  notes,
  gcName,
  matterUrl
}) {
  const isApproved = decision === 'APPROVED';
  const subject = `Matter ${isApproved ? 'Approved' : 'Rejected'}: ${matterTitle}`;

  const textBody = `
Hello ${recipientName},

${gcName} has ${isApproved ? 'approved' : 'rejected'} your legal matter.

Matter: ${matterTitle}
Decision: ${decision}

${notes ? `Notes from ${gcName}:\n${notes}\n` : ''}
View matter:
${matterUrl}

${isApproved
  ? 'You may proceed with this matter.'
  : 'Please review the feedback and revise as needed.'
}

This is an automated notification from Canonical Deal OS.
`;

  const htmlBody = `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: ${isApproved ? '#16a34a' : '#dc2626'};">
    ${isApproved ? '✅ Matter Approved' : '❌ Matter Rejected'}
  </h2>

  <p>Hello ${recipientName},</p>

  <p><strong>${gcName}</strong> has ${isApproved ? 'approved' : 'rejected'} your legal matter.</p>

  <div style="background: ${isApproved ? '#dcfce7' : '#fee2e2'}; border-left: 4px solid ${isApproved ? '#16a34a' : '#dc2626'}; padding: 16px; border-radius: 4px; margin: 16px 0;">
    <p style="margin: 0;"><strong>Matter:</strong> ${matterTitle}</p>
    <p style="margin: 8px 0 0 0;"><strong>Decision:</strong> ${decision}</p>
  </div>

  ${notes
    ? `<div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
         <p style="margin: 0; font-size: 14px; color: #525252;"><strong>Notes from ${gcName}:</strong></p>
         <p style="margin: 8px 0 0 0; font-size: 14px;">${notes}</p>
       </div>`
    : ''
  }

  <p>
    <a href="${matterUrl}" style="display: inline-block; background: ${isApproved ? '#16a34a' : '#dc2626'}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
      View Matter
    </a>
  </p>

  <p style="color: #737373; font-size: 12px; margin-top: 24px;">
    ${isApproved
      ? 'You may proceed with this matter.'
      : 'Please review the feedback and revise as needed.'
    }
  </p>

  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 32px 0;">

  <p style="color: #a3a3a3; font-size: 11px;">
    Powered by Canonical Deal OS
  </p>
</div>
`;

  return sendEmail({
    to: toEmail,
    subject,
    text: textBody.trim(),
    html: htmlBody.trim(),
    metadata: {
      event: isApproved ? 'GC_APPROVED' : 'GC_REJECTED',
      matterTitle,
      gcName
    }
  });
}
