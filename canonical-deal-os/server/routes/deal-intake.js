/**
 * Deal Intake Routes
 *
 * API endpoints for broker deal intake and pre-marketing workflow.
 *
 * Routes:
 * - POST /api/intake/draft - Create new deal draft
 * - GET /api/intake/drafts - List deal drafts
 * - GET /api/intake/draft/:id - Get deal draft
 * - POST /api/intake/draft/:id/documents - Upload documents
 * - POST /api/intake/draft/:id/paste - Paste text for extraction
 * - POST /api/intake/draft/:id/brokers - Add co-broker
 * - POST /api/intake/draft/:id/seller - Set seller
 * - GET /api/intake/draft/:id/claims - Get claims
 * - POST /api/intake/draft/:id/claims/:claimId/verify - Verify claim
 * - GET /api/intake/draft/:id/conflicts - Get conflicts
 * - POST /api/intake/draft/:id/conflicts/:conflictId/resolve - Resolve conflict
 * - POST /api/intake/draft/:id/advance - Advance status
 * - GET /api/intake/draft/:id/stats - Get extraction stats
 */

import {
  dealIngestService,
  DEAL_DRAFT_STATUSES,
  INGEST_SOURCES
} from '../services/deal-ingest.js';
import { dealClaimExtractorService } from '../services/deal-claim-extractor.js';
import { kernelFetchJson } from '../kernel.js';
import { upsertDealIndex, readStore } from '../store.js';
import { PrismaClient } from '@prisma/client';
import { createValidationLogger } from '../services/validation-logger.js';
import {
  CreateDraftSchema,
  PasteTextSchema,
  UploadDocumentsSchema,
  AddBrokerSchema,
  SetSellerSchema,
  VerifyClaimSchema,
  ResolveConflictSchema,
  AdvanceStatusSchema,
  ConvertToDealSchema,
  UpdateDraftSchema,
  CreateListingSchema,
  CounterOfferSchema,
  CreateListingConfigSchema,
  ConfirmAgreementSchema
} from '../middleware/route-schemas.js';

const prisma = new PrismaClient();

// ============================================================================
// Helpers
// ============================================================================

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message, details = null) {
  sendJson(res, status, { error: message, details });
}

/**
 * Check if user has a pending/accepted broker invitation for a deal
 * Enables cross-organization broker access to deals they've been invited to
 */
async function isInvitedBroker(dealDraftId, userEmail) {
  if (!userEmail) return false;
  const invitation = await prisma.brokerInvitation.findFirst({
    where: {
      dealDraftId,
      brokerEmail: userEmail,
      status: { in: ['PENDING', 'ACCEPTED'] }
    }
  });
  return !!invitation;
}

/**
 * Check if user has access to a deal draft
 * Considers: broker assignment, seller, same-org GP, admin, or broker invitation
 */
async function checkDealDraftAccess(dealDraft, authUser) {
  // Admin always has access
  if (authUser.role === 'Admin') return true;

  // Assigned broker on this deal
  const isBroker = dealDraft.brokers?.some(b => b.userId === authUser.id);
  if (isBroker) return true;

  // Seller of this deal
  const isSeller = dealDraft.seller?.userId === authUser.id;
  if (isSeller) return true;

  // GP/GP Analyst in the same organization
  const isSameOrg = dealDraft.organizationId === authUser.organizationId;
  const isGPInOrg = isSameOrg && (authUser.role === 'GP' || authUser.role === 'GP Analyst');
  if (isGPInOrg) return true;

  // Invited broker (cross-org access via BrokerInvitation)
  const isInvited = await isInvitedBroker(dealDraft.id, authUser.email);
  if (isInvited) return true;

  return false;
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * Create a new deal draft
 * POST /api/intake/draft
 */
export async function handleCreateDraft(req, res, readJsonBody, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  const body = await readJsonBody(req);
  if (!body) {
    return sendError(res, 400, 'Request body required');
  }

  // ========== VALIDATION ==========
  const validationLog = createValidationLogger('handleCreateDraft');
  validationLog.beforeValidation(body);

  const parsed = CreateDraftSchema.safeParse(body);
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

  const { ingestSource, sourceData, seller, brokerFirm } = parsed.data;

  try {
    const dealDraft = await dealIngestService.createDealDraft({
      organizationId: authUser.organizationId,
      broker: {
        userId: authUser.id,
        email: authUser.email,
        name: authUser.name,
        firmName: brokerFirm
      },
      ingestSource,
      sourceData,
      seller
    });

    return sendJson(res, 201, dealDraft);
  } catch (error) {
    console.error('[DealIntake] Create draft error:', error);
    return sendError(res, 500, error.message);
  }
}

/**
 * List deal drafts
 * GET /api/intake/drafts
 */
export async function handleListDrafts(req, res, authUser) {
  console.log('[DealIntake] handleListDrafts called', {
    hasAuthUser: !!authUser,
    userId: authUser?.id,
    orgId: authUser?.organizationId
  });

  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  // Parse query params
  const url = new URL(req.url, `http://${req.headers.host}`);
  const status = url.searchParams.get('status');
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  console.log('[DealIntake] Querying drafts', {
    orgId: authUser.organizationId,
    userId: authUser.id,
    userEmail: authUser.email,
    status,
    limit,
    offset
  });

  try {
    const result = await dealIngestService.listDealDrafts(authUser.organizationId, {
      status,
      userId: authUser.id, // Show drafts where user is broker OR seller
      userEmail: authUser.email, // Enable cross-org broker invitation lookup
      limit,
      offset
    });

    console.log('[DealIntake] Found drafts', {
      total: result.total,
      count: result.drafts?.length
    });

    return sendJson(res, 200, result);
  } catch (error) {
    console.error('[DealIntake] List drafts error:', error);
    return sendError(res, 500, error.message);
  }
}

/**
 * List marketplace deals (public listings)
 * GET /api/intake/deals?listingType=PUBLIC&status=ACTIVE
 */
export async function handleListMarketplaceDeals(req, res, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  // Parse query params
  const url = new URL(req.url, `http://${req.headers.host}`);
  const listingType = url.searchParams.get('listingType') || 'PUBLIC';
  const status = url.searchParams.get('status') || 'ACTIVE';
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  console.log('[DealIntake] Querying marketplace deals', {
    listingType,
    status,
    limit,
    offset
  });

  try {
    // Query deal drafts with PUBLIC listing type and specified status
    const where = {
      listingType: listingType,
      status: status
    };

    const [drafts, total] = await Promise.all([
      prisma.dealDraft.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          propertyName: true,
          propertyAddress: true,
          city: true,
          state: true,
          assetType: true,
          askingPrice: true,
          pricePerSF: true,
          squareFeet: true,
          units: true,
          yearBuilt: true,
          capRate: true,
          createdAt: true,
          listingType: true,
          status: true,
          // Include primary broker info for display
          brokers: {
            where: { role: 'PRIMARY' },
            take: 1,
            select: {
              id: true,
              userId: true,
              name: true,
              email: true
            }
          }
        }
      }),
      prisma.dealDraft.count({ where })
    ]);

    console.log('[DealIntake] Found marketplace deals', {
      total,
      count: drafts.length
    });

    return sendJson(res, 200, { deals: drafts, total });
  } catch (error) {
    console.error('[DealIntake] List marketplace deals error:', error);
    return sendError(res, 500, error.message);
  }
}

/**
 * Get a single deal draft
 * GET /api/intake/draft/:id
 */
export async function handleGetDraft(req, res, dealDraftId, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  try {
    const dealDraft = await dealIngestService.getDealDraft(dealDraftId, true);

    // Check access (includes cross-org broker invitations)
    const hasAccess = await checkDealDraftAccess(dealDraft, authUser);
    if (!hasAccess) {
      return sendError(res, 403, 'Access denied');
    }

    return sendJson(res, 200, dealDraft);
  } catch (error) {
    if (error.message === 'Deal draft not found') {
      return sendError(res, 404, 'Deal draft not found');
    }
    console.error('[DealIntake] Get draft error:', error);
    return sendError(res, 500, error.message);
  }
}

/**
 * Upload documents to a draft
 * POST /api/intake/draft/:id/documents
 *
 * Note: This is a simplified version. Real implementation would handle
 * multipart file uploads and store files to disk/S3.
 */
