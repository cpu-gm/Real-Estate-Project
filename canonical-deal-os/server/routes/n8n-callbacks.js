/**
 * n8n Workflow Callback Endpoints
 *
 * These endpoints are called by n8n workflows to:
 * - Generate AI emails for LP invitations
 * - Create GP approval tasks
 * - Send approved emails
 * - Update workflow state
 * - Create in-app notifications
 *
 * SECURITY: All endpoints require HMAC signature validation.
 */

import crypto from "node:crypto";
import { getPrisma } from "../db.js";
import { callOpenAI } from "../llm.js";
import { sendEmail } from "../services/email-service.js";
import { emitLpWebhook } from "../notifications.js";

const N8N_CALLBACK_SECRET = process.env.BFF_N8N_CALLBACK_SECRET?.trim();

// ========== UTILITY FUNCTIONS ==========

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message, code = null) {
  sendJson(res, status, {
    error: message,
    code: code || "N8N_CALLBACK_ERROR"
  });
}

// ========== AUTHENTICATION VALIDATION ==========

/**
 * Validate n8n callback request
 * Supports both:
 * 1. HMAC signature (X-N8n-Signature header) - more secure
 * 2. Simple secret (X-N8n-Secret header) - for n8n Cloud where crypto module is blocked
 *
 * SECURITY: Fails closed - missing secret or auth = reject
 */
function validateN8nSignature(req, body) {
  if (!N8N_CALLBACK_SECRET) {
    console.error("[n8n] Callback secret not configured (BFF_N8N_CALLBACK_SECRET)");
    return { valid: false, error: "Callback secret not configured" };
  }

  // Option 1: Simple secret header (for n8n Cloud)
  const simpleSecret = req.headers["x-n8n-secret"];
  if (simpleSecret) {
    try {
      const isValid = crypto.timingSafeEqual(
        Buffer.from(simpleSecret),
        Buffer.from(N8N_CALLBACK_SECRET)
      );
      if (isValid) {
        return { valid: true };
      }
    } catch {
      // Fall through to HMAC check
    }
  }

  // Option 2: HMAC signature (more secure, for self-hosted n8n)
  const signature = req.headers["x-n8n-signature"];
  if (!signature && !simpleSecret) {
    console.error("[n8n] Missing X-N8n-Signature or X-N8n-Secret header");
    return { valid: false, error: "Missing authentication header" };
  }

  if (!signature) {
    return { valid: false, error: "Invalid secret" };
  }

  const expectedSignature = `sha256=${crypto
    .createHmac("sha256", N8N_CALLBACK_SECRET)
    .update(JSON.stringify(body))
    .digest("hex")}`;

  try {
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
    return { valid: isValid, error: isValid ? undefined : "Invalid signature" };
  } catch {
    return { valid: false, error: "Signature validation failed" };
  }
}

/**
 * Validate authentication for GET requests
 * Supports simple secret or HMAC signature
 */
function validateN8nSignatureForGet(req, invitationId) {
  if (!N8N_CALLBACK_SECRET) {
    return { valid: false, error: "Callback secret not configured" };
  }

  // Option 1: Simple secret header (for n8n Cloud)
  const simpleSecret = req.headers["x-n8n-secret"];
  if (simpleSecret) {
    try {
      const isValid = crypto.timingSafeEqual(
        Buffer.from(simpleSecret),
        Buffer.from(N8N_CALLBACK_SECRET)
      );
      if (isValid) {
        return { valid: true };
      }
    } catch {
      // Fall through to HMAC check
    }
  }

  // Option 2: HMAC signature
  const signature = req.headers["x-n8n-signature"];
  if (!signature && !simpleSecret) {
    return { valid: false, error: "Missing authentication header" };
  }

  if (!signature) {
    return { valid: false, error: "Invalid secret" };
  }

  // For GET requests, sign the invitationId
  const expectedSignature = `sha256=${crypto
    .createHmac("sha256", N8N_CALLBACK_SECRET)
    .update(invitationId)
    .digest("hex")}`;

  try {
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
    return { valid: isValid, error: isValid ? undefined : "Invalid signature" };
  } catch {
    return { valid: false, error: "Signature validation failed" };
  }
}

// ========== WORKFLOW LOGGING ==========

/**
 * Log n8n workflow activity for audit trail
 */
async function logN8nActivity(req, action, entityType, entityId, payload = {}) {
  const prisma = getPrisma();
  try {
    await prisma.n8nWorkflowLog.create({
      data: {
        workflowId: req.headers["x-n8n-execution-id"] || "unknown",
        workflowName: req.headers["x-n8n-workflow-name"] || "LP_INVITATION_FUNNEL",
        triggerEvent: req.headers["x-n8n-trigger-event"] || action,
        entityType,
        entityId,
        action,
        status: "SUCCESS",
        payload: JSON.stringify(payload)
      }
    });
  } catch (err) {
    console.error("[n8n] Failed to log activity:", err.message);
  }
}

// ========== EMAIL PROMPT BUILDER ==========

/**
 * Build AI prompt based on email type
 */
function buildEmailPrompt(emailType, invitation, dealContext) {
  const baseContext = `
LP Name: ${invitation.lpEntityName}
LP Email: ${invitation.lpEmail}
Deal Name: ${dealContext?.dealName || "the investment opportunity"}
Commitment Amount: $${invitation.commitment?.toLocaleString() || "TBD"}
Ownership: ${invitation.ownershipPct}%
`;

  const prompts = {
    INVITATION: `Generate a professional investment invitation email.
${baseContext}
This is the initial invitation. Be welcoming and highlight the opportunity.
Keep it concise (2-3 paragraphs) but warm and professional.`,

    REMINDER_DAY3: `Generate a gentle reminder email (3 days since invitation).
${baseContext}
Friendly reminder without being pushy. Ask if they have questions or need clarification.
Keep it brief (1-2 paragraphs).`,

    REMINDER_DAY7: `Generate a follow-up reminder email (7 days since invitation).
${baseContext}
Express continued interest. Offer to schedule a call to discuss the opportunity.
Mention the deadline is approaching.`,

    REMINDER_DAY14: `Generate a final reminder email (14 days since invitation).
${baseContext}
Note this is the final reminder before the invitation expires.
Create appropriate urgency about the opportunity without being aggressive.`,

    ESCALATION: `Generate an internal escalation notification for the GP team.
${baseContext}
This LP has not responded after 14 days of reminders.
Request that a team member personally follow up via phone or other channel.
This is an internal email, not sent to the LP.`
  };

  return prompts[emailType] || `Generate a professional email for: ${emailType}\n${baseContext}`;
}

