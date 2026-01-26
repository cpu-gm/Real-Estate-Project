import { getPrisma } from "../db.js";
import { extractAuthUser } from "./auth.js";
import { readStore } from "../store.js";
import { createValidationLogger } from "../services/validation-logger.js";
import { AssignAnalystSchema, BulkAssignAnalystSchema } from "../middleware/route-schemas.js";

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
 * Get all assignments for a deal
 */
export async function handleListDealAssignments(req, res, dealId) {
  // Organization isolation check
  const authUser = await requireDealOrgAccess(req, res, dealId);
  if (!authUser) return;

  const prisma = getPrisma();

  const assignments = await prisma.dealAssignment.findMany({
    where: {
      dealId,
      removedAt: null
    },
    orderBy: { assignedAt: "asc" }
  });

  sendJson(res, 200, { assignments });
}

/**
 * Assign an analyst to a deal (GP only)
 *
 * T1.3 (P1 Security Sprint): Uses authUser from validated JWT
 */
export async function handleAssignAnalyst(req, res, dealId, readJsonBody, authUser) {
  // Organization isolation check
  const verifiedAuthUser = await requireDealOrgAccess(req, res, dealId);
  if (!verifiedAuthUser) return;

  // Only GP or Admin can assign analysts
  if (!['GP', 'Admin'].includes(verifiedAuthUser.role)) {
    return sendError(res, 403, "Only GP or Admin can assign analysts to deals");
  }

  const body = await readJsonBody(req);

  // ========== VALIDATION ==========
  const validationLog = createValidationLogger('handleAssignAnalyst');
  validationLog.beforeValidation(body);

  const parsed = AssignAnalystSchema.safeParse(body);
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
  const assignedBy = authUser.id;  // T1.3: Use validated JWT identity

  try {
    // Check if already assigned
    const existing = await prisma.dealAssignment.findUnique({
      where: {
        dealId_userId: {
          dealId,
          userId: parsed.data.userId
        }
      }
    });

    if (existing && !existing.removedAt) {
      return sendError(res, 409, "User is already assigned to this deal");
    }

    // If previously removed, reactivate
    if (existing && existing.removedAt) {
      const updated = await prisma.dealAssignment.update({
        where: { id: existing.id },
        data: {
          removedAt: null,
          assignedBy,
          assignedAt: new Date(),
          userName: parsed.data.userName ?? existing.userName,
          role: parsed.data.role ?? "analyst"
        }
      });

      // SECURITY: V9 - Audit log for analyst access control change
      await prisma.permissionAuditLog.create({
        data: {
          actorId: authUser.id,
          actorName: authUser.name || null,
          targetUserId: parsed.data.userId,
          targetUserName: parsed.data.userName || existing.userName || null,
          action: 'DEAL_ASSIGNMENT_REACTIVATED',
          afterValue: JSON.stringify({
            dealId,
            analystId: parsed.data.userId,
            analystName: parsed.data.userName || existing.userName,
            role: parsed.data.role ?? "analyst"
          }),
          ipAddress: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || null
        }
      });

      return sendJson(res, 200, { assignment: updated });
    }

    // Create new assignment
    const assignment = await prisma.dealAssignment.create({
      data: {
        dealId,
        userId: parsed.data.userId,
        userName: parsed.data.userName ?? null,
        role: parsed.data.role ?? "analyst",
        assignedBy
      }
    });

    // SECURITY: V9 - Audit log for analyst access control change
    await prisma.permissionAuditLog.create({
      data: {
        actorId: authUser.id,
        actorName: authUser.name || null,
        targetUserId: parsed.data.userId,
        targetUserName: parsed.data.userName || null,
        action: 'DEAL_ASSIGNMENT_CREATED',
        afterValue: JSON.stringify({
          dealId,
          analystId: parsed.data.userId,
          analystName: parsed.data.userName,
          role: parsed.data.role ?? "analyst"
        }),
        ipAddress: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || null
      }
    });

    sendJson(res, 201, { assignment });
  } catch (error) {
    console.error("Failed to assign analyst:", error);
    sendError(res, 500, "Failed to assign analyst");
  }
}

/**
 * Remove an analyst from a deal (GP only)
 *
 * T1.3 (P1 Security Sprint): Removed resolveActorRole param (unused)
 */
export async function handleUnassignAnalyst(req, res, dealId, userId) {
  // Organization isolation check
  const authUser = await requireDealOrgAccess(req, res, dealId);
  if (!authUser) return;

  // Only GP or Admin can unassign analysts
  if (!['GP', 'Admin'].includes(authUser.role)) {
    return sendError(res, 403, "Only GP or Admin can unassign analysts from deals");
  }

  const prisma = getPrisma();

  try {
    const assignment = await prisma.dealAssignment.findUnique({
      where: {
        dealId_userId: {
          dealId,
          userId
        }
      }
    });

    if (!assignment || assignment.removedAt) {
      return sendError(res, 404, "Assignment not found");
    }

    // Soft delete
    await prisma.dealAssignment.update({
      where: { id: assignment.id },
      data: { removedAt: new Date() }
    });

    // SECURITY: V9 - Audit log for analyst access control change
    await prisma.permissionAuditLog.create({
      data: {
        actorId: authUser.id,
        actorName: authUser.name || null,
        targetUserId: userId,
        targetUserName: assignment.userName || null,
        action: 'DEAL_ASSIGNMENT_REMOVED',
        beforeValue: JSON.stringify({
          dealId,
          analystId: userId,
          analystName: assignment.userName,
          role: assignment.role
        }),
        ipAddress: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || null
      }
    });

    sendJson(res, 200, { success: true });
  } catch (error) {
    console.error("Failed to unassign analyst:", error);
    sendError(res, 500, "Failed to unassign analyst");
  }
}

