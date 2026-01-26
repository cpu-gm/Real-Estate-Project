/**
 * Permission Gate Routes
 *
 * API endpoints for buyer authorization workflow:
 * - Review queue management
 * - Authorization decisions
 * - NDA tracking
 * - Data room access
 *
 * Part of Phase 4: Permission Gate
 */

import {
  permissionGateService,
  AUTH_STATUSES,
  NDA_STATUSES,
  ACCESS_LEVELS
} from '../services/permission-gate.js';
import { createValidationLogger } from '../services/validation-logger.js';
import {
  AuthorizeBuyerSchema,
  DeclineBuyerSchema,
  RevokeBuyerSchema,
  RecordNDASignedSchema,
  BulkAuthorizeBuyersSchema,
  BulkDeclineBuyersSchema,
  GrantDataRoomAccessSchema
} from '../middleware/route-schemas.js';

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

// Debug logging helper
const DEBUG = process.env.DEBUG_ROUTES === 'true' || process.env.DEBUG === 'true';
function debugLog(context, message, data = null) {
  if (DEBUG) {
    const timestamp = new Date().toISOString();
    console.log(`[PERMISSION_GATE_ROUTES ${timestamp}] [${context}] ${message}`);
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

/**
 * Dispatch permission gate routes
 *
 * @param {Request} req - HTTP request
 * @param {Response} res - HTTP response
 * @param {string[]} segments - URL path segments
 * @param {Function} readJsonBody - JSON body parser
 * @param {Object} authUser - Authenticated user
 */
export function dispatchPermissionGateRoutes(req, res, segments, readJsonBody, authUser) {
  const method = req.method;
  debugLog('dispatch', `${method} /api/gate/${segments.join('/')}`);

  // =====================
  // REVIEW QUEUE
  // =====================

  // GET /api/gate/queue/:dealDraftId - Get review queue for a deal
  if (method === 'GET' && segments[0] === 'queue' && segments[1]) {
    return handleGetReviewQueue(req, res, segments[1], authUser);
  }

  // =====================
  // AUTHORIZATION ACTIONS
  // =====================

  // POST /api/gate/authorize/:dealDraftId/:buyerUserId - Authorize a buyer
  if (method === 'POST' && segments[0] === 'authorize' && segments[1] && segments[2]) {
    return handleAuthorizeBuyer(req, res, segments[1], segments[2], readJsonBody, authUser);
  }

  // POST /api/gate/bulk/authorize/:dealDraftId - Bulk authorize buyers
  if (method === 'POST' && segments[0] === 'bulk' && segments[1] === 'authorize' && segments[2]) {
    return handleBulkAuthorizeBuyers(req, res, segments[2], readJsonBody, authUser);
  }

  // POST /api/gate/bulk/decline/:dealDraftId - Bulk decline buyers
  if (method === 'POST' && segments[0] === 'bulk' && segments[1] === 'decline' && segments[2]) {
    return handleBulkDeclineBuyers(req, res, segments[2], readJsonBody, authUser);
  }

  // POST /api/gate/decline/:dealDraftId/:buyerUserId - Decline a buyer
  if (method === 'POST' && segments[0] === 'decline' && segments[1] && segments[2]) {
    return handleDeclineBuyer(req, res, segments[1], segments[2], readJsonBody, authUser);
  }

  // POST /api/gate/revoke/:dealDraftId/:buyerUserId - Revoke access
  if (method === 'POST' && segments[0] === 'revoke' && segments[1] && segments[2]) {
    return handleRevokeBuyer(req, res, segments[1], segments[2], readJsonBody, authUser);
  }

  // =====================
  // NDA MANAGEMENT
  // =====================

  // POST /api/gate/nda/send/:dealDraftId/:buyerUserId - Send NDA
  if (method === 'POST' && segments[0] === 'nda' && segments[1] === 'send' && segments[2] && segments[3]) {
    return handleSendNDA(req, res, segments[2], segments[3], authUser);
  }

  // POST /api/gate/nda/signed/:dealDraftId/:buyerUserId - Record NDA signed
  if (method === 'POST' && segments[0] === 'nda' && segments[1] === 'signed' && segments[2] && segments[3]) {
    return handleRecordNDASigned(req, res, segments[2], segments[3], readJsonBody, authUser);
  }

  // =====================
  // DATA ROOM ACCESS
  // =====================

  // POST /api/gate/access/:dealDraftId/:buyerUserId - Grant data room access
  if (method === 'POST' && segments[0] === 'access' && segments[1] && segments[2]) {
    return handleGrantDataRoomAccess(req, res, segments[1], segments[2], readJsonBody, authUser);
  }

  // =====================
  // STATUS & PROGRESS
  // =====================

  // GET /api/gate/status/:dealDraftId/:buyerUserId - Get authorization status
  if (method === 'GET' && segments[0] === 'status' && segments[1] && segments[2]) {
    return handleGetAuthorizationStatus(req, res, segments[1], segments[2], authUser);
  }

  // GET /api/gate/authorizations/:dealDraftId - Get all authorizations for a deal
  if (method === 'GET' && segments[0] === 'authorizations' && segments[1]) {
    return handleGetAuthorizations(req, res, segments[1], authUser);
  }

  // GET /api/gate/progress/:dealDraftId - Get deal progress summary
  if (method === 'GET' && segments[0] === 'progress' && segments[1]) {
    return handleGetProgress(req, res, segments[1], authUser);
  }

  // =====================
  // DEAL ADVANCEMENT
  // =====================

  // POST /api/gate/advance/:dealDraftId - Advance deal to Active DD
  if (method === 'POST' && segments[0] === 'advance' && segments[1]) {
    return handleAdvanceToActiveDD(req, res, segments[1], authUser);
  }

  // 404 - Route not found
  debugLog('dispatch', 'Route not found');
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Permission gate route not found' }));
}

/**
 * Get review queue for a deal
 * GET /api/gate/queue/:dealDraftId
 */
async function handleGetReviewQueue(req, res, dealDraftId, authUser) {
  debugLog('handleGetReviewQueue', 'Fetching review queue', { dealDraftId });

  try {
    // Parse query params
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pendingOnly = url.searchParams.get('pendingOnly') !== 'false';
    const status = url.searchParams.get('status');

    const queue = await permissionGateService.getReviewQueue(dealDraftId, {
      pendingOnly,
      status
    });

    debugLog('handleGetReviewQueue', 'Queue fetched', { count: queue.length });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(queue));
  } catch (error) {
    debugLog('handleGetReviewQueue', 'Error', { error: error.message });
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

/**
 * Authorize a buyer
 * POST /api/gate/authorize/:dealDraftId/:buyerUserId
 */
async function handleAuthorizeBuyer(req, res, dealDraftId, buyerUserId, readJsonBody, authUser) {
  debugLog('handleAuthorizeBuyer', 'Authorizing buyer', { dealDraftId, buyerUserId });

  try {
    const body = await readJsonBody();

    // ========== VALIDATION ==========
    const validationLog = createValidationLogger('handleAuthorizeBuyer');
    validationLog.beforeValidation(body);

    const parsed = AuthorizeBuyerSchema.safeParse(body || {});
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

    const authorization = await permissionGateService.authorizeBuyer(
      dealDraftId,
      buyerUserId,
      { accessLevel: parsed.data.accessLevel },
      authUser
    );

    debugLog('handleAuthorizeBuyer', 'Buyer authorized', {
      authorizationId: authorization.id
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(authorization));
  } catch (error) {
    debugLog('handleAuthorizeBuyer', 'Error', { error: error.message });
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

/**
 * Decline a buyer
 * POST /api/gate/decline/:dealDraftId/:buyerUserId
 */
async function handleDeclineBuyer(req, res, dealDraftId, buyerUserId, readJsonBody, authUser) {
  debugLog('handleDeclineBuyer', 'Declining buyer', { dealDraftId, buyerUserId });

  try {
    const body = await readJsonBody();

    // ========== VALIDATION ==========
    const validationLog = createValidationLogger('handleDeclineBuyer');
    validationLog.beforeValidation(body);

    const parsed = DeclineBuyerSchema.safeParse(body);
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

    const authorization = await permissionGateService.declineBuyer(
      dealDraftId,
      buyerUserId,
      parsed.data.reason,
      authUser
    );

    debugLog('handleDeclineBuyer', 'Buyer declined', {
      authorizationId: authorization.id
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(authorization));
  } catch (error) {
    debugLog('handleDeclineBuyer', 'Error', { error: error.message });
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

/**
 * Bulk authorize buyers
 * POST /api/gate/bulk/authorize/:dealDraftId
 * Body: { buyerUserIds: string[] }
 * Response: { succeeded: string[], failed: { id: string, error: string }[] }
 */
async function handleBulkAuthorizeBuyers(req, res, dealDraftId, readJsonBody, authUser) {
  debugLog('handleBulkAuthorizeBuyers', 'Bulk authorizing buyers', { dealDraftId });

  try {
    const body = await readJsonBody();

    // ========== VALIDATION ==========
    const validationLog = createValidationLogger('handleBulkAuthorizeBuyers');
    validationLog.beforeValidation(body);

    const parsed = BulkAuthorizeBuyersSchema.safeParse(body);
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

    const { buyerUserIds } = parsed.data;
    const succeeded = [];
    const failed = [];

    // Process each buyer (continue on error)
    for (const buyerUserId of buyerUserIds) {
      try {
        await permissionGateService.authorizeBuyer(
          dealDraftId,
          buyerUserId,
          {},
          authUser
        );
        succeeded.push(buyerUserId);
        debugLog('handleBulkAuthorizeBuyers', 'Authorized', { buyerUserId });
      } catch (error) {
        failed.push({ id: buyerUserId, error: error.message });
        debugLog('handleBulkAuthorizeBuyers', 'Failed to authorize', { buyerUserId, error: error.message });
      }
    }

    debugLog('handleBulkAuthorizeBuyers', 'Bulk authorize complete', {
      total: buyerUserIds.length,
      succeeded: succeeded.length,
      failed: failed.length
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ succeeded, failed }));
  } catch (error) {
    debugLog('handleBulkAuthorizeBuyers', 'Error', { error: error.message });
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

/**
 * Bulk decline buyers
 * POST /api/gate/bulk/decline/:dealDraftId
 * Body: { buyerUserIds: string[], reason?: string }
 * Response: { succeeded: string[], failed: { id: string, error: string }[] }
 */
async function handleBulkDeclineBuyers(req, res, dealDraftId, readJsonBody, authUser) {
  debugLog('handleBulkDeclineBuyers', 'Bulk declining buyers', { dealDraftId });

  try {
    const body = await readJsonBody();

    // ========== VALIDATION ==========
    const validationLog = createValidationLogger('handleBulkDeclineBuyers');
    validationLog.beforeValidation(body);

    const parsed = BulkDeclineBuyersSchema.safeParse(body);
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

    const { buyerUserIds, reason } = parsed.data;
    const succeeded = [];
    const failed = [];

    // Process each buyer (continue on error)
    for (const buyerUserId of buyerUserIds) {
      try {
        await permissionGateService.declineBuyer(
          dealDraftId,
          buyerUserId,
          reason,
          authUser
        );
        succeeded.push(buyerUserId);
        debugLog('handleBulkDeclineBuyers', 'Declined', { buyerUserId });
      } catch (error) {
        failed.push({ id: buyerUserId, error: error.message });
        debugLog('handleBulkDeclineBuyers', 'Failed to decline', { buyerUserId, error: error.message });
      }
    }

    debugLog('handleBulkDeclineBuyers', 'Bulk decline complete', {
      total: buyerUserIds.length,
      succeeded: succeeded.length,
      failed: failed.length
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ succeeded, failed }));
  } catch (error) {
    debugLog('handleBulkDeclineBuyers', 'Error', { error: error.message });
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

/**
 * Revoke access from a buyer
 * POST /api/gate/revoke/:dealDraftId/:buyerUserId
 */
async function handleRevokeBuyer(req, res, dealDraftId, buyerUserId, readJsonBody, authUser) {
  debugLog('handleRevokeBuyer', 'Revoking access', { dealDraftId, buyerUserId });

  try {
    const body = await readJsonBody();

    // ========== VALIDATION ==========
    const validationLog = createValidationLogger('handleRevokeBuyer');
    validationLog.beforeValidation(body);

    const parsed = RevokeBuyerSchema.safeParse(body);
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

    const authorization = await permissionGateService.revokeBuyer(
      dealDraftId,
      buyerUserId,
      parsed.data.reason,
      authUser
    );

    debugLog('handleRevokeBuyer', 'Access revoked', {
      authorizationId: authorization.id
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(authorization));
  } catch (error) {
    debugLog('handleRevokeBuyer', 'Error', { error: error.message });
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

/**
 * Send NDA to buyer
 * POST /api/gate/nda/send/:dealDraftId/:buyerUserId
 */
async function handleSendNDA(req, res, dealDraftId, buyerUserId, authUser) {
  debugLog('handleSendNDA', 'Sending NDA', { dealDraftId, buyerUserId });

  try {
    const authorization = await permissionGateService.sendNDA(
      dealDraftId,
      buyerUserId,
      authUser
    );

    debugLog('handleSendNDA', 'NDA sent', { authorizationId: authorization.id });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(authorization));
  } catch (error) {
    debugLog('handleSendNDA', 'Error', { error: error.message });
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

/**
 * Record NDA signed
 * POST /api/gate/nda/signed/:dealDraftId/:buyerUserId
 */
async function handleRecordNDASigned(req, res, dealDraftId, buyerUserId, readJsonBody, authUser) {
  debugLog('handleRecordNDASigned', 'Recording NDA signature', { dealDraftId, buyerUserId });

  try {
    const body = await readJsonBody();

    // ========== VALIDATION ==========
    const validationLog = createValidationLogger('handleRecordNDASigned');
    validationLog.beforeValidation(body);

    const parsed = RecordNDASignedSchema.safeParse(body || {});
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

    const authorization = await permissionGateService.recordNDASigned(
      dealDraftId,
      buyerUserId,
      parsed.data.ndaDocumentId
    );

    debugLog('handleRecordNDASigned', 'NDA signed recorded', {
      authorizationId: authorization.id
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(authorization));
  } catch (error) {
    debugLog('handleRecordNDASigned', 'Error', { error: error.message });
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

/**
 * Grant data room access
 * POST /api/gate/access/:dealDraftId/:buyerUserId
 */
async function handleGrantDataRoomAccess(req, res, dealDraftId, buyerUserId, readJsonBody, authUser) {
  debugLog('handleGrantDataRoomAccess', 'Granting access', { dealDraftId, buyerUserId });

  try {
    const body = await readJsonBody();

    // ========== VALIDATION ==========
    const validationLog = createValidationLogger('handleGrantDataRoomAccess');
    validationLog.beforeValidation(body);

    const parsed = GrantDataRoomAccessSchema.safeParse(body || {});
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

    const authorization = await permissionGateService.grantDataRoomAccess(
      dealDraftId,
      buyerUserId,
      parsed.data.accessLevel,
      authUser
    );

    debugLog('handleGrantDataRoomAccess', 'Access granted', {
      authorizationId: authorization.id
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(authorization));
  } catch (error) {
    debugLog('handleGrantDataRoomAccess', 'Error', { error: error.message });
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

/**
 * Get authorization status for a buyer
 * GET /api/gate/status/:dealDraftId/:buyerUserId
 */
async function handleGetAuthorizationStatus(req, res, dealDraftId, buyerUserId, authUser) {
  debugLog('handleGetAuthorizationStatus', 'Fetching status', { dealDraftId, buyerUserId });

  try {
    const authorization = await permissionGateService.getAuthorizationStatus(
      dealDraftId,
      buyerUserId
    );

    if (!authorization) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'NOT_REVIEWED' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(authorization));
  } catch (error) {
    debugLog('handleGetAuthorizationStatus', 'Error', { error: error.message });
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

/**
 * Get all authorizations for a deal
 * GET /api/gate/authorizations/:dealDraftId
 */
async function handleGetAuthorizations(req, res, dealDraftId, authUser) {
  debugLog('handleGetAuthorizations', 'Fetching authorizations', { dealDraftId });

  try {
    // Parse query params
    const url = new URL(req.url, `http://${req.headers.host}`);
    const status = url.searchParams.get('status');

    const authorizations = await permissionGateService.getAuthorizationsForDeal(
      dealDraftId,
      { status }
    );

    debugLog('handleGetAuthorizations', 'Authorizations fetched', {
      count: authorizations.length
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(authorizations));
  } catch (error) {
    debugLog('handleGetAuthorizations', 'Error', { error: error.message });
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

/**
 * Get deal progress summary
 * GET /api/gate/progress/:dealDraftId
 */
async function handleGetProgress(req, res, dealDraftId, authUser) {
  debugLog('handleGetProgress', 'Fetching progress', { dealDraftId });

  try {
    const progress = await permissionGateService.getDealProgress(dealDraftId);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(progress));
  } catch (error) {
    debugLog('handleGetProgress', 'Error', { error: error.message });
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

/**
 * Advance deal to Active DD
 * POST /api/gate/advance/:dealDraftId
 */
async function handleAdvanceToActiveDD(req, res, dealDraftId, authUser) {
  debugLog('handleAdvanceToActiveDD', 'Advancing deal', { dealDraftId });

  try {
    const dealDraft = await permissionGateService.advanceToActiveDD(
      dealDraftId,
      authUser
    );

    debugLog('handleAdvanceToActiveDD', 'Deal advanced', { status: dealDraft.status });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(dealDraft));
  } catch (error) {
    debugLog('handleAdvanceToActiveDD', 'Error', { error: error.message });
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

// Export constants for external use
export { AUTH_STATUSES, NDA_STATUSES, ACCESS_LEVELS };
