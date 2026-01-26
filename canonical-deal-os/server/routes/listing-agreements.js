/**
 * Listing Agreement Routes - Manage seller-broker listing agreements
 *
 * Routes:
 *   POST   /api/listing-agreements                    - Create listing agreement
 *   GET    /api/listing-agreements/:id                - Get agreement details
 *   PATCH  /api/listing-agreements/:id                - Update agreement terms
 *   POST   /api/listing-agreements/:id/confirm        - Confirm agreement (seller or broker)
 *   POST   /api/listing-agreements/:id/terminate      - Terminate agreement early
 *   GET    /api/deals/:dealId/agreement               - Get agreement for a deal
 */

import { getPrisma } from "../db.js";
import { isBrokerRole } from "../../src/lib/permissions.js";
import { createValidationLogger } from "../services/validation-logger.js";
import {
  CreateListingAgreementSchema,
  UpdateListingAgreementSchema,
  TerminateAgreementSchema
} from "../middleware/route-schemas.js";

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS"
  });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message, details = null) {
  sendJson(res, status, { message, details });
}

// Agreement types
const AGREEMENT_TYPES = {
  EXCLUSIVE_RIGHT_TO_SELL: 'EXCLUSIVE_RIGHT_TO_SELL',
  EXCLUSIVE_AGENCY: 'EXCLUSIVE_AGENCY',
  OPEN: 'OPEN'
};

// Agreement statuses
const AGREEMENT_STATUS = {
  DRAFT: 'DRAFT',
  PENDING_SELLER: 'PENDING_SELLER',
  PENDING_BROKER: 'PENDING_BROKER',
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  TERMINATED: 'TERMINATED'
};

/**
 * POST /api/listing-agreements
 * Create a new listing agreement for a deal
 */
async function handleCreateAgreement(req, res, readJsonBody, authUser) {
  const body = await readJsonBody(req);

  // ========== VALIDATION ==========
  const validationLog = createValidationLogger('handleCreateAgreement');
  validationLog.beforeValidation(body);

  const parsed = CreateListingAgreementSchema.safeParse(body);
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
    dealDraftId,
    agreementType,
    sellerUserId,
    sellerEntityName,
    brokerUserId,
    commissionPercent,
    commissionFlat,
    listingPriceMin,
    listingPriceMax,
    termStartDate,
    termEndDate
  } = parsed.data;

  const prisma = getPrisma();

  // Verify deal draft exists and user has access
  const dealDraft = await prisma.dealDraft.findUnique({
    where: { id: dealDraftId },
    include: {
      seller: true,
      brokers: true
    }
  });

  if (!dealDraft) {
    return sendError(res, 404, "Deal draft not found");
  }

  // Check if agreement already exists for this deal
  const existingAgreement = await prisma.listingAgreement.findFirst({
    where: {
      dealDraftId,
      status: { notIn: ['TERMINATED', 'EXPIRED'] }
    }
  });

  if (existingAgreement) {
    return sendError(res, 409, "An active listing agreement already exists for this deal");
  }

  // Determine seller and broker
  const finalSellerUserId = sellerUserId || dealDraft.createdBy;
  const finalBrokerUserId = brokerUserId || (isBrokerRole(authUser.role) ? authUser.id : null);

  if (!finalBrokerUserId) {
    return sendError(res, 400, "Broker user ID is required");
  }

  // Verify the broker is actually a broker
  const broker = await prisma.authUser.findUnique({
    where: { id: finalBrokerUserId }
  });

  if (!broker || !isBrokerRole(broker.role)) {
    return sendError(res, 400, "Specified broker user is not a broker");
  }

  // Create the agreement
  const agreement = await prisma.listingAgreement.create({
    data: {
      dealDraftId,
      agreementType,
      sellerUserId: finalSellerUserId,
      sellerEntityName: sellerEntityName || null,
      brokerUserId: finalBrokerUserId,
      brokerageId: broker.brokerageId || null,
      commissionPercent: commissionPercent || null,
      commissionFlat: commissionFlat || null,
      listingPriceMin: listingPriceMin || null,
      listingPriceMax: listingPriceMax || null,
      termStartDate: new Date(termStartDate),
      termEndDate: new Date(termEndDate),
      status: AGREEMENT_STATUS.DRAFT
    },
    include: {
      seller: { select: { id: true, name: true, email: true } },
      broker: { select: { id: true, name: true, email: true, brokerLicenseNo: true, brokerLicenseState: true } },
      dealDraft: { select: { id: true, propertyName: true, propertyAddress: true } }
    }
  });

  return sendJson(res, 201, { agreement });
}

/**
 * GET /api/listing-agreements/:id
 * Get agreement details
 */