// ========== ENDPOINT HANDLERS ==========

/**
 * POST /api/n8n/generate-email
 *
 * Generates AI email content for LP invitation funnel.
 * Creates a draft in the database pending GP approval.
 *
 * Body: { invitationId, emailType, dealContext? }
 */
export async function handleGenerateEmail(req, res, readJsonBody) {
  const body = await readJsonBody(req);

  const validation = validateN8nSignature(req, body);
  if (!validation.valid) {
    return sendError(res, 403, validation.error, "INVALID_SIGNATURE");
  }

  const { invitationId, emailType, dealContext } = body;

  if (!invitationId || !emailType) {
    return sendError(res, 400, "Missing invitationId or emailType", "MISSING_PARAMS");
  }

  const prisma = getPrisma();

  // Fetch invitation details
  const invitation = await prisma.lPInvitation.findUnique({
    where: { id: invitationId }
  });

  if (!invitation) {
    return sendError(res, 404, "Invitation not found", "NOT_FOUND");
  }

  // Build AI prompt
  const prompt = buildEmailPrompt(emailType, invitation, dealContext);

  try {
    // Call OpenAI to generate email
    const aiResponse = await callOpenAI(
      [
        {
          role: "system",
          content: `You are a professional real estate investment communications specialist.
Generate professional, warm but concise emails for LP (Limited Partner) investor communications.
Always maintain a professional tone suitable for institutional investors.
Return JSON with: { "subject": "string", "bodyHtml": "string", "bodyText": "string" }
The bodyHtml should be simple HTML suitable for email (no complex CSS).
The bodyText should be plain text version of the same content.`
        },
        { role: "user", content: prompt }
      ],
      {
        response_format: { type: "json_object" },
        temperature: 0.7
      }
    );

    const content = JSON.parse(aiResponse.choices[0].message.content);

    // Create draft in database
    const draft = await prisma.emailDraft.create({
      data: {
        invitationId,
        dealId: invitation.dealId,
        recipientEmail: invitation.lpEmail,
        recipientName: invitation.lpEntityName,
        emailType,
        subject: content.subject,
        bodyHtml: content.bodyHtml,
        bodyText: content.bodyText,
        aiGenerated: true,
        aiPrompt: prompt,
        status: "PENDING",
        n8nExecutionId: req.headers["x-n8n-execution-id"] || null
      }
    });

    await logN8nActivity(req, "EMAIL_GENERATED", "LP_INVITATION", invitationId, {
      draftId: draft.id,
      emailType
    });

    console.log(`[n8n] Email draft created: ${draft.id} for invitation ${invitationId}`);

    sendJson(res, 201, {
      draftId: draft.id,
      subject: content.subject,
      status: "PENDING_APPROVAL"
    });
  } catch (err) {
    console.error("[n8n] Email generation failed:", err.message);

    await logN8nActivity(req, "EMAIL_GENERATION_FAILED", "LP_INVITATION", invitationId, {
      error: err.message
    });

    sendError(res, 500, `Email generation failed: ${err.message}`, "AI_ERROR");
  }
}

/**
 * POST /api/n8n/create-gp-approval-task
 *
 * Creates an in-app notification for GP to approve email draft.
 *
 * Body: { draftId, gpUserId, dealId, invitationId }
 */
export async function handleCreateGPApprovalTask(req, res, readJsonBody) {
  const body = await readJsonBody(req);

  const validation = validateN8nSignature(req, body);
  if (!validation.valid) {
    return sendError(res, 403, validation.error, "INVALID_SIGNATURE");
  }

  const { draftId, gpUserId, dealId } = body;

  if (!draftId || !gpUserId) {
    return sendError(res, 400, "Missing draftId or gpUserId", "MISSING_PARAMS");
  }

  const prisma = getPrisma();

  const draft = await prisma.emailDraft.findUnique({
    where: { id: draftId }
  });

  if (!draft) {
    return sendError(res, 404, "Draft not found", "NOT_FOUND");
  }

  // Create actionable notification
  const actionToken = crypto.randomUUID();
  const notification = await prisma.notification.create({
    data: {
      userId: gpUserId,
      type: "email_approval_required",
      title: `Approve LP Email: ${draft.recipientName || draft.recipientEmail}`,
      body: `${draft.emailType.replace(/_/g, " ")} email ready for review`,
      dealId: dealId || draft.dealId,
      actionUrl: `/email-approvals?draft=${draftId}`,
      actionToken,
      actionExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      sourceUserId: "n8n-workflow",
      sourceUserName: "Workflow Automation"
    }
  });

  await logN8nActivity(req, "GP_APPROVAL_REQUESTED", "EMAIL_DRAFT", draftId, {
    notificationId: notification.id,
    gpUserId
  });

  console.log(`[n8n] GP approval task created: ${notification.id} for draft ${draftId}`);

  sendJson(res, 201, {
    notificationId: notification.id,
    actionToken
  });
}

/**
 * POST /api/n8n/email-drafts/:id/approve
 *
 * GP approves email draft. Can be called from UI or n8n.
 * Emits webhook for n8n to continue workflow.
 *
 * Body: { gpUserId?, gpUserName? } (optional if authUser available)
 */
export async function handleApproveEmailDraft(req, res, draftId, readJsonBody, authUser) {
  const body = await readJsonBody(req);
  const prisma = getPrisma();

  // If called from n8n, validate signature
  if (req.headers["x-n8n-signature"]) {
    const validation = validateN8nSignature(req, body);
    if (!validation.valid) {
      return sendError(res, 403, validation.error, "INVALID_SIGNATURE");
    }
  } else {
    // If called from UI, verify authUser is GP/Admin
    if (!authUser || !["GP", "Admin"].includes(authUser.role)) {
      return sendError(res, 403, "GP or Admin role required", "FORBIDDEN_ROLE");
    }
  }

  const draft = await prisma.emailDraft.findUnique({
    where: { id: draftId }
  });

  if (!draft) {
    return sendError(res, 404, "Draft not found", "NOT_FOUND");
  }

  if (draft.status !== "PENDING") {
    return sendError(res, 409, `Draft already ${draft.status.toLowerCase()}`, "ALREADY_PROCESSED");
  }

  const approver = authUser || body;

  await prisma.emailDraft.update({
    where: { id: draftId },
    data: {
      status: "APPROVED",
      approvedBy: approver.userId || approver.gpUserId,
      approvedByName: approver.name || approver.gpUserName || "Unknown",
      approvedAt: new Date()
    }
  });

  await logN8nActivity(req, "EMAIL_APPROVED", "EMAIL_DRAFT", draftId, {
    approvedBy: approver.userId || approver.gpUserId
  });

  // Emit webhook for n8n to continue workflow
  await emitLpWebhook("EMAIL_DRAFT_APPROVED", {
    draftId,
    invitationId: draft.invitationId,
    emailType: draft.emailType
  });

  console.log(`[n8n] Email draft approved: ${draftId}`);

  sendJson(res, 200, { success: true, status: "APPROVED" });
}

