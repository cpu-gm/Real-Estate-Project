import { PrismaClient } from '@prisma/client';
import { generateMagicLinkToken } from '../services/magic-link-service.js';
import { createValidationLogger } from '../services/validation-logger.js';
import { SubmitDealSchema } from '../middleware/route-schemas.js';

const prisma = new PrismaClient();

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

/**
 * Submit a deal to an external party (Lender, Counsel)
 * POST /api/deals/:dealId/submit
 *
 * T1.3 (P1 Security Sprint): Uses authUser from validated JWT
 */
export async function handleSubmitDeal(req, res, dealId, readJsonBody, authUser) {
  const userId = authUser?.id ?? 'anonymous';  // T1.3: Use validated JWT identity
  const userName = authUser?.name ?? userId;
  const body = await readJsonBody(req);

  // ========== VALIDATION ==========
  const validationLog = createValidationLogger('handleSubmitDeal');
  validationLog.beforeValidation(body);

  const parsed = SubmitDealSchema.safeParse(body);
  if (!parsed.success) {
    validationLog.validationFailed(parsed.error.errors);
    return sendJson(res, 400, {
      code: 'VALIDATION_FAILED',
      message: 'Invalid request body',
      errors: parsed.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message
      }))
    });
  }

  validationLog.afterValidation(parsed.data);
  // ================================

  const {
    recipientEmail,
    recipientName,
    recipientRole = 'LENDER',
    message
  } = parsed.data;

  try {
    // Validate role
    const validRoles = ['LENDER', 'COUNSEL'];
    const normalizedRole = recipientRole.toUpperCase();
    if (!validRoles.includes(normalizedRole)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: `Invalid recipientRole. Must be one of: ${validRoles.join(', ')}`
      }));
      return;
    }

    // Check for existing pending submission
    const existingSubmission = await prisma.dealSubmission.findFirst({
      where: {
        dealId,
        recipientEmail,
        status: { in: ['PENDING', 'VIEWED'] }
      }
    });

    if (existingSubmission) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'A submission is already pending for this recipient',
        existingSubmission: {
          id: existingSubmission.id,
          status: existingSubmission.status,
          submittedAt: existingSubmission.submittedAt
        }
      }));
      return;
    }

    // Generate magic link token
    const tokenResult = await generateMagicLinkToken({
      dealId,
      recipientEmail,
      recipientName,
      recipientRole: normalizedRole,
      actionType: 'view_deal',
      createdByUserId: userId,
      expiresInDays: 7
    });

    // Create submission record
    const submission = await prisma.dealSubmission.create({
      data: {
        dealId,
        submittedTo: normalizedRole,
        recipientEmail,
        recipientName: recipientName || null,
        status: 'PENDING',
        submittedByUserId: userId,
        submittedByName: userName,
        magicLinkTokenId: tokenResult.tokenRecord.id
      }
    });

    // Create notification for the submitting GP
    await prisma.notification.create({
      data: {
        userId,
        type: 'deal_submitted',
        title: `Deal Submitted to ${normalizedRole}`,
        body: `You submitted a deal to ${recipientName || recipientEmail}`,
        dealId,
        actionUrl: `/DealOverview?id=${dealId}`
      }
    });

    // In production, send email here with magic link
    // For now, return the magic link in the response for testing
    console.log(`[DEMO] Magic link for ${recipientEmail}: ${tokenResult.magicLink}`);

    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: submission.id,
      status: 'PENDING',
      recipientEmail,
      recipientName,
      recipientRole: normalizedRole,
      submittedAt: submission.submittedAt,
      magicLink: tokenResult.magicLink, // Remove in production
      message: `Deal submitted to ${recipientName || recipientEmail}. They will receive an email with access instructions.`
    }));
  } catch (error) {
    console.error('Error submitting deal:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to submit deal' }));
  }
}

/**
 * List submissions for a deal
 * GET /api/deals/:dealId/submissions
 */
