import { extractAuthUser } from "../routes/auth.js";
import { getPrisma } from "../db.js";
import { ApiError } from "../lib/api-error.js";

// Consistent CORS headers (must match server/index.js)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-User-Id, X-Canonical-User-Id, X-Actor-Role, X-Idempotency-Key",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS"
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders
  });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message, details = null) {
  sendJson(res, status, { message, details });
}

// ========== THROWING VERSIONS (for use with withErrorHandling) ==========

/**
 * Require authenticated user - THROWS ApiError on failure
 * Use with withErrorHandling wrapper for automatic error responses
 */
export async function requireAuthOrThrow(req) {
  const user = await extractAuthUser(req);
  if (!user) {
    throw ApiError.auth('Authentication required', 'Include Authorization: Bearer <token> header');
  }
  if (user.status === 'PENDING') {
    throw new ApiError('AUTH_REQUIRED', 'Account pending verification', {
      status: 403,
      suggestion: 'Your account is awaiting admin approval'
    });
  }
  if (user.status === 'SUSPENDED') {
    throw new ApiError('AUTH_REQUIRED', 'Account suspended', {
      status: 403,
      suggestion: 'Contact your administrator'
    });
  }
  if (user.status !== 'ACTIVE') {
    throw ApiError.auth('Account not active', 'Contact your administrator');
  }
  return user;
}

/**
 * Require GP or Admin role - THROWS ApiError on failure
 */
export async function requireGPOrThrow(req) {
  const user = await requireAuthOrThrow(req);
  if (!['GP', 'Admin'].includes(user.role)) {
    throw ApiError.forbiddenRole('GP or Admin');
  }
  return user;
}

/**
 * Require Admin role - THROWS ApiError on failure
 */
export async function requireAdminOrThrow(req) {
  const user = await requireAuthOrThrow(req);
  if (user.role !== 'Admin') {
    throw ApiError.forbiddenRole('Admin');
  }
  return user;
}

/**
 * Require GP Counsel or General Counsel role - THROWS ApiError on failure
 * GP Counsel = in-house legal, advisory role with full visibility
 */
export async function requireGPCounselOrThrow(req) {
  const user = await requireAuthOrThrow(req);
  const counselRoles = ['GP Counsel', 'General Counsel', 'Admin'];
  if (!counselRoles.includes(user.role)) {
    throw ApiError.forbiddenRole('GP Counsel or General Counsel');
  }
  return user;
}

/**
 * Require General Counsel role (GC oversight) - THROWS ApiError on failure
 */
export async function requireGeneralCounselOrThrow(req) {
  const user = await requireAuthOrThrow(req);
  const gcRoles = ['General Counsel', 'Admin'];
  if (!gcRoles.includes(user.role)) {
    throw ApiError.forbiddenRole('General Counsel');
  }
  return user;
}

/**
 * Verify deal belongs to user's organization - THROWS ApiError on failure
 */
export async function requireDealAccessOrThrow(authUser, dealId) {
  if (!authUser) {
    throw ApiError.auth();
  }

  const { readStore } = await import("../store.js");
  const store = await readStore();
  const record = store.dealIndex.find((item) => item.id === dealId);

  if (!record) {
    throw ApiError.notFound('Deal');
  }

  if (record.organizationId && record.organizationId !== authUser.organizationId) {
    throw ApiError.forbiddenOrg('deal');
  }

  return true;
}

/**
 * Require org isolation - THROWS ApiError on failure
 */
export function requireOrgIsolationOrThrow(resource, authUser, resourceName = "resource", orgField = "deal.organizationId") {
  const parts = orgField.split(".");
  let orgId = resource;
  for (const part of parts) {
    orgId = orgId?.[part];
  }

  if (orgId && orgId !== authUser.organizationId) {
    throw ApiError.forbiddenOrg(resourceName);
  }

  return true;
}

/**
 * Fetch resource with org check - THROWS ApiError on failure
 */
export async function fetchWithOrgCheckOrThrow({ prisma, model, id, authUser, include = { deal: true }, resourceName = "resource" }) {
  const resource = await prisma[model].findUnique({
    where: { id },
    include
  });

  if (!resource) {
    throw ApiError.notFound(resourceName);
  }

  requireOrgIsolationOrThrow(resource, authUser, resourceName);

  return resource;
}