/**
 * Get all deals assigned to a specific user
 */
export async function getAssignedDealIds(userId) {
  const prisma = getPrisma();

  const assignments = await prisma.dealAssignment.findMany({
    where: {
      userId,
      removedAt: null
    },
    select: { dealId: true }
  });

  return assignments.map(a => a.dealId);
}

/**
 * Check if a user is assigned to a specific deal
 */
export async function isUserAssignedToDeal(userId, dealId) {
  const prisma = getPrisma();

  const assignment = await prisma.dealAssignment.findUnique({
    where: {
      dealId_userId: {
        dealId,
        userId
      }
    }
  });

  return assignment && !assignment.removedAt;
}

/**
 * Check if user has access to a deal based on role
 * GP sees all, GP Analyst sees only assigned
 */
export async function checkDealAccess(role, userId, dealId) {
  // GP, Admin, Lender, Regulator, Auditor can see all deals
  if (['GP', 'Admin', 'Lender', 'Regulator', 'Auditor'].includes(role)) {
    return { allowed: true };
  }

  // GP Analyst and Counsel can only see assigned deals
  if (role === 'GP Analyst' || role === 'Counsel') {
    const isAssigned = await isUserAssignedToDeal(userId, dealId);
    if (!isAssigned) {
      return {
        allowed: false,
        reason: `${role} can only access assigned deals`
      };
    }
    return { allowed: true };
  }

  // LP has their own access logic (via LPActor)
  if (role === 'LP') {
    // LP access is handled separately via LPActor table
    return { allowed: true };
  }

  return { allowed: false, reason: 'Unknown role' };
}

/**
 * Bulk assign an analyst to multiple deals (GP only)
 *
 * Request body: { dealIds: string[], userId: string, userName?: string, role?: string }
 * Response: { succeeded: string[], failed: { id: string, name?: string, error: string }[] }
 */
export async function handleBulkAssignAnalyst(req, res, readJsonBody) {
  const authUser = await extractAuthUser(req);
  if (!authUser) {
    return sendError(res, 401, "Not authenticated");
  }

  // Only GP or Admin can assign analysts
  if (!['GP', 'Admin'].includes(authUser.role)) {
    return sendError(res, 403, "Only GP or Admin can assign analysts to deals");
  }

  const body = await readJsonBody(req);

  // ========== VALIDATION ==========
  const validationLog = createValidationLogger('handleBulkAssignAnalyst');
  validationLog.beforeValidation(body);

  const parsed = BulkAssignAnalystSchema.safeParse(body);
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
  const store = await readStore();
  const succeeded = [];
  const failed = [];

  console.log(`[Bulk] Assigning analyst to ${parsed.data.dealIds.length} deals`);

  for (const dealId of parsed.data.dealIds) {
    try {
      // Find deal in store
      const dealRecord = store.dealIndex.find((item) => item.id === dealId);

      // Check org isolation
      if (!dealRecord) {
        failed.push({ id: dealId, error: 'Deal not found' });
        continue;
      }

      if (dealRecord.organizationId && dealRecord.organizationId !== authUser.organizationId) {
        failed.push({ id: dealId, name: dealRecord.name, error: 'Access denied - different organization' });
        continue;
      }

      // Check if already assigned
      const existing = await prisma.dealAssignment.findUnique({
        where: {
          dealId_userId: {
            dealId,
            userId: parsed.data.userId
          }
        }
      });

      if (existing && !existing.removedAt) {
        // Already assigned - count as success (idempotent)
        succeeded.push(dealId);
        continue;
      }

      if (existing && existing.removedAt) {
        // Reactivate
        await prisma.dealAssignment.update({
          where: { id: existing.id },
          data: {
            removedAt: null,
            assignedBy: authUser.id,
            assignedAt: new Date(),
            userName: parsed.data.userName ?? existing.userName,
            role: parsed.data.role ?? "analyst"
          }
        });
      } else {
        // Create new assignment
        await prisma.dealAssignment.create({
          data: {
            dealId,
            userId: parsed.data.userId,
            userName: parsed.data.userName ?? null,
            role: parsed.data.role ?? "analyst",
            assignedBy: authUser.id
          }
        });
      }

      // Audit log
      await prisma.permissionAuditLog.create({
        data: {
          actorId: authUser.id,
          actorName: authUser.name || null,
          targetUserId: parsed.data.userId,
          targetUserName: parsed.data.userName || null,
          action: 'BULK_DEAL_ASSIGNMENT_CREATED',
          afterValue: JSON.stringify({
            dealId,
            analystId: parsed.data.userId,
            analystName: parsed.data.userName,
            role: parsed.data.role ?? "analyst"
          }),
          ipAddress: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || null
        }
      });

      succeeded.push(dealId);
    } catch (error) {
      console.error(`[Bulk] Failed to assign deal ${dealId}:`, error.message);
      const dealRecord = store.dealIndex.find((item) => item.id === dealId);
      failed.push({
        id: dealId,
        name: dealRecord?.name,
        error: error.message || 'Unknown error'
      });
    }
  }

  console.log(`[Bulk] Assignment complete: ${succeeded.length} succeeded, ${failed.length} failed`);

  sendJson(res, 200, { succeeded, failed });
}