async function handleGetAgreement(req, res, agreementId, authUser) {
  const prisma = getPrisma();

  const agreement = await prisma.listingAgreement.findUnique({
    where: { id: agreementId },
    include: {
      seller: { select: { id: true, name: true, email: true, organizationId: true } },
      broker: { select: { id: true, name: true, email: true, brokerLicenseNo: true, brokerLicenseState: true, brokerageId: true } },
      dealDraft: { select: { id: true, propertyName: true, propertyAddress: true, assetType: true, askingPrice: true } },
      commissionAgreements: true
    }
  });

  if (!agreement) {
    return sendError(res, 404, "Listing agreement not found");
  }

  // Check access - must be seller, broker, or admin
  const isSeller = agreement.sellerUserId === authUser.id;
  const isBroker = agreement.brokerUserId === authUser.id;
  const isAdmin = authUser.role === 'Admin';
  const isSameOrg = agreement.seller.organizationId === authUser.organizationId;

  if (!isSeller && !isBroker && !isAdmin && !isSameOrg) {
    return sendError(res, 403, "You don't have access to this agreement");
  }

  return sendJson(res, 200, { agreement });
}

/**
 * PATCH /api/listing-agreements/:id
 * Update agreement terms (only in DRAFT status)
 */
async function handleUpdateAgreement(req, res, agreementId, readJsonBody, authUser) {
  const body = await readJsonBody(req);

  // ========== VALIDATION ==========
  const validationLog = createValidationLogger('handleUpdateAgreement');
  validationLog.beforeValidation(body);

  const parsed = UpdateListingAgreementSchema.safeParse(body);
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

  const prisma = getPrisma();

  const agreement = await prisma.listingAgreement.findUnique({
    where: { id: agreementId }
  });

  if (!agreement) {
    return sendError(res, 404, "Listing agreement not found");
  }

  // Can only update in DRAFT status
  if (agreement.status !== AGREEMENT_STATUS.DRAFT) {
    return sendError(res, 400, "Can only update agreements in DRAFT status");
  }

  // Check access - must be seller or broker
  const isSeller = agreement.sellerUserId === authUser.id;
  const isBrokerUser = agreement.brokerUserId === authUser.id;

  if (!isSeller && !isBrokerUser && authUser.role !== 'Admin') {
    return sendError(res, 403, "You don't have permission to update this agreement");
  }

  // Build update data
  const updateData = {};
  if (body.agreementType && Object.values(AGREEMENT_TYPES).includes(body.agreementType)) {
    updateData.agreementType = body.agreementType;
  }
  if (body.commissionPercent !== undefined) {
    updateData.commissionPercent = body.commissionPercent;
    updateData.commissionFlat = null; // Clear flat if setting percent
  }
  if (body.commissionFlat !== undefined) {
    updateData.commissionFlat = body.commissionFlat;
    updateData.commissionPercent = null; // Clear percent if setting flat
  }
  if (body.listingPriceMin !== undefined) updateData.listingPriceMin = body.listingPriceMin;
  if (body.listingPriceMax !== undefined) updateData.listingPriceMax = body.listingPriceMax;
  if (body.termStartDate) updateData.termStartDate = new Date(body.termStartDate);
  if (body.termEndDate) updateData.termEndDate = new Date(body.termEndDate);
  if (body.sellerEntityName !== undefined) updateData.sellerEntityName = body.sellerEntityName;

  const updatedAgreement = await prisma.listingAgreement.update({
    where: { id: agreementId },
    data: updateData,
    include: {
      seller: { select: { id: true, name: true, email: true } },
      broker: { select: { id: true, name: true, email: true } },
      dealDraft: { select: { id: true, propertyName: true } }
    }
  });

  return sendJson(res, 200, { agreement: updatedAgreement });
}

/**
 * POST /api/listing-agreements/:id/confirm
 * Confirm agreement (seller or broker)
 */
async function handleConfirmAgreement(req, res, agreementId, authUser) {
  const prisma = getPrisma();

  const agreement = await prisma.listingAgreement.findUnique({
    where: { id: agreementId }
  });

  if (!agreement) {
    return sendError(res, 404, "Listing agreement not found");
  }

  const isSeller = agreement.sellerUserId === authUser.id;
  const isBrokerUser = agreement.brokerUserId === authUser.id;

  if (!isSeller && !isBrokerUser) {
    return sendError(res, 403, "Only the seller or broker can confirm this agreement");
  }

  // Determine what to update based on who is confirming
  const updateData = {};
  let newStatus = agreement.status;

  if (isSeller && !agreement.sellerConfirmedAt) {
    updateData.sellerConfirmedAt = new Date();
    // If broker already confirmed, activate; otherwise wait for broker
    if (agreement.brokerConfirmedAt) {
      newStatus = AGREEMENT_STATUS.ACTIVE;
    } else {
      newStatus = AGREEMENT_STATUS.PENDING_BROKER;
    }
  } else if (isBrokerUser && !agreement.brokerConfirmedAt) {
    updateData.brokerConfirmedAt = new Date();
    // If seller already confirmed, activate; otherwise wait for seller
    if (agreement.sellerConfirmedAt) {
      newStatus = AGREEMENT_STATUS.ACTIVE;
    } else {
      newStatus = AGREEMENT_STATUS.PENDING_SELLER;
    }
  } else {
    return sendError(res, 400, "You have already confirmed this agreement");
  }

  updateData.status = newStatus;

  const updatedAgreement = await prisma.listingAgreement.update({
    where: { id: agreementId },
    data: updateData,
    include: {
      seller: { select: { id: true, name: true, email: true } },
      broker: { select: { id: true, name: true, email: true } },
      dealDraft: { select: { id: true, propertyName: true } }
    }
  });

  return sendJson(res, 200, {
    agreement: updatedAgreement,
    message: newStatus === AGREEMENT_STATUS.ACTIVE
      ? "Agreement is now active - both parties have confirmed"
      : `Waiting for ${newStatus === AGREEMENT_STATUS.PENDING_SELLER ? 'seller' : 'broker'} confirmation`
  });
}