// ========== LEGACY VERSIONS (send response directly, return null) ==========

/**
 * Require authenticated user with ACTIVE status
 */
export async function requireAuth(req, res) {
  const user = await extractAuthUser(req);
  if (!user) {
    sendError(res, 401, "Not authenticated");
    return null;
  }
  if (user.status !== 'ACTIVE') {
    sendError(res, 403, "Account not active");
    return null;
  }
  return user;
}

/**
 * Require GP or Admin role
 */
export async function requireGP(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return null;

  if (!['GP', 'Admin'].includes(user.role)) {
    sendError(res, 403, "GP or Admin role required");
    return null;
  }
  return user;
}

/**
 * Require Admin role
 */
export async function requireAdmin(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return null;

  if (user.role !== 'Admin') {
    sendError(res, 403, "Admin access required");
    return null;
  }
  return user;
}

/**
 * Require GP Counsel or General Counsel role
 * GP Counsel = in-house legal, advisory role with full visibility
 */
export async function requireGPCounsel(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return null;

  const counselRoles = ['GP Counsel', 'General Counsel', 'Admin'];
  if (!counselRoles.includes(user.role)) {
    sendError(res, 403, "GP Counsel or General Counsel role required");
    return null;
  }
  return user;
}

/**
 * Require General Counsel role (GC oversight)
 */
export async function requireGeneralCounsel(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return null;

  const gcRoles = ['General Counsel', 'Admin'];
  if (!gcRoles.includes(user.role)) {
    sendError(res, 403, "General Counsel role required");
    return null;
  }
  return user;
}

/**
 * Verify deal belongs to user's organization
 * ALWAYS enforces - no conditional bypass
 * @returns {boolean} true if access granted, false if denied (response already sent)
 */
export async function requireDealAccess(authUser, dealId, res) {
  if (!authUser) {
    sendError(res, 401, "Not authenticated");
    return false;
  }

  const { readStore } = await import("../store.js");
  const store = await readStore();
  const record = store.dealIndex.find((item) => item.id === dealId);

  if (!record) {
    sendError(res, 404, "Deal not found");
    return false;
  }

  // ALWAYS enforce org isolation - no conditional bypass
  if (record.organizationId && record.organizationId !== authUser.organizationId) {
    sendError(res, 403, "Access denied - deal belongs to different organization");
    return false;
  }

  return true;
}

/**
 * Validate that approver is not the same as creator (prevent self-approval)
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateNotSelfApproval(approverId, creatorId) {
  if (approverId === creatorId) {
    return { valid: false, reason: "Cannot approve your own submission" };
  }
  return { valid: true };
}

/**
 * Check if required approval exists and is valid
 * @returns {{ valid: boolean, approval?: object, reason?: string }}
 */
export async function checkApprovalExists(dealId, approvalType) {
  const prisma = getPrisma();

  const existingApproval = await prisma.approvalRecord.findFirst({
    where: {
      dealId,
      approvalType,
      decision: 'APPROVED'
    },
    orderBy: { createdAt: 'desc' }
  });

  if (!existingApproval) {
    return { valid: false, reason: `Requires ${approvalType} approval before proceeding` };
  }

  // Check if expired (if expiresAt is set)
  if (existingApproval.expiresAt && existingApproval.expiresAt < new Date()) {
    return { valid: false, reason: `${approvalType} approval has expired` };
  }

  return { valid: true, approval: existingApproval };
}

/**
 * Require LP entitlement - validates LP has access via JWT or portal token
 * SECURITY: Uses validated credentials, NOT raw headers like x-user-id
 *
 * @param {object} req - Request object
 * @param {object} res - Response object
 * @param {string|null} dealId - Optional deal ID to verify specific deal access
 * @param {string|null} token - Optional LP portal session token from query param
 * @returns {Promise<{lpEmail: string, lpActorId?: string, authType: 'jwt'|'token'}|null>}
 *          Returns LP context if entitled, null if not (response already sent)
 */
