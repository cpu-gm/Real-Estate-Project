/**
 * Legal Dashboard API Routes
 *
 * Provides dashboard data for GP Counsel Kanban view.
 *
 * Routes:
 *   GET /api/legal/dashboard - Dashboard summary with Kanban counts
 *   GET /api/legal/deals/:dealId/legal-context - Legal view of a specific deal
 */

import { getPrisma } from "../db.js";
import {
  requireGPCounsel,
  requireDealAccess,
  sendJson,
  sendError
} from "../middleware/auth.js";

/**
 * Calculate aging color based on due date
 */
function calculateAgingColor(dueDate) {
  if (!dueDate) return null;

  const now = new Date();
  const due = new Date(dueDate);
  const daysUntilDue = Math.ceil((due - now) / (1000 * 60 * 60 * 24));

  if (daysUntilDue < 0) return 'red';
  if (daysUntilDue <= 3) return 'red';
  if (daysUntilDue <= 7) return 'yellow';
  return 'green';
}

/**
 * GET /api/legal/dashboard - Dashboard summary
 */
export async function handleGetDashboard(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();

  try {
    // Get counts by stage
    const [newCount, inProgressCount, completeCount] = await Promise.all([
      prisma.legalMatter.count({
        where: { organizationId: authUser.organizationId, stage: 'NEW' }
      }),
      prisma.legalMatter.count({
        where: { organizationId: authUser.organizationId, stage: 'IN_PROGRESS' }
      }),
      prisma.legalMatter.count({
        where: { organizationId: authUser.organizationId, stage: 'COMPLETE' }
      })
    ]);

    // Get recent matters for each column (top 10)
    const [newMatters, inProgressMatters, recentComplete] = await Promise.all([
      prisma.legalMatter.findMany({
        where: { organizationId: authUser.organizationId, stage: 'NEW' },
        orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
        take: 10
      }),
      prisma.legalMatter.findMany({
        where: { organizationId: authUser.organizationId, stage: 'IN_PROGRESS' },
        orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }, { stageEnteredAt: 'desc' }],
        take: 10
      }),
      prisma.legalMatter.findMany({
        where: { organizationId: authUser.organizationId, stage: 'COMPLETE' },
        orderBy: { closedAt: 'desc' },
        take: 10
      })
    ]);

    // Get urgent items (overdue or due within 3 days)
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    const urgentMatters = await prisma.legalMatter.findMany({
      where: {
        organizationId: authUser.organizationId,
        stage: { not: 'COMPLETE' },
        dueDate: { lte: threeDaysFromNow }
      },
      orderBy: { dueDate: 'asc' },
      take: 5
    });

    // Get my assigned matters (for the logged-in user)
    const myMatters = await prisma.legalMatter.findMany({
      where: {
        organizationId: authUser.organizationId,
        assignedTo: authUser.id,
        stage: { not: 'COMPLETE' }
      },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
      take: 10
    });

    // Add aging color to all matters
    const addAging = (matters) => matters.map(m => ({
      ...m,
      agingColor: calculateAgingColor(m.dueDate)
    }));

    // Get recent activity across all matters
    const recentActivity = await prisma.legalMatterActivity.findMany({
      where: {
        matter: { organizationId: authUser.organizationId }
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        matter: {
          select: { id: true, title: true, matterNumber: true }
        }
      }
    });

    console.log(`[legal-dashboard] Dashboard loaded for ${authUser.email}: ${newCount} new, ${inProgressCount} in progress`);

    sendJson(res, 200, {
      counts: {
        NEW: newCount,
        IN_PROGRESS: inProgressCount,
        COMPLETE: completeCount,
        total: newCount + inProgressCount + completeCount
      },
      columns: {
        NEW: addAging(newMatters),
        IN_PROGRESS: addAging(inProgressMatters),
        COMPLETE: addAging(recentComplete)
      },
      urgentMatters: addAging(urgentMatters),
      myMatters: addAging(myMatters),
      recentActivity
    });
  } catch (error) {
    console.error('[legal-dashboard] Dashboard error:', error);
    sendError(res, 500, 'Failed to load dashboard', error.message);
  }
}

