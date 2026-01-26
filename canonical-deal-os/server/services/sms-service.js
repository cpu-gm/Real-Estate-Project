/**
 * Twilio SMS Service
 *
 * Sends SMS notifications via Twilio for:
 * - Urgent LP invitation reminders (day 14)
 * - GP escalation alerts
 * - Capital call payment reminders
 *
 * All SMS are logged to the SmsLog table for audit trail.
 */

import { getPrisma } from "../db.js";

const TWILIO_ACCOUNT_SID = process.env.BFF_TWILIO_ACCOUNT_SID?.trim();
const TWILIO_AUTH_TOKEN = process.env.BFF_TWILIO_AUTH_TOKEN?.trim();
const TWILIO_PHONE_NUMBER = process.env.BFF_TWILIO_PHONE_NUMBER?.trim();
const PUBLIC_BASE_URL = process.env.BFF_PUBLIC_URL || "http://localhost:8787";

// Lazy-loaded Twilio client
let twilioClient = null;

/**
 * Get or create Twilio client
 */
async function getTwilioClient() {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    return null;
  }

  if (!twilioClient) {
    try {
      // Dynamic import to avoid requiring twilio if not configured
      const twilio = await import("twilio");
      twilioClient = twilio.default(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    } catch (err) {
      console.error("[SMS] Failed to initialize Twilio client:", err.message);
      return null;
    }
  }

  return twilioClient;
}

/**
 * Check if SMS sending is enabled
 */
export function isSmsEnabled() {
  return !!TWILIO_ACCOUNT_SID && !!TWILIO_AUTH_TOKEN && !!TWILIO_PHONE_NUMBER;
}

/**
 * Send SMS via Twilio
 *
 * @param {Object} params
 * @param {string} params.to - Recipient phone number (E.164 format: +1234567890)
 * @param {string} params.body - Message content
 * @param {string} [params.invitationId] - Related invitation ID (for tracking)
 * @param {string} [params.dealId] - Related deal ID (for tracking)
 * @param {string} [params.messageType] - Type: REMINDER, ESCALATION, ALERT
 * @param {string} [params.recipientName] - Recipient name (for logging)
 */
export async function sendSms({
  to,
  body,
  invitationId,
  dealId,
  messageType = "REMINDER",
  recipientName
}) {
  const client = await getTwilioClient();

  if (!client || !TWILIO_PHONE_NUMBER) {
    console.log("[SMS] Twilio not configured, skipping send");
    return { sent: false, reason: "not_configured" };
  }

  // Validate phone number format
  if (!to || !to.match(/^\+[1-9]\d{1,14}$/)) {
    console.error("[SMS] Invalid phone number format:", to);
    return { sent: false, reason: "invalid_phone", error: "Phone must be E.164 format" };
  }

  const prisma = getPrisma();

  // Create log entry before sending
  const logEntry = await prisma.smsLog.create({
    data: {
      invitationId: invitationId || null,
      dealId: dealId || null,
      recipientPhone: to,
      recipientName: recipientName || null,
      messageType,
      body,
      status: "QUEUED"
    }
  });

  try {
    const message = await client.messages.create({
      body,
      from: TWILIO_PHONE_NUMBER,
      to,
      statusCallback: `${PUBLIC_BASE_URL}/api/webhooks/twilio/status`
    });

    await prisma.smsLog.update({
      where: { id: logEntry.id },
      data: {
        twilioSid: message.sid,
        status: "SENT",
        sentAt: new Date()
      }
    });

    console.log(`[SMS] Sent to ${to}: ${message.sid}`);
    return { sent: true, sid: message.sid, logId: logEntry.id };
  } catch (error) {
    await prisma.smsLog.update({
      where: { id: logEntry.id },
      data: {
        status: "FAILED",
        errorCode: error.code?.toString() || null,
        errorMessage: error.message
      }
    });

    console.error("[SMS] Send failed:", error.message);
    return {
      sent: false,
      reason: "error",
      error: error.message,
      code: error.code,
      logId: logEntry.id
    };
  }
}

/**
 * Send LP reminder SMS
 */
export async function sendLpReminderSms({
  to,
  lpName,
  dealName,
  invitationId,
  dealId,
  daysRemaining
}) {
  const body = `Hi ${lpName || "Investor"}, reminder: Your invitation to ${dealName || "a deal"} expires in ${daysRemaining} day(s). Please respond at your earliest convenience. - Canonical Deal OS`;

  return sendSms({
    to,
    body,
    invitationId,
    dealId,
    messageType: "REMINDER",
    recipientName: lpName
  });
}

/**
 * Send GP escalation SMS
 */
export async function sendGpEscalationSms({
  to,
  gpName,
  lpName,
  dealName,
  invitationId,
  dealId
}) {
  const body = `[Action Required] ${lpName || "An LP"} has not responded to their ${dealName || "deal"} invitation after 14 days. Please follow up personally. - Canonical Deal OS`;

  return sendSms({
    to,
    body,
    invitationId,
    dealId,
    messageType: "ESCALATION",
    recipientName: gpName
  });
}

/**
 * Handle Twilio status callback webhook
 *
 * Called by Twilio when message status changes.
 */
export async function handleTwilioStatusCallback(req, res, readJsonBody) {
  let body;
  try {
    // Twilio sends form-urlencoded, but we'll handle both
    const contentType = req.headers["content-type"] || "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      // Parse form data manually
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const data = Buffer.concat(chunks).toString();
      body = Object.fromEntries(new URLSearchParams(data));
    } else {
      body = await readJsonBody(req);
    }
  } catch (err) {
    console.error("[SMS] Failed to parse Twilio callback:", err.message);
    res.writeHead(200);
    res.end();
    return;
  }

  const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = body;

  if (!MessageSid) {
    res.writeHead(200);
    res.end();
    return;
  }

  const prisma = getPrisma();

  const updateData = {
    status: MessageStatus?.toUpperCase() || "UNKNOWN"
  };

  if (MessageStatus === "delivered") {
    updateData.deliveredAt = new Date();
  }

  if (ErrorCode) {
    updateData.errorCode = ErrorCode.toString();
    updateData.errorMessage = ErrorMessage || null;
  }

  try {
    await prisma.smsLog.updateMany({
      where: { twilioSid: MessageSid },
      data: updateData
    });

    console.log(`[SMS] Status update: ${MessageSid} -> ${MessageStatus}`);
  } catch (err) {
    console.error("[SMS] Failed to update status:", err.message);
  }

  res.writeHead(200);
  res.end();
}

/**
 * n8n callback endpoint for sending SMS
 *
 * POST /api/n8n/send-sms
 * Body: { to, body, invitationId?, dealId?, messageType?, recipientName? }
 */
export async function handleN8nSendSms(req, res, readJsonBody, validateSignature) {
  const body = await readJsonBody(req);

  // Validate n8n signature
  const validation = validateSignature(req, body);
  if (!validation.valid) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: validation.error, code: "INVALID_SIGNATURE" }));
    return;
  }

  const { to, body: messageBody, invitationId, dealId, messageType, recipientName } = body;

  if (!to || !messageBody) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing 'to' or 'body'", code: "MISSING_PARAMS" }));
    return;
  }

  const result = await sendSms({
    to,
    body: messageBody,
    invitationId,
    dealId,
    messageType,
    recipientName
  });

  res.writeHead(result.sent ? 200 : 500, { "Content-Type": "application/json" });
  res.end(JSON.stringify(result));
}
