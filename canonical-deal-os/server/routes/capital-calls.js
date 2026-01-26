/**
 * Capital Calls Routes
 *
 * Handles creation, management, and funding of capital calls.
 * GP creates calls → LP views and marks funding → GP confirms receipt.
 */

import { getPrisma } from "../db.js";
import { extractAuthUser } from "./auth.js";
import { logPermissionAction, AUDIT_ACTIONS } from "../middleware/auth.js";
import { readStore } from "../store.js";
import crypto from "node:crypto";
import { createDealEvent, createCapTableSnapshot } from "../services/audit-service.js";
import { generateCapitalCallNotices } from "../services/document-generator.js";
import { emitLpWebhook } from "../notifications.js";
import { createIntegrityLogger, INTEGRITY_OPERATIONS, INVARIANTS } from "../services/integrity-logger.js";
import { dollarsToCents, allocateCents, validateAllocationSum } from "../services/money.js";
import { addToOutbox } from "../services/outbox-worker.js";
import {
  CreateCapitalCallSchema,
  UpdateCapitalCallSchema,
  MarkWireInitiatedSchema,
  UploadWireProofSchema,
  MarkFundedSchema
} from "../middleware/route-schemas.js";
import { createValidationLogger } from "../services/validation-logger.js";
import { getIdempotencyStats } from "../middleware/idempotency.js";

/**
 * Get capital calls summary across all deals for GP's organization
 * GET /api/capital-calls/summary
 */