/**
 * POST /api/n8n/email-drafts/:id/reject
 *
 * GP rejects email draft with reason.
 *
 * Body: { gpUserId?, gpUserName?, reason }
 */
export async function handleRejectEmailDraft(req, res, draftId, readJsonBody, authUser) {
  const body = await readJsonBody(req);
  const prisma = getPrisma();

  // Validate signature or auth
  if (req.headers["x-n8n-signature"]) {
    const validation = validateN8nSignature(req, body);
    if (!validation.valid) {
      return sendError(res, 403, validation.error, "INVALID_SIGNATURE");
    }
  } else {
    if (!authUser || !["GP", "Admin"].includes(authUser.role)) {
      return sendError(res, 403, "GP or Admin role required", "FORBIDDEN_ROLE");
    }
  }

  const draft = await prisma.emailDraft.findUnique({
    where: { id: draftId }
  });

  if (!draft) {
    return sendError(res, 404, "Draft not found", "NOT_FOUND");
  }

  if (draft.status !== "PENDING") {
    return sendError(res, 409, `Draft already ${draft.status.toLowerCase()}`, "ALREADY_PROCESSED");
  }

  const rejector = authUser || body;

  await prisma.emailDraft.update({
    where: { id: draftId },
    data: {
      status: "REJECTED",
      rejectedBy: rejector.userId || rejector.gpUserId,
      rejectedByName: rejector.name || rejector.gpUserName || "Unknown",
      rejectedAt: new Date(),
      rejectionReason: body.reason || "No reason provided"
    }
  });

  await logN8nActivity(req, "EMAIL_REJECTED", "EMAIL_DRAFT", draftId, {
    rejectedBy: rejector.userId || rejector.gpUserId,
    reason: body.reason
  });

  // Emit webhook for n8n to handle rejection
  await emitLpWebhook("EMAIL_DRAFT_REJECTED", {
    draftId,
    invitationId: draft.invitationId,
    reason: body.reason
  });

  console.log(`[n8n] Email draft rejected: ${draftId}`);

  sendJson(res, 200, { success: true, status: "REJECTED" });
}

/**
 * POST /api/n8n/send-email
 *
 * Sends approved email via SendGrid.
 *
 * Body: { draftId }
 */
export async function handleSendEmail(req, res, readJsonBody) {
  const body = await readJsonBody(req);

  const validation = validateN8nSignature(req, body);
  if (!validation.valid) {
    return sendError(res, 403, validation.error, "INVALID_SIGNATURE");
  }

  const { draftId } = body;

  if (!draftId) {
    return sendError(res, 400, "Missing draftId", "MISSING_PARAMS");
  }

  const prisma = getPrisma();

  const draft = await prisma.emailDraft.findUnique({
    where: { id: draftId }
  });

  if (!draft) {
    return sendError(res, 404, "Draft not found", "NOT_FOUND");
  }

  if (draft.status !== "APPROVED") {
    return sendError(res, 400, `Draft not approved (status: ${draft.status})`, "NOT_APPROVED");
  }

  const result = await sendEmail({
    to: draft.recipientEmail,
    subject: draft.subject,
    html: draft.bodyHtml,
    text: draft.bodyText,
    metadata: {
      event: `LP_${draft.emailType}`,
      invitationId: draft.invitationId,
      draftId: draft.id
    }
  });

  if (!result.sent) {
    await logN8nActivity(req, "EMAIL_SEND_FAILED", "EMAIL_DRAFT", draftId, {
      reason: result.reason,
      error: result.error
    });
    return sendError(res, 500, `Email send failed: ${result.reason}`, "SEND_FAILED");
  }

  await prisma.emailDraft.update({
    where: { id: draftId },
    data: {
      status: "SENT",
      sentAt: new Date(),
      sendGridMessageId: result.messageId || null
    }
  });

  await logN8nActivity(req, "EMAIL_SENT", "EMAIL_DRAFT", draftId, {
    messageId: result.messageId
  });

  console.log(`[n8n] Email sent: ${draftId} to ${draft.recipientEmail}`);

  sendJson(res, 200, { success: true, messageId: result.messageId });
}

/**
 * POST /api/n8n/send-direct-email
 *
 * Sends email directly without draft/approval flow.
 * Used for automated notifications (distributions, capital calls, investor updates).
 *
 * Body: { to, subject, html, text, metadata }
 */
export async function handleSendDirectEmail(req, res, readJsonBody) {
  const body = await readJsonBody(req);

  const validation = validateN8nSignature(req, body);
  if (!validation.valid) {
    return sendError(res, 403, validation.error, "INVALID_SIGNATURE");
  }

  const { to, subject, html, text, metadata } = body;

  if (!to || !subject) {
    return sendError(res, 400, "Missing to or subject", "MISSING_PARAMS");
  }

  const result = await sendEmail({
    to,
    subject,
    html: html || text,
    text: text || html?.replace(/<[^>]*>/g, ''),
    metadata: metadata || {}
  });

  if (!result.sent) {
    await logN8nActivity(req, "DIRECT_EMAIL_SEND_FAILED", metadata?.event || "UNKNOWN", metadata?.distributionId || "unknown", {
      to,
      reason: result.reason,
      error: result.error
    });
    return sendError(res, 500, `Email send failed: ${result.reason}`, "SEND_FAILED");
  }

  await logN8nActivity(req, "DIRECT_EMAIL_SENT", metadata?.event || "UNKNOWN", metadata?.distributionId || "unknown", {
    to,
    messageId: result.messageId
  });

  console.log(`[n8n] Direct email sent to ${to} (${metadata?.event || 'unknown event'})`);

  sendJson(res, 200, { success: true, messageId: result.messageId });
}

/**
 * POST /api/n8n/create-notification
 *
 * Creates in-app notification from n8n workflow.
 *
 * Body: { userId, type, title, body, dealId?, actionUrl?, invitationId? }
 */
