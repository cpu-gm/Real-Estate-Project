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
import { PrismaClient } from '@prisma/client';

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

  const { ingestSource, sourceData, seller } = body;

  // Validate ingest source
  if (!ingestSource || !INGEST_SOURCES.has(ingestSource)) {
    return sendError(res, 400, `Invalid ingestSource. Valid values: ${[...INGEST_SOURCES].join(', ')}`);
  }

  try {
    const dealDraft = await dealIngestService.createDealDraft({
      organizationId: authUser.organizationId,
      broker: {
        userId: authUser.id,
        email: authUser.email,
        name: authUser.name,
        firmName: body.brokerFirm
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
    status,
    limit,
    offset
  });

  try {
    const result = await dealIngestService.listDealDrafts(authUser.organizationId, {
      status,
      userId: authUser.id, // Show drafts where user is broker OR seller
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
 * Get a single deal draft
 * GET /api/intake/draft/:id
 */
export async function handleGetDraft(req, res, dealDraftId, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  try {
    const dealDraft = await dealIngestService.getDealDraft(dealDraftId, true);

    // Check access:
    // - Must be broker on this deal, OR
    // - Must be seller on this deal, OR
    // - Must be GP in the same organization (for GP Dashboard), OR
    // - Must be Admin
    const isBroker = dealDraft.brokers?.some(b => b.userId === authUser.id);
    const isSeller = dealDraft.seller?.userId === authUser.id;
    const isSameOrg = dealDraft.organizationId === authUser.organizationId;
    const isGPInOrg = isSameOrg && (authUser.role === 'GP' || authUser.role === 'GP Analyst');

    if (!isBroker && !isSeller && !isGPInOrg && authUser.role !== 'Admin') {
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
  if (!body?.documents || !Array.isArray(body.documents)) {
    return sendError(res, 400, 'documents array required');
  }

  try {
    // Verify access
    const dealDraft = await dealIngestService.getDealDraft(dealDraftId, true);
    const isBroker = dealDraft.brokers?.some(b => b.userId === authUser.id);

    if (!isBroker && authUser.role !== 'Admin') {
      return sendError(res, 403, 'Only brokers can upload documents');
    }

    const result = await dealIngestService.addDocuments(
      dealDraftId,
      body.documents,
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
  if (!body?.text || typeof body.text !== 'string') {
    return sendError(res, 400, 'text field required');
  }

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
      text: body.text,
      sourceName: body.sourceName || 'Pasted Text'
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
  if (!body?.email || !body?.name) {
    return sendError(res, 400, 'email and name required');
  }

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
    let userId = body.userId;
    if (!userId) {
      const user = await prisma.authUser.findFirst({
        where: {
          email: body.email,
          organizationId: authUser.organizationId
        }
      });
      userId = user?.id || `pending_${body.email}`;
    }

    const broker = await dealIngestService.addCoBroker(
      dealDraftId,
      {
        userId,
        email: body.email,
        name: body.name,
        firmName: body.firmName
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
  if (!body?.email || !body?.name) {
    return sendError(res, 400, 'email and name required');
  }

  try {
    // Verify caller is a broker on this deal
    const broker = await prisma.dealDraftBroker.findFirst({
      where: { dealDraftId, userId: authUser.id }
    });

    if (!broker && authUser.role !== 'Admin') {
      return sendError(res, 403, 'Only brokers can set seller');
    }

    // Look up user by email
    let userId = body.userId;
    if (!userId) {
      const user = await prisma.authUser.findFirst({
        where: {
          email: body.email,
          organizationId: authUser.organizationId
        }
      });
      userId = user?.id || `pending_${body.email}`;
    }

    const seller = await dealIngestService.setSeller(
      dealDraftId,
      {
        userId,
        email: body.email,
        name: body.name,
        entityName: body.entityName,
        hasDirectAccess: body.hasDirectAccess,
        receiveNotifications: body.receiveNotifications,
        requiresOMApproval: body.requiresOMApproval,
        requiresBuyerApproval: body.requiresBuyerApproval,
        sellerSeesBuyerIdentity: body.sellerSeesBuyerIdentity
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
  const { action, correctedValue, rejectionReason } = body || {};

  if (!action || !['confirm', 'reject'].includes(action)) {
    return sendError(res, 400, 'action must be "confirm" or "reject"');
  }

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
  if (!body?.method) {
    return sendError(res, 400, 'method required (CHOSE_CLAIM_A, CHOSE_CLAIM_B, MANUAL_OVERRIDE, AVERAGED)');
  }

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
        resolvedClaimId: body.resolvedClaimId,
        resolvedValue: body.resolvedValue,
        method: body.method
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
  if (!body?.status) {
    return sendError(res, 400, 'status required');
  }

  if (!Object.values(DEAL_DRAFT_STATUSES).includes(body.status)) {
    return sendError(res, 400, `Invalid status. Valid values: ${Object.values(DEAL_DRAFT_STATUSES).join(', ')}`);
  }

  try {
    // Verify access based on transition
    const dealDraft = await dealIngestService.getDealDraft(dealDraftId, true);

    // Check permissions for specific transitions
    if (body.status === DEAL_DRAFT_STATUSES.OM_BROKER_APPROVED) {
      const isBroker = dealDraft.brokers?.some(b => b.userId === authUser.id);
      if (!isBroker && authUser.role !== 'Admin') {
        return sendError(res, 403, 'Only brokers can approve OM');
      }
    }

    if (body.status === DEAL_DRAFT_STATUSES.OM_APPROVED_FOR_MARKETING) {
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
      body.status,
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
export async function handleConvertToDeal(req, res, dealDraftId, readJsonBody, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  const body = await readJsonBody(req);
  const { winningBuyerUserId, notes } = body || {};

  if (!winningBuyerUserId) {
    return sendError(res, 400, 'winningBuyerUserId required');
  }

  try {
    // Verify access - only broker or admin can convert
    const dealDraft = await dealIngestService.getDealDraft(dealDraftId, true);
    const isBroker = dealDraft.brokers?.some(b => b.userId === authUser.id);

    if (!isBroker && authUser.role !== 'Admin') {
      return sendError(res, 403, 'Only brokers can convert deals');
    }

    // Find the winning buyer
    const winningBuyer = await prisma.user.findUnique({
      where: { id: winningBuyerUserId }
    });

    if (!winningBuyer) {
      return sendError(res, 404, 'Winning buyer not found');
    }

    // Create the kernel deal
    const kernelDealId = `deal-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const kernelDeal = await prisma.deal.create({
      data: {
        id: kernelDealId,
        name: dealDraft.propertyName || dealDraft.propertyAddress || 'Converted Deal',
        address: dealDraft.propertyAddress,
        assetType: dealDraft.assetType,
        acquisitionPrice: dealDraft.askingPrice,
        status: 'PRE_CLOSING',
        // Set the winning buyer as the GP
        gp: {
          connect: { id: winningBuyerUserId }
        },
        organizationId: winningBuyer.organizationId || authUser.organizationId,
        metadata: JSON.stringify({
          convertedFromDraftId: dealDraftId,
          convertedAt: new Date().toISOString(),
          convertedBy: authUser.id,
          originalSellerId: dealDraft.seller?.userId,
          notes
        }),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

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

  try {
    // Get the draft first to check access
    const dealDraft = await dealIngestService.getDealDraft(dealDraftId, true);

    // Check access (same as handleGetDraft)
    const isBroker = dealDraft.brokers?.some(b => b.userId === authUser.id);
    const isSeller = dealDraft.seller?.userId === authUser.id;
    const isSameOrg = dealDraft.organizationId === authUser.organizationId;
    const isGPInOrg = isSameOrg && (authUser.role === 'GP' || authUser.role === 'GP Analyst');

    if (!isBroker && !isSeller && !isGPInOrg && authUser.role !== 'Admin') {
      return sendError(res, 403, 'Access denied');
    }

    // Allowed fields to update
    const allowedFields = [
      'status', 'listingType', 'askingPrice', 'askingPriceMin', 'askingPriceMax',
      'propertyName', 'propertyAddress', 'assetType', 'unitCount', 'totalSF'
    ];

    const updateData = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
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

  const { pricingType, askingPrice, priceMin, priceMax, listingType, broker } = body;

  try {
    // Get the draft first to check access
    const dealDraft = await dealIngestService.getDealDraft(dealDraftId, true);

    // Check access
    const isBroker = dealDraft.brokers?.some(b => b.userId === authUser.id);
    const isSeller = dealDraft.seller?.userId === authUser.id;
    const isSameOrg = dealDraft.organizationId === authUser.organizationId;
    const isGPInOrg = isSameOrg && (authUser.role === 'GP' || authUser.role === 'GP Analyst');

    if (!isBroker && !isSeller && !isGPInOrg && authUser.role !== 'Admin') {
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
          brokerEmail: broker.email,
          brokerName: broker.name || null,
          brokerFirmName: broker.firmName || null,
          brokerUserId: brokerUser?.id || null,
          status: 'PENDING',
          token,
          invitedBy: authUser.id,
          invitedByName: authUser.name,
          invitedByEmail: authUser.email,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          createdAt: new Date()
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

    // Check access
    const isBroker = dealDraft.brokers?.some(b => b.userId === authUser.id);
    const isSeller = dealDraft.seller?.userId === authUser.id;
    const isSameOrg = dealDraft.organizationId === authUser.organizationId;
    const isGPInOrg = isSameOrg && (authUser.role === 'GP' || authUser.role === 'GP Analyst');

    if (!isBroker && !isSeller && !isGPInOrg && authUser.role !== 'Admin') {
      return sendError(res, 403, 'Access denied');
    }

    // Get broker invitation if exists
    const brokerInvitation = await prisma.brokerInvitation.findFirst({
      where: { dealDraftId },
      orderBy: { createdAt: 'desc' }
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
        invitedAt: brokerInvitation.createdAt,
        acceptedAt: brokerInvitation.acceptedAt
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
// Route Dispatcher
// ============================================================================

/**
 * Main route dispatcher for /api/intake/*
 */
export function dispatchIntakeRoutes(req, res, segments, readJsonBody, authUser) {
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
    return handleConvertToDeal(req, res, dealDraftId, readJsonBody, authUser);
  }

  // Not found
  console.log('[DealIntake] Route not found', { method, segments });
  return sendError(res, 404, 'Route not found');
}