export async function handleCapitalCallsSummary(req, res, authUser) {
  if (!authUser) {
    sendError(res, 401, "Not authenticated");
    return;
  }

  const prisma = getPrisma();

  try {
    // Get all capital calls for deals in the user's organization
    const capitalCalls = await prisma.capitalCall.findMany({
      where: {
        deal: {
          organizationId: authUser.organizationId
        }
      },
      include: {
        allocations: true
      }
    });

    // Calculate summary stats
    const totalCalled = capitalCalls
      .filter(cc => cc.status !== 'DRAFT' && cc.status !== 'CANCELLED')
      .reduce((sum, cc) => sum + cc.totalAmount, 0);

    const totalFunded = capitalCalls.reduce((sum, cc) => {
      return sum + cc.allocations
        .filter(a => a.status === 'FUNDED')
        .reduce((aSum, a) => aSum + (a.fundedAmount || a.amount || 0), 0);
    }, 0);

    const pendingCalls = capitalCalls.filter(
      cc => cc.status !== 'FUNDED' && cc.status !== 'CANCELLED' && cc.status !== 'DRAFT'
    ).length;

    sendJson(res, 200, {
      totalCalled,
      totalFunded,
      pendingCalls,
      totalCalls: capitalCalls.length
    });
  } catch (error) {
    console.error('[Capital Calls] Summary error:', error);
    sendError(res, 500, "Failed to get capital calls summary");
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message, details) {
  sendJson(res, status, { message, details: details ?? null });
}

/**
 * Require GP or Admin role for GP-only endpoints
 * Returns the authenticated user or null (and sends error response)
 */
async function requireGP(req, res) {
  const user = await extractAuthUser(req);
  if (!user) {
    sendError(res, 401, "Not authenticated");
    return null;
  }
  if (!['GP', 'Admin'].includes(user.role)) {
    sendError(res, 403, "GP or Admin role required");
    return null;
  }
  if (user.status !== 'ACTIVE') {
    sendError(res, 403, "Account not active");
    return null;
  }
  return user;
}

/**
 * Check organization isolation for a deal
 * Returns authUser if access granted, null if denied (response already sent)
 */
async function requireDealOrgAccess(req, res, dealId) {
  const authUser = await extractAuthUser(req);
  if (!authUser) {
    sendError(res, 401, "Not authenticated");
    return null;
  }

  const store = await readStore();
  const record = store.dealIndex.find((item) => item.id === dealId);

  if (!record) {
    sendError(res, 404, "Deal not found");
    return null;
  }

  // Enforce org isolation
  if (record.organizationId && record.organizationId !== authUser.organizationId) {
    sendError(res, 403, "Access denied - deal belongs to different organization");
    return null;
  }

  return authUser;
}

/**
 * List capital calls for a deal
 * GET /api/deals/:dealId/capital-calls
 */
export async function handleListCapitalCalls(req, res, dealId) {
  // Organization isolation check
  const authUser = await requireDealOrgAccess(req, res, dealId);
  if (!authUser) return;

  const prisma = getPrisma();

  const capitalCalls = await prisma.capitalCall.findMany({
    where: { dealId },
    orderBy: { createdAt: 'desc' },
    include: {
      allocations: true
    }
  });

  // Calculate summary stats
  const totalCalled = capitalCalls.reduce((sum, cc) => sum + cc.totalAmount, 0);
  const totalFunded = capitalCalls.reduce((sum, cc) => {
    return sum + cc.allocations.reduce((aSum, a) => aSum + (a.fundedAmount || 0), 0);
  }, 0);

  sendJson(res, 200, {
    capitalCalls: capitalCalls.map(cc => ({
      id: cc.id,
      dealId: cc.dealId,
      title: cc.title,
      description: cc.description,
      totalAmount: cc.totalAmount,
      dueDate: cc.dueDate?.toISOString(),
      wireInstructions: cc.wireInstructions,
      purpose: cc.purpose,
      status: cc.status,
      issuedAt: cc.issuedAt?.toISOString(),
      issuedBy: cc.issuedBy,
      issuedByName: cc.issuedByName,
      createdAt: cc.createdAt.toISOString(),
      allocationCount: cc.allocations.length,
      fundedCount: cc.allocations.filter(a => a.status === 'FUNDED').length,
      fundedAmount: cc.allocations.reduce((sum, a) => sum + (a.fundedAmount || 0), 0)
    })),
    summary: {
      totalCalled,
      totalFunded,
      pendingCalls: capitalCalls.filter(cc => cc.status !== 'FUNDED' && cc.status !== 'CANCELLED').length
    }
  });
}

/**
 * Get single capital call with allocations
 * GET /api/deals/:dealId/capital-calls/:callId
 */
export async function handleGetCapitalCall(req, res, dealId, callId) {
  // Organization isolation check
  const authUser = await requireDealOrgAccess(req, res, dealId);
  if (!authUser) return;

  const prisma = getPrisma();

  const capitalCall = await prisma.capitalCall.findFirst({
    where: { id: callId, dealId },
    include: {
      allocations: true
    }
  });

  if (!capitalCall) {
    return sendError(res, 404, "Capital call not found");
  }

  // Get LP actor details for each allocation (including share class)
  const allocationsWithLP = await Promise.all(
    capitalCall.allocations.map(async (alloc) => {
      const lpActor = await prisma.lPActor.findUnique({
        where: { id: alloc.lpActorId },
        select: {
          id: true,
          entityName: true,
          email: true,
          commitment: true,
          ownershipPct: true,
          shareClass: { select: { id: true, code: true, name: true } }
        }
      });
      return {
        id: alloc.id,
        lpActorId: alloc.lpActorId,
        lpEntityName: lpActor?.entityName || 'Unknown',
        lpEmail: lpActor?.email || '',
        shareClass: lpActor?.shareClass || null,  // NEW: Include share class info
        amount: alloc.amount,
        status: alloc.status,
        fundedAmount: alloc.fundedAmount,
        fundedAt: alloc.fundedAt?.toISOString(),
        wireReference: alloc.wireReference,
        proofDocumentId: alloc.proofDocumentId,
        remindersSent: alloc.remindersSent,
        lastReminderAt: alloc.lastReminderAt?.toISOString()
      };
    })
  );

  sendJson(res, 200, {
    capitalCall: {
      id: capitalCall.id,
      dealId: capitalCall.dealId,
      title: capitalCall.title,
      description: capitalCall.description,
      totalAmount: capitalCall.totalAmount,
      dueDate: capitalCall.dueDate?.toISOString(),
      wireInstructions: capitalCall.wireInstructions,
      purpose: capitalCall.purpose,
      status: capitalCall.status,
      issuedAt: capitalCall.issuedAt?.toISOString(),
      issuedBy: capitalCall.issuedBy,
      issuedByName: capitalCall.issuedByName,
      documentId: capitalCall.documentId,
      createdBy: capitalCall.createdBy,
      createdByName: capitalCall.createdByName,
      createdAt: capitalCall.createdAt.toISOString(),
      updatedAt: capitalCall.updatedAt.toISOString(),
      allocations: allocationsWithLP
    }
  });
}

/**
 * Create a capital call (GP only)
 * POST /api/deals/:dealId/capital-calls
 * Body: { title, description?, totalAmount, dueDate, wireInstructions?, purpose }
 *
 * Sprint 2: Supports Idempotency-Key header for duplicate prevention
 * - If Idempotency-Key is provided and matches a previous request, returns cached result
 * - Idempotency keys are scoped to: organization + dealId + key + payload hash
 */
export async function handleCreateCapitalCall(req, res, dealId, readJsonBody, userId, userName) {
  const authUser = await requireGP(req, res);
  if (!authUser) return;

  // Sprint 2: Check for idempotency key
  const idempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];

  const validationLog = createValidationLogger('handleCreateCapitalCall');
  const rawBody = await readJsonBody(req);
  validationLog.beforeValidation(rawBody);

  // Sprint 2: Check for existing capital call with same idempotency key
  if (idempotencyKey) {
    const prisma = getPrisma();
    const existingCall = await prisma.capitalCall.findFirst({
      where: {
        idempotencyKey,
        dealId,
        deal: { organizationId: authUser.organizationId }
      },
      include: { allocations: true }
    });

    if (existingCall) {
      console.log(`[Capital Calls] Idempotency cache hit for key ${idempotencyKey}`);
      return sendJson(res, 200, {
        capitalCall: {
          id: existingCall.id,
          dealId: existingCall.dealId,
          title: existingCall.title,
          totalAmount: existingCall.totalAmount,
          dueDate: existingCall.dueDate.toISOString(),
          status: existingCall.status,
          allocationCount: existingCall.allocations.length,
          snapshotId: existingCall.snapshotId
        },
        _idempotent: true
      });
    }
  }

  // Validate with Zod schema
  const parseResult = CreateCapitalCallSchema.safeParse(rawBody ?? {});
  if (!parseResult.success) {
    validationLog.validationFailed(parseResult.error.errors);
    return sendError(res, 400, "Validation failed", {
      code: 'VALIDATION_FAILED',
      errors: parseResult.error.errors
    });
  }

  const body = parseResult.data;
  validationLog.afterValidation(body);

  const prisma = getPrisma();

  // Create integrity logger for this operation
  const logger = createIntegrityLogger({
    operation: INTEGRITY_OPERATIONS.CAPITAL_CALL_CREATE,
    dealId,
    userId: authUser?.id,
    requestId: req.headers['x-request-id']
  });

  try {
    logger.info('Starting capital call creation', {
      title: body.title,
      totalAmount: body.totalAmount,
      dueDate: body.dueDate
    });

    // Verify deal exists (deals are stored in store.json, not Prisma)
    const store = await readStore();
    const deal = store.dealIndex.find((item) => item.id === dealId);
    if (!deal) {
      logger.warn('Deal not found', { dealId });
      await logger.flush();
      return sendError(res, 404, "Deal not found");
    }

    // Get all active LPs for this deal (with share class info for logging)
    const lpActors = await prisma.lPActor.findMany({
      where: { dealId, status: 'ACTIVE' },
      include: { shareClass: { select: { id: true, code: true, name: true } } }
    });

    if (lpActors.length === 0) {
      logger.warn('No active LPs found', { dealId });
      await logger.flush();
      return sendError(res, 400, "No active LPs found for this deal. Add LPs before creating a capital call.");
    }

    logger.beforeState('lpActors', lpActors.map(lp => ({
      id: lp.id,
      entityName: lp.entityName,
      commitment: lp.commitment,
      shareClass: lp.shareClass?.code
    })));

    // Calculate total commitment to determine pro-rata allocations
    const totalCommitment = lpActors.reduce((sum, lp) => sum + (lp.commitment || 0), 0);

    // Use cents-based allocation for exact sums
    const totalCents = dollarsToCents(body.totalAmount);
    const recipients = lpActors.map(lp => ({
      id: lp.id,
      weight: totalCommitment > 0 ? lp.commitment : 1  // Equal split if no commitments
    }));
    const allocations = allocateCents(totalCents, recipients);

    // Validate allocation sum matches total
    const sumValidation = validateAllocationSum(allocations, totalCents);
    const sumValid = logger.invariantCheck(
      INVARIANTS.ALLOCATION_SUM_EQUALS_TOTAL,
      sumValidation.valid,
      { sum: sumValidation.sum, expected: totalCents, diff: sumValidation.diff }
    );

    if (!sumValid) {
      logger.critical('Allocation sum mismatch - aborting', sumValidation);
      await logger.flush();
      return sendError(res, 500, "Internal error: allocation calculation failed");
    }

    logger.computedValue('allocations', allocations, {
      totalCents,
      totalCommitment,
      lpCount: lpActors.length
    });

    // ATOMIC TRANSACTION - all operations succeed or all fail
    const result = await prisma.$transaction(async (tx) => {
      logger.info('Starting transaction');

      // 1. Create capital call
      const capitalCall = await tx.capitalCall.create({
        data: {
          id: crypto.randomUUID(),
          dealId,
          title: body.title,
          description: body.description || null,
          totalAmount: body.totalAmount,
          dueDate: new Date(body.dueDate),
          wireInstructions: body.wireInstructions || null,
          purpose: body.purpose || 'INITIAL_FUNDING',
          status: 'DRAFT',
          idempotencyKey: idempotencyKey || null, // Sprint 2: Store idempotency key
          createdBy: userId,
          createdByName: userName || 'Unknown'
        }
      });

      logger.info('Created capital call', { capitalCallId: capitalCall.id });

      // 2. Create allocations for each LP
      const createdAllocations = [];
      for (const alloc of allocations) {
        const lpActor = lpActors.find(lp => lp.id === alloc.id);

        const allocation = await tx.capitalCallAllocation.create({
          data: {
            id: crypto.randomUUID(),
            capitalCallId: capitalCall.id,
            lpActorId: alloc.id,
            amount: alloc.dollars,  // Stored as dollars
            status: 'PENDING',
            fundedAmount: 0
          }
        });

        createdAllocations.push({
          ...allocation,
          lpEntityName: lpActor?.entityName,
          lpEmail: lpActor?.email
        });

        logger.debug('Created allocation', {
          allocationId: allocation.id,
          lpActorId: alloc.id,
          amount: alloc.dollars
        });
      }

      // 3. Verify final state inside transaction
      const verifyAllocations = await tx.capitalCallAllocation.findMany({
        where: { capitalCallId: capitalCall.id }
      });

      const verifySum = verifyAllocations.reduce((sum, a) => sum + a.amount, 0);
      const verifyDiff = Math.abs(verifySum - body.totalAmount);

      logger.invariantCheck(
        'FINAL_ALLOCATION_SUM_MATCHES',
        verifyDiff < 0.01,
        { verifySum, expectedTotal: body.totalAmount, diff: verifyDiff }
      );

      logger.info('Transaction complete', {
        capitalCallId: capitalCall.id,
        allocationCount: createdAllocations.length
      });

      return { capitalCall, allocations: createdAllocations };
    });

    // Operations AFTER transaction succeeds (non-critical)

    // Create snapshot of cap table for reproducibility
    const snapshot = await createCapTableSnapshot(
      dealId,
      'CAPITAL_CALL_CALC',
      `Capital Call: ${body.title}`,
      { id: userId, name: userName }
    );

    // Update capital call with snapshotId
    await prisma.capitalCall.update({
      where: { id: result.capitalCall.id },
      data: { snapshotId: snapshot.id }
    });

    // Record audit event
    await createDealEvent(dealId, 'CAPITAL_CALL_CREATED', {
      capitalCallId: result.capitalCall.id,
      title: result.capitalCall.title,
      totalAmount: result.capitalCall.totalAmount,
      dueDate: result.capitalCall.dueDate.toISOString(),
      purpose: result.capitalCall.purpose,
      snapshotId: snapshot.id,
      allocationCount: result.allocations.length,
      allocations: result.allocations.map(a => ({
        lpActorId: a.lpActorId,
        amount: a.amount
      }))
    }, { id: userId, name: userName, role: 'GP' });

    logger.afterState('result', {
      capitalCallId: result.capitalCall.id,
      allocationCount: result.allocations.length,
      totalAmount: result.capitalCall.totalAmount,
      snapshotId: snapshot.id
    });

    await logger.flush();

    console.log(`[Capital Calls] Created capital call ${result.capitalCall.id} for deal ${dealId} with ${result.allocations.length} allocations (snapshot: ${snapshot.id})`);

    sendJson(res, 201, {
      capitalCall: {
        id: result.capitalCall.id,
        dealId: result.capitalCall.dealId,
        title: result.capitalCall.title,
        totalAmount: result.capitalCall.totalAmount,
        dueDate: result.capitalCall.dueDate.toISOString(),
        status: result.capitalCall.status,
        allocationCount: result.allocations.length,
        snapshotId: snapshot.id
      }
    });

  } catch (error) {
    logger.error('Capital call creation failed', {
      error: error.message,
      stack: error.stack
    });
    await logger.flush();

    // Check for unique constraint violation (duplicate allocation)
    if (error.code === 'P2002') {
      return sendError(res, 409, 'Duplicate allocation detected');
    }

    throw error;
  }
}