export async function handleCreateNotification(req, res, readJsonBody) {
  const body = await readJsonBody(req);

  const validation = validateN8nSignature(req, body);
  if (!validation.valid) {
    return sendError(res, 403, validation.error, "INVALID_SIGNATURE");
  }

  const { userId, type, title, body: notificationBody, dealId, actionUrl, invitationId } = body;

  if (!userId || !type || !title) {
    return sendError(res, 400, "Missing userId, type, or title", "MISSING_PARAMS");
  }

  const prisma = getPrisma();

  const notification = await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      body: notificationBody || null,
      dealId: dealId || null,
      actionUrl: actionUrl || null,
      sourceUserId: "n8n-workflow",
      sourceUserName: "Workflow Automation"
    }
  });

  await logN8nActivity(req, "NOTIFICATION_CREATED", "LP_INVITATION", invitationId || "unknown", {
    notificationId: notification.id,
    type
  });

  console.log(`[n8n] Notification created: ${notification.id} for user ${userId}`);

  sendJson(res, 201, { notificationId: notification.id });
}

/**
 * POST /api/n8n/update-reminder-state
 *
 * Updates reminder state from n8n workflow.
 *
 * Body: { invitationId, currentStep, nextReminderAt?, remindersSent?, escalatedToUserId? }
 */
export async function handleUpdateReminderState(req, res, readJsonBody) {
  const body = await readJsonBody(req);

  const validation = validateN8nSignature(req, body);
  if (!validation.valid) {
    return sendError(res, 403, validation.error, "INVALID_SIGNATURE");
  }

  const { invitationId, currentStep, nextReminderAt, remindersSent, escalatedToUserId } = body;

  if (!invitationId || !currentStep) {
    return sendError(res, 400, "Missing invitationId or currentStep", "MISSING_PARAMS");
  }

  const prisma = getPrisma();

  const data = {
    currentStep,
    lastReminderAt: new Date(),
    n8nExecutionId: req.headers["x-n8n-execution-id"] || null
  };

  if (nextReminderAt) {
    data.nextReminderAt = new Date(nextReminderAt);
  }
  if (typeof remindersSent === "number") {
    data.remindersSent = remindersSent;
  }
  if (escalatedToUserId) {
    data.escalatedToUserId = escalatedToUserId;
    data.escalatedAt = new Date();
  }

  await prisma.invitationReminderState.upsert({
    where: { invitationId },
    create: {
      invitationId,
      ...data
    },
    update: data
  });

  await logN8nActivity(req, "REMINDER_STATE_UPDATED", "LP_INVITATION", invitationId, {
    currentStep,
    remindersSent
  });

  console.log(`[n8n] Reminder state updated: ${invitationId} -> ${currentStep}`);

  sendJson(res, 200, { success: true });
}

/**
 * POST /api/n8n/expire-invitation
 *
 * Marks invitation as expired after reminders exhausted.
 *
 * Body: { invitationId, reason? }
 */
export async function handleExpireInvitation(req, res, readJsonBody) {
  const body = await readJsonBody(req);

  const validation = validateN8nSignature(req, body);
  if (!validation.valid) {
    return sendError(res, 403, validation.error, "INVALID_SIGNATURE");
  }

  const { invitationId, reason } = body;

  if (!invitationId) {
    return sendError(res, 400, "Missing invitationId", "MISSING_PARAMS");
  }

  const prisma = getPrisma();

  // Update invitation status
  await prisma.lPInvitation.update({
    where: { id: invitationId },
    data: { status: "EXPIRED" }
  });

  // Update reminder state
  await prisma.invitationReminderState.update({
    where: { invitationId },
    data: {
      currentStep: "EXPIRED",
      expiredAt: new Date()
    }
  });

  await logN8nActivity(req, "INVITATION_EXPIRED", "LP_INVITATION", invitationId, {
    reason: reason || "No response after reminders"
  });

  // Emit webhook for tracking
  await emitLpWebhook("LP_INVITATION_EXPIRED", {
    invitationId,
    reason: reason || "No response after reminders"
  });

  console.log(`[n8n] Invitation expired: ${invitationId}`);

  sendJson(res, 200, { success: true });
}

/**
 * GET /api/n8n/invitations/:id/status
 *
 * Check if invitation has been accepted (for n8n polling).
 */
export async function handleCheckInvitationStatus(req, res, invitationId) {
  const validation = validateN8nSignatureForGet(req, invitationId);
  if (!validation.valid) {
    return sendError(res, 403, validation.error, "INVALID_SIGNATURE");
  }

  const prisma = getPrisma();

  const invitation = await prisma.lPInvitation.findUnique({
    where: { id: invitationId }
  });

  if (!invitation) {
    return sendError(res, 404, "Invitation not found", "NOT_FOUND");
  }

  sendJson(res, 200, {
    invitationId,
    status: invitation.status,
    accepted: invitation.status === "ACCEPTED",
    acceptedAt: invitation.acceptedAt?.toISOString() || null,
    expired: invitation.status === "EXPIRED",
    expiresAt: invitation.expiresAt?.toISOString() || null
  });
}

/**
 * GET /api/n8n/email-drafts
 *
 * List email drafts pending approval (for GP UI).
 * No n8n signature required - uses authUser.
 */
export async function handleListEmailDrafts(req, res, authUser, url) {
  if (!authUser || !["GP", "Admin"].includes(authUser.role)) {
    return sendError(res, 403, "GP or Admin role required", "FORBIDDEN_ROLE");
  }

  const searchParams = new URL(url, "http://localhost").searchParams;
  const status = searchParams.get("status") || "PENDING";
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);

  const prisma = getPrisma();

  const drafts = await prisma.emailDraft.findMany({
    where: { status },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      invitation: {
        select: {
          dealId: true,
          lpEntityName: true,
          lpEmail: true
        }
      }
    }
  });

  sendJson(res, 200, { drafts, count: drafts.length });
}

/**
 * GET /api/n8n/email-drafts/:id
 *
 * Get single email draft details (for GP preview).
 */
export async function handleGetEmailDraft(req, res, draftId, authUser) {
  if (!authUser || !["GP", "Admin"].includes(authUser.role)) {
    return sendError(res, 403, "GP or Admin role required", "FORBIDDEN_ROLE");
  }

  const prisma = getPrisma();

  const draft = await prisma.emailDraft.findUnique({
    where: { id: draftId },
    include: {
      invitation: {
        select: {
          dealId: true,
          lpEntityName: true,
          lpEmail: true,
          commitment: true,
          ownershipPct: true
        }
      }
    }
  });

  if (!draft) {
    return sendError(res, 404, "Draft not found", "NOT_FOUND");
  }

  sendJson(res, 200, { draft });
}

