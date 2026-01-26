/**
 * Legal Matters API Routes
 *
 * Provides CRUD operations for GP Counsel legal matter tracking.
 * All routes require GP Counsel or General Counsel role.
 *
 * Routes:
 *   GET    /api/legal/matters           - List all matters (with filters)
 *   POST   /api/legal/matters           - Create a new matter
 *   GET    /api/legal/matters/:id       - Get matter by ID
 *   PATCH  /api/legal/matters/:id       - Update matter
 *   POST   /api/legal/matters/:id/stage - Change matter stage (Kanban move)
 *   POST   /api/legal/matters/:id/assign - Assign matter to user
 *   POST   /api/legal/matters/:id/sign-off - Sign off on matter
 *   GET    /api/legal/matters/:id/activities - Get matter activities
 *   POST   /api/legal/matters/:id/activities - Add activity (comment)
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

// Valid stages for Kanban workflow
const VALID_STAGES = ['NEW', 'IN_PROGRESS', 'COMPLETE'];
const VALID_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const VALID_MATTER_TYPES = ['DEAL_SPECIFIC', 'ENTITY_CORPORATE', 'INVESTOR_RELATIONS', 'ONGOING_RECURRING'];
const VALID_ACTIVITY_TYPES = ['COMMENT', 'STATUS_CHANGE', 'ASSIGNMENT', 'SIGN_OFF', 'PRIORITY_CHANGE', 'AI_ANALYSIS'];

/**
 * Generate a matter number: ORG-YYYY-NNNN
 */
async function generateMatterNumber(prisma, organizationId) {
  const year = new Date().getFullYear();
  const prefix = `${organizationId.slice(0, 3).toUpperCase()}-${year}`;

  // Count existing matters for this org this year
  const count = await prisma.legalMatter.count({
    where: {
      organizationId,
      matterNumber: { startsWith: prefix }
    }
  });

  const seq = (count + 1).toString().padStart(4, '0');
  return `${prefix}-${seq}`;
}

/**
 * Calculate aging color based on due date
 * @returns {'green' | 'yellow' | 'red' | null}
 */
function calculateAgingColor(dueDate) {
  if (!dueDate) return null;

  const now = new Date();
  const due = new Date(dueDate);
  const daysUntilDue = Math.ceil((due - now) / (1000 * 60 * 60 * 24));

  if (daysUntilDue < 0) return 'red';      // Overdue
  if (daysUntilDue <= 3) return 'red';     // Less than 3 days
  if (daysUntilDue <= 7) return 'yellow';  // 3-7 days
  return 'green';                          // More than 7 days
}

/**
 * GET /api/legal/matters - List all matters with filters
 */
export async function handleListMatters(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Parse query params
  const stage = url.searchParams.get('stage');
  const matterType = url.searchParams.get('matterType');
  const dealId = url.searchParams.get('dealId');
  const assignedTo = url.searchParams.get('assignedTo');
  const priority = url.searchParams.get('priority');
  const search = url.searchParams.get('search');
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  // Build where clause
  const where = {
    organizationId: authUser.organizationId
  };

  if (stage && VALID_STAGES.includes(stage)) {
    where.stage = stage;
  }
  if (matterType && VALID_MATTER_TYPES.includes(matterType)) {
    where.matterType = matterType;
  }
  if (dealId) {
    where.dealId = dealId;
  }
  if (assignedTo) {
    where.assignedTo = assignedTo;
  }
  if (priority && VALID_PRIORITIES.includes(priority)) {
    where.priority = priority;
  }
  if (search) {
    where.OR = [
      { title: { contains: search } },
      { description: { contains: search } },
      { matterNumber: { contains: search } }
    ];
  }

  try {
    const [matters, total] = await Promise.all([
      prisma.legalMatter.findMany({
        where,
        orderBy: [
          { priority: 'desc' },
          { dueDate: 'asc' },
          { createdAt: 'desc' }
        ],
        take: limit,
        skip: offset
      }),
      prisma.legalMatter.count({ where })
    ]);

    // Add aging color to each matter
    const mattersWithAging = matters.map(matter => ({
      ...matter,
      agingColor: calculateAgingColor(matter.dueDate)
    }));

    console.log(`[legal-matters] Listed ${matters.length} matters for org ${authUser.organizationId}`);

    sendJson(res, 200, {
      matters: mattersWithAging,
      total,
      limit,
      offset
    });
  } catch (error) {
    console.error('[legal-matters] List error:', error);
    sendError(res, 500, 'Failed to list matters', error.message);
  }
}