/**
 * Issue a capital call (send to LPs)
 * POST /api/deals/:dealId/capital-calls/:callId/issue
 */
export async function handleIssueCapitalCall(req, res, dealId, callId, userId, userName) {
  const authUser = await requireGP(req, res);
  if (!authUser) return;

  const prisma = getPrisma();

  const capitalCall = await prisma.capitalCall.findFirst({
    where: { id: callId, dealId }
  });

  if (!capitalCall) {
    return sendError(res, 404, "Capital call not found");
  }

  if (capitalCall.status !== 'DRAFT') {
    return sendError(res, 400, `Cannot issue capital call with status ${capitalCall.status}`);
  }

  // Prevent self-approval: creator cannot issue their own capital call
  if (capitalCall.createdBy === authUser.id) {
    return sendError(res, 403, "Cannot issue your own capital call - requires another GP/Admin to issue");
  }

  const updated = await prisma.capitalCall.update({
    where: { id: callId },
    data: {
      status: 'ISSUED',
      issuedAt: new Date(),
      issuedBy: authUser.id,
      issuedByName: authUser.name || 'Unknown'
    }
  });

  // Create approval record for audit trail
  await prisma.approvalRecord.create({
    data: {
      dealId,
      approvalType: 'CAPITAL_CALL_ISSUANCE',
      approverId: authUser.id,
      approverName: authUser.name || 'Unknown',
      approverRole: authUser.role,
      approverEmail: authUser.email,
      decision: 'APPROVED',
      notes: `Capital call "${capitalCall.title}" issued for ${capitalCall.totalAmount}`,
      captureMethod: 'UI'
    }
  });

  console.log(`[Capital Calls] Issued capital call ${callId} by ${authUser.name}`);

  // Audit log for compliance
  await logPermissionAction({
    actorId: authUser.id,
    action: AUDIT_ACTIONS.CAPITAL_CALL_ISSUED,
    resourceType: 'CapitalCall',
    resourceId: callId,
    beforeValue: { status: 'DRAFT' },
    afterValue: {
      status: 'ISSUED',
      totalAmount: capitalCall.totalAmount,
      issuedAt: updated.issuedAt.toISOString()
    },
    metadata: { dealId, callTitle: capitalCall.title },
    ipAddress: req.headers['x-forwarded-for'] || req.socket?.remoteAddress
  });

  // Fetch allocations with LP details for webhook
  const allocations = await prisma.capitalCallAllocation.findMany({
    where: { capitalCallId: callId },
    include: {
      lpActor: {
        select: {
          id: true,
          entityName: true,
          email: true
        }
      }
    }
  });

  // Emit webhook for n8n to send LP notifications
  // NOTE: Fixed bug - was using a.callAmount (undefined) instead of a.amount (schema field)
  await emitLpWebhook("CAPITAL_CALL_ISSUED", {
    dealId,
    callId,
    callTitle: capitalCall.title,
    totalAmount: capitalCall.totalAmount,
    dueDate: capitalCall.dueDate?.toISOString(),
    purpose: capitalCall.purpose,
    issuedBy: authUser.name || 'Unknown',
    issuedAt: updated.issuedAt.toISOString(),
    allocations: allocations.map(a => ({
      allocationId: a.id,
      lpActorId: a.lpActor.id,
      lpEntityName: a.lpActor.entityName,
      lpEmail: a.lpActor.email,
      callAmount: a.amount,  // FIXED: was a.callAmount (undefined)
      status: a.status
    }))
  });

  sendJson(res, 200, {
    capitalCall: {
      id: updated.id,
      status: updated.status,
      issuedAt: updated.issuedAt.toISOString()
    }
  });
}

