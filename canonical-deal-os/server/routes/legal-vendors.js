/**
 * Legal Vendors API Routes
 *
 * Provides vendor CRM functionality for GP Counsel to manage outside counsel,
 * law firms, title companies, and other legal service vendors.
 *
 * Routes:
 *   GET    /api/legal/vendors                - List all vendors (with filters)
 *   POST   /api/legal/vendors                - Create a new vendor
 *   GET    /api/legal/vendors/:id            - Get vendor by ID with stats
 *   PATCH  /api/legal/vendors/:id            - Update vendor
 *   DELETE /api/legal/vendors/:id            - Archive vendor
 *   POST   /api/legal/vendors/:id/contacts   - Add contact person
 *   PATCH  /api/legal/vendors/:id/contacts/:contactId - Update contact
 *   DELETE /api/legal/vendors/:id/contacts/:contactId - Remove contact
 *   POST   /api/legal/vendors/:id/engagements - Create engagement
 *   GET    /api/legal/vendors/:id/engagements  - List engagements
 *   PATCH  /api/legal/vendors/:id/engagements/:engId - Update engagement
 *   POST   /api/legal/vendors/:id/reviews    - Add performance review
 *   GET    /api/legal/vendors/:id/reviews    - List reviews
 *   GET    /api/legal/vendors/compare        - Compare multiple vendors
 *   GET    /api/legal/vendors/stats          - Vendor spend stats
 */

import { getPrisma } from "../db.js";
import {
  requireGPCounsel,
  requireGeneralCounsel,
  sendJson,
  sendError,
  logPermissionAction,
  AUDIT_ACTIONS
} from "../middleware/auth.js";

import {
  createVendor,
  getVendor,
  listVendors,
  createEngagement,
  compareVendors,
  addVendorReview
} from "../services/legal/vendor-service.js";

// Valid vendor types
const VALID_VENDOR_TYPES = ['LAW_FIRM', 'TITLE_COMPANY', 'SURVEYOR', 'ENVIRONMENTAL'];
const VALID_ENGAGEMENT_STATUS = ['ACTIVE', 'COMPLETED', 'CANCELLED'];

/**
 * GET /api/legal/vendors - List all vendors with filters
 */
export async function handleListVendors(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const url = new URL(req.url, `http://${req.headers.host}`);

  // Parse filters
  const filters = {
    vendorType: url.searchParams.get('vendorType'),
    search: url.searchParams.get('search')
  };

  try {
    const vendors = await listVendors(authUser.organizationId, filters);
    return sendJson(res, { vendors });
  } catch (err) {
    console.error('[handleListVendors] Error:', err);
    return sendError(res, 500, 'Failed to list vendors', 'VENDOR_LIST_FAILED');
  }
}

/**
 * POST /api/legal/vendors - Create a new vendor
 */
export async function handleCreateVendor(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const { vendorType, name, primaryContact, email, phone, address, defaultRate, rateNotes } = req.body;

  // Validation
  if (!vendorType || !VALID_VENDOR_TYPES.includes(vendorType)) {
    return sendError(res, 400, 'Invalid or missing vendorType', 'VALIDATION_FAILED');
  }
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return sendError(res, 400, 'Vendor name is required', 'VALIDATION_FAILED');
  }

  try {
    const vendor = await createVendor(
      authUser.organizationId,
      { vendorType, name, primaryContact, email, phone, address, defaultRate, rateNotes },
      authUser.id
    );

    // Log the creation
    await logPermissionAction({
      actorId: authUser.id,
      action: AUDIT_ACTIONS.VENDOR_CREATE,
      resource: 'LegalVendor',
      resourceId: vendor.id,
      afterValue: JSON.stringify({ vendorType, name })
    });

    return sendJson(res, { vendor }, 201);
  } catch (err) {
    console.error('[handleCreateVendor] Error:', err);
    return sendError(res, 500, 'Failed to create vendor', 'VENDOR_CREATE_FAILED');
  }
}

/**
 * GET /api/legal/vendors/:id - Get vendor by ID with stats
 */
export async function handleGetVendor(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const { id } = req.params;

  try {
    const vendor = await getVendor(id, authUser.organizationId);

    if (!vendor) {
      return sendError(res, 404, 'Vendor not found', 'VENDOR_NOT_FOUND');
    }

    return sendJson(res, { vendor });
  } catch (err) {
    console.error('[handleGetVendor] Error:', err);
    return sendError(res, 500, 'Failed to get vendor', 'VENDOR_GET_FAILED');
  }
}

/**
 * PATCH /api/legal/vendors/:id - Update vendor
 */