export async function handleListDealSubmissions(req, res, dealId) {
  try {
    const submissions = await prisma.dealSubmission.findMany({
      where: { dealId },
      orderBy: { submittedAt: 'desc' }
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      submissions: submissions.map(s => ({
        id: s.id,
        submittedTo: s.submittedTo,
        recipientEmail: s.recipientEmail,
        recipientName: s.recipientName,
        status: s.status,
        submittedByName: s.submittedByName,
        submittedAt: s.submittedAt,
        viewedAt: s.viewedAt,
        respondedAt: s.respondedAt,
        responseNotes: s.responseNotes
      }))
    }));
  } catch (error) {
    console.error('Error listing submissions:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to list submissions' }));
  }
}

/**
 * Get a single submission
 * GET /api/submissions/:id
 */
export async function handleGetSubmission(req, res, submissionId) {
  try {
    const submission = await prisma.dealSubmission.findUnique({
      where: { id: submissionId }
    });

    if (!submission) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Submission not found' }));
      return;
    }

    // Get related comments
    const comments = await prisma.portalComment.findMany({
      where: { submissionId },
      orderBy: { createdAt: 'desc' }
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ...submission,
      comments
    }));
  } catch (error) {
    console.error('Error getting submission:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to get submission' }));
  }
}

/**
 * Resend magic link for a submission
 * POST /api/submissions/:id/resend
 *
 * T1.3 (P1 Security Sprint): Uses authUser from validated JWT
 */
export async function handleResendSubmission(req, res, submissionId, authUser) {
  try {
    const userId = authUser?.id ?? 'anonymous';  // T1.3: Use validated JWT identity

    const submission = await prisma.dealSubmission.findUnique({
      where: { id: submissionId }
    });

    if (!submission) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Submission not found' }));
      return;
    }

    if (['APPROVED', 'REJECTED'].includes(submission.status)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Cannot resend - submission has already been responded to'
      }));
      return;
    }

    // Generate new magic link
    const tokenResult = await generateMagicLinkToken({
      dealId: submission.dealId,
      recipientEmail: submission.recipientEmail,
      recipientName: submission.recipientName,
      recipientRole: submission.submittedTo,
      actionType: 'view_deal',
      createdByUserId: userId,
      expiresInDays: 7
    });

    // Update submission with new token
    await prisma.dealSubmission.update({
      where: { id: submissionId },
      data: {
        magicLinkTokenId: tokenResult.tokenRecord.id
      }
    });

    // In production, send email here
    console.log(`[DEMO] Resent magic link for ${submission.recipientEmail}: ${tokenResult.magicLink}`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: submissionId,
      magicLink: tokenResult.magicLink, // Remove in production
      message: `Magic link resent to ${submission.recipientEmail}`
    }));
  } catch (error) {
    console.error('Error resending submission:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to resend submission' }));
  }
}

/**
 * Cancel a submission
 * POST /api/submissions/:id/cancel
 *
 * T1.3 (P1 Security Sprint): Removed unused resolveUserId param
 */
export async function handleCancelSubmission(req, res, submissionId) {
  try {
    const submission = await prisma.dealSubmission.findUnique({
      where: { id: submissionId }
    });

    if (!submission) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Submission not found' }));
      return;
    }

    if (['APPROVED', 'REJECTED'].includes(submission.status)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Cannot cancel - submission has already been responded to'
      }));
      return;
    }

    // Revoke the magic link token if it exists
    if (submission.magicLinkTokenId) {
      await prisma.magicLinkToken.update({
        where: { id: submission.magicLinkTokenId },
        data: { status: 'REVOKED' }
      });
    }

    // Update submission status
    await prisma.dealSubmission.update({
      where: { id: submissionId },
      data: { status: 'CANCELLED' }
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: submissionId,
      status: 'CANCELLED',
      message: 'Submission has been cancelled'
    }));
  } catch (error) {
    console.error('Error cancelling submission:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to cancel submission' }));
  }
}