/**
 * Update capital call (GP only, draft only)
 * PATCH /api/deals/:dealId/capital-calls/:callId
 */
export async function handleUpdateCapitalCall(req, res, dealId, callId, readJsonBody) {
  const authUser = await requireGP(req, res);
  if (!authUser) return;

  const validationLog = createValidationLogger('handleUpdateCapitalCall');
  const rawBody = await readJsonBody(req);
  validationLog.beforeValidation(rawBody);

  // Validate with Zod schema
  const parseResult = UpdateCapitalCallSchema.safeParse(rawBody ?? {});
  if (!parseResult.success) {
    validationLog.validationFailed(parseResult.error.errors);
    return sendError(res, 400, "Validation failed", {
      code: 'VALIDATION_FAILED',
      errors: parseResult.error.errors
    });
  }

  const body = parseResult.data;
  validationLog.afterValidation(body);

  const prisma = getPrisma();

  const capitalCall = await prisma.capitalCall.findFirst({
    where: { id: callId, dealId }
  });

  if (!capitalCall) {
    return sendError(res, 404, "Capital call not found");
  }

  if (capitalCall.status !== 'DRAFT') {
    return sendError(res, 400, "Can only update draft capital calls");
  }

  const updated = await prisma.capitalCall.update({
    where: { id: callId },
    data: {
      title: body.title ?? undefined,
      description: body.description ?? undefined,
      totalAmount: body.totalAmount ?? undefined,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      wireInstructions: body.wireInstructions ?? undefined,
      purpose: body.purpose ?? undefined
    }
  });

  sendJson(res, 200, {
    capitalCall: {
      id: updated.id,
      title: updated.title,
      totalAmount: updated.totalAmount,
      dueDate: updated.dueDate?.toISOString(),
      status: updated.status
    }
  });
}