export async function handleUpdateVendor(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const { id } = req.params;
  const prisma = getPrisma();

  // Verify vendor exists and belongs to org
  const existing = await prisma.legalVendor.findFirst({
    where: { id, organizationId: authUser.organizationId }
  });

  if (!existing) {
    return sendError(res, 404, 'Vendor not found', 'VENDOR_NOT_FOUND');
  }

  const { name, primaryContact, email, phone, address, defaultRate, rateNotes, notes } = req.body;

  try {
    const vendor = await prisma.legalVendor.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(primaryContact !== undefined && { primaryContact }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
        ...(address !== undefined && { address }),
        ...(defaultRate !== undefined && { defaultRate }),
        ...(rateNotes !== undefined && { rateNotes }),
        ...(notes !== undefined && { notes })
      }
    });

    await logPermissionAction({
      actorId: authUser.id,
      action: AUDIT_ACTIONS.VENDOR_UPDATE,
      resource: 'LegalVendor',
      resourceId: id,
      afterValue: JSON.stringify({ name, email })
    });

    return sendJson(res, { vendor });
  } catch (err) {
    console.error('[handleUpdateVendor] Error:', err);
    return sendError(res, 500, 'Failed to update vendor', 'VENDOR_UPDATE_FAILED');
  }
}

/**
 * POST /api/legal/vendors/:id/contacts - Add contact person
 */
export async function handleAddContact(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const { id: vendorId } = req.params;
  const { name, title, email, phone, isPrimary } = req.body;

  if (!name) {
    return sendError(res, 400, 'Contact name is required', 'VALIDATION_FAILED');
  }

  const prisma = getPrisma();

  // Verify vendor exists and belongs to org
  const vendor = await prisma.legalVendor.findFirst({
    where: { id: vendorId, organizationId: authUser.organizationId }
  });

  if (!vendor) {
    return sendError(res, 404, 'Vendor not found', 'VENDOR_NOT_FOUND');
  }

  try {
    const contact = await prisma.legalVendorContact.create({
      data: {
        vendorId,
        name,
        title: title || null,
        email: email || null,
        phone: phone || null,
        isPrimary: isPrimary || false
      }
    });

    return sendJson(res, { contact }, 201);
  } catch (err) {
    console.error('[handleAddContact] Error:', err);
    return sendError(res, 500, 'Failed to add contact', 'CONTACT_ADD_FAILED');
  }
}

/**
 * POST /api/legal/vendors/:id/engagements - Create engagement
 */
export async function handleCreateEngagement(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const { id: vendorId } = req.params;
  const { matterId, dealId, scope, estimatedCost, actualCost, status, startDate, endDate } = req.body;

  try {
    const engagement = await createEngagement(
      vendorId,
      { matterId, dealId, scope, estimatedCost, actualCost, status, startDate, endDate },
      authUser.organizationId
    );

    await logPermissionAction({
      actorId: authUser.id,
      action: AUDIT_ACTIONS.ENGAGEMENT_CREATE,
      resource: 'LegalVendorEngagement',
      resourceId: engagement.id,
      afterValue: JSON.stringify({ vendorId, matterId, dealId, status })
    });

    return sendJson(res, { engagement }, 201);
  } catch (err) {
    console.error('[handleCreateEngagement] Error:', err);
    return sendError(res, 500, 'Failed to create engagement', 'ENGAGEMENT_CREATE_FAILED');
  }
}

/**
 * POST /api/legal/vendors/:id/reviews - Add performance review
 */
export async function handleAddReview(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const { id: vendorId } = req.params;
  const { engagementId, qualityRating, timelinessRating, communicationRating, valueRating, overallRating, strengths, weaknesses, notes, wouldUseAgain } = req.body;

  if (!overallRating || typeof overallRating !== 'number' || overallRating < 1 || overallRating > 5) {
    return sendError(res, 400, 'Overall rating must be between 1 and 5', 'VALIDATION_FAILED');
  }

  try {
    const review = await addVendorReview(
      vendorId,
      { engagementId, qualityRating, timelinessRating, communicationRating, valueRating, overallRating, strengths, weaknesses, notes, wouldUseAgain },
      authUser.organizationId,
      authUser.id,
      authUser.name || authUser.email
    );

    return sendJson(res, { review }, 201);
  } catch (err) {
    console.error('[handleAddReview] Error:', err);
    return sendError(res, 500, 'Failed to add review', 'REVIEW_ADD_FAILED');
  }
}

/**
 * GET /api/legal/vendors/compare - Compare multiple vendors
 */
export async function handleCompareVendors(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const url = new URL(req.url, `http://${req.headers.host}`);
  const vendorIdsParam = url.searchParams.get('vendorIds');

  if (!vendorIdsParam) {
    return sendError(res, 400, 'vendorIds query parameter is required', 'VALIDATION_FAILED');
  }

  const vendorIds = vendorIdsParam.split(',').map(id => id.trim());

  if (vendorIds.length < 2) {
    return sendError(res, 400, 'At least 2 vendor IDs required for comparison', 'VALIDATION_FAILED');
  }

  try {
    const vendors = await compareVendors(authUser.organizationId, vendorIds);
    return sendJson(res, { vendors });
  } catch (err) {
    console.error('[handleCompareVendors] Error:', err);
    return sendError(res, 500, 'Failed to compare vendors', 'VENDOR_COMPARE_FAILED');
  }
}