// ========== DISTRIBUTION WORKFLOW ENDPOINTS ==========

/**
 * GET /api/n8n/distributions/:id/details
 *
 * Get distribution details with allocations for n8n workflow.
 * Called by n8n after receiving DISTRIBUTION_APPROVED webhook.
 */
export async function handleGetDistributionDetails(req, res, distributionId) {
  const validation = validateN8nSignatureForGet(req, distributionId);
  if (!validation.valid) {
    return sendError(res, 403, validation.error, "INVALID_SIGNATURE");
  }

  const prisma = getPrisma();

  const distribution = await prisma.distribution.findUnique({
    where: { id: distributionId },
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
              shareClass: {
                select: { code: true, name: true }
              }
            }
          }
        }
      }
    }
  });

  if (!distribution) {
    return sendError(res, 404, "Distribution not found", "NOT_FOUND");
  }

  // Get deal name from store (deals are in store.json, not Prisma)
  let dealName = null;
  try {
    const { readStore } = await import("../store.js");
    const store = await readStore();
    const deal = store.dealIndex.find(d => d.id === distribution.dealId);
    dealName = deal?.name || deal?.propertyName || null;
  } catch {
    // Store not available, continue without deal name
  }

  await logN8nActivity(req, "DISTRIBUTION_DETAILS_FETCHED", "DISTRIBUTION", distributionId, {
    allocationsCount: distribution.allocations.length
  });

  sendJson(res, 200, {
    distribution: {
      id: distribution.id,
      dealId: distribution.dealId,
      dealName,
      title: distribution.title,
      description: distribution.description,
      totalAmount: distribution.totalAmount,
      distributionDate: distribution.distributionDate?.toISOString(),
      period: distribution.period,
      type: distribution.type,
      status: distribution.status,
      approvedAt: distribution.approvedAt?.toISOString(),
      approvedBy: distribution.approvedBy,
      approvedByName: distribution.approvedByName
    },
    allocations: distribution.allocations.map(a => ({
      id: a.id,
      lpActorId: a.lpActor.id,
      lpEntityName: a.lpActor.entityName,
      lpEmail: a.lpActor.email,
      lpCommitment: a.lpActor.commitment,
      lpOwnershipPct: a.lpActor.ownershipPct,
      shareClass: a.lpActor.shareClass?.code || null,
      grossAmount: a.grossAmount,
      withholdingAmount: a.withholdingAmount,
      netAmount: a.netAmount,
      paymentMethod: a.paymentMethod,
      status: a.status
    }))
  });
}

/**
 * GET /api/n8n/deals/:dealId/lp-actors
 *
 * Get all active LP actors for a deal.
 * Used by n8n workflows to send notifications to all LPs.
 */
export async function handleGetDealLPActors(req, res, dealId) {
  const validation = validateN8nSignatureForGet(req, dealId);
  if (!validation.valid) {
    return sendError(res, 403, validation.error, "INVALID_SIGNATURE");
  }

  const prisma = getPrisma();

  const lpActors = await prisma.lPActor.findMany({
    where: {
      dealId,
      status: "ACTIVE"
    },
    select: {
      id: true,
      entityName: true,
      email: true,
      commitment: true,
      ownershipPct: true,
      shareClass: {
        select: { code: true, name: true }
      }
    }
  });

  // Get deal name from store
  let dealName = null;
  try {
    const { readStore } = await import("../store.js");
    const store = await readStore();
    const deal = store.dealIndex.find(d => d.id === dealId);
    dealName = deal?.name || deal?.propertyName || null;
  } catch {
    // Store not available
  }

  await logN8nActivity(req, "LP_ACTORS_FETCHED", "DEAL", dealId, {
    count: lpActors.length
  });

  sendJson(res, 200, {
    dealId,
    dealName,
    lpActors: lpActors.map(lp => ({
      id: lp.id,
      entityName: lp.entityName,
      email: lp.email,
      commitment: lp.commitment,
      ownershipPct: lp.ownershipPct,
      shareClass: lp.shareClass?.code || null
    })),
    count: lpActors.length
  });
}

// ========== CAPITAL CALL WORKFLOW ENDPOINTS ==========

/**
 * GET /api/n8n/capital-calls/:id/details
 *
 * Get capital call details with allocations for n8n workflow.
 * Called by n8n after receiving CAPITAL_CALL_ISSUED webhook.
 */
export async function handleGetCapitalCallDetails(req, res, callId) {
  const validation = validateN8nSignatureForGet(req, callId);
  if (!validation.valid) {
    return sendError(res, 403, validation.error, "INVALID_SIGNATURE");
  }

  const prisma = getPrisma();

  const capitalCall = await prisma.capitalCall.findUnique({
    where: { id: callId },
    include: {
      allocations: {
        include: {
          lpActor: {
            select: {
              id: true,
              entityName: true,
              email: true,
              commitment: true,
              ownershipPct: true
            }
          }
        }
      }
    }
  });

  if (!capitalCall) {
    return sendError(res, 404, "Capital call not found", "NOT_FOUND");
  }

  // Get deal name from store
  let dealName = null;
  try {
    const { readStore } = await import("../store.js");
    const store = await readStore();
    const deal = store.dealIndex.find(d => d.id === capitalCall.dealId);
    dealName = deal?.name || deal?.propertyName || null;
  } catch {
    // Store not available
  }

  await logN8nActivity(req, "CAPITAL_CALL_DETAILS_FETCHED", "CAPITAL_CALL", callId, {
    allocationsCount: capitalCall.allocations.length
  });

  sendJson(res, 200, {
    capitalCall: {
      id: capitalCall.id,
      dealId: capitalCall.dealId,
      dealName,
      title: capitalCall.title,
      purpose: capitalCall.purpose,
      totalAmount: capitalCall.totalAmount,
      dueDate: capitalCall.dueDate?.toISOString(),
      status: capitalCall.status,
      issuedAt: capitalCall.issuedAt?.toISOString(),
      issuedBy: capitalCall.issuedBy,
      issuedByName: capitalCall.issuedByName
    },
    allocations: capitalCall.allocations.map(a => ({
      id: a.id,
      lpActorId: a.lpActor.id,
      lpEntityName: a.lpActor.entityName,
      lpEmail: a.lpActor.email,
      lpCommitment: a.lpActor.commitment,
      callAmount: a.amount,  // FIXED: was a.callAmount (undefined)
      fundedAmount: a.fundedAmount,
      status: a.status
    }))
  });
}