/**
 * Cancel a capital call (GP only)
 * POST /api/deals/:dealId/capital-calls/:callId/cancel
 */
export async function handleCancelCapitalCall(req, res, dealId, callId) {
  const authUser = await requireGP(req, res);
  if (!authUser) return;

  const prisma = getPrisma();

  const capitalCall = await prisma.capitalCall.findFirst({
    where: { id: callId, dealId }
  });

  if (!capitalCall) {
    return sendError(res, 404, "Capital call not found");
  }

  if (capitalCall.status === 'FUNDED' || capitalCall.status === 'CANCELLED') {
    return sendError(res, 400, `Cannot cancel capital call with status ${capitalCall.status}`);
  }

  const previousStatus = capitalCall.status;

  const updated = await prisma.capitalCall.update({
    where: { id: callId },
    data: { status: 'CANCELLED' }
  });

  // Record audit event
  await createDealEvent(dealId, 'CAPITAL_CALL_CANCELLED', {
    capitalCallId: callId,
    title: capitalCall.title,
    totalAmount: capitalCall.totalAmount,
    previousStatus,
    cancelledBy: authUser.id,
    cancelledByName: authUser.name
  }, { id: authUser.id, name: authUser.name, role: authUser.role });

  console.log(`[Capital Calls] Cancelled capital call ${callId}`);

  sendJson(res, 200, {
    capitalCall: {
      id: updated.id,
      status: updated.status
    }
  });
}

// ========== LP-FACING ENDPOINTS ==========

/**
 * Get capital calls for authenticated LP user
 * GET /api/lp/portal/my-investments/:dealId/capital-calls
 */
export async function handleGetMyCapitalCalls(req, res, authUser, dealId) {
  if (!authUser) {
    return sendError(res, 401, "Authentication required");
  }

  if (authUser.role !== "LP") {
    return sendError(res, 403, "Only LP users can access this endpoint");
  }

  const prisma = getPrisma();

  // Find LP actor for this deal
  const lpActor = await prisma.lPActor.findFirst({
    where: {
      dealId,
      OR: [
        { authUserId: authUser.id },
        { email: authUser.email.toLowerCase() }
      ],
      status: 'ACTIVE'
    }
  });

  if (!lpActor) {
    return sendError(res, 404, "Investment not found or you don't have access");
  }

  // Get capital calls with this LP's allocations
  const capitalCalls = await prisma.capitalCall.findMany({
    where: {
      dealId,
      status: { in: ['ISSUED', 'PARTIALLY_FUNDED', 'FUNDED'] }
    },
    orderBy: { issuedAt: 'desc' },
    include: {
      allocations: {
        where: { lpActorId: lpActor.id }
      }
    }
  });

  sendJson(res, 200, {
    capitalCalls: capitalCalls.map(cc => ({
      id: cc.id,
      title: cc.title,
      description: cc.description,
      totalAmount: cc.totalAmount,
      dueDate: cc.dueDate?.toISOString(),
      wireInstructions: cc.wireInstructions,
      purpose: cc.purpose,
      status: cc.status,
      issuedAt: cc.issuedAt?.toISOString(),
      myAllocation: cc.allocations[0] ? {
        id: cc.allocations[0].id,
        amount: cc.allocations[0].amount,
        status: cc.allocations[0].status,
        fundedAmount: cc.allocations[0].fundedAmount,
        fundedAt: cc.allocations[0].fundedAt?.toISOString()
      } : null
    })),
    lpActorId: lpActor.id
  });
}

/**
 * Get single capital call detail for LP
 * GET /api/lp/portal/my-investments/:dealId/capital-calls/:callId
 */