export async function handleUploadDocuments(req, res, dealDraftId, readJsonBody, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  const body = await readJsonBody(req);

  // ========== VALIDATION ==========
  const validationLog = createValidationLogger('handleUploadDocuments');
  validationLog.beforeValidation(body);

  const parsed = UploadDocumentsSchema.safeParse(body);
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

  try {
    // Verify access - must be an assigned broker, invited broker, or admin
    const dealDraft = await dealIngestService.getDealDraft(dealDraftId, true);
    const isBroker = dealDraft.brokers?.some(b => b.userId === authUser.id);
    const isInvited = await isInvitedBroker(dealDraftId, authUser.email);

    if (!isBroker && !isInvited && authUser.role !== 'Admin') {
      return sendError(res, 403, 'Only brokers can upload documents');
    }

    const result = await dealIngestService.addDocuments(
      dealDraftId,
      parsed.data.documents,
      authUser.id
    );

    return sendJson(res, 200, result);
  } catch (error) {
    if (error.message === 'Deal draft not found') {
      return sendError(res, 404, 'Deal draft not found');
    }
    console.error('[DealIntake] Upload documents error:', error);
    return sendError(res, 500, error.message);
  }
}

/**
 * Paste text for extraction
 * POST /api/intake/draft/:id/paste
 */
export async function handlePasteText(req, res, dealDraftId, readJsonBody, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  const body = await readJsonBody(req);

  // ========== VALIDATION ==========
  const validationLog = createValidationLogger('handlePasteText');
  validationLog.beforeValidation(body);

  const parsed = PasteTextSchema.safeParse(body);
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

  try {
    // Verify access
    const dealDraft = await dealIngestService.getDealDraft(dealDraftId, false);
    const drafts = await prisma.dealDraftBroker.findFirst({
      where: { dealDraftId, userId: authUser.id }
    });

    if (!drafts && authUser.role !== 'Admin') {
      return sendError(res, 403, 'Only brokers can add content');
    }

    // Extract claims from pasted text
    const result = await dealClaimExtractorService.extractFromText({
      dealDraftId,
      text: parsed.data.text,
      sourceName: parsed.data.sourceName
    });

    return sendJson(res, 200, result);
  } catch (error) {
    if (error.message === 'Deal draft not found') {
      return sendError(res, 404, 'Deal draft not found');
    }
    console.error('[DealIntake] Paste text error:', error);
    return sendError(res, 500, error.message);
  }
}

/**
 * Add a co-broker
 * POST /api/intake/draft/:id/brokers
 */
export async function handleAddBroker(req, res, dealDraftId, readJsonBody, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  const body = await readJsonBody(req);

  // ========== VALIDATION ==========
  const validationLog = createValidationLogger('handleAddBroker');
  validationLog.beforeValidation(body);

  const parsed = AddBrokerSchema.safeParse(body);
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

  try {
    // Verify caller is primary broker
    const primaryBroker = await prisma.dealDraftBroker.findFirst({
      where: {
        dealDraftId,
        userId: authUser.id,
        role: 'PRIMARY'
      }
    });

    if (!primaryBroker && authUser.role !== 'Admin') {
      return sendError(res, 403, 'Only primary broker can add co-brokers');
    }

    // Look up user by email or create placeholder
    let userId = parsed.data.userId;
    if (!userId) {
      const user = await prisma.authUser.findFirst({
        where: {
          email: parsed.data.email,
          organizationId: authUser.organizationId
        }
      });
      userId = user?.id || `pending_${parsed.data.email}`;
    }

    const broker = await dealIngestService.addCoBroker(
      dealDraftId,
      {
        userId,
        email: parsed.data.email,
        name: parsed.data.name,
        firmName: parsed.data.firmName
      },
      authUser.id
    );

    return sendJson(res, 201, broker);
  } catch (error) {
    console.error('[DealIntake] Add broker error:', error);
    return sendError(res, 500, error.message);
  }
}

/**
 * Set the seller
 * POST /api/intake/draft/:id/seller
 */
export async function handleSetSeller(req, res, dealDraftId, readJsonBody, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  const body = await readJsonBody(req);

  // ========== VALIDATION ==========
  const validationLog = createValidationLogger('handleSetSeller');
  validationLog.beforeValidation(body);

  const parsed = SetSellerSchema.safeParse(body);
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

  try {
    // Verify caller is a broker on this deal
    const broker = await prisma.dealDraftBroker.findFirst({
      where: { dealDraftId, userId: authUser.id }
    });

    if (!broker && authUser.role !== 'Admin') {
      return sendError(res, 403, 'Only brokers can set seller');
    }

    // Look up user by email
    let userId = parsed.data.userId;
    if (!userId) {
      const user = await prisma.authUser.findFirst({
        where: {
          email: parsed.data.email,
          organizationId: authUser.organizationId
        }
      });
      userId = user?.id || `pending_${parsed.data.email}`;
    }

    const seller = await dealIngestService.setSeller(
      dealDraftId,
      {
        userId,
        email: parsed.data.email,
        name: parsed.data.name,
        entityName: parsed.data.entityName,
        hasDirectAccess: parsed.data.hasDirectAccess,
        receiveNotifications: parsed.data.receiveNotifications,
        requiresOMApproval: parsed.data.requiresOMApproval,
        requiresBuyerApproval: parsed.data.requiresBuyerApproval,
        sellerSeesBuyerIdentity: parsed.data.sellerSeesBuyerIdentity
      },
      authUser.id
    );

    return sendJson(res, 201, seller);
  } catch (error) {
    console.error('[DealIntake] Set seller error:', error);
    return sendError(res, 500, error.message);
  }
}

/**
 * Get claims for a draft
 * GET /api/intake/draft/:id/claims
 */
export async function handleGetClaims(req, res, dealDraftId, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const status = url.searchParams.get('status');
  const field = url.searchParams.get('field');

  try {
    const where = { dealDraftId };
    if (status) where.status = status;
    if (field) where.field = field;

    const claims = await prisma.dealClaim.findMany({
      where,
      orderBy: [
        { status: 'asc' },
        { confidence: 'asc' },
        { createdAt: 'desc' }
      ]
    });

    const formatted = claims.map(claim => ({
      id: claim.id,
      field: claim.field,
      value: JSON.parse(claim.value),
      displayValue: claim.displayValue,
      source: {
        documentId: claim.documentId,
        documentName: claim.documentName,
        pageNumber: claim.pageNumber,
        location: claim.location,
        textSnippet: claim.textSnippet
      },
      extraction: {
        method: claim.extractionMethod,
        confidence: claim.confidence
      },
      verification: {
        status: claim.status,
        verifiedBy: claim.verifiedByName,
        verifiedAt: claim.verifiedAt
      },
      conflictGroupId: claim.conflictGroupId,
      createdAt: claim.createdAt
    }));

    return sendJson(res, 200, { claims: formatted });
  } catch (error) {
    console.error('[DealIntake] Get claims error:', error);
    return sendError(res, 500, error.message);
  }
}

/**
 * Verify a claim
 * POST /api/intake/draft/:id/claims/:claimId/verify
 */