export async function requireLPEntitlement(req, res, dealId = null, token = null) {
  const prisma = getPrisma();

  // Try JWT auth first
  const authUser = await extractAuthUser(req);

  if (authUser) {
    // JWT auth path - use email from validated JWT, NOT from headers
    const lpEmail = authUser.email;

    if (dealId) {
      // Verify LP has access to this specific deal
      const lpActor = await prisma.lPActor.findUnique({
        where: {
          email_dealId: {
            email: lpEmail,
            dealId
          }
        }
      });

      if (!lpActor || lpActor.status !== 'ACTIVE') {
        sendError(res, 403, "LP does not have access to this deal");
        return null;
      }

      return { lpEmail, lpActorId: lpActor.id, authType: 'jwt' };
    }

    // No specific deal - verify LP has at least one active investment
    const lpActors = await prisma.lPActor.findMany({
      where: {
        email: lpEmail,
        status: 'ACTIVE'
      },
      take: 1
    });

    if (lpActors.length === 0) {
      sendError(res, 403, "No active LP investments found");
      return null;
    }

    return { lpEmail, authType: 'jwt' };
  }

  // Token auth path - validate portal session token
  if (token) {
    const session = await prisma.lPPortalSession.findUnique({
      where: { token }
    });

    if (!session) {
      sendError(res, 401, "Invalid session token");
      return null;
    }

    if (new Date() > session.expiresAt) {
      sendError(res, 401, "Session expired");
      return null;
    }

    // Get LP actor from session
    const lpActor = await prisma.lPActor.findUnique({
      where: { id: session.lpActorId }
    });

    if (!lpActor || lpActor.status !== 'ACTIVE') {
      sendError(res, 403, "LP is not active");
      return null;
    }

    // If dealId specified, verify this LP has access to that deal
    if (dealId && lpActor.dealId !== dealId) {
      // Check if LP has access to the requested deal via another LPActor record
      const dealAccess = await prisma.lPActor.findUnique({
        where: {
          email_dealId: {
            email: lpActor.email,
            dealId
          }
        }
      });

      if (!dealAccess || dealAccess.status !== 'ACTIVE') {
        sendError(res, 403, "LP does not have access to this deal");
        return null;
      }

      return { lpEmail: lpActor.email, lpActorId: dealAccess.id, authType: 'token' };
    }

    // Update last used timestamp
    await prisma.lPPortalSession.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() }
    });

    return { lpEmail: lpActor.email, lpActorId: lpActor.id, authType: 'token' };
  }

  // Neither JWT nor token provided
  sendError(res, 401, "Authentication required - provide JWT or LP portal token");
  return null;
}

/**
 * Standard audit action names for financial operations
 * Use these for consistency across the codebase
 */
export const AUDIT_ACTIONS = {
  // Capital Calls
  CAPITAL_CALL_CREATED: 'CAPITAL_CALL_CREATED',
  CAPITAL_CALL_ISSUED: 'CAPITAL_CALL_ISSUED',
  CAPITAL_CALL_ALLOCATION_FUNDED: 'CAPITAL_CALL_ALLOCATION_FUNDED',
  CAPITAL_CALL_CANCELLED: 'CAPITAL_CALL_CANCELLED',

  // Distributions
  DISTRIBUTION_CREATED: 'DISTRIBUTION_CREATED',
  DISTRIBUTION_APPROVED: 'DISTRIBUTION_APPROVED',
  DISTRIBUTION_ALLOCATION_PAID: 'DISTRIBUTION_ALLOCATION_PAID',
  DISTRIBUTION_CANCELLED: 'DISTRIBUTION_CANCELLED',

  // LP Actions
  LP_INVITED: 'LP_INVITED',
  LP_ONBOARDED: 'LP_ONBOARDED',
  LP_TRANSFER_INITIATED: 'LP_TRANSFER_INITIATED',
  LP_TRANSFER_COMPLETED: 'LP_TRANSFER_COMPLETED',

  // User Management
  ROLE_CHANGE: 'ROLE_CHANGE',
  STATUS_CHANGE: 'STATUS_CHANGE',
  VERIFICATION_APPROVED: 'VERIFICATION_APPROVED',
  VERIFICATION_REJECTED: 'VERIFICATION_REJECTED',

  // GC Approval
  GC_REVIEW_REQUESTED: 'GC_REVIEW_REQUESTED',
  GC_APPROVED: 'GC_APPROVED',
  GC_REJECTED: 'GC_REJECTED'
};