/**
 * GET /api/n8n/capital-calls/:id/unfunded
 *
 * Get unfunded allocations for capital call reminder workflow.
 */
export async function handleGetUnfundedAllocations(req, res, callId) {
  const validation = validateN8nSignatureForGet(req, callId);
  if (!validation.valid) {
    return sendError(res, 403, validation.error, "INVALID_SIGNATURE");
  }

  const prisma = getPrisma();

  const capitalCall = await prisma.capitalCall.findUnique({
    where: { id: callId },
    include: {
      allocations: {
        where: {
          status: { not: "FUNDED" }
        },
        include: {
          lpActor: {
            select: {
              id: true,
              entityName: true,
              email: true
            }
          }
        }
      }
    }
  });

  if (!capitalCall) {
    return sendError(res, 404, "Capital call not found", "NOT_FOUND");
  }

  // Get deal name
  let dealName = null;
  try {
    const { readStore } = await import("../store.js");
    const store = await readStore();
    const deal = store.dealIndex.find(d => d.id === capitalCall.dealId);
    dealName = deal?.name || deal?.propertyName || null;
  } catch {
    // Store not available
  }

  await logN8nActivity(req, "UNFUNDED_ALLOCATIONS_FETCHED", "CAPITAL_CALL", callId, {
    unfundedCount: capitalCall.allocations.length
  });

  sendJson(res, 200, {
    callId,
    dealId: capitalCall.dealId,
    dealName,
    title: capitalCall.title,
    dueDate: capitalCall.dueDate?.toISOString(),
    status: capitalCall.status,
    unfundedAllocations: capitalCall.allocations.map(a => ({
      id: a.id,
      lpActorId: a.lpActor.id,
      lpEntityName: a.lpActor.entityName,
      lpEmail: a.lpActor.email,
      callAmount: a.amount,  // FIXED: was a.callAmount (undefined)
      fundedAmount: a.fundedAmount,
      remainingAmount: a.amount - (a.fundedAmount || 0),  // FIXED: was a.callAmount
      status: a.status
    })),
    unfundedCount: capitalCall.allocations.length
  });
}

// ========== SCHEDULER MIGRATION ENDPOINTS ==========
// These endpoints support the n8n migration of Node-cron jobs.
// They provide stateless query and atomic mutation operations.

/**
 * GET /api/n8n/scheduler/deadline-scan
 *
 * Returns items that need deadline reminders (tasks, reviews, submissions).
 * This is a READ-ONLY endpoint - it does NOT create notifications.
 * The n8n workflow should call process-reminder for each item.
 */
export async function handleDeadlineScan(req, res) {
  const validation = validateN8nSignatureForGet(req, "deadline-scan");
  if (!validation.valid) {
    return sendError(res, 403, validation.error, "INVALID_SIGNATURE");
  }

  const prisma = getPrisma();
  const now = new Date();

  const results = {
    tasks: [],
    reviews: [],
    submissions: [],
    scannedAt: now.toISOString()
  };

  // 1. Find tasks due in 7, 3, or 1 days
  for (const daysAhead of [7, 3, 1]) {
    const targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + daysAhead);

    const dayStart = new Date(targetDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDate);
    dayEnd.setHours(23, 59, 59, 999);

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const tasks = await prisma.chatTask.findMany({
      where: {
        dueDate: { gte: dayStart, lte: dayEnd },
        status: { in: ["OPEN", "IN_PROGRESS"] },
        assigneeId: { not: null },
        OR: [
          { reminderSentAt: null },
          { reminderSentAt: { lt: todayStart } }
        ]
      },
      select: {
        id: true,
        title: true,
        description: true,
        dueDate: true,
        priority: true,
        assigneeId: true,
        assigneeName: true,
        dealId: true,
        createdById: true
      }
    });

    for (const task of tasks) {
      results.tasks.push({
        ...task,
        dueDate: task.dueDate?.toISOString(),
        daysAhead,
        reminderType: "task_reminder"
      });
    }
  }

  // 2. Find pending reviews older than 2 days
  const twoDaysAgo = new Date(now);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

  const pendingReviews = await prisma.reviewRequest.findMany({
    where: {
      status: "pending",
      requestedAt: { lt: twoDaysAgo }
    },
    select: {
      id: true,
      dealId: true,
      requestedByName: true,
      requestedAt: true
    }
  });

  // Check which reviews don't have recent reminders
  for (const review of pendingReviews) {
    const existingReminder = await prisma.notification.findFirst({
      where: {
        type: "review_reminder",
        reviewRequestId: review.id,
        createdAt: { gt: twoDaysAgo }
      }
    });

    if (!existingReminder) {
      results.reviews.push({
        ...review,
        requestedAt: review.requestedAt?.toISOString(),
        reminderType: "review_reminder"
      });
    }
  }

  // 3. Find pending submissions older than 5 days
  const fiveDaysAgo = new Date(now);
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

  const pendingSubmissions = await prisma.dealSubmission.findMany({
    where: {
      status: "PENDING",
      submittedAt: { lt: fiveDaysAgo }
    },
    select: {
      id: true,
      dealId: true,
      submittedByUserId: true,
      recipientName: true,
      recipientEmail: true,
      submittedAt: true
    }
  });

  // Check which submissions don't have recent reminders
  for (const submission of pendingSubmissions) {
    const existingReminder = await prisma.notification.findFirst({
      where: {
        type: "submission_reminder",
        dealId: submission.dealId,
        createdAt: { gt: fiveDaysAgo }
      }
    });

    if (!existingReminder) {
      results.submissions.push({
        ...submission,
        submittedAt: submission.submittedAt?.toISOString(),
        reminderType: "submission_reminder"
      });
    }
  }

  await logN8nActivity(req, "DEADLINE_SCAN", "SCHEDULER", "n8n", {
    tasksFound: results.tasks.length,
    reviewsFound: results.reviews.length,
    submissionsFound: results.submissions.length
  });

  sendJson(res, 200, results);
}

/**
 * GET /api/n8n/scheduler/escalation-scan
 *
 * Returns overdue tasks that need escalation.
 * READ-ONLY - n8n should call process-escalation for each.
 */