export async function handleGetMyCapitalCallDetail(req, res, authUser, dealId, callId) {
  if (!authUser) {
    return sendError(res, 401, "Authentication required");
  }

  if (authUser.role !== "LP") {
    return sendError(res, 403, "Only LP users can access this endpoint");
  }

  const prisma = getPrisma();

  // Find LP actor
  const lpActor = await prisma.lPActor.findFirst({
    where: {
      dealId,
      OR: [
        { authUserId: authUser.id },
        { email: authUser.email.toLowerCase() }
      ],
      status: 'ACTIVE'
    }
  });

  if (!lpActor) {
    return sendError(res, 404, "Investment not found or you don't have access");
  }

  // Get capital call with LP's allocation
  const capitalCall = await prisma.capitalCall.findFirst({
    where: { id: callId, dealId },
    include: {
      allocations: {
        where: { lpActorId: lpActor.id }
      }
    }
  });

  if (!capitalCall) {
    return sendError(res, 404, "Capital call not found");
  }

  if (!['ISSUED', 'PARTIALLY_FUNDED', 'FUNDED'].includes(capitalCall.status)) {
    return sendError(res, 404, "Capital call not available");
  }

  sendJson(res, 200, {
    capitalCall: {
      id: capitalCall.id,
      title: capitalCall.title,
      description: capitalCall.description,
      totalAmount: capitalCall.totalAmount,
      dueDate: capitalCall.dueDate?.toISOString(),
      wireInstructions: capitalCall.wireInstructions,
      purpose: capitalCall.purpose,
      status: capitalCall.status,
      issuedAt: capitalCall.issuedAt?.toISOString(),
      documentId: capitalCall.documentId
    },
    myAllocation: capitalCall.allocations[0] ? {
      id: capitalCall.allocations[0].id,
      amount: capitalCall.allocations[0].amount,
      status: capitalCall.allocations[0].status,
      fundedAmount: capitalCall.allocations[0].fundedAmount,
      fundedAt: capitalCall.allocations[0].fundedAt?.toISOString(),
      wireReference: capitalCall.allocations[0].wireReference,
      proofDocumentId: capitalCall.allocations[0].proofDocumentId
    } : null,
    lpActorId: lpActor.id
  });
}

/**
 * LP marks wire as initiated
 * POST /api/lp/portal/my-investments/:dealId/capital-calls/:callId/wire-initiated
 * Body: { wireReference? }
 */
export async function handleMarkWireInitiated(req, res, authUser, dealId, callId, readJsonBody) {
  if (!authUser) {
    return sendError(res, 401, "Authentication required");
  }

  if (authUser.role !== "LP") {
    return sendError(res, 403, "Only LP users can access this endpoint");
  }

  const validationLog = createValidationLogger('handleMarkWireInitiated');
  const rawBody = await readJsonBody(req);
  validationLog.beforeValidation(rawBody);

  // Validate with Zod schema
  const parseResult = MarkWireInitiatedSchema.safeParse(rawBody ?? {});
  if (!parseResult.success) {
    validationLog.validationFailed(parseResult.error.errors);
    return sendError(res, 400, "Validation failed", {
      code: 'VALIDATION_FAILED',
      errors: parseResult.error.errors
    });
  }

  const body = parseResult.data;
  validationLog.afterValidation(body);

  const prisma = getPrisma();

  // Find LP actor
  const lpActor = await prisma.lPActor.findFirst({
    where: {
      dealId,
      OR: [
        { authUserId: authUser.id },
        { email: authUser.email.toLowerCase() }
      ],
      status: 'ACTIVE'
    }
  });

  if (!lpActor) {
    return sendError(res, 404, "Investment not found");
  }

  // Find allocation
  const allocation = await prisma.capitalCallAllocation.findFirst({
    where: {
      capitalCallId: callId,
      lpActorId: lpActor.id
    }
  });

  if (!allocation) {
    return sendError(res, 404, "Allocation not found");
  }

  if (allocation.status !== 'PENDING') {
    return sendError(res, 400, `Cannot update allocation with status ${allocation.status}`);
  }

  const updated = await prisma.capitalCallAllocation.update({
    where: { id: allocation.id },
    data: {
      status: 'WIRE_INITIATED',
      wireReference: body?.wireReference || null
    }
  });

  // Record audit event
  await createDealEvent(dealId, 'WIRE_INITIATED', {
    capitalCallId: callId,
    allocationId: allocation.id,
    lpActorId: lpActor.id,
    lpEntityName: lpActor.entityName,
    amount: allocation.amount,
    wireReference: body?.wireReference || null
  }, { id: authUser.id, name: authUser.name, role: 'LP' });

  console.log(`[Capital Calls] LP ${lpActor.entityName} marked wire initiated for call ${callId}`);

  sendJson(res, 200, {
    allocation: {
      id: updated.id,
      status: updated.status,
      wireReference: updated.wireReference
    }
  });
}

/**
 * LP uploads wire proof document
 * POST /api/lp/portal/my-investments/:dealId/capital-calls/:callId/upload-proof
 * Body: { documentId, wireReference? }
 */