/**
 * POST /api/legal/matters - Create a new matter
 */
export async function handleCreateMatter(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();

  // Parse request body
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    sendError(res, 400, 'Invalid JSON body');
    return;
  }

  const { title, description, matterType, subType, dealId, dealName, priority, dueDate, targetDate } = body;

  // Validate required fields
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    sendError(res, 400, 'Title is required');
    return;
  }
  if (!matterType || !VALID_MATTER_TYPES.includes(matterType)) {
    sendError(res, 400, `Invalid matterType. Must be one of: ${VALID_MATTER_TYPES.join(', ')}`);
    return;
  }
  if (priority && !VALID_PRIORITIES.includes(priority)) {
    sendError(res, 400, `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}`);
    return;
  }

  try {
    // Generate matter number
    const matterNumber = await generateMatterNumber(prisma, authUser.organizationId);

    const matter = await prisma.legalMatter.create({
      data: {
        organizationId: authUser.organizationId,
        matterNumber,
        title: title.trim(),
        description: description?.trim() || null,
        matterType,
        subType: subType || null,
        dealId: dealId || null,
        dealName: dealName || null,
        stage: 'NEW',
        priority: priority || 'NORMAL',
        dueDate: dueDate ? new Date(dueDate) : null,
        targetDate: targetDate ? new Date(targetDate) : null,
        stageEnteredAt: new Date(),
        createdBy: authUser.id,
        createdByName: authUser.name || authUser.email
      }
    });

    // Create initial activity
    await prisma.legalMatterActivity.create({
      data: {
        matterId: matter.id,
        activityType: 'STATUS_CHANGE',
        content: 'Matter created',
        newValue: 'NEW',
        createdBy: authUser.id,
        createdByName: authUser.name || authUser.email
      }
    });

    // Audit log
    await logPermissionAction({
      actorId: authUser.id,
      actorName: authUser.name,
      action: 'LEGAL_MATTER_CREATED',
      resourceType: 'LegalMatter',
      resourceId: matter.id,
      afterValue: { matterNumber, title, matterType, dealId },
      metadata: { organizationId: authUser.organizationId }
    });

    console.log(`[legal-matters] Created matter ${matterNumber} by ${authUser.email}`);

    sendJson(res, 201, {
      matter: {
        ...matter,
        agingColor: calculateAgingColor(matter.dueDate)
      }
    });
  } catch (error) {
    console.error('[legal-matters] Create error:', error);
    sendError(res, 500, 'Failed to create matter', error.message);
  }
}

/**
 * GET /api/legal/matters/:id - Get matter by ID
 */
export async function handleGetMatter(req, res, matterId) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();

  try {
    const matter = await prisma.legalMatter.findUnique({
      where: { id: matterId },
      include: {
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 20
        }
      }
    });

    if (!matter) {
      sendError(res, 404, 'Matter not found');
      return;
    }

    // Org isolation
    if (matter.organizationId !== authUser.organizationId) {
      sendError(res, 403, 'Access denied - matter belongs to different organization');
      return;
    }

    sendJson(res, 200, {
      matter: {
        ...matter,
        agingColor: calculateAgingColor(matter.dueDate)
      }
    });
  } catch (error) {
    console.error('[legal-matters] Get error:', error);
    sendError(res, 500, 'Failed to get matter', error.message);
  }
}

/**
 * PATCH /api/legal/matters/:id - Update matter
 */