export async function handleEscalationScan(req, res) {
  const validation = validateN8nSignatureForGet(req, "escalation-scan");
  if (!validation.valid) {
    return sendError(res, 403, validation.error, "INVALID_SIGNATURE");
  }

  const prisma = getPrisma();
  const now = new Date();

  const overdueTasks = await prisma.chatTask.findMany({
    where: {
      dueDate: { lt: now },
      status: { in: ["OPEN", "IN_PROGRESS"] },
      escalatedAt: null
    },
    select: {
      id: true,
      title: true,
      description: true,
      dueDate: true,
      priority: true,
      assigneeId: true,
      assigneeName: true,
      dealId: true,
      createdById: true
    }
  });

  const results = overdueTasks.map(task => {
    const daysOverdue = Math.floor((now.getTime() - task.dueDate.getTime()) / (1000 * 60 * 60 * 24));
    return {
      ...task,
      dueDate: task.dueDate?.toISOString(),
      daysOverdue,
      needsLevel1: daysOverdue >= 2,
      needsLevel2: daysOverdue >= 5
    };
  });

  await logN8nActivity(req, "ESCALATION_SCAN", "SCHEDULER", "n8n", {
    overdueTasksFound: results.length
  });

  sendJson(res, 200, {
    overdueTasks: results,
    count: results.length,
    scannedAt: now.toISOString()
  });
}

/**
 * GET /api/n8n/scheduler/snooze-scan
 *
 * Returns notifications with expired snoozes.
 * READ-ONLY - n8n should call process-snooze-expiry for each.
 */
export async function handleSnoozeScan(req, res) {
  const validation = validateN8nSignatureForGet(req, "snooze-scan");
  if (!validation.valid) {
    return sendError(res, 403, validation.error, "INVALID_SIGNATURE");
  }

  const prisma = getPrisma();
  const now = new Date();

  // NOTE: No isRead filter - we process ALL expired snoozes
  // (Bug fix from original Node-cron implementation)
  const expiredSnoozes = await prisma.notification.findMany({
    where: {
      snoozedUntil: { lte: now }
    },
    select: {
      id: true,
      userId: true,
      type: true,
      title: true,
      body: true,
      dealId: true,
      taskId: true,
      actionUrl: true,
      reminderCount: true,
      isRead: true
    }
  });

  await logN8nActivity(req, "SNOOZE_SCAN", "SCHEDULER", "n8n", {
    expiredSnoozesFound: expiredSnoozes.length
  });

  sendJson(res, 200, {
    expiredSnoozes,
    count: expiredSnoozes.length,
    scannedAt: now.toISOString()
  });
}

/**
 * POST /api/n8n/scheduler/process-reminder
 *
 * Process a single reminder (create notification + send email).
 * This is an ATOMIC operation - all or nothing.
 *
 * Body: { type, itemId, daysAhead?, dealId?, assigneeId?, title?, ... }
 */
export async function handleProcessReminder(req, res, readJsonBody) {
  const body = await readJsonBody(req);

  const validation = validateN8nSignature(req, body);
  if (!validation.valid) {
    return sendError(res, 403, validation.error, "INVALID_SIGNATURE");
  }

  const { type, itemId, daysAhead, dealId, assigneeId, title } = body;

  if (!type || !itemId) {
    return sendError(res, 400, "Missing type or itemId", "MISSING_PARAMS");
  }

  const prisma = getPrisma();

  try {
    // Use transaction for atomicity
    const result = await prisma.$transaction(async (tx) => {
      let notification;

      if (type === "task_reminder") {
        const dueLabel = daysAhead === 1 ? "tomorrow" : `in ${daysAhead} days`;

        notification = await tx.notification.create({
          data: {
            userId: assigneeId,
            type: "task_reminder",
            title: `Task due ${dueLabel}`,
            body: title,
            taskId: itemId,
            dealId: dealId || null,
            deadlineAt: body.dueDate ? new Date(body.dueDate) : null,
            actionUrl: dealId ? `/DealOverview?id=${dealId}` : "/Tasks"
          }
        });

        // Update task reminder tracking
        await tx.chatTask.update({
          where: { id: itemId },
          data: { reminderSentAt: new Date() }
        });
      } else if (type === "review_reminder") {
        notification = await tx.notification.create({
          data: {
            userId: "gp-team",
            type: "review_reminder",
            title: "Review request pending",
            body: `Review requested by ${body.requestedByName || "Analyst"} is awaiting response`,
            reviewRequestId: itemId,
            dealId: dealId || null,
            actionUrl: dealId ? `/DealOverview?id=${dealId}` : null
          }
        });
      } else if (type === "submission_reminder") {
        notification = await tx.notification.create({
          data: {
            userId: body.submittedByUserId,
            type: "submission_reminder",
            title: "Deal submission awaiting response",
            body: `Your submission to ${body.recipientName || body.recipientEmail} has not received a response`,
            dealId: dealId || null,
            actionUrl: dealId ? `/DealOverview?id=${dealId}` : null
          }
        });
      } else {
        throw new Error(`Unknown reminder type: ${type}`);
      }

      return notification;
    });

    // Get user preferences for email (outside transaction)
    const userId = result.userId;
    if (userId && userId !== "gp-team") {
      const prefs = await prisma.notificationPreference.findUnique({
        where: { userId }
      });

      if (prefs?.emailEnabled !== false) {
        // Send email - but don't fail if email fails
        try {
          await sendEmail({
            to: userId,
            subject: result.title,
            text: result.body || "",
            html: `<p>${result.body || ""}</p>`,
            metadata: {
              event: `N8N_${type.toUpperCase()}`,
              itemId,
              notificationId: result.id
            }
          });
        } catch (emailError) {
          console.error(`[n8n] Email failed for ${type} ${itemId}:`, emailError.message);
        }
      }
    }

    await logN8nActivity(req, "REMINDER_PROCESSED", "SCHEDULER", itemId, {
      type,
      notificationId: result.id
    });

    sendJson(res, 201, {
      success: true,
      notificationId: result.id,
      type
    });
  } catch (error) {
    console.error(`[n8n] Failed to process reminder ${type} ${itemId}:`, error);
    sendError(res, 500, error.message, "PROCESSING_FAILED");
  }
}

/**
 * POST /api/n8n/scheduler/process-escalation
 *
 * Process a single task escalation (create notification + update task + send email).
 * ATOMIC operation.
 *
 * Body: { taskId, level, escalateToUserId, daysOverdue, title?, ... }
 */
