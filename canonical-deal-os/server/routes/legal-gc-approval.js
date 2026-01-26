/**
 * GC Approval Queue Routes
 *
 * Phase 5.1: Approval queue management
 */

import { getPrisma } from "../db.js";
import {
  requireGeneralCounsel,
  requireGPCounsel,
  sendJson,
  sendError,
  logPermissionAction,
  AUDIT_ACTIONS
} from "../middleware/auth.js";
import { createLogger } from "../lib/logger.js";
import {
  getApprovalQueue,
  requestGCReview,
  approveGCReview,
  rejectGCReview
} from "../services/legal/gc-oversight-service.js";

const logger = createLogger('legal:gc-approval-routes');

/**
 * GET /api/legal/gc/approval-queue
 * Get all matters awaiting GC approval
 * Auth: General Counsel only
 */
export async function handleGetApprovalQueue(req, res) {
  const authUser = await requireGeneralCounsel(req, res);
  if (!authUser) return;

  try {
    const matters = await getApprovalQueue(authUser.organizationId, authUser.id);

    logger.info('Approval queue retrieved', {
      count: matters.length,
      organizationId: authUser.organizationId,
      userId: authUser.id
    });

    return sendJson(res, {
      matters,
      count: matters.length
    });
  } catch (err) {
    logger.error('Failed to get approval queue', {
      error: err.message,
      stack: err.stack,
      userId: authUser.id
    });
    return sendError(res, 500, 'Failed to get approval queue', 'APPROVAL_QUEUE_FETCH_FAILED');
  }
}

/**
 * POST /api/legal/matters/:matterId/request-gc-review
 * Request GC review for a matter (triggers notifications)
 * Auth: GP Counsel or General Counsel
 */
export async function handleRequestGCReview(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const { matterId } = req.params;
  const { notes } = req.body || {};

  if (!matterId) {
    return sendError(res, 400, 'Matter ID is required', 'MATTER_ID_REQUIRED');
  }

  try {
    await requestGCReview(
      matterId,
      authUser.id,
      authUser.name || authUser.email,
      notes,
      authUser.organizationId
    );

    logger.info('GC review requested', {
      matterId,
      requestedBy: authUser.id,
      organizationId: authUser.organizationId
    });

    logPermissionAction({
      actorId: authUser.id,
      action: AUDIT_ACTIONS.GC_REVIEW_REQUESTED,
      resourceType: 'legal_matter',
      resourceId: matterId,
      afterValue: { notes }
    });

    return sendJson(res, {
      success: true,
      message: 'GC review requested. Notifications have been sent to all General Counsel.'
    });
  } catch (err) {
    logger.error('Failed to request GC review', {
      error: err.message,
      stack: err.stack,
      matterId,
      userId: authUser.id
    });
    return sendError(res, 500, err.message || 'Failed to request GC review', 'GC_REVIEW_REQUEST_FAILED');
  }
}

/**
 * POST /api/legal/gc/approve/:matterId
 * Approve GC review for a matter
 * Auth: General Counsel only
 */
export async function handleApproveGCReview(req, res) {
  const authUser = await requireGeneralCounsel(req, res);
  if (!authUser) return;

  const { matterId } = req.params;
  const { notes } = req.body || {};

  if (!matterId) {
    return sendError(res, 400, 'Matter ID is required', 'MATTER_ID_REQUIRED');
  }

  try {
    const updatedMatter = await approveGCReview(
      matterId,
      authUser.id,
      authUser.name || authUser.email,
      notes,
      authUser.organizationId
    );

    logger.info('GC review approved', {
      matterId,
      approvedBy: authUser.id,
      organizationId: authUser.organizationId
    });

    logPermissionAction({
      actorId: authUser.id,
      action: AUDIT_ACTIONS.GC_APPROVED,
      resourceType: 'legal_matter',
      resourceId: matterId,
      afterValue: { gcApprovalStatus: 'APPROVED', notes }
    });

    return sendJson(res, {
      success: true,
      matter: updatedMatter,
      message: 'Matter approved successfully. The requester has been notified.'
    });
  } catch (err) {
    logger.error('Failed to approve GC review', {
      error: err.message,
      stack: err.stack,
      matterId,
      userId: authUser.id
    });
    return sendError(res, 500, err.message || 'Failed to approve GC review', 'GC_APPROVAL_FAILED');
  }
}

/**
 * POST /api/legal/gc/reject/:matterId
 * Reject GC review for a matter (requires notes)
 * Auth: General Counsel only
 */
export async function handleRejectGCReview(req, res) {
  const authUser = await requireGeneralCounsel(req, res);
  if (!authUser) return;

  const { matterId } = req.params;
  const { notes } = req.body || {};

  if (!matterId) {
    return sendError(res, 400, 'Matter ID is required', 'MATTER_ID_REQUIRED');
  }

  if (!notes || notes.trim().length === 0) {
    return sendError(res, 400, 'Rejection reason is required', 'REJECTION_REASON_REQUIRED');
  }

  try {
    const updatedMatter = await rejectGCReview(
      matterId,
      authUser.id,
      authUser.name || authUser.email,
      notes,
      authUser.organizationId
    );

    logger.info('GC review rejected', {
      matterId,
      rejectedBy: authUser.id,
      organizationId: authUser.organizationId
    });

    logPermissionAction({
      actorId: authUser.id,
      action: AUDIT_ACTIONS.GC_REJECTED,
      resourceType: 'legal_matter',
      resourceId: matterId,
      afterValue: { gcApprovalStatus: 'REJECTED', notes }
    });

    return sendJson(res, {
      success: true,
      matter: updatedMatter,
      message: 'Matter rejected. The requester has been notified.'
    });
  } catch (err) {
    logger.error('Failed to reject GC review', {
      error: err.message,
      stack: err.stack,
      matterId,
      userId: authUser.id
    });
    return sendError(res, 500, err.message || 'Failed to reject GC review', 'GC_REJECTION_FAILED');
  }
}