/**
 * POST /api/listing-agreements/:id/terminate
 * Terminate agreement early
 */
async function handleTerminateAgreement(req, res, agreementId, readJsonBody, authUser) {
  const body = await readJsonBody(req);

  // ========== VALIDATION ==========
  const validationLog = createValidationLogger('handleTerminateAgreement');
  validationLog.beforeValidation(body);

  const parsed = TerminateAgreementSchema.safeParse(body);
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

  const { reason } = parsed.data;

  const prisma = getPrisma();

  const agreement = await prisma.listingAgreement.findUnique({
    where: { id: agreementId }
  });

  if (!agreement) {
    return sendError(res, 404, "Listing agreement not found");
  }

  // Can't terminate already terminated/expired
  if ([AGREEMENT_STATUS.TERMINATED, AGREEMENT_STATUS.EXPIRED].includes(agreement.status)) {
    return sendError(res, 400, "Agreement is already terminated or expired");
  }

  // Check access - must be seller, broker, or admin
  const isSeller = agreement.sellerUserId === authUser.id;
  const isBrokerUser = agreement.brokerUserId === authUser.id;
  const isAdmin = authUser.role === 'Admin';

  if (!isSeller && !isBrokerUser && !isAdmin) {
    return sendError(res, 403, "You don't have permission to terminate this agreement");
  }

  const updatedAgreement = await prisma.listingAgreement.update({
    where: { id: agreementId },
    data: {
      status: AGREEMENT_STATUS.TERMINATED,
      terminatedAt: new Date(),
      terminatedBy: authUser.id,
      terminationReason: reason || null
    },
    include: {
      seller: { select: { id: true, name: true } },
      broker: { select: { id: true, name: true } }
    }
  });

  return sendJson(res, 200, {
    agreement: updatedAgreement,
    message: "Agreement has been terminated"
  });
}

/**
 * GET /api/deals/:dealId/agreement
 * Get agreement for a specific deal
 */
async function handleGetDealAgreement(req, res, dealDraftId, authUser) {
  const prisma = getPrisma();

  const agreement = await prisma.listingAgreement.findFirst({
    where: {
      dealDraftId,
      status: { notIn: ['TERMINATED', 'EXPIRED'] }
    },
    include: {
      seller: { select: { id: true, name: true, email: true } },
      broker: { select: { id: true, name: true, email: true, brokerLicenseNo: true, brokerLicenseState: true } },
      dealDraft: { select: { id: true, propertyName: true, propertyAddress: true } }
    }
  });

  if (!agreement) {
    return sendJson(res, 200, { agreement: null });
  }

  return sendJson(res, 200, { agreement });
}

/**
 * Route dispatcher for /api/listing-agreements/*
 */
export function dispatchListingAgreementRoutes(req, res, segments, readJsonBody, authUser) {
  const method = req.method;
  // segments: ['api', 'listing-agreements', ...]

  // POST /api/listing-agreements - Create agreement
  if (segments.length === 2 && method === "POST") {
    return handleCreateAgreement(req, res, readJsonBody, authUser);
  }

  // GET /api/listing-agreements/:id
  if (segments.length === 3 && method === "GET") {
    const agreementId = segments[2];
    return handleGetAgreement(req, res, agreementId, authUser);
  }

  // PATCH /api/listing-agreements/:id
  if (segments.length === 3 && method === "PATCH") {
    const agreementId = segments[2];
    return handleUpdateAgreement(req, res, agreementId, readJsonBody, authUser);
  }

  // POST /api/listing-agreements/:id/confirm
  if (segments.length === 4 && segments[3] === "confirm" && method === "POST") {
    const agreementId = segments[2];
    return handleConfirmAgreement(req, res, agreementId, authUser);
  }

  // POST /api/listing-agreements/:id/terminate
  if (segments.length === 4 && segments[3] === "terminate" && method === "POST") {
    const agreementId = segments[2];
    return handleTerminateAgreement(req, res, agreementId, readJsonBody, authUser);
  }

  return sendError(res, 404, "Listing agreement route not found");
}

/**
 * Route dispatcher for /api/deals/:id/agreement
 * Called from deals routes
 */
export function handleDealAgreementRoute(req, res, dealDraftId, authUser) {
  if (req.method === "GET") {
    return handleGetDealAgreement(req, res, dealDraftId, authUser);
  }
  return sendError(res, 405, "Method not allowed");
}