/**
 * Log permission/audit action for compliance tracking
 *
 * @param {Object} options - Audit log options
 * @param {string} options.actorId - ID of user performing the action
 * @param {string} [options.actorName] - Name of user (for snapshot)
 * @param {string} [options.targetUserId] - ID of user being affected (defaults to actorId)
 * @param {string} [options.targetUserName] - Name of target user
 * @param {string} options.action - Action name (use AUDIT_ACTIONS constants)
 * @param {string} [options.resourceType] - Type of resource (e.g., 'CapitalCall', 'Distribution')
 * @param {string} [options.resourceId] - ID of the resource
 * @param {Object} [options.beforeValue] - State before the action
 * @param {Object} [options.afterValue] - State after the action
 * @param {Object} [options.metadata] - Additional context (dealId, etc.)
 * @param {string} [options.reason] - Reason for the action
 * @param {string} [options.ipAddress] - Client IP address
 * @returns {Promise<void>}
 *
 * @example
 * await logPermissionAction({
 *   actorId: authUser.id,
 *   action: AUDIT_ACTIONS.CAPITAL_CALL_ALLOCATION_FUNDED,
 *   resourceType: 'CapitalCallAllocation',
 *   resourceId: allocation.id,
 *   beforeValue: { status: 'PENDING', fundedAmount: 0 },
 *   afterValue: { status: 'FUNDED', fundedAmount: 50000, version: 2 },
 *   metadata: { dealId, capitalCallId: callId },
 *   ipAddress: req.headers['x-forwarded-for']
 * });
 */
export async function logPermissionAction({
  actorId,
  actorName,
  targetUserId,
  targetUserName,
  action,
  resourceType,
  resourceId,
  beforeValue,
  afterValue,
  metadata,
  reason,
  ipAddress
}) {
  const prisma = getPrisma();

  try {
    // Combine resource info and metadata into afterValue for richer context
    const enrichedAfterValue = afterValue ? {
      ...afterValue,
      ...(resourceType ? { _resourceType: resourceType } : {}),
      ...(resourceId ? { _resourceId: resourceId } : {}),
      ...(metadata || {})
    } : metadata ? {
      _resourceType: resourceType,
      _resourceId: resourceId,
      ...metadata
    } : null;

    await prisma.permissionAuditLog.create({
      data: {
        actorId,
        actorName: actorName || null,
        targetUserId: targetUserId || actorId,
        targetUserName: targetUserName || null,
        action,
        beforeValue: beforeValue ? JSON.stringify(beforeValue) : null,
        afterValue: enrichedAfterValue ? JSON.stringify(enrichedAfterValue) : null,
        reason: reason || null,
        ipAddress: ipAddress || null
      }
    });
  } catch (error) {
    // Don't fail the request if audit logging fails - log and continue
    console.error('[AUDIT] Failed to log action:', action, error.message);
  }
}

/**
 * Generic resource org isolation check
 * Verifies a resource belongs to the user's organization via deal chain
 *
 * @param {object} resource - The fetched resource (must include deal if using dealField)
 * @param {object} authUser - The authenticated user
 * @param {object} res - Response object (for sending 403)
 * @param {string} resourceName - Name for error message (e.g., "document", "import")
 * @param {string} orgField - Field path to organizationId (default: "deal.organizationId")
 * @returns {boolean} true if access granted, false if denied (response already sent)
 */
export function requireOrgIsolation(resource, authUser, res, resourceName = "resource", orgField = "deal.organizationId") {
  // Navigate the field path (e.g., "deal.organizationId" -> resource.deal.organizationId)
  const parts = orgField.split(".");
  let orgId = resource;
  for (const part of parts) {
    orgId = orgId?.[part];
  }

  if (orgId && orgId !== authUser.organizationId) {
    sendError(res, 403, `Access denied - ${resourceName} belongs to different organization`);
    return false;
  }

  return true;
}

/**
 * Fetch a resource by ID with org isolation check built-in
 * Returns null if not found or access denied (response already sent)
 *
 * @param {object} options
 * @param {object} options.prisma - Prisma client
 * @param {string} options.model - Model name (e.g., "excelImport")
 * @param {string} options.id - Resource ID
 * @param {object} options.authUser - Authenticated user
 * @param {object} options.res - Response object
 * @param {object} options.include - Prisma include object (should include deal for org check)
 * @param {string} options.resourceName - Name for error messages
 * @returns {Promise<object|null>} The resource or null
 */