export async function handleVerifyClaim(req, res, dealDraftId, claimId, readJsonBody, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  const body = await readJsonBody(req);

  // ========== VALIDATION ==========
  const validationLog = createValidationLogger('handleVerifyClaim');
  validationLog.beforeValidation(body);

  const parsed = VerifyClaimSchema.safeParse(body);
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

  const { action, correctedValue, rejectionReason } = parsed.data;

  try {
    // Verify access
    const broker = await prisma.dealDraftBroker.findFirst({
      where: { dealDraftId, userId: authUser.id }
    });
    const seller = await prisma.dealDraftSeller.findFirst({
      where: { dealDraftId, userId: authUser.id }
    });

    if (!broker && !seller && authUser.role !== 'Admin') {
      return sendError(res, 403, 'Access denied');
    }

    // Get the claim
    const claim = await prisma.dealClaim.findFirst({
      where: { id: claimId, dealDraftId }
    });

    if (!claim) {
      return sendError(res, 404, 'Claim not found');
    }

    if (claim.status !== 'UNVERIFIED') {
      return sendError(res, 400, `Claim already has status: ${claim.status}`);
    }

    // Determine new status based on who is verifying
    const newStatus = action === 'confirm'
      ? (seller ? 'SELLER_CONFIRMED' : 'BROKER_CONFIRMED')
      : 'REJECTED';

    const updated = await prisma.dealClaim.update({
      where: { id: claimId },
      data: {
        status: newStatus,
        verifiedBy: authUser.id,
        verifiedByName: authUser.name,
        verifiedAt: new Date(),
        rejectionReason: action === 'reject' ? rejectionReason : null,
        // If corrected, update the value
        value: correctedValue !== undefined ? JSON.stringify(correctedValue) : claim.value
      }
    });

    // Update deal draft with confirmed value
    if (action === 'confirm') {
      const value = correctedValue !== undefined ? correctedValue : JSON.parse(claim.value);
      await dealIngestService.updateDealFromClaim(dealDraftId, claim.field, value);
    }

    return sendJson(res, 200, {
      id: updated.id,
      field: updated.field,
      status: updated.status,
      verifiedBy: updated.verifiedByName,
      verifiedAt: updated.verifiedAt
    });
  } catch (error) {
    console.error('[DealIntake] Verify claim error:', error);
    return sendError(res, 500, error.message);
  }
}

/**
 * Get conflicts
 * GET /api/intake/draft/:id/conflicts
 */
export async function handleGetConflicts(req, res, dealDraftId, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const status = url.searchParams.get('status') || 'OPEN';

  try {
    const conflicts = await dealIngestService.getConflicts(dealDraftId, { status });
    return sendJson(res, 200, { conflicts });
  } catch (error) {
    console.error('[DealIntake] Get conflicts error:', error);
    return sendError(res, 500, error.message);
  }
}

/**
 * Resolve a conflict
 * POST /api/intake/draft/:id/conflicts/:conflictId/resolve
 */
export async function handleResolveConflict(req, res, dealDraftId, conflictId, readJsonBody, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  const body = await readJsonBody(req);

  // ========== VALIDATION ==========
  const validationLog = createValidationLogger('handleResolveConflict');
  validationLog.beforeValidation(body);

  const parsed = ResolveConflictSchema.safeParse(body);
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

  try {
    // Verify access
    const broker = await prisma.dealDraftBroker.findFirst({
      where: { dealDraftId, userId: authUser.id }
    });

    if (!broker && authUser.role !== 'Admin') {
      return sendError(res, 403, 'Only brokers can resolve conflicts');
    }

    const resolved = await dealIngestService.resolveConflict(
      conflictId,
      {
        resolvedClaimId: parsed.data.resolvedClaimId,
        resolvedValue: parsed.data.resolvedValue,
        method: parsed.data.method
      },
      { id: authUser.id, name: authUser.name }
    );

    return sendJson(res, 200, resolved);
  } catch (error) {
    console.error('[DealIntake] Resolve conflict error:', error);
    return sendError(res, 500, error.message);
  }
}

/**
 * Advance deal draft status
 * POST /api/intake/draft/:id/advance
 */
export async function handleAdvanceStatus(req, res, dealDraftId, readJsonBody, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  const body = await readJsonBody(req);

  // ========== VALIDATION ==========
  const validationLog = createValidationLogger('handleAdvanceStatus');
  validationLog.beforeValidation(body);

  const parsed = AdvanceStatusSchema.safeParse(body);
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

  if (!Object.values(DEAL_DRAFT_STATUSES).includes(parsed.data.status)) {
    return sendError(res, 400, `Invalid status. Valid values: ${Object.values(DEAL_DRAFT_STATUSES).join(', ')}`);
  }

  try {
    // Verify access based on transition
    const dealDraft = await dealIngestService.getDealDraft(dealDraftId, true);

    // Check permissions for specific transitions
    if (parsed.data.status === DEAL_DRAFT_STATUSES.OM_BROKER_APPROVED) {
      const isBroker = dealDraft.brokers?.some(b => b.userId === authUser.id);
      const isInvited = await isInvitedBroker(dealDraftId, authUser.email);
      if (!isBroker && !isInvited && authUser.role !== 'Admin') {
        return sendError(res, 403, 'Only brokers can approve OM');
      }
    }

    if (parsed.data.status === DEAL_DRAFT_STATUSES.OM_APPROVED_FOR_MARKETING) {
      const isSeller = dealDraft.seller?.userId === authUser.id;
      const brokerCanApprove = dealDraft.brokers?.some(
        b => b.userId === authUser.id && b.permissions?.canApproveOM
      );

      if (!isSeller && !brokerCanApprove && authUser.role !== 'Admin') {
        return sendError(res, 403, 'Seller approval required');
      }
    }

    const updated = await dealIngestService.advanceStatus(
      dealDraftId,
      parsed.data.status,
      { id: authUser.id, name: authUser.name, role: authUser.role }
    );

    return sendJson(res, 200, updated);
  } catch (error) {
    console.error('[DealIntake] Advance status error:', error);
    return sendError(res, 500, error.message);
  }
}

/**
 * Convert deal draft to kernel deal
 * POST /api/intake/draft/:id/convert
 *
 * When a buyer wins the deal, this converts the intake draft to a kernel deal
 * with the buyer becoming the new GP.
 */
export async function handleConvertToDeal(req, res, dealDraftId, readJsonBody, authUser, kernelBaseUrl) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  const body = await readJsonBody(req);

  // ========== VALIDATION ==========
  const validationLog = createValidationLogger('handleConvertToDeal');
  validationLog.beforeValidation(body);

  const parsed = ConvertToDealSchema.safeParse(body);
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

  const { winningBuyerUserId, notes } = parsed.data;

  try {
    // Verify access - only broker (assigned or invited) or admin can convert
    const dealDraft = await dealIngestService.getDealDraft(dealDraftId, true);
    const isBroker = dealDraft.brokers?.some(b => b.userId === authUser.id);
    const isInvited = await isInvitedBroker(dealDraftId, authUser.email);

    if (!isBroker && !isInvited && authUser.role !== 'Admin') {
      return sendError(res, 403, 'Only brokers can convert deals');
    }

    // Find the winning buyer
    const winningBuyer = await prisma.user.findUnique({
      where: { id: winningBuyerUserId }
    });

    if (!winningBuyer) {
      return sendError(res, 404, 'Winning buyer not found');
    }

    // Create the kernel deal via Kernel API (Deal model lives in Kernel, not BFF)
    const kernelDeal = await kernelFetchJson(`${kernelBaseUrl}/deals`, {
      method: 'POST',
      body: JSON.stringify({
        name: dealDraft.propertyName || dealDraft.propertyAddress || 'Converted Deal',
        address: dealDraft.propertyAddress,
        assetType: dealDraft.assetType,
        acquisitionPrice: dealDraft.askingPrice,
        status: 'PRE_CLOSING',
        organizationId: winningBuyer.organizationId || authUser.organizationId,
        metadata: {
          convertedFromDraftId: dealDraftId,
          convertedAt: new Date().toISOString(),
          convertedBy: authUser.id,
          originalSellerId: dealDraft.seller?.userId,
          notes
        }
      })
    }).catch((error) => {
      console.error('[DealIntake] Kernel deal creation failed:', error);
      throw error;
    });

    // Cache the deal in BFF's store
    if (kernelDeal?.id) {
      await upsertDealIndex({
        id: kernelDeal.id,
        name: kernelDeal.name,
        organizationId: kernelDeal.organizationId || authUser.organizationId
      });
    }

    // Update the draft status
    await dealIngestService.advanceStatus(
      dealDraftId,
      'CONVERTED_TO_DEAL',
      { id: authUser.id, name: authUser.name, role: authUser.role }
    );

    // Link the draft to the kernel deal
    await prisma.dealDraft.update({
      where: { id: dealDraftId },
      data: {
        kernelDealId: kernelDeal.id,
        updatedAt: new Date()
      }
    });

    console.log('[DealIntake] Deal converted:', {
      draftId: dealDraftId,
      kernelDealId: kernelDeal.id,
      buyerId: winningBuyerUserId
    });

    return sendJson(res, 201, {
      success: true,
      kernelDealId: kernelDeal.id,
      draftId: dealDraftId,
      message: 'Deal successfully converted'
    });
  } catch (error) {
    console.error('[DealIntake] Convert deal error:', error);
    return sendError(res, 500, error.message);
  }
}