export async function handleUpdateMatter(req, res, matterId) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();

  // Parse request body
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    sendError(res, 400, 'Invalid JSON body');
    return;
  }

  try {
    // Fetch existing matter
    const existing = await prisma.legalMatter.findUnique({
      where: { id: matterId }
    });

    if (!existing) {
      sendError(res, 404, 'Matter not found');
      return;
    }

    if (existing.organizationId !== authUser.organizationId) {
      sendError(res, 403, 'Access denied - matter belongs to different organization');
      return;
    }

    // Build update data
    const updateData = {};
    const changes = [];

    if (body.title !== undefined) {
      updateData.title = body.title.trim();
      changes.push(`Title: "${existing.title}" -> "${body.title}"`);
    }
    if (body.description !== undefined) {
      updateData.description = body.description?.trim() || null;
    }
    if (body.priority !== undefined && VALID_PRIORITIES.includes(body.priority)) {
      updateData.priority = body.priority;
      if (existing.priority !== body.priority) {
        changes.push(`Priority: ${existing.priority} -> ${body.priority}`);
      }
    }
    if (body.dueDate !== undefined) {
      updateData.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    }
    if (body.targetDate !== undefined) {
      updateData.targetDate = body.targetDate ? new Date(body.targetDate) : null;
    }
    if (body.dealId !== undefined) {
      updateData.dealId = body.dealId || null;
      updateData.dealName = body.dealName || null;
    }
    if (body.isPrivileged !== undefined) {
      updateData.isPrivileged = Boolean(body.isPrivileged);
    }
    if (body.gcReviewRequired !== undefined) {
      updateData.gcReviewRequired = Boolean(body.gcReviewRequired);
    }

    if (Object.keys(updateData).length === 0) {
      sendError(res, 400, 'No valid fields to update');
      return;
    }

    const updated = await prisma.legalMatter.update({
      where: { id: matterId },
      data: updateData
    });

    // Log activity if significant changes
    if (changes.length > 0) {
      await prisma.legalMatterActivity.create({
        data: {
          matterId,
          activityType: body.priority !== existing.priority ? 'PRIORITY_CHANGE' : 'STATUS_CHANGE',
          content: changes.join('; '),
          previousValue: JSON.stringify({ priority: existing.priority }),
          newValue: JSON.stringify(updateData),
          createdBy: authUser.id,
          createdByName: authUser.name || authUser.email
        }
      });
    }

    console.log(`[legal-matters] Updated matter ${matterId} by ${authUser.email}`);

    sendJson(res, 200, {
      matter: {
        ...updated,
        agingColor: calculateAgingColor(updated.dueDate)
      }
    });
  } catch (error) {
    console.error('[legal-matters] Update error:', error);
    sendError(res, 500, 'Failed to update matter', error.message);
  }
}

/**
 * POST /api/legal/matters/:id/stage - Change stage (Kanban move)
 */
export async function handleChangeMatterStage(req, res, matterId) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    sendError(res, 400, 'Invalid JSON body');
    return;
  }

  const { stage } = body;

  if (!stage || !VALID_STAGES.includes(stage)) {
    sendError(res, 400, `Invalid stage. Must be one of: ${VALID_STAGES.join(', ')}`);
    return;
  }

  try {
    const existing = await prisma.legalMatter.findUnique({
      where: { id: matterId }
    });

    if (!existing) {
      sendError(res, 404, 'Matter not found');
      return;
    }

    if (existing.organizationId !== authUser.organizationId) {
      sendError(res, 403, 'Access denied - matter belongs to different organization');
      return;
    }

    if (existing.stage === stage) {
      sendJson(res, 200, { matter: { ...existing, agingColor: calculateAgingColor(existing.dueDate) } });
      return;
    }

    const previousStage = existing.stage;

    const updated = await prisma.legalMatter.update({
      where: { id: matterId },
      data: {
        stage,
        stageEnteredAt: new Date(),
        closedAt: stage === 'COMPLETE' ? new Date() : null
      }
    });

    // Log activity
    await prisma.legalMatterActivity.create({
      data: {
        matterId,
        activityType: 'STATUS_CHANGE',
        content: `Stage changed: ${previousStage} -> ${stage}`,
        previousValue: previousStage,
        newValue: stage,
        createdBy: authUser.id,
        createdByName: authUser.name || authUser.email
      }
    });

    // Audit log
    await logPermissionAction({
      actorId: authUser.id,
      action: 'LEGAL_MATTER_STAGE_CHANGE',
      resourceType: 'LegalMatter',
      resourceId: matterId,
      beforeValue: { stage: previousStage },
      afterValue: { stage }
    });

    console.log(`[legal-matters] Stage change ${matterId}: ${previousStage} -> ${stage} by ${authUser.email}`);

    sendJson(res, 200, {
      matter: {
        ...updated,
        agingColor: calculateAgingColor(updated.dueDate)
      }
    });
  } catch (error) {
    console.error('[legal-matters] Stage change error:', error);
    sendError(res, 500, 'Failed to change stage', error.message);
  }
}