export async function fetchWithOrgCheck({ prisma, model, id, authUser, res, include = { deal: true }, resourceName = "resource" }) {
  const resource = await prisma[model].findUnique({
    where: { id },
    include
  });

  if (!resource) {
    sendError(res, 404, `${resourceName} not found`);
    return null;
  }

  if (!requireOrgIsolation(resource, authUser, res, resourceName)) {
    return null;
  }

  return resource;
}

// ========== CROSS-ORGANIZATION ACCESS HELPERS ==========

/**
 * Check if a user has cross-org access to a deal draft
 * This considers organization membership, broker invitations, distribution recipients, etc.
 *
 * @param {object} options
 * @param {string} options.userId - User ID
 * @param {string} options.userEmail - User email
 * @param {string} options.userOrgId - User's organization ID
 * @param {string} options.dealDraftId - Deal draft ID to check access for
 * @returns {Promise<{ allowed: boolean, reason: string }>}
 */
export async function checkDealDraftAccess({ userId, userEmail, userOrgId, dealDraftId }) {
  const prisma = getPrisma();

  // 1. Check if deal exists and get its org
  const dealDraft = await prisma.dealDraft.findUnique({
    where: { id: dealDraftId },
    select: { organizationId: true }
  });

  if (!dealDraft) {
    return { allowed: false, reason: 'deal_not_found' };
  }

  // 2. Same org - always allowed
  if (dealDraft.organizationId === userOrgId) {
    return { allowed: true, reason: 'same_org' };
  }

  // 3. Broker invitation (PENDING or ACCEPTED)
  if (userEmail) {
    const brokerInvite = await prisma.brokerInvitation.findFirst({
      where: {
        dealDraftId,
        brokerEmail: userEmail,
        status: { in: ['PENDING', 'ACCEPTED'] }
      }
    });
    if (brokerInvite) {
      return { allowed: true, reason: 'broker_invited' };
    }
  }

  // 4. Distribution recipient (buyer who received a distribution)
  if (userId) {
    const recipient = await prisma.distributionRecipient.findFirst({
      where: {
        distribution: { dealDraftId },
        userId
      }
    });
    if (recipient) {
      return { allowed: true, reason: 'distribution_recipient' };
    }
  }

  // 5. Assigned broker on the deal
  if (userId) {
    const brokerAssignment = await prisma.dealDraftBroker.findFirst({
      where: { dealDraftId, userId }
    });
    if (brokerAssignment) {
      return { allowed: true, reason: 'broker_assigned' };
    }
  }

  // 6. Seller of the deal
  if (userId) {
    const seller = await prisma.dealDraftSeller.findFirst({
      where: { dealDraftId, userId }
    });
    if (seller) {
      return { allowed: true, reason: 'seller' };
    }
  }

  return { allowed: false, reason: 'no_access' };
}

/**
 * Require cross-org access to a deal draft - sends error response if denied
 * @returns {Promise<boolean>} true if access granted, false if denied (response already sent)
 */
export async function requireDealDraftAccess({ userId, userEmail, userOrgId, dealDraftId, res }) {
  const result = await checkDealDraftAccess({ userId, userEmail, userOrgId, dealDraftId });

  if (!result.allowed) {
    if (result.reason === 'deal_not_found') {
      sendError(res, 404, 'Deal not found');
    } else {
      sendError(res, 403, 'Access denied - no permission to access this deal');
    }
    return false;
  }

  return true;
}

/**
 * Throwing version of requireDealDraftAccess for use with withErrorHandling
 * @throws {ApiError} if access denied
 */
export async function requireDealDraftAccessOrThrow({ userId, userEmail, userOrgId, dealDraftId }) {
  const result = await checkDealDraftAccess({ userId, userEmail, userOrgId, dealDraftId });

  if (!result.allowed) {
    if (result.reason === 'deal_not_found') {
      throw ApiError.notFound('Deal');
    } else {
      throw ApiError.forbidden('No permission to access this deal');
    }
  }

  return result;
}

// Re-export for convenience
export { sendJson, sendError };