/**
 * Get extraction statistics
 * GET /api/intake/draft/:id/stats
 */
export async function handleGetStats(req, res, dealDraftId, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  try {
    const [stats, verifiedFields, fieldsNeedingVerification] = await Promise.all([
      dealClaimExtractorService.getExtractionStats(dealDraftId),
      dealClaimExtractorService.getVerifiedFields(dealDraftId),
      dealClaimExtractorService.getFieldsNeedingVerification(dealDraftId)
    ]);

    return sendJson(res, 200, {
      stats,
      verifiedFields,
      fieldsNeedingVerification
    });
  } catch (error) {
    console.error('[DealIntake] Get stats error:', error);
    return sendError(res, 500, error.message);
  }
}

/**
 * Update a deal draft
 * PATCH /api/intake/draft/:id
 */
export async function handleUpdateDraft(req, res, dealDraftId, readJsonBody, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  const body = await readJsonBody(req);
  if (!body) {
    return sendError(res, 400, 'Request body required');
  }

  // ========== VALIDATION ==========
  const validationLog = createValidationLogger('handleUpdateDraft');
  validationLog.beforeValidation(body);

  const parsed = UpdateDraftSchema.safeParse(body);
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

  try {
    // Get the draft first to check access
    const dealDraft = await dealIngestService.getDealDraft(dealDraftId, true);

    // Check access (includes cross-org broker invitations)
    const hasAccess = await checkDealDraftAccess(dealDraft, authUser);
    if (!hasAccess) {
      return sendError(res, 403, 'Access denied');
    }

    // Allowed fields to update
    const allowedFields = [
      'status', 'listingType', 'askingPrice', 'askingPriceMin', 'askingPriceMax',
      'propertyName', 'propertyAddress', 'assetType', 'unitCount', 'totalSF'
    ];

    const updateData = {};
    for (const field of allowedFields) {
      if (parsed.data[field] !== undefined) {
        updateData[field] = parsed.data[field];
      }
    }
    updateData.updatedAt = new Date();

    const updated = await prisma.dealDraft.update({
      where: { id: dealDraftId },
      data: updateData
    });

    console.log('[DealIntake] Draft updated', { dealDraftId, fields: Object.keys(updateData) });

    return sendJson(res, 200, updated);
  } catch (error) {
    if (error.message === 'Deal draft not found') {
      return sendError(res, 404, 'Deal draft not found');
    }
    console.error('[DealIntake] Update draft error:', error);
    return sendError(res, 500, error.message);
  }
}

/**
 * Create a listing for a deal draft
 * POST /api/intake/draft/:id/listing
 *
 * This creates/updates the listing status and optionally invites a broker.
 */