export async function handleUploadWireProof(req, res, authUser, dealId, callId, readJsonBody) {
  if (!authUser) {
    return sendError(res, 401, "Authentication required");
  }

  if (authUser.role !== "LP") {
    return sendError(res, 403, "Only LP users can access this endpoint");
  }

  const validationLog = createValidationLogger('handleUploadWireProof');
  const rawBody = await readJsonBody(req);
  validationLog.beforeValidation(rawBody);

  // Validate with Zod schema
  const parseResult = UploadWireProofSchema.safeParse(rawBody ?? {});
  if (!parseResult.success) {
    validationLog.validationFailed(parseResult.error.errors);
    return sendError(res, 400, "Validation failed", {
      code: 'VALIDATION_FAILED',
      errors: parseResult.error.errors
    });
  }

  const body = parseResult.data;
  validationLog.afterValidation(body);

  const prisma = getPrisma();

  // Find LP actor
  const lpActor = await prisma.lPActor.findFirst({
    where: {
      dealId,
      OR: [
        { authUserId: authUser.id },
        { email: authUser.email.toLowerCase() }
      ],
      status: 'ACTIVE'
    }
  });

  if (!lpActor) {
    return sendError(res, 404, "Investment not found");
  }

  // Find allocation
  const allocation = await prisma.capitalCallAllocation.findFirst({
    where: {
      capitalCallId: callId,
      lpActorId: lpActor.id
    }
  });

  if (!allocation) {
    return sendError(res, 404, "Allocation not found");
  }

  const updated = await prisma.capitalCallAllocation.update({
    where: { id: allocation.id },
    data: {
      proofDocumentId: body.documentId,
      wireReference: body.wireReference ?? allocation.wireReference,
      status: allocation.status === 'PENDING' ? 'WIRE_INITIATED' : allocation.status
    }
  });

  console.log(`[Capital Calls] LP ${lpActor.entityName} uploaded proof for call ${callId}`);

  sendJson(res, 200, {
    allocation: {
      id: updated.id,
      status: updated.status,
      proofDocumentId: updated.proofDocumentId
    }
  });
}

/**
 * GP marks LP allocation as funded
 * POST /api/deals/:dealId/capital-calls/:callId/allocations/:allocationId/mark-funded
 * Body: { fundedAmount?, confirmationRef? }
 */
export async function handleMarkFunded(req, res, dealId, callId, allocationId, readJsonBody) {
  const authUser = await requireGP(req, res);
  if (!authUser) return;

  const validationLog = createValidationLogger('handleMarkFunded');
  const rawBody = await readJsonBody(req);
  validationLog.beforeValidation(rawBody);

  // Validate with Zod schema
  const parseResult = MarkFundedSchema.safeParse(rawBody ?? {});
  if (!parseResult.success) {
    validationLog.validationFailed(parseResult.error.errors);
    return sendError(res, 400, "Validation failed", {
      code: 'VALIDATION_FAILED',
      errors: parseResult.error.errors
    });
  }

  const body = parseResult.data;
  validationLog.afterValidation(body);

  const prisma = getPrisma();

  // Create integrity logger
  const logger = createIntegrityLogger({
    operation: INTEGRITY_OPERATIONS.CAPITAL_CALL_FUND,
    dealId,
    userId: authUser?.id,
    requestId: req.headers['x-request-id']
  });

  try {
    logger.info('Funding allocation', {
      allocationId,
      callId,
      fundedAmount: body?.fundedAmount,
      expectedVersion: body?.expectedVersion
    });

    // Use transaction for optimistic concurrency
    const result = await prisma.$transaction(async (tx) => {
      // 1. Get current allocation with version check
      const allocation = await tx.capitalCallAllocation.findFirst({
        where: { id: allocationId, capitalCallId: callId }
      });

      if (!allocation) {
        throw { code: 'NOT_FOUND', message: 'Allocation not found' };
      }

      // 2. OPTIMISTIC CONCURRENCY - check version if provided
      if (body?.expectedVersion !== undefined && allocation.version !== body.expectedVersion) {
        logger.warn('Version mismatch - concurrent modification detected', {
          expectedVersion: body.expectedVersion,
          actualVersion: allocation.version
        });
        throw {
          code: 'CONCURRENCY_ERROR',
          message: `Allocation was modified by another user. Expected version ${body.expectedVersion}, found ${allocation.version}. Please refresh and try again.`
        };
      }

      logger.beforeState('allocation', {
        id: allocation.id,
        status: allocation.status,
        fundedAmount: allocation.fundedAmount,
        version: allocation.version
      });

      // 3. Validate state transition
      if (allocation.status === 'FUNDED') {
        throw { code: 'ALREADY_FUNDED', message: 'Allocation is already funded' };
      }

      // 4. Update allocation with version increment
      const updated = await tx.capitalCallAllocation.update({
        where: { id: allocationId },
        data: {
          status: 'FUNDED',
          fundedAmount: body?.fundedAmount ?? allocation.amount,
          fundedAt: new Date(),
          wireReference: body?.confirmationRef || null,
          version: allocation.version + 1  // Increment version for optimistic concurrency
        }
      });

      logger.afterState('allocation', {
        id: updated.id,
        status: updated.status,
        fundedAmount: updated.fundedAmount,
        version: updated.version
      });

      // 5. Check if all allocations are funded
      const allAllocations = await tx.capitalCallAllocation.findMany({
        where: { capitalCallId: callId }
      });

      const allFunded = allAllocations.every(a => a.status === 'FUNDED');
      const someFunded = allAllocations.some(a => a.status === 'FUNDED');

      // 6. Update capital call status
      let newCallStatus = null;
      if (allFunded) {
        await tx.capitalCall.update({
          where: { id: callId },
          data: { status: 'FUNDED' }
        });
        newCallStatus = 'FUNDED';
        logger.info('All allocations funded - capital call marked FUNDED', { callId });
      } else if (someFunded) {
        await tx.capitalCall.update({
          where: { id: callId },
          data: { status: 'PARTIALLY_FUNDED' }
        });
        newCallStatus = 'PARTIALLY_FUNDED';
      }

      return { allocation, updated, newCallStatus };
    });

    // Get LP actor info for audit (outside transaction)
    const lpActor = await prisma.lPActor.findUnique({
      where: { id: result.allocation.lpActorId },
      select: { entityName: true }
    });

    // Get capital call for context
    const capitalCall = await prisma.capitalCall.findUnique({
      where: { id: callId },
      select: { dealId: true, title: true }
    });

    // Record audit event
    await createDealEvent(dealId, 'CAPITAL_CALL_FUNDED', {
      capitalCallId: callId,
      capitalCallTitle: capitalCall?.title,
      allocationId: allocationId,
      lpActorId: result.allocation.lpActorId,
      lpEntityName: lpActor?.entityName,
      requestedAmount: result.allocation.amount,
      fundedAmount: result.updated.fundedAmount,
      confirmationRef: body?.confirmationRef || null,
      newCallStatus: result.newCallStatus,
      version: result.updated.version
    }, { id: authUser.id, name: authUser.name, role: authUser.role });

    // Audit log with AUDIT_ACTIONS
    await logPermissionAction({
      actorId: authUser.id,
      action: AUDIT_ACTIONS.CAPITAL_CALL_ALLOCATION_FUNDED,
      resourceType: 'CapitalCallAllocation',
      resourceId: allocationId,
      beforeValue: {
        status: result.allocation.status,
        fundedAmount: result.allocation.fundedAmount,
        version: result.allocation.version
      },
      afterValue: {
        status: result.updated.status,
        fundedAmount: result.updated.fundedAmount,
        version: result.updated.version
      },
      metadata: { dealId, capitalCallId: callId, lpActorId: result.allocation.lpActorId },
      ipAddress: req.headers['x-forwarded-for'] || req.socket?.remoteAddress
    });

    await logger.flush();

    console.log(`[Capital Calls] Marked allocation ${allocationId} as funded (version: ${result.updated.version})`);

    sendJson(res, 200, {
      allocation: {
        id: result.updated.id,
        status: result.updated.status,
        fundedAmount: result.updated.fundedAmount,
        fundedAt: result.updated.fundedAt.toISOString(),
        version: result.updated.version
      },
      capitalCallStatus: result.newCallStatus
    });

  } catch (error) {
    // Handle specific error types
    if (error.code === 'NOT_FOUND') {
      logger.warn('Allocation not found', { allocationId });
      await logger.flush();
      return sendError(res, 404, error.message);
    }

    if (error.code === 'CONCURRENCY_ERROR') {
      await logger.flush();
      return sendError(res, 409, error.message, 'CONCURRENCY_ERROR');
    }

    if (error.code === 'ALREADY_FUNDED') {
      logger.warn('Already funded', { allocationId });
      await logger.flush();
      return sendError(res, 400, error.message);
    }

    logger.error('Fund allocation failed', { error: error.message });
    await logger.flush();
    throw error;
  }
}