/**
 * POST /api/legal/matters/:id/assign - Assign matter to user
 */
export async function handleAssignMatter(req, res, matterId) {
  // GC can assign to anyone, GP Counsel can assign to self
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    sendError(res, 400, 'Invalid JSON body');
    return;
  }

  const { assignedTo, assignedToName } = body;

  // GP Counsel can only assign to self unless they're GC
  const isGC = ['General Counsel', 'Admin'].includes(authUser.role);
  if (!isGC && assignedTo && assignedTo !== authUser.id) {
    sendError(res, 403, 'GP Counsel can only assign matters to themselves. General Counsel required for team assignment.');
    return;
  }

  try {
    const existing = await prisma.legalMatter.findUnique({
      where: { id: matterId }
    });

    if (!existing) {
      sendError(res, 404, 'Matter not found');
      return;
    }

    if (existing.organizationId !== authUser.organizationId) {
      sendError(res, 403, 'Access denied - matter belongs to different organization');
      return;
    }

    const previousAssignee = existing.assignedToName || existing.assignedTo;

    const updated = await prisma.legalMatter.update({
      where: { id: matterId },
      data: {
        assignedTo: assignedTo || null,
        assignedToName: assignedToName || null,
        assignedBy: authUser.id,
        assignedByName: authUser.name || authUser.email,
        assignedAt: assignedTo ? new Date() : null
      }
    });

    // Log activity
    await prisma.legalMatterActivity.create({
      data: {
        matterId,
        activityType: 'ASSIGNMENT',
        content: assignedTo
          ? `Assigned to ${assignedToName || assignedTo}`
          : 'Assignment removed',
        previousValue: previousAssignee,
        newValue: assignedToName || assignedTo,
        createdBy: authUser.id,
        createdByName: authUser.name || authUser.email
      }
    });

    console.log(`[legal-matters] Assigned ${matterId} to ${assignedToName || assignedTo} by ${authUser.email}`);

    sendJson(res, 200, {
      matter: {
        ...updated,
        agingColor: calculateAgingColor(updated.dueDate)
      }
    });
  } catch (error) {
    console.error('[legal-matters] Assign error:', error);
    sendError(res, 500, 'Failed to assign matter', error.message);
  }
}

/**
 * POST /api/legal/matters/:id/sign-off - Sign off on matter
 */