export async function handleCreateListing(req, res, dealDraftId, readJsonBody, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  const body = await readJsonBody(req);
  if (!body) {
    return sendError(res, 400, 'Request body required');
  }

  // ========== VALIDATION ==========
  const validationLog = createValidationLogger('handleCreateListing');
  validationLog.beforeValidation(body);

  const parsed = CreateListingSchema.safeParse(body);
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

  const { pricingType, askingPrice, priceMin, priceMax, listingType, broker } = parsed.data;

  try {
    // Get the draft first to check access
    const dealDraft = await dealIngestService.getDealDraft(dealDraftId, true);

    // Check access (includes cross-org broker invitations)
    const hasAccess = await checkDealDraftAccess(dealDraft, authUser);
    if (!hasAccess) {
      return sendError(res, 403, 'Access denied');
    }

    // Determine new status based on whether a broker is being invited
    const newStatus = broker ? 'LISTED_PENDING_BROKER' : 'LISTED_ACTIVE';

    // Update draft with listing info
    const updated = await prisma.dealDraft.update({
      where: { id: dealDraftId },
      data: {
        status: newStatus,
        listingType: listingType === 'public' ? 'PUBLIC' : 'PRIVATE',
        askingPrice: pricingType === 'fixed' ? askingPrice : null,
        askingPriceMin: pricingType === 'range' ? priceMin : null,
        askingPriceMax: pricingType === 'range' ? priceMax : null,
        listedAt: new Date(),
        listedBy: authUser.id,
        updatedAt: new Date()
      }
    });

    let brokerInvitation = null;

    // If broker is provided, create invitation
    if (broker && broker.email) {
      // Generate unique token for invitation
      const token = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

      // Check if broker user exists
      const brokerUser = await prisma.authUser.findFirst({
        where: { email: broker.email }
      });

      brokerInvitation = await prisma.brokerInvitation.create({
        data: {
          id: `bi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          dealDraftId,
          organizationId: dealDraft.organizationId,
          brokerEmail: broker.email.toLowerCase(), // Normalize to lowercase for consistent matching
          brokerName: broker.name || null,
          brokerFirmName: broker.firmName || null,
          // Note: respondedByUserId is set when broker ACCEPTS the invitation, not at creation
          status: 'PENDING',
          token,
          invitedBy: authUser.id,
          invitedByName: authUser.name,
          invitedByEmail: authUser.email,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
          // sentAt is auto-generated by Prisma @default(now())
        }
      });

      // Create in-app notification for broker if they have an account
      if (brokerUser) {
        try {
          await prisma.notification.create({
            data: {
              id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              userId: brokerUser.id,
              type: 'LISTING_INVITATION',
              title: 'New listing invitation',
              body: `${authUser.name || authUser.email} invited you to represent ${dealDraft.propertyName || dealDraft.propertyAddress || 'a property'}`,
              dealId: dealDraftId,
              actionUrl: `/DealWorkspace?dealDraftId=${dealDraftId}`,
              isRead: false,
              createdAt: new Date()
            }
          });
        } catch (notifError) {
          // Notification creation is non-critical, log and continue
          console.warn('[DealIntake] Failed to create notification:', notifError.message);
        }
      }

      // TODO: Send email notification via SendGrid
      // For now, log that we would send an email
      console.log('[DealIntake] Would send email to broker:', {
        to: broker.email,
        subject: `New Listing Opportunity: ${dealDraft.propertyName || dealDraft.propertyAddress}`,
        token: brokerInvitation.token
      });
    }

    console.log('[DealIntake] Listing created', {
      dealDraftId,
      status: newStatus,
      listingType,
      hasBrokerInvitation: !!brokerInvitation
    });

    return sendJson(res, 201, {
      draft: updated,
      brokerInvitation,
      message: broker
        ? `Property listed. Invitation sent to ${broker.email}`
        : 'Property listed successfully'
    });
  } catch (error) {
    console.error('[DealIntake] Create listing error:', error);
    return sendError(res, 500, error.message);
  }
}

/**
 * Get listing details including broker invitation status
 * GET /api/intake/draft/:id/listing
 */
export async function handleGetListing(req, res, dealDraftId, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  try {
    const dealDraft = await dealIngestService.getDealDraft(dealDraftId, true);

    // Check access (includes cross-org broker invitations)
    const hasAccess = await checkDealDraftAccess(dealDraft, authUser);
    if (!hasAccess) {
      return sendError(res, 403, 'Access denied');
    }

    // Get broker invitation if exists
    const brokerInvitation = await prisma.brokerInvitation.findFirst({
      where: { dealDraftId },
      orderBy: { sentAt: 'desc' }
    });

    // Get listing agreement if exists
    const listingAgreement = await prisma.listingAgreement.findFirst({
      where: { dealDraftId },
      orderBy: { createdAt: 'desc' }
    });

    return sendJson(res, 200, {
      isListed: dealDraft.status?.startsWith('LISTED'),
      status: dealDraft.status,
      listingType: dealDraft.listingType,
      askingPrice: dealDraft.askingPrice,
      askingPriceMin: dealDraft.askingPriceMin,
      askingPriceMax: dealDraft.askingPriceMax,
      listedAt: dealDraft.listedAt,
      listedBy: dealDraft.listedBy,
      broker: brokerInvitation ? {
        email: brokerInvitation.brokerEmail,
        name: brokerInvitation.brokerName,
        firmName: brokerInvitation.brokerFirmName,
        status: brokerInvitation.status,
        invitedAt: brokerInvitation.sentAt,
        acceptedAt: brokerInvitation.respondedAt
      } : null,
      listingAgreement: listingAgreement ? {
        id: listingAgreement.id,
        status: listingAgreement.status,
        commissionPercent: listingAgreement.commissionPercent
      } : null
    });
  } catch (error) {
    console.error('[DealIntake] Get listing error:', error);
    return sendError(res, 500, error.message);
  }
}

/**
 * Cancel a listing
 * DELETE /api/intake/draft/:id/listing
 */
export async function handleCancelListing(req, res, dealDraftId, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  try {
    const dealDraft = await dealIngestService.getDealDraft(dealDraftId, true);

    // Check access
    const isSameOrg = dealDraft.organizationId === authUser.organizationId;
    const isGPInOrg = isSameOrg && (authUser.role === 'GP' || authUser.role === 'GP Analyst');

    if (!isGPInOrg && authUser.role !== 'Admin') {
      return sendError(res, 403, 'Only the property owner can cancel listings');
    }

    // Update draft status
    await prisma.dealDraft.update({
      where: { id: dealDraftId },
      data: {
        status: 'LISTING_CANCELLED',
        updatedAt: new Date()
      }
    });

    // Expire any pending broker invitations
    await prisma.brokerInvitation.updateMany({
      where: {
        dealDraftId,
        status: 'PENDING'
      },
      data: {
        status: 'EXPIRED'
      }
    });

    console.log('[DealIntake] Listing cancelled', { dealDraftId });

    return sendJson(res, 200, { success: true, message: 'Listing cancelled' });
  } catch (error) {
    console.error('[DealIntake] Cancel listing error:', error);
    return sendError(res, 500, error.message);
  }
}

// ============================================================================
// Broker Invitation Handlers
// ============================================================================

/**
 * Check user's access level to a deal
 * GET /api/intake/draft/:id/access
 * Returns the user's relationship to the deal and their permissions
 */
async function handleCheckAccess(req, res, dealDraftId, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  try {
    const draft = await prisma.dealDraft.findUnique({
      where: { id: dealDraftId },
      select: {
        id: true,
        organizationId: true,
        status: true,
        propertyName: true,
        propertyAddress: true,
        assetType: true
      }
    });

    if (!draft) {
      return sendError(res, 404, 'Deal not found');
    }

    // 1. Check if owner (same org)
    if (draft.organizationId === authUser.organizationId) {
      return sendJson(res, 200, {
        relation: 'owner',
        permissions: ['view_all', 'edit', 'archive', 'manage_listing'],
        invitation: null
      });
    }

    // 2. Check for broker invitation
    const invitation = await prisma.brokerInvitation.findFirst({
      where: {
        dealDraftId,
        brokerEmail: authUser.email.toLowerCase()
      }
    });

    if (invitation) {
      const relation = invitation.status === 'ACCEPTED' ? 'broker_accepted' : 'broker_pending';
      return sendJson(res, 200, {
        relation,
        permissions: relation === 'broker_accepted'
          ? ['view_marketing', 'manage_showings', 'view_offers', 'manage_listing']
          : ['view_basic'],
        invitation
      });
    }

    // 3. Check for distribution recipient (buyer)
    const recipient = await prisma.distributionRecipient.findFirst({
      where: {
        distribution: { dealDraftId },
        userId: authUser.id
      }
    });

    if (recipient) {
      return sendJson(res, 200, {
        relation: 'buyer',
        permissions: ['view_om', 'submit_response'],
        invitation: null
      });
    }

    return sendError(res, 403, 'No access to this deal');
  } catch (error) {
    console.error('[DealIntake] Check access error:', error);
    return sendError(res, 500, error.message);
  }
}

/**
 * List broker invitations for current user
 * GET /api/intake/invitations
 */
async function handleListInvitations(req, res, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  try {
    const invitations = await prisma.brokerInvitation.findMany({
      where: {
        brokerEmail: authUser.email.toLowerCase(),
        status: { in: ['PENDING', 'ACCEPTED'] }
      },
      include: {
        dealDraft: {
          select: {
            id: true,
            propertyName: true,
            propertyAddress: true,
            status: true,
            assetType: true,
            askingPrice: true,
            priceMin: true,
            priceMax: true
          }
        }
      },
      orderBy: { sentAt: 'desc' }
    });

    console.log('[DealIntake] Listed invitations for user', {
      userEmail: authUser.email,
      count: invitations.length
    });

    return sendJson(res, 200, { invitations });
  } catch (error) {
    console.error('[DealIntake] List invitations error:', error);
    return sendError(res, 500, error.message);
  }
}

/**
 * Accept a broker invitation
 * POST /api/intake/invitation/:id/accept
 */
async function handleAcceptInvitation(req, res, invitationId, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  try {
    // Find the invitation
    const invitation = await prisma.brokerInvitation.findUnique({
      where: { id: invitationId },
      include: { dealDraft: true }
    });

    if (!invitation) {
      return sendError(res, 404, 'Invitation not found');
    }

    // Verify this invitation was sent to the current user
    if (invitation.brokerEmail.toLowerCase() !== authUser.email.toLowerCase()) {
      return sendError(res, 403, 'This invitation was not sent to you');
    }

    // Check invitation status
    if (invitation.status !== 'PENDING') {
      return sendError(res, 400, `Invitation already ${invitation.status.toLowerCase()}`);
    }

    // Check if expired
    if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
      return sendError(res, 400, 'Invitation has expired');
    }

    // Update invitation status
    await prisma.brokerInvitation.update({
      where: { id: invitationId },
      data: {
        status: 'ACCEPTED',
        respondedAt: new Date(),
        respondedByUserId: authUser.id
      }
    });

    // Update deal status to LISTED_ACTIVE
    if (invitation.dealDraftId) {
      await prisma.dealDraft.update({
        where: { id: invitation.dealDraftId },
        data: { status: 'LISTED_ACTIVE' }
      });
    }

    // Create notification for the inviter (GP/Seller)
    try {
      await prisma.notification.create({
        data: {
          id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          userId: invitation.invitedBy,
          type: 'LISTING_INVITATION_ACCEPTED',
          title: 'Broker accepted invitation',
          body: `${authUser.name || authUser.email} has accepted your invitation to represent ${invitation.dealDraft?.propertyName || 'your property'}`,
          dealId: invitation.dealDraftId,
          actionUrl: `/DealWorkspace?dealDraftId=${invitation.dealDraftId}`,
          isRead: false,
          createdAt: new Date()
        }
      });
    } catch (notifError) {
      console.warn('[DealIntake] Failed to create notification:', notifError.message);
    }

    console.log('[DealIntake] Invitation accepted', {
      invitationId,
      dealDraftId: invitation.dealDraftId,
      broker: authUser.email
    });

    return sendJson(res, 200, {
      success: true,
      message: 'Invitation accepted',
      dealDraftId: invitation.dealDraftId
    });
  } catch (error) {
    console.error('[DealIntake] Accept invitation error:', error);
    return sendError(res, 500, error.message);
  }
}

/**
 * Decline a broker invitation
 * POST /api/intake/invitation/:id/decline
 */
async function handleDeclineInvitation(req, res, invitationId, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  try {
    // Find the invitation
    const invitation = await prisma.brokerInvitation.findUnique({
      where: { id: invitationId },
      include: { dealDraft: true }
    });

    if (!invitation) {
      return sendError(res, 404, 'Invitation not found');
    }

    // Verify this invitation was sent to the current user
    if (invitation.brokerEmail.toLowerCase() !== authUser.email.toLowerCase()) {
      return sendError(res, 403, 'This invitation was not sent to you');
    }

    // Check invitation status
    if (invitation.status !== 'PENDING') {
      return sendError(res, 400, `Invitation already ${invitation.status.toLowerCase()}`);
    }

    // Update invitation status
    await prisma.brokerInvitation.update({
      where: { id: invitationId },
      data: {
        status: 'DECLINED',
        respondedAt: new Date(),
        respondedByUserId: authUser.id
      }
    });

    // Create notification for the inviter (GP/Seller)
    try {
      await prisma.notification.create({
        data: {
          id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          userId: invitation.invitedBy,
          type: 'LISTING_INVITATION_DECLINED',
          title: 'Broker declined invitation',
          body: `${authUser.name || authUser.email} has declined your invitation to represent ${invitation.dealDraft?.propertyName || 'your property'}`,
          dealId: invitation.dealDraftId,
          actionUrl: `/DealWorkspace?dealDraftId=${invitation.dealDraftId}`,
          isRead: false,
          createdAt: new Date()
        }
      });
    } catch (notifError) {
      console.warn('[DealIntake] Failed to create notification:', notifError.message);
    }

    console.log('[DealIntake] Invitation declined', {
      invitationId,
      dealDraftId: invitation.dealDraftId,
      broker: authUser.email
    });

    return sendJson(res, 200, {
      success: true,
      message: 'Invitation declined'
    });
  } catch (error) {
    console.error('[DealIntake] Decline invitation error:', error);
    return sendError(res, 500, error.message);
  }
}

// ============================================================================
// COMMISSION NEGOTIATION HANDLERS
// ============================================================================

/**
 * Get negotiation history for an invitation
 * GET /api/intake/invitation/:id/negotiations
 */
async function handleGetNegotiations(req, res, invitationId, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  console.log('[DealIntake] Get negotiations', { invitationId, userId: authUser.id });

  try {
    const invitation = await prisma.brokerInvitation.findUnique({
      where: { id: invitationId },
      include: {
        dealDraft: true,
        negotiations: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!invitation) {
      return sendError(res, 404, 'Invitation not found');
    }

    // Check access - must be inviter (seller) or invitee (broker)
    const isSeller = invitation.invitedBy === authUser.id;
    const isBroker = invitation.brokerEmail.toLowerCase() === authUser.email.toLowerCase();

    if (!isSeller && !isBroker) {
      return sendError(res, 403, 'Not authorized to view this negotiation');
    }

    return sendJson(res, 200, {
      negotiations: invitation.negotiations,
      invitationStatus: invitation.status,
      negotiationStatus: invitation.negotiationStatus,
      sellerTerms: {
        commissionType: invitation.commissionType,
        commissionRate: invitation.commissionRate,
        commissionAmount: invitation.commissionAmount,
        commissionNotes: invitation.commissionNotes
      }
    });
  } catch (error) {
    console.error('[DealIntake] Get negotiations error:', error);
    return sendError(res, 500, error.message);
  }
}

/**
 * Submit a counter-offer for commission terms
 * POST /api/intake/invitation/:id/counter-offer
 */
async function handleCounterOffer(req, res, invitationId, readJsonBody, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  console.log('[DealIntake] Counter offer submitted', { invitationId, userId: authUser.id });

  const body = await readJsonBody(req);

  // ========== VALIDATION ==========
  const validationLog = createValidationLogger('handleCounterOffer');
  validationLog.beforeValidation(body);

  const parsed = CounterOfferSchema.safeParse(body);
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

  const { commissionType, commissionRate, commissionAmount, notes } = parsed.data;

  try {
    const invitation = await prisma.brokerInvitation.findUnique({
      where: { id: invitationId },
      include: {
        dealDraft: true,
        negotiations: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    if (!invitation) {
      return sendError(res, 404, 'Invitation not found');
    }

    // Check access and determine role
    const isSeller = invitation.invitedBy === authUser.id;
    const isBroker = invitation.brokerEmail.toLowerCase() === authUser.email.toLowerCase();

    if (!isSeller && !isBroker) {
      return sendError(res, 403, 'Not authorized to make counter-offer');
    }

    // Determine round number
    const lastNegotiation = invitation.negotiations[0];
    const round = lastNegotiation ? lastNegotiation.round + 1 : 1;

    // Create negotiation record
    const negotiation = await prisma.commissionNegotiation.create({
      data: {
        invitationId,
        proposedBy: authUser.id,
        proposedByRole: isSeller ? 'SELLER' : 'BROKER',
        commissionType,
        commissionRate: commissionRate ? parseFloat(commissionRate) / 100 : null, // Convert percent to decimal
        commissionAmount: commissionAmount ? parseFloat(commissionAmount) : null,
        notes,
        status: 'PENDING',
        round
      }
    });

    // Update invitation negotiation status
    await prisma.brokerInvitation.update({
      where: { id: invitationId },
      data: { negotiationStatus: 'PENDING' }
    });

    // Create notification for the other party
    const notifyUserId = isSeller ? null : invitation.invitedBy;
    const notifyEmail = isSeller ? invitation.brokerEmail : null;

    if (notifyUserId) {
      try {
        await prisma.notification.create({
          data: {
            id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            userId: notifyUserId,
            type: 'COMMISSION_COUNTER_OFFER',
            title: 'Commission counter-offer received',
            body: `${authUser.name || authUser.email} submitted a counter-offer for ${invitation.dealDraft?.propertyName || 'your listing'}`,
            dealId: invitation.dealDraftId,
            actionUrl: `/DealWorkspace?dealDraftId=${invitation.dealDraftId}`,
            isRead: false,
            createdAt: new Date()
          }
        });
      } catch (notifError) {
        console.warn('[DealIntake] Failed to create notification:', notifError.message);
      }
    }

    // Warning after 3 rounds
    if (round >= 3) {
      console.log('[DealIntake] Negotiation round warning', { invitationId, round });
    }

    console.log('[DealIntake] Counter offer created', { negotiationId: negotiation.id, round });

    return sendJson(res, 201, {
      success: true,
      negotiation,
      round,
      warning: round >= 3 ? 'Multiple negotiation rounds. Consider direct communication.' : null
    });
  } catch (error) {
    console.error('[DealIntake] Counter offer error:', error);
    return sendError(res, 500, error.message);
  }
}

/**
 * Accept a negotiation offer
 * POST /api/intake/negotiation/:id/accept
 */
async function handleAcceptNegotiation(req, res, negotiationId, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  console.log('[DealIntake] Accept negotiation', { negotiationId, userId: authUser.id });

  try {
    const negotiation = await prisma.commissionNegotiation.findUnique({
      where: { id: negotiationId },
      include: {
        invitation: {
          include: { dealDraft: true }
        }
      }
    });

    if (!negotiation) {
      return sendError(res, 404, 'Negotiation not found');
    }

    if (negotiation.status !== 'PENDING') {
      return sendError(res, 400, `Negotiation already ${negotiation.status.toLowerCase()}`);
    }

    // Only the other party can accept (not the one who proposed)
    const invitation = negotiation.invitation;
    const isSeller = invitation.invitedBy === authUser.id;
    const isBroker = invitation.brokerEmail.toLowerCase() === authUser.email.toLowerCase();

    if (!isSeller && !isBroker) {
      return sendError(res, 403, 'Not authorized');
    }

    // Cannot accept your own offer
    if (negotiation.proposedBy === authUser.id) {
      return sendError(res, 400, 'Cannot accept your own offer');
    }

    // Update negotiation
    await prisma.commissionNegotiation.update({
      where: { id: negotiationId },
      data: {
        status: 'ACCEPTED',
        respondedAt: new Date(),
        respondedBy: authUser.id
      }
    });

    // Update invitation with agreed terms
    await prisma.brokerInvitation.update({
      where: { id: invitation.id },
      data: {
        negotiationStatus: 'AGREED',
        commissionType: negotiation.commissionType,
        commissionRate: negotiation.commissionRate,
        commissionAmount: negotiation.commissionAmount,
        commissionNotes: negotiation.notes
      }
    });

    // Notify the proposer
    try {
      await prisma.notification.create({
        data: {
          id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          userId: negotiation.proposedBy,
          type: 'COMMISSION_AGREED',
          title: 'Commission terms accepted',
          body: `${authUser.name || authUser.email} has accepted your commission terms for ${invitation.dealDraft?.propertyName || 'the listing'}`,
          dealId: invitation.dealDraftId,
          actionUrl: `/DealWorkspace?dealDraftId=${invitation.dealDraftId}`,
          isRead: false,
          createdAt: new Date()
        }
      });
    } catch (notifError) {
      console.warn('[DealIntake] Failed to create notification:', notifError.message);
    }

    console.log('[DealIntake] Negotiation accepted', { negotiationId, invitationId: invitation.id });

    return sendJson(res, 200, {
      success: true,
      message: 'Commission terms agreed',
      agreedTerms: {
        commissionType: negotiation.commissionType,
        commissionRate: negotiation.commissionRate,
        commissionAmount: negotiation.commissionAmount
      }
    });
  } catch (error) {
    console.error('[DealIntake] Accept negotiation error:', error);
    return sendError(res, 500, error.message);
  }
}

/**
 * Flag invitation for negotiate-later
 * POST /api/intake/invitation/:id/negotiate-later
 */
async function handleNegotiateLater(req, res, invitationId, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  console.log('[DealIntake] Negotiate later flagged', { invitationId, userId: authUser.id });

  try {
    const invitation = await prisma.brokerInvitation.findUnique({
      where: { id: invitationId },
      include: { dealDraft: true }
    });

    if (!invitation) {
      return sendError(res, 404, 'Invitation not found');
    }

    // Check access
    const isSeller = invitation.invitedBy === authUser.id;
    const isBroker = invitation.brokerEmail.toLowerCase() === authUser.email.toLowerCase();

    if (!isSeller && !isBroker) {
      return sendError(res, 403, 'Not authorized');
    }

    // Update invitation
    await prisma.brokerInvitation.update({
      where: { id: invitationId },
      data: { negotiationStatus: 'NEGOTIATE_LATER' }
    });

    console.log('[DealIntake] Negotiation flagged for later', { invitationId });

    return sendJson(res, 200, {
      success: true,
      message: 'Marked for later negotiation'
    });
  } catch (error) {
    console.error('[DealIntake] Negotiate later error:', error);
    return sendError(res, 500, error.message);
  }
}

// ============================================================================
// LISTING CONFIGURATION HANDLERS
// ============================================================================

/**
 * Get listing configuration for a deal draft
 * GET /api/intake/draft/:id/listing-config
 */
async function handleGetListingConfig(req, res, dealDraftId, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  console.log('[DealIntake] Get listing config', { dealDraftId, userId: authUser.id });

  try {
    const config = await prisma.listingConfiguration.findUnique({
      where: { dealDraftId }
    });

    return sendJson(res, 200, { config: config || null });
  } catch (error) {
    console.error('[DealIntake] Get listing config error:', error);
    return sendError(res, 500, error.message);
  }
}

/**
 * Create or update listing configuration
 * POST /api/intake/draft/:id/listing-config
 */
async function handleCreateListingConfig(req, res, dealDraftId, readJsonBody, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  console.log('[DealIntake] Create/update listing config', { dealDraftId, userId: authUser.id });

  const body = await readJsonBody(req);

  // ========== VALIDATION ==========
  const validationLog = createValidationLogger('handleCreateListingConfig');
  validationLog.beforeValidation(body);

  const parsed = CreateListingConfigSchema.safeParse(body);
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

  try {
    const configData = {
      dealDraftId,
      visibility: parsed.data.visibility || 'PLATFORM',
      targetBuyerTypes: parsed.data.targetBuyerTypes || [],
      targetInvestmentMin: parsed.data.targetInvestmentMin || null,
      targetInvestmentMax: parsed.data.targetInvestmentMax || null,
      targetGeographies: parsed.data.targetGeographies || [],
      enableOM: parsed.data.enableOM !== false,
      enableFlyers: parsed.data.enableFlyers || false,
      enablePropertyWebsite: parsed.data.enablePropertyWebsite || false,
      offerDeadline: parsed.data.offerDeadline ? new Date(parsed.data.offerDeadline) : null,
      listingDuration: parsed.data.listingDuration || null,
      openHouseDates: parsed.data.openHouseDates?.map(d => new Date(d)) || [],
      configuredBy: authUser.id,
      configuredByName: authUser.name || authUser.email
    };

    const config = await prisma.listingConfiguration.upsert({
      where: { dealDraftId },
      create: configData,
      update: configData
    });

    console.log('[DealIntake] Listing config saved', { configId: config.id });

    return sendJson(res, 200, { config, message: 'Configuration saved' });
  } catch (error) {
    console.error('[DealIntake] Create listing config error:', error);
    return sendError(res, 500, error.message);
  }
}

/**
 * Confirm listing agreement (checkbox confirmation)
 * POST /api/intake/draft/:id/agreement/confirm
 */
async function handleConfirmAgreement(req, res, dealDraftId, readJsonBody, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  console.log('[DealIntake] Confirm agreement', { dealDraftId, userId: authUser.id });

  const body = await readJsonBody(req);

  // ========== VALIDATION ==========
  const validationLog = createValidationLogger('handleConfirmAgreement');
  validationLog.beforeValidation(body);

  const parsed = ConfirmAgreementSchema.safeParse(body);
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

  const { agreementId } = parsed.data;

  try {
    // Get client IP for ESIGN compliance
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                     req.headers['x-real-ip'] ||
                     req.socket?.remoteAddress ||
                     'unknown';

    const agreement = await prisma.listingAgreement.findUnique({
      where: { id: agreementId },
      include: { dealDraft: true }
    });

    if (!agreement) {
      return sendError(res, 404, 'Agreement not found');
    }

    // Determine which party is confirming
    const isSeller = agreement.sellerUserId === authUser.id;
    const isBroker = agreement.brokerUserId === authUser.id;

    if (!isSeller && !isBroker) {
      return sendError(res, 403, 'Not authorized to confirm this agreement');
    }

    const updateData = {};
    if (isSeller && !agreement.sellerConfirmedAt) {
      updateData.sellerConfirmedAt = new Date();
      updateData.sellerConfirmedIp = clientIp;
    }
    if (isBroker && !agreement.brokerConfirmedAt) {
      updateData.brokerConfirmedAt = new Date();
      updateData.brokerConfirmedIp = clientIp;
    }

    // Check if both parties have now confirmed
    const bothConfirmed = (agreement.sellerConfirmedAt || updateData.sellerConfirmedAt) &&
                          (agreement.brokerConfirmedAt || updateData.brokerConfirmedAt);

    if (bothConfirmed) {
      updateData.status = 'ACTIVE';
    } else if (isSeller) {
      updateData.status = 'PENDING_BROKER';
    } else {
      updateData.status = 'PENDING_SELLER';
    }

    const updated = await prisma.listingAgreement.update({
      where: { id: agreementId },
      data: updateData
    });

    console.log('[DealIntake] Agreement confirmed', {
      agreementId,
      confirmedBy: isSeller ? 'SELLER' : 'BROKER',
      clientIp,
      status: updated.status
    });

    return sendJson(res, 200, {
      success: true,
      agreement: updated,
      bothConfirmed,
      message: bothConfirmed ? 'Agreement fully executed' : 'Confirmation recorded'
    });
  } catch (error) {
    console.error('[DealIntake] Confirm agreement error:', error);
    return sendError(res, 500, error.message);
  }
}

// ============================================================================
// Route Dispatcher
// ============================================================================

/**
 * Main route dispatcher for /api/intake/*
 */
export function dispatchIntakeRoutes(req, res, segments, readJsonBody, authUser, kernelBaseUrl) {
  const method = req.method;
  // segments = ['api', 'intake', ...] so we check from index 2 onwards

  console.log('[DealIntake] dispatchIntakeRoutes', { method, segments });

  // POST /api/intake/draft - Create draft
  if (method === 'POST' && segments.length === 3 && segments[2] === 'draft') {
    return handleCreateDraft(req, res, readJsonBody, authUser);
  }

  // GET /api/intake/drafts - List drafts
  if (method === 'GET' && segments.length === 3 && segments[2] === 'drafts') {
    return handleListDrafts(req, res, authUser);
  }

  // GET /api/intake/deals - List marketplace deals (public listings)
  if (method === 'GET' && segments.length === 3 && segments[2] === 'deals') {
    return handleListMarketplaceDeals(req, res, authUser);
  }

  // GET /api/intake/draft/:id - Get draft
  if (method === 'GET' && segments.length === 4 && segments[2] === 'draft') {
    const dealDraftId = segments[3];
    return handleGetDraft(req, res, dealDraftId, authUser);
  }

  // PATCH /api/intake/draft/:id - Update draft
  if (method === 'PATCH' && segments.length === 4 && segments[2] === 'draft') {
    const dealDraftId = segments[3];
    return handleUpdateDraft(req, res, dealDraftId, readJsonBody, authUser);
  }

  // POST /api/intake/draft/:id/listing - Create listing
  if (method === 'POST' && segments.length === 5 && segments[2] === 'draft' && segments[4] === 'listing') {
    const dealDraftId = segments[3];
    return handleCreateListing(req, res, dealDraftId, readJsonBody, authUser);
  }

  // GET /api/intake/draft/:id/listing - Get listing details
  if (method === 'GET' && segments.length === 5 && segments[2] === 'draft' && segments[4] === 'listing') {
    const dealDraftId = segments[3];
    return handleGetListing(req, res, dealDraftId, authUser);
  }

  // DELETE /api/intake/draft/:id/listing - Cancel listing
  if (method === 'DELETE' && segments.length === 5 && segments[2] === 'draft' && segments[4] === 'listing') {
    const dealDraftId = segments[3];
    return handleCancelListing(req, res, dealDraftId, authUser);
  }

  // POST /api/intake/draft/:id/documents - Upload documents
  if (method === 'POST' && segments.length === 5 && segments[2] === 'draft' && segments[4] === 'documents') {
    const dealDraftId = segments[3];
    return handleUploadDocuments(req, res, dealDraftId, readJsonBody, authUser);
  }

  // POST /api/intake/draft/:id/paste - Paste text
  if (method === 'POST' && segments.length === 5 && segments[2] === 'draft' && segments[4] === 'paste') {
    const dealDraftId = segments[3];
    return handlePasteText(req, res, dealDraftId, readJsonBody, authUser);
  }

  // POST /api/intake/draft/:id/brokers - Add broker
  if (method === 'POST' && segments.length === 5 && segments[2] === 'draft' && segments[4] === 'brokers') {
    const dealDraftId = segments[3];
    return handleAddBroker(req, res, dealDraftId, readJsonBody, authUser);
  }

  // POST /api/intake/draft/:id/seller - Set seller
  if (method === 'POST' && segments.length === 5 && segments[2] === 'draft' && segments[4] === 'seller') {
    const dealDraftId = segments[3];
    return handleSetSeller(req, res, dealDraftId, readJsonBody, authUser);
  }

  // GET /api/intake/draft/:id/claims - Get claims
  if (method === 'GET' && segments.length === 5 && segments[2] === 'draft' && segments[4] === 'claims') {
    const dealDraftId = segments[3];
    return handleGetClaims(req, res, dealDraftId, authUser);
  }

  // POST /api/intake/draft/:id/claims/:claimId/verify - Verify claim
  if (method === 'POST' && segments.length === 7 && segments[2] === 'draft' && segments[4] === 'claims' && segments[6] === 'verify') {
    const dealDraftId = segments[3];
    const claimId = segments[5];
    return handleVerifyClaim(req, res, dealDraftId, claimId, readJsonBody, authUser);
  }

  // GET /api/intake/draft/:id/conflicts - Get conflicts
  if (method === 'GET' && segments.length === 5 && segments[2] === 'draft' && segments[4] === 'conflicts') {
    const dealDraftId = segments[3];
    return handleGetConflicts(req, res, dealDraftId, authUser);
  }

  // POST /api/intake/draft/:id/conflicts/:conflictId/resolve - Resolve conflict
  if (method === 'POST' && segments.length === 7 && segments[2] === 'draft' && segments[4] === 'conflicts' && segments[6] === 'resolve') {
    const dealDraftId = segments[3];
    const conflictId = segments[5];
    return handleResolveConflict(req, res, dealDraftId, conflictId, readJsonBody, authUser);
  }

  // POST /api/intake/draft/:id/advance - Advance status
  if (method === 'POST' && segments.length === 5 && segments[2] === 'draft' && segments[4] === 'advance') {
    const dealDraftId = segments[3];
    return handleAdvanceStatus(req, res, dealDraftId, readJsonBody, authUser);
  }

  // GET /api/intake/draft/:id/stats - Get stats
  if (method === 'GET' && segments.length === 5 && segments[2] === 'draft' && segments[4] === 'stats') {
    const dealDraftId = segments[3];
    return handleGetStats(req, res, dealDraftId, authUser);
  }

  // POST /api/intake/draft/:id/convert - Convert to kernel deal
  if (method === 'POST' && segments.length === 5 && segments[2] === 'draft' && segments[4] === 'convert') {
    const dealDraftId = segments[3];
    return handleConvertToDeal(req, res, dealDraftId, readJsonBody, authUser, kernelBaseUrl);
  }

  // GET /api/intake/draft/:id/access - Check user's access level to a deal
  if (method === 'GET' && segments.length === 5 && segments[2] === 'draft' && segments[4] === 'access') {
    const dealDraftId = segments[3];
    return handleCheckAccess(req, res, dealDraftId, authUser);
  }

  // GET /api/intake/invitations - List broker invitations for current user
  if (method === 'GET' && segments.length === 3 && segments[2] === 'invitations') {
    return handleListInvitations(req, res, authUser);
  }

  // POST /api/intake/invitation/:id/accept - Accept broker invitation
  if (method === 'POST' && segments.length === 5 && segments[2] === 'invitation' && segments[4] === 'accept') {
    const invitationId = segments[3];
    return handleAcceptInvitation(req, res, invitationId, authUser);
  }

  // POST /api/intake/invitation/:id/decline - Decline broker invitation
  if (method === 'POST' && segments.length === 5 && segments[2] === 'invitation' && segments[4] === 'decline') {
    const invitationId = segments[3];
    return handleDeclineInvitation(req, res, invitationId, authUser);
  }

  // GET /api/intake/invitation/:id/negotiations - Get negotiation history
  if (method === 'GET' && segments.length === 5 && segments[2] === 'invitation' && segments[4] === 'negotiations') {
    const invitationId = segments[3];
    return handleGetNegotiations(req, res, invitationId, authUser);
  }

  // POST /api/intake/invitation/:id/counter-offer - Submit counter-offer
  if (method === 'POST' && segments.length === 5 && segments[2] === 'invitation' && segments[4] === 'counter-offer') {
    const invitationId = segments[3];
    return handleCounterOffer(req, res, invitationId, readJsonBody, authUser);
  }

  // POST /api/intake/negotiation/:id/accept - Accept negotiation offer
  if (method === 'POST' && segments.length === 5 && segments[2] === 'negotiation' && segments[4] === 'accept') {
    const negotiationId = segments[3];
    return handleAcceptNegotiation(req, res, negotiationId, authUser);
  }

  // POST /api/intake/invitation/:id/negotiate-later - Flag for later negotiation
  if (method === 'POST' && segments.length === 5 && segments[2] === 'invitation' && segments[4] === 'negotiate-later') {
    const invitationId = segments[3];
    return handleNegotiateLater(req, res, invitationId, authUser);
  }

  // GET /api/intake/draft/:id/listing-config - Get listing configuration
  if (method === 'GET' && segments.length === 5 && segments[2] === 'draft' && segments[4] === 'listing-config') {
    const dealDraftId = segments[3];
    return handleGetListingConfig(req, res, dealDraftId, authUser);
  }

  // POST /api/intake/draft/:id/listing-config - Create/update listing configuration
  if (method === 'POST' && segments.length === 5 && segments[2] === 'draft' && segments[4] === 'listing-config') {
    const dealDraftId = segments[3];
    return handleCreateListingConfig(req, res, dealDraftId, readJsonBody, authUser);
  }

  // POST /api/intake/draft/:id/agreement/confirm - Confirm listing agreement
  if (method === 'POST' && segments.length === 6 && segments[2] === 'draft' && segments[4] === 'agreement' && segments[5] === 'confirm') {
    const dealDraftId = segments[3];
    return handleConfirmAgreement(req, res, dealDraftId, readJsonBody, authUser);
  }

  // Not found
  console.log('[DealIntake] Route not found', { method, segments });
  return sendError(res, 404, 'Route not found');
}
