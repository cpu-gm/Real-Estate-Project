import { PrismaClient } from '@prisma/client';
import {
  generateMagicLinkToken,
  validateMagicLinkToken,
  revokeToken,
  getActiveTokensForDeal
} from '../services/magic-link-service.js';
import { checkRateLimit, logSecurityEvent } from '../services/rate-limiter.js';
import { kernelFetchJson } from '../kernel.js';
import { CreateMagicLinkSchema } from '../middleware/route-schemas.js';
import { createValidationLogger } from '../services/validation-logger.js';

const prisma = new PrismaClient();
const KERNEL_BASE_URL = process.env.KERNEL_API_URL || 'http://localhost:3001';

// Structured logging
function log(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${timestamp}] [${level}] [MAGIC-LINKS] ${message}${metaStr}`);
}

// Helper to send JSON response with CORS
function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, error) {
  sendJson(res, status, { error });
}

/**
 * Generate a new magic link
 * POST /api/magic-links
 *
 * T1.2 (P1 Security Sprint): Now requires authentication and org isolation
 * - authUser is passed from dispatch (validated JWT identity)
 * - Verifies deal belongs to user's organization before creating link
 * - Returns 404 (not 403) to hide deal existence in other orgs
 */
export async function handleCreateMagicLink(req, res, readJsonBody, authUser) {
  try {
    // T1.2: Require authentication
    if (!authUser) {
      log('WARN', 'Unauthenticated magic link creation attempt');
      return sendError(res, 401, 'Authentication required');
    }

    // Rate limiting for magic link creation (T1.4)
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
               req.socket?.remoteAddress ||
               "unknown";

    const rateLimitResult = await checkRateLimit(`${authUser.id}:${ip}`, 'magic-links:create');
    if (!rateLimitResult.allowed) {
      log('WARN', 'Rate limit exceeded for magic link creation', {
        userId: authUser.id,
        ip,
        attempts: rateLimitResult.attempts
      });
      res.setHeader("Retry-After", rateLimitResult.retryAfterSeconds);
      return sendJson(res, 429, {
        error: 'Too many magic link creation attempts',
        message: `Please try again in ${rateLimitResult.retryAfterSeconds} seconds`,
        retryAfterSeconds: rateLimitResult.retryAfterSeconds
      });
    }

    const validationLog = createValidationLogger('handleCreateMagicLink');
    const rawBody = await readJsonBody(req);
    validationLog.beforeValidation(rawBody);

    // Validate with Zod schema
    const parseResult = CreateMagicLinkSchema.safeParse(rawBody ?? {});
    if (!parseResult.success) {
      validationLog.validationFailed(parseResult.error.errors);
      return sendJson(res, 400, {
        error: 'Validation failed',
        code: 'VALIDATION_FAILED',
        errors: parseResult.error.errors
      });
    }

    const body = parseResult.data;
    validationLog.afterValidation(body);

    const {
      dealId,
      recipientEmail,
      recipientName,
      recipientRole,
      actionType,
      expiresInDays
    } = body;

    // T1.2: Organization isolation - verify deal belongs to user's org
    // Return 404 (not 403) to hide deal existence in other orgs
    let deal;
    try {
      deal = await kernelFetchJson(`${KERNEL_BASE_URL}/deals/${dealId}`);
    } catch (error) {
      // Deal doesn't exist at all
      log('WARN', 'Magic link creation for non-existent deal', {
        dealId,
        userId: authUser.id,
        ip
      });
      return sendError(res, 404, 'Deal not found');
    }

    // Check organization isolation
    if (deal.organizationId && deal.organizationId !== authUser.organizationId) {
      log('WARN', 'Cross-org magic link creation attempt blocked', {
        dealId,
        dealOrgId: deal.organizationId,
        userOrgId: authUser.organizationId,
        userId: authUser.id,
        ip
      });

      // Log security event for cross-org access attempt
      await logSecurityEvent({
        type: 'CROSS_ORG_ACCESS_BLOCKED',
        identifier: authUser.id,
        endpoint: 'magic-links:create',
        allowed: false,
        actorId: authUser.id,
        dealId,
        ipAddress: ip,
        userAgent: req.headers["user-agent"],
        metadata: {
          dealOrgId: deal.organizationId,
          userOrgId: authUser.organizationId,
          action: 'create_magic_link'
        }
      });

      // T1.2: Return 404 (not 403) to hide that deal exists in another org
      return sendError(res, 404, 'Deal not found');
    }

    // Create the magic link
    const result = await generateMagicLinkToken({
      dealId,
      recipientEmail,
      recipientName,
      recipientRole: recipientRole.toUpperCase(),
      actionType,
      createdByUserId: authUser.id,  // Use validated authUser.id, not header
      expiresInDays
    });

    // Log successful magic link creation
    await logSecurityEvent({
      type: 'MAGIC_LINK_CREATED',
      identifier: recipientEmail,
      endpoint: 'magic-links:create',
      allowed: true,
      actorId: authUser.id,
      dealId,
      ipAddress: ip,
      userAgent: req.headers["user-agent"],
      metadata: {
        recipientRole: recipientRole.toUpperCase(),
        expiresInDays,
        tokenId: result.tokenRecord.id
      }
    });

    log('INFO', 'Magic link created successfully', {
      tokenId: result.tokenRecord.id,
      dealId,
      recipientEmail,
      recipientRole: recipientRole.toUpperCase(),
      createdBy: authUser.id
    });

    return sendJson(res, 201, {
      id: result.tokenRecord.id,
      magicLink: result.magicLink,
      expiresAt: result.tokenRecord.expiresAt,
      recipientEmail,
      recipientRole: recipientRole.toUpperCase()
    });
  } catch (error) {
    console.error('Error creating magic link:', error);
    return sendError(res, 500, 'Failed to create magic link');
  }
}

/**
 * Validate a magic link token
 * GET /api/magic-links/:token/validate
 *
 * Note: This endpoint is public - it's how external parties (lenders, counsel)
 * validate their access token. Rate limiting applied to prevent enumeration.
 */
export async function handleValidateMagicLink(req, res, token) {
  try {
    // Rate limiting for magic link validation (T1.4)
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
               req.socket?.remoteAddress ||
               "unknown";

    const rateLimitResult = await checkRateLimit(`${token}:${ip}`, 'magic-links:validate');
    if (!rateLimitResult.allowed) {
      log('WARN', 'Rate limit exceeded for magic link validation', {
        token: token.substring(0, 8) + '...',
        ip,
        attempts: rateLimitResult.attempts
      });
      res.setHeader("Retry-After", rateLimitResult.retryAfterSeconds);
      return sendJson(res, 429, {
        error: 'Too many validation attempts',
        message: `Please try again in ${rateLimitResult.retryAfterSeconds} seconds`,
        retryAfterSeconds: rateLimitResult.retryAfterSeconds
      });
    }

    const result = await validateMagicLinkToken(token);

    if (!result.valid) {
      // Log failed validation attempt
      await logSecurityEvent({
        type: 'MAGIC_LINK_VALIDATION_FAILED',
        identifier: token.substring(0, 16) + '...',
        endpoint: 'magic-links:validate',
        allowed: false,
        ipAddress: ip,
        userAgent: req.headers["user-agent"],
        metadata: { error: result.error }
      });

      return sendJson(res, 401, {
        valid: false,
        error: result.error
      });
    }

    // Log successful validation
    await logSecurityEvent({
      type: 'MAGIC_LINK_VALIDATED',
      identifier: result.payload.recipientEmail,
      endpoint: 'magic-links:validate',
      allowed: true,
      dealId: result.payload.dealId,
      ipAddress: ip,
      userAgent: req.headers["user-agent"],
      metadata: { recipientRole: result.payload.recipientRole }
    });

    return sendJson(res, 200, {
      valid: true,
      dealId: result.payload.dealId,
      recipientEmail: result.payload.recipientEmail,
      recipientRole: result.payload.recipientRole,
      actionType: result.payload.actionType,
      expiresAt: result.tokenRecord.expiresAt
    });
  } catch (error) {
    console.error('Error validating magic link:', error);
    return sendError(res, 500, 'Failed to validate magic link');
  }
}

/**
 * Revoke a magic link
 * POST /api/magic-links/:id/revoke
 *
 * T1.2/T1.3 (P1 Security Sprint): Now requires authentication and org isolation
 * - authUser is passed from dispatch (validated JWT identity)
 * - Verifies the magic link's deal belongs to user's organization
 */
export async function handleRevokeMagicLink(req, res, tokenId, authUser) {
  try {
    // T1.2: Require authentication
    if (!authUser) {
      log('WARN', 'Unauthenticated magic link revocation attempt');
      return sendError(res, 401, 'Authentication required');
    }

    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
               req.socket?.remoteAddress ||
               "unknown";

    // Check if token exists
    const token = await prisma.magicLinkToken.findUnique({
      where: { id: tokenId }
    });

    if (!token) {
      return sendError(res, 404, 'Token not found');
    }

    // T1.2: Organization isolation - verify the deal belongs to user's org
    let deal;
    try {
      deal = await kernelFetchJson(`${KERNEL_BASE_URL}/deals/${token.dealId}`);
    } catch (error) {
      // Deal no longer exists, allow revocation anyway
      log('WARN', 'Revoking magic link for deleted deal', { tokenId, dealId: token.dealId });
    }

    if (deal && deal.organizationId && deal.organizationId !== authUser.organizationId) {
      log('WARN', 'Cross-org magic link revocation attempt blocked', {
        tokenId,
        dealId: token.dealId,
        dealOrgId: deal.organizationId,
        userOrgId: authUser.organizationId,
        userId: authUser.id,
        ip
      });

      // Log security event
      await logSecurityEvent({
        type: 'CROSS_ORG_ACCESS_BLOCKED',
        identifier: authUser.id,
        endpoint: 'magic-links:revoke',
        allowed: false,
        actorId: authUser.id,
        dealId: token.dealId,
        ipAddress: ip,
        userAgent: req.headers["user-agent"],
        metadata: {
          dealOrgId: deal.organizationId,
          userOrgId: authUser.organizationId,
          action: 'revoke_magic_link',
          tokenId
        }
      });

      // Return 404 to hide existence
      return sendError(res, 404, 'Token not found');
    }

    await revokeToken(tokenId);

    // Log successful revocation
    await logSecurityEvent({
      type: 'MAGIC_LINK_REVOKED',
      identifier: token.recipientEmail,
      endpoint: 'magic-links:revoke',
      allowed: true,
      actorId: authUser.id,
      dealId: token.dealId,
      ipAddress: ip,
      userAgent: req.headers["user-agent"],
      metadata: { tokenId, recipientRole: token.recipientRole }
    });

    log('INFO', 'Magic link revoked', {
      tokenId,
      dealId: token.dealId,
      revokedBy: authUser.id
    });

    return sendJson(res, 200, {
      id: tokenId,
      status: 'REVOKED',
      message: 'Magic link has been revoked'
    });
  } catch (error) {
    console.error('Error revoking magic link:', error);
    return sendError(res, 500, 'Failed to revoke magic link');
  }
}

/**
 * List active magic links for a deal
 * GET /api/deals/:dealId/magic-links
 *
 * T1.2/T1.3 (P1 Security Sprint): Now requires authentication and org isolation
 * - authUser is passed from dispatch (validated JWT identity)
 * - Verifies deal belongs to user's organization
 */
export async function handleListDealMagicLinks(req, res, dealId, authUser) {
  try {
    // T1.2: Require authentication
    if (!authUser) {
      log('WARN', 'Unauthenticated magic link list attempt');
      return sendError(res, 401, 'Authentication required');
    }

    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
               req.socket?.remoteAddress ||
               "unknown";

    // T1.2: Organization isolation - verify deal belongs to user's org
    let deal;
    try {
      deal = await kernelFetchJson(`${KERNEL_BASE_URL}/deals/${dealId}`);
    } catch (error) {
      return sendError(res, 404, 'Deal not found');
    }

    if (deal.organizationId && deal.organizationId !== authUser.organizationId) {
      log('WARN', 'Cross-org magic link list attempt blocked', {
        dealId,
        dealOrgId: deal.organizationId,
        userOrgId: authUser.organizationId,
        userId: authUser.id,
        ip
      });

      // Log security event
      await logSecurityEvent({
        type: 'CROSS_ORG_ACCESS_BLOCKED',
        identifier: authUser.id,
        endpoint: 'magic-links:list',
        allowed: false,
        actorId: authUser.id,
        dealId,
        ipAddress: ip,
        userAgent: req.headers["user-agent"],
        metadata: {
          dealOrgId: deal.organizationId,
          userOrgId: authUser.organizationId,
          action: 'list_magic_links'
        }
      });

      // Return 404 to hide existence
      return sendError(res, 404, 'Deal not found');
    }

    const tokens = await getActiveTokensForDeal(dealId);

    return sendJson(res, 200, {
      tokens: tokens.map(t => ({
        id: t.id,
        recipientEmail: t.recipientEmail,
        recipientName: t.recipientName,
        recipientRole: t.recipientRole,
        actionType: t.actionType,
        status: t.status,
        createdAt: t.createdAt,
        expiresAt: t.expiresAt
      }))
    });
  } catch (error) {
    console.error('Error listing magic links:', error);
    return sendError(res, 500, 'Failed to list magic links');
  }
}