export async function handleSignOff(req, res, matterId) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    sendError(res, 400, 'Invalid JSON body');
    return;
  }

  const { signOffType, conditions } = body;
  const validSignOffTypes = ['SIMPLE', 'CHECKLIST', 'CONDITIONAL'];

  if (signOffType && !validSignOffTypes.includes(signOffType)) {
    sendError(res, 400, `Invalid signOffType. Must be one of: ${validSignOffTypes.join(', ')}`);
    return;
  }

  try {
    const existing = await prisma.legalMatter.findUnique({
      where: { id: matterId }
    });

    if (!existing) {
      sendError(res, 404, 'Matter not found');
      return;
    }

    if (existing.organizationId !== authUser.organizationId) {
      sendError(res, 403, 'Access denied - matter belongs to different organization');
      return;
    }

    // If GC review is required, only GC can sign off
    if (existing.gcReviewRequired && !['General Counsel', 'Admin'].includes(authUser.role)) {
      sendError(res, 403, 'This matter requires General Counsel sign-off');
      return;
    }

    const updated = await prisma.legalMatter.update({
      where: { id: matterId },
      data: {
        signOffType: signOffType || 'SIMPLE',
        signOffStatus: 'APPROVED',
        signOffBy: authUser.id,
        signOffByName: authUser.name || authUser.email,
        signOffAt: new Date(),
        signOffConditions: conditions ? JSON.stringify(conditions) : null,
        gcApprovalStatus: existing.gcReviewRequired ? 'APPROVED' : null
      }
    });

    // Log activity
    await prisma.legalMatterActivity.create({
      data: {
        matterId,
        activityType: 'SIGN_OFF',
        content: `Signed off by ${authUser.name || authUser.email}`,
        newValue: JSON.stringify({ type: signOffType || 'SIMPLE', conditions }),
        createdBy: authUser.id,
        createdByName: authUser.name || authUser.email
      }
    });

    // Audit log
    await logPermissionAction({
      actorId: authUser.id,
      action: 'LEGAL_MATTER_SIGN_OFF',
      resourceType: 'LegalMatter',
      resourceId: matterId,
      afterValue: { signOffType, signedOffBy: authUser.email }
    });

    console.log(`[legal-matters] Signed off ${matterId} by ${authUser.email}`);

    sendJson(res, 200, {
      matter: {
        ...updated,
        agingColor: calculateAgingColor(updated.dueDate)
      }
    });
  } catch (error) {
    console.error('[legal-matters] Sign-off error:', error);
    sendError(res, 500, 'Failed to sign off on matter', error.message);
  }
}

/**
 * GET /api/legal/matters/:id/activities - Get matter activities
 */
export async function handleGetActivities(req, res, matterId) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();
  const url = new URL(req.url, `http://${req.headers.host}`);
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  try {
    // Verify matter exists and belongs to org
    const matter = await prisma.legalMatter.findUnique({
      where: { id: matterId },
      select: { organizationId: true }
    });

    if (!matter) {
      sendError(res, 404, 'Matter not found');
      return;
    }

    if (matter.organizationId !== authUser.organizationId) {
      sendError(res, 403, 'Access denied - matter belongs to different organization');
      return;
    }

    const [activities, total] = await Promise.all([
      prisma.legalMatterActivity.findMany({
        where: { matterId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      }),
      prisma.legalMatterActivity.count({ where: { matterId } })
    ]);

    sendJson(res, 200, { activities, total, limit, offset });
  } catch (error) {
    console.error('[legal-matters] Get activities error:', error);
    sendError(res, 500, 'Failed to get activities', error.message);
  }
}

/**
 * POST /api/legal/matters/:id/activities - Add activity (comment)
 */
export async function handleAddActivity(req, res, matterId) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    sendError(res, 400, 'Invalid JSON body');
    return;
  }

  const { content, activityType = 'COMMENT', metadata } = body;

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    sendError(res, 400, 'Content is required');
    return;
  }

  if (!VALID_ACTIVITY_TYPES.includes(activityType)) {
    sendError(res, 400, `Invalid activityType. Must be one of: ${VALID_ACTIVITY_TYPES.join(', ')}`);
    return;
  }

  try {
    // Verify matter exists and belongs to org
    const matter = await prisma.legalMatter.findUnique({
      where: { id: matterId },
      select: { organizationId: true }
    });

    if (!matter) {
      sendError(res, 404, 'Matter not found');
      return;
    }

    if (matter.organizationId !== authUser.organizationId) {
      sendError(res, 403, 'Access denied - matter belongs to different organization');
      return;
    }

    const activity = await prisma.legalMatterActivity.create({
      data: {
        matterId,
        activityType,
        content: content.trim(),
        metadata: metadata ? JSON.stringify(metadata) : null,
        createdBy: authUser.id,
        createdByName: authUser.name || authUser.email
      }
    });

    console.log(`[legal-matters] Added ${activityType} to ${matterId} by ${authUser.email}`);

    sendJson(res, 201, { activity });
  } catch (error) {
    console.error('[legal-matters] Add activity error:', error);
    sendError(res, 500, 'Failed to add activity', error.message);
  }
}