/**
 * Generate capital call notices for all LPs in a capital call
 * POST /api/deals/:dealId/capital-calls/:callId/generate-notices
 * GP Only - Generates PDF notices for each LP allocation
 */
export async function handleGenerateCapitalCallNotices(req, res, dealId, callId, userId, userName) {
  console.log(`[Capital Calls] Generate notices request`, { dealId, callId, userId });

  // Auth is handled by route dispatch (requireGPWithDealAccess)
  const prisma = getPrisma();

  // Verify capital call exists and belongs to deal
  const capitalCall = await prisma.capitalCall.findUnique({
    where: { id: callId },
    include: {
      allocations: {
        include: { lpActor: true }
      }
    }
  });

  if (!capitalCall) {
    return sendError(res, 404, "Capital call not found");
  }

  if (capitalCall.dealId !== dealId) {
    return sendError(res, 400, "Capital call does not belong to this deal");
  }

  if (capitalCall.allocations.length === 0) {
    return sendError(res, 400, "No LP allocations found for this capital call");
  }

  console.log(`[Capital Calls] Generating notices for ${capitalCall.allocations.length} LPs`, { dealId, callId });

  try {
    const results = await generateCapitalCallNotices(
      dealId,
      callId,
      { id: userId, name: userName, role: 'GP' }
    );

    const successful = results.filter(r => !r.error);
    const failed = results.filter(r => r.error);

    // Record audit event
    await createDealEvent(dealId, 'CAPITAL_CALL_NOTICES_GENERATED', {
      capitalCallId: callId,
      capitalCallTitle: capitalCall.title,
      totalCount: results.length,
      successCount: successful.length,
      failedCount: failed.length,
      generatedBy: userName
    }, { id: userId, name: userName, role: 'GP' });

    console.log(`[Capital Calls] Generated ${successful.length}/${results.length} notices`, { dealId, callId });

    sendJson(res, 200, {
      success: true,
      totalCount: results.length,
      successCount: successful.length,
      failedCount: failed.length,
      documents: successful.map(r => ({
        lpActorId: r.lpActorId,
        entityName: r.entityName,
        documentId: r.document?.generatedDocument?.id,
        versionId: r.document?.documentVersion?.id
      })),
      errors: failed.map(r => ({
        lpActorId: r.lpActorId,
        entityName: r.entityName,
        error: r.error
      }))
    });
  } catch (error) {
    console.error(`[Capital Calls] Failed to generate notices`, { dealId, callId, error: error.message });
    return sendError(res, 500, "Failed to generate notices", error.message);
  }
}
