/**
 * User routes - organization user management
 * Used by UserPicker component for bulk operations
 */

import { getPrisma } from '../db.js';
import { requireGP } from '../middleware/auth.js';

// Consistent CORS headers (must match server/index.js)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-User-Id, X-Canonical-User-Id, X-Actor-Role, X-Idempotency-Key",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS"
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders
  });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message, details = null) {
  sendJson(res, status, { message, details });
}

/**
 * GET /api/users
 * Get all users in the current user's organization
 * Accessible by GP and Admin users
 * Query params:
 *   - search: filter by name or email
 *   - role: filter by role
 */
export async function handleGetUsers(req, res) {
  const authUser = await requireGP(req, res);
  if (!authUser) return;

  try {
    const prisma = getPrisma();
    const url = new URL(req.url, `http://${req.headers.host}`);
    const search = url.searchParams.get('search')?.toLowerCase() || '';
    const roleFilter = url.searchParams.get('role') || '';

    const users = await prisma.authUser.findMany({
      where: {
        organizationId: authUser.organizationId,
        status: 'verified', // Only show verified users for assignment
        ...(roleFilter && { role: roleFilter }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
      orderBy: { name: 'asc' }
    });

    // Client-side filter for search (Prisma SQLite doesn't support case-insensitive contains well)
    const filtered = search
      ? users.filter(u =>
          u.name?.toLowerCase().includes(search) ||
          u.email?.toLowerCase().includes(search)
        )
      : users;

    return sendJson(res, 200, { users: filtered });
  } catch (error) {
    console.error("[Users] Get users error:", error);
    return sendError(res, 500, "Failed to get users");
  }
}

/**
 * GET /api/users/recent
 * Get recently assigned users for the current user
 * Used by UserPicker to show recent selections
 */
export async function handleGetRecentUsers(req, res) {
  const authUser = await requireGP(req, res);
  if (!authUser) return;

  try {
    const prisma = getPrisma();

    // Get recent assignments made by this user
    const recentAssignments = await prisma.permissionAuditLog.findMany({
      where: {
        actorId: authUser.id,
        action: { in: ['assign', 'bulk_assign'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        afterValue: true,
      }
    });

    // Extract unique user IDs from recent assignments
    const recentUserIds = [...new Set(
      recentAssignments
        .map(a => {
          try {
            const parsed = JSON.parse(a.afterValue);
            return parsed.userId || parsed.assignedTo;
          } catch {
            return null;
          }
        })
        .filter(Boolean)
    )].slice(0, 5);

    if (recentUserIds.length === 0) {
      return sendJson(res, 200, { users: [] });
    }

    const recentUsers = await prisma.authUser.findMany({
      where: {
        id: { in: recentUserIds },
        organizationId: authUser.organizationId,
        status: 'verified',
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      }
    });

    // Sort by the order they appeared in recent assignments
    const sorted = recentUserIds
      .map(id => recentUsers.find(u => u.id === id))
      .filter(Boolean);

    return sendJson(res, 200, { users: sorted });
  } catch (error) {
    console.error("[Users] Get recent users error:", error);
    return sendJson(res, 200, { users: [] }); // Fail gracefully
  }
}