/**
 * GET /api/legal/deals/:dealId/legal-context - Legal view of a deal
 */
export async function handleGetDealLegalContext(req, res, dealId) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  // Verify deal access
  const hasAccess = await requireDealAccess(authUser, dealId, res);
  if (!hasAccess) return;

  const prisma = getPrisma();

  try {
    // Get all legal matters linked to this deal
    const matters = await prisma.legalMatter.findMany({
      where: {
        organizationId: authUser.organizationId,
        dealId
      },
      orderBy: [{ stage: 'asc' }, { priority: 'desc' }, { dueDate: 'asc' }],
      include: {
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 5
        }
      }
    });

    // Calculate summary stats
    const summary = {
      total: matters.length,
      byStage: {
        NEW: matters.filter(m => m.stage === 'NEW').length,
        IN_PROGRESS: matters.filter(m => m.stage === 'IN_PROGRESS').length,
        COMPLETE: matters.filter(m => m.stage === 'COMPLETE').length
      },
      byType: {},
      urgentCount: 0,
      overdueCount: 0
    };

    const now = new Date();
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    matters.forEach(m => {
      // Count by type
      summary.byType[m.matterType] = (summary.byType[m.matterType] || 0) + 1;

      // Count urgent/overdue
      if (m.stage !== 'COMPLETE' && m.dueDate) {
        const due = new Date(m.dueDate);
        if (due < now) {
          summary.overdueCount++;
        } else if (due <= threeDaysFromNow) {
          summary.urgentCount++;
        }
      }
    });

    // Add aging colors
    const mattersWithAging = matters.map(m => ({
      ...m,
      agingColor: calculateAgingColor(m.dueDate)
    }));

    console.log(`[legal-dashboard] Deal legal context for ${dealId}: ${matters.length} matters`);

    sendJson(res, 200, {
      dealId,
      matters: mattersWithAging,
      summary
    });
  } catch (error) {
    console.error('[legal-dashboard] Deal legal context error:', error);
    sendError(res, 500, 'Failed to load deal legal context', error.message);
  }
}

/**
 * GET /api/legal/stats - GC oversight stats (General Counsel only)
 */
export async function handleGetStats(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();

  try {
    // Get workload by assignee
    const workloadByAssignee = await prisma.legalMatter.groupBy({
      by: ['assignedTo', 'assignedToName'],
      where: {
        organizationId: authUser.organizationId,
        stage: { not: 'COMPLETE' }
      },
      _count: { id: true }
    });

    // Get matters by type
    const mattersByType = await prisma.legalMatter.groupBy({
      by: ['matterType'],
      where: { organizationId: authUser.organizationId },
      _count: { id: true }
    });

    // Get completion stats (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const completedLast30Days = await prisma.legalMatter.count({
      where: {
        organizationId: authUser.organizationId,
        stage: 'COMPLETE',
        closedAt: { gte: thirtyDaysAgo }
      }
    });

    const createdLast30Days = await prisma.legalMatter.count({
      where: {
        organizationId: authUser.organizationId,
        createdAt: { gte: thirtyDaysAgo }
      }
    });

    // Average time in each stage (for completed matters)
    const avgTimeToComplete = await prisma.$queryRaw`
      SELECT AVG(julianday(closedAt) - julianday(createdAt)) as avgDays
      FROM LegalMatter
      WHERE organizationId = ${authUser.organizationId}
        AND stage = 'COMPLETE'
        AND closedAt IS NOT NULL
        AND createdAt >= ${thirtyDaysAgo.toISOString()}
    `;

    sendJson(res, 200, {
      workload: workloadByAssignee.map(w => ({
        assignedTo: w.assignedTo,
        assignedToName: w.assignedToName,
        count: w._count.id
      })),
      byType: mattersByType.map(t => ({
        type: t.matterType,
        count: t._count.id
      })),
      last30Days: {
        created: createdLast30Days,
        completed: completedLast30Days,
        avgDaysToComplete: avgTimeToComplete[0]?.avgDays || null
      }
    });
  } catch (error) {
    console.error('[legal-dashboard] Stats error:', error);
    sendError(res, 500, 'Failed to load stats', error.message);
  }
}