export async function handleProcessEscalation(req, res, readJsonBody) {
  const body = await readJsonBody(req);

  const validation = validateN8nSignature(req, body);
  if (!validation.valid) {
    return sendError(res, 403, validation.error, "INVALID_SIGNATURE");
  }

  const { taskId, level, escalateToUserId, daysOverdue } = body;

  if (!taskId || !level || !escalateToUserId) {
    return sendError(res, 400, "Missing taskId, level, or escalateToUserId", "MISSING_PARAMS");
  }

  const prisma = getPrisma();

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Verify task exists and hasn't been escalated yet
      const task = await tx.chatTask.findUnique({
        where: { id: taskId }
      });

      if (!task) {
        throw new Error("Task not found");
      }

      if (task.escalatedAt) {
        throw new Error("Task already escalated");
      }

      // Create escalation notification
      const notification = await tx.notification.create({
        data: {
          userId: escalateToUserId,
          type: "task_escalated",
          title: `[Escalated] Task overdue: ${task.title}`,
          body: `Task assigned to ${task.assigneeName || "team member"} is ${daysOverdue || "multiple"} days overdue`,
          taskId: task.id,
          dealId: task.dealId,
          escalationLevel: level,
          deadlineAt: task.dueDate,
          actionUrl: task.dealId ? `/DealOverview?id=${task.dealId}` : "/Tasks"
        }
      });

      // Update task
      await tx.chatTask.update({
        where: { id: taskId },
        data: {
          escalatedAt: new Date(),
          escalatedToUserId
        }
      });

      return { notification, task };
    });

    // Send escalation email (outside transaction)
    const prefs = await prisma.notificationPreference.findUnique({
      where: { userId: escalateToUserId }
    });

    if (prefs?.emailEnabled !== false) {
      try {
        await sendEmail({
          to: escalateToUserId,
          subject: `[Escalated] Task overdue: "${result.task.title}"`,
          text: `Task assigned to ${result.task.assigneeName || "team member"} is ${daysOverdue || "multiple"} days overdue.`,
          html: `<div style="font-family: sans-serif;">
            <h2 style="color: #dc2626;">[Escalated] Task Overdue</h2>
            <p>Task: <strong>${result.task.title}</strong></p>
            <p>Assignee: ${result.task.assigneeName || "Unknown"}</p>
            <p style="color: #dc2626;">Overdue by ${daysOverdue || "multiple"} days</p>
          </div>`,
          metadata: {
            event: "N8N_TASK_ESCALATED",
            taskId,
            level
          }
        });
      } catch (emailError) {
        console.error(`[n8n] Escalation email failed for task ${taskId}:`, emailError.message);
      }
    }

    await logN8nActivity(req, "ESCALATION_PROCESSED", "SCHEDULER", taskId, {
      level,
      escalateToUserId,
      notificationId: result.notification.id
    });

    sendJson(res, 201, {
      success: true,
      notificationId: result.notification.id,
      level
    });
  } catch (error) {
    console.error(`[n8n] Failed to process escalation for task ${taskId}:`, error);
    sendError(res, 500, error.message, "PROCESSING_FAILED");
  }
}

/**
 * POST /api/n8n/scheduler/process-snooze-expiry
 *
 * Process a single snooze expiry (clear snooze + send email).
 * ATOMIC operation.
 *
 * Body: { notificationId }
 */
export async function handleProcessSnoozeExpiry(req, res, readJsonBody) {
  const body = await readJsonBody(req);

  const validation = validateN8nSignature(req, body);
  if (!validation.valid) {
    return sendError(res, 403, validation.error, "INVALID_SIGNATURE");
  }

  const { notificationId } = body;

  if (!notificationId) {
    return sendError(res, 400, "Missing notificationId", "MISSING_PARAMS");
  }

  const prisma = getPrisma();

  try {
    const notification = await prisma.notification.update({
      where: { id: notificationId },
      data: {
        snoozedUntil: null,
        reminderCount: { increment: 1 },
        lastReminderAt: new Date()
      }
    });

    // Send snooze expired email
    const prefs = await prisma.notificationPreference.findUnique({
      where: { userId: notification.userId }
    });

    let emailSent = false;
    if (prefs?.emailEnabled !== false) {
      try {
        await sendEmail({
          to: notification.userId,
          subject: `Reminder: ${notification.title}`,
          text: `Your snoozed reminder is back:\n\n${notification.title}\n${notification.body || ""}`,
          html: `<div style="font-family: sans-serif;">
            <h2>Snoozed Reminder</h2>
            <p>Your snoozed reminder is back:</p>
            <div style="background: #f5f5f5; padding: 16px; border-radius: 8px;">
              <p><strong>${notification.title}</strong></p>
              ${notification.body ? `<p>${notification.body}</p>` : ""}
            </div>
          </div>`,
          metadata: {
            event: "N8N_SNOOZE_EXPIRED",
            notificationId
          }
        });
        emailSent = true;
      } catch (emailError) {
        console.error(`[n8n] Snooze email failed for notification ${notificationId}:`, emailError.message);
      }
    }

    await logN8nActivity(req, "SNOOZE_EXPIRY_PROCESSED", "SCHEDULER", notificationId, {
      userId: notification.userId,
      emailSent
    });

    sendJson(res, 200, {
      success: true,
      notificationId,
      emailSent,
      reminderCount: notification.reminderCount + 1
    });
  } catch (error) {
    console.error(`[n8n] Failed to process snooze expiry for ${notificationId}:`, error);
    sendError(res, 500, error.message, "PROCESSING_FAILED");
  }
}

/**
 * POST /api/n8n/scheduler/log-completion
 *
 * Log scheduler run completion from n8n workflow.
 * Used for parallel run comparison with Node-cron.
 *
 * Body: { jobType, runId, results, durationMs }
 */
export async function handleLogSchedulerCompletion(req, res, readJsonBody) {
  const body = await readJsonBody(req);

  const validation = validateN8nSignature(req, body);
  if (!validation.valid) {
    return sendError(res, 403, validation.error, "INVALID_SIGNATURE");
  }

  const { jobType, runId, results, durationMs, error } = body;

  if (!jobType || !runId) {
    return sendError(res, 400, "Missing jobType or runId", "MISSING_PARAMS");
  }

  const prisma = getPrisma();

  try {
    await prisma.schedulerLog.create({
      data: {
        runId,
        jobType,
        source: "N8N",
        results: results ? JSON.stringify(results) : null,
        error: error || null,
        itemsProcessed: results?.itemsProcessed || 0,
        durationMs: durationMs || null
      }
    });

    sendJson(res, 201, { success: true, runId });
  } catch (err) {
    console.error(`[n8n] Failed to log scheduler completion:`, err);
    sendError(res, 500, err.message, "LOG_FAILED");
  }
}
