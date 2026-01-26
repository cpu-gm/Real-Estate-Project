/**
 * Brokerage Routes - Manage brokerage firms and broker membership
 *
 * Routes:
 *   POST   /api/brokerages                    - Create brokerage organization
 *   GET    /api/brokerages                    - List brokerages (for joining)
 *   GET    /api/brokerages/:id                - Get brokerage details
 *   GET    /api/brokerages/:id/brokers        - List brokers in firm
 *   GET    /api/brokerages/:id/listings       - All listings by firm brokers
 *   POST   /api/brokerages/:id/invite         - Invite broker to join firm
 *   POST   /api/brokerages/:id/join           - Request to join firm
 *   POST   /api/brokerages/:id/approve/:userId - Approve broker join request
 */

import { getPrisma } from "../db.js";
import { isBrokerRole } from "../../src/lib/permissions.js";
import { createValidationLogger } from "../services/validation-logger.js";
import { CreateBrokerageSchema, InviteBrokerSchema } from "../middleware/route-schemas.js";

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

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * POST /api/brokerages
 * Create a new brokerage organization
 */
async function handleCreateBrokerage(req, res, readJsonBody, authUser) {
  // Only brokers or admins can create brokerage firms
  if (!isBrokerRole(authUser.role) && authUser.role !== 'Admin') {
    return sendError(res, 403, "Only brokers can create brokerage firms");
  }

  const body = await readJsonBody(req);

  // ========== VALIDATION ==========
  const validationLog = createValidationLogger('handleCreateBrokerage');
  validationLog.beforeValidation(body);

  const parsed = CreateBrokerageSchema.safeParse(body);
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

  const { name, domain } = parsed.data;

  const prisma = getPrisma();
  const slug = slugify(name.trim());

  // Check if slug already exists
  const existing = await prisma.organization.findUnique({
    where: { slug }
  });

  if (existing) {
    return sendError(res, 409, "A brokerage with this name already exists");
  }

  // Create brokerage organization
  const brokerage = await prisma.organization.create({
    data: {
      name: name.trim(),
      slug,
      type: "BROKERAGE",
      domain: domain?.trim() || null,
      status: "ACTIVE"
    }
  });

  // If current user is a broker without a brokerage, assign them to this one
  // and make them Brokerage Admin
  if (isBrokerRole(authUser.role) && !authUser.brokerageId) {
    await prisma.authUser.update({
      where: { id: authUser.id },
      data: {
        brokerageId: brokerage.id,
        role: "Brokerage Admin"
      }
    });
  }

  return sendJson(res, 201, {
    brokerage: {
      id: brokerage.id,
      name: brokerage.name,
      slug: brokerage.slug,
      type: brokerage.type,
      domain: brokerage.domain
    }
  });
}

/**
 * GET /api/brokerages
 * List all brokerages (for joining)
 */
async function handleListBrokerages(req, res, authUser) {
  const prisma = getPrisma();

  const brokerages = await prisma.organization.findMany({
    where: {
      type: "BROKERAGE",
      status: "ACTIVE"
    },
    select: {
      id: true,
      name: true,
      slug: true,
      domain: true,
      _count: {
        select: {
          brokerUsers: true
        }
      }
    },
    orderBy: { name: "asc" }
  });

  return sendJson(res, 200, {
    brokerages: brokerages.map(b => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      domain: b.domain,
      brokerCount: b._count.brokerUsers
    }))
  });
}

/**
 * GET /api/brokerages/:id
 * Get brokerage details
 */
async function handleGetBrokerage(req, res, brokerageId, authUser) {
  const prisma = getPrisma();

  const brokerage = await prisma.organization.findUnique({
    where: { id: brokerageId },
    include: {
      brokerUsers: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          brokerLicenseNo: true,
          brokerLicenseState: true,
          status: true
        }
      }
    }
  });

  if (!brokerage) {
    return sendError(res, 404, "Brokerage not found");
  }

  if (brokerage.type !== "BROKERAGE") {
    return sendError(res, 400, "Organization is not a brokerage");
  }

  // Only show broker details if user is in the brokerage or is admin
  const isInBrokerage = authUser.brokerageId === brokerageId;
  const isAdmin = authUser.role === 'Admin' || authUser.role === 'Brokerage Admin';

  return sendJson(res, 200, {
    brokerage: {
      id: brokerage.id,
      name: brokerage.name,
      slug: brokerage.slug,
      domain: brokerage.domain,
      brokerCount: brokerage.brokerUsers.length,
      // Only include broker list if authorized
      brokers: (isInBrokerage || isAdmin) ? brokerage.brokerUsers : undefined
    }
  });
}

/**
 * GET /api/brokerages/:id/brokers
 * List brokers in a brokerage firm
 */
async function handleGetBrokers(req, res, brokerageId, authUser) {
  const prisma = getPrisma();

  // Check if user has access to view broker list
  const isInBrokerage = authUser.brokerageId === brokerageId;
  const isBrokerageAdmin = authUser.role === 'Brokerage Admin' && isInBrokerage;
  const isAdmin = authUser.role === 'Admin';

  if (!isInBrokerage && !isAdmin) {
    return sendError(res, 403, "You don't have access to view this brokerage's brokers");
  }

  const brokers = await prisma.authUser.findMany({
    where: {
      brokerageId,
      role: { in: ['Broker', 'Brokerage Admin'] }
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      brokerLicenseNo: true,
      brokerLicenseState: true,
      status: true,
      createdAt: true
    },
    orderBy: { name: "asc" }
  });

  return sendJson(res, 200, { brokers });
}

/**
 * GET /api/brokerages/:id/listings
 * Get all listings by brokers in this firm
 */
async function handleGetBrokerageListings(req, res, brokerageId, authUser) {
  const prisma = getPrisma();

  // Check if user has access
  const isInBrokerage = authUser.brokerageId === brokerageId;
  const isBrokerageAdmin = authUser.role === 'Brokerage Admin' && isInBrokerage;
  const isAdmin = authUser.role === 'Admin';

  if (!isBrokerageAdmin && !isAdmin) {
    return sendError(res, 403, "Only brokerage admins can view all firm listings");
  }

  // Get all broker IDs in this brokerage
  const brokerIds = await prisma.authUser.findMany({
    where: { brokerageId },
    select: { id: true }
  });

  const brokerIdList = brokerIds.map(b => b.id);

  // Get all deal drafts where any of these brokers is assigned
  const listings = await prisma.dealDraft.findMany({
    where: {
      brokers: {
        some: {
          userId: { in: brokerIdList }
        }
      }
    },
    include: {
      brokers: {
        select: {
          userId: true,
          name: true,
          email: true,
          role: true
        }
      },
      seller: {
        select: {
          entityName: true
        }
      },
      _count: {
        select: {
          distributions: true
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  return sendJson(res, 200, {
    listings: listings.map(l => ({
      id: l.id,
      propertyName: l.propertyName,
      propertyAddress: l.propertyAddress,
      assetType: l.assetType,
      askingPrice: l.askingPrice,
      status: l.status,
      listingType: l.listingType,
      brokers: l.brokers,
      sellerName: l.seller?.entityName,
      distributionCount: l._count.distributions,
      createdAt: l.createdAt
    }))
  });
}

/**
 * POST /api/brokerages/:id/invite
 * Invite a broker to join the firm (by email)
 */
async function handleInviteBroker(req, res, brokerageId, readJsonBody, authUser) {
  // Only brokerage admins can invite
  if (authUser.role !== 'Brokerage Admin' || authUser.brokerageId !== brokerageId) {
    return sendError(res, 403, "Only brokerage admins can invite brokers");
  }

  const body = await readJsonBody(req);

  // ========== VALIDATION ==========
  const validationLog = createValidationLogger('handleInviteBroker');
  validationLog.beforeValidation(body);

  const parsed = InviteBrokerSchema.safeParse(body);
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

  const { email, name } = parsed.data;

  const prisma = getPrisma();

  // Check if user with this email exists and is a broker
  const existingUser = await prisma.authUser.findFirst({
    where: { email: email.toLowerCase() }
  });

  if (existingUser) {
    if (!isBrokerRole(existingUser.role)) {
      return sendError(res, 400, "This user is not a broker");
    }
    if (existingUser.brokerageId === brokerageId) {
      return sendError(res, 400, "This broker is already in your firm");
    }
    if (existingUser.brokerageId) {
      return sendError(res, 400, "This broker already belongs to another firm");
    }

    // Directly add existing broker to firm
    await prisma.authUser.update({
      where: { id: existingUser.id },
      data: { brokerageId }
    });

    return sendJson(res, 200, {
      message: "Broker added to firm",
      broker: {
        id: existingUser.id,
        name: existingUser.name,
        email: existingUser.email
      }
    });
  }

  // Create invitation for new user
  const token = crypto.randomUUID();
  const invitation = await prisma.brokerInvitation.create({
    data: {
      organizationId: authUser.organizationId,
      invitedBy: authUser.id,
      invitedByName: authUser.name,
      invitedByEmail: authUser.email,
      brokerEmail: email.toLowerCase(),
      brokerName: name || null,
      brokerFirmName: (await prisma.organization.findUnique({ where: { id: brokerageId } }))?.name,
      token,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    }
  });

  // TODO: Send invitation email via SendGrid

  return sendJson(res, 201, {
    message: "Invitation sent",
    invitation: {
      id: invitation.id,
      email: invitation.brokerEmail,
      expiresAt: invitation.expiresAt
    }
  });
}

/**
 * POST /api/brokerages/:id/join
 * Request to join a brokerage firm
 */
async function handleJoinBrokerage(req, res, brokerageId, authUser) {
  // Only brokers can join
  if (!isBrokerRole(authUser.role)) {
    return sendError(res, 403, "Only brokers can join brokerage firms");
  }

  if (authUser.brokerageId) {
    return sendError(res, 400, "You already belong to a brokerage firm");
  }

  const prisma = getPrisma();

  const brokerage = await prisma.organization.findUnique({
    where: { id: brokerageId }
  });

  if (!brokerage || brokerage.type !== "BROKERAGE") {
    return sendError(res, 404, "Brokerage not found");
  }

  // For now, directly add broker to firm
  // In future, could require admin approval
  await prisma.authUser.update({
    where: { id: authUser.id },
    data: { brokerageId }
  });

  return sendJson(res, 200, {
    message: "Successfully joined brokerage",
    brokerage: {
      id: brokerage.id,
      name: brokerage.name
    }
  });
}

/**
 * Route dispatcher for /api/brokerages/*
 */
export function dispatchBrokerageRoutes(req, res, segments, readJsonBody, authUser) {
  const method = req.method;
  // segments: ['api', 'brokerages', ...]

  // POST /api/brokerages - Create brokerage
  if (segments.length === 2 && method === "POST") {
    return handleCreateBrokerage(req, res, readJsonBody, authUser);
  }

  // GET /api/brokerages - List brokerages
  if (segments.length === 2 && method === "GET") {
    return handleListBrokerages(req, res, authUser);
  }

  // GET /api/brokerages/:id
  if (segments.length === 3 && method === "GET") {
    const brokerageId = segments[2];
    return handleGetBrokerage(req, res, brokerageId, authUser);
  }

  // GET /api/brokerages/:id/brokers
  if (segments.length === 4 && segments[3] === "brokers" && method === "GET") {
    const brokerageId = segments[2];
    return handleGetBrokers(req, res, brokerageId, authUser);
  }

  // GET /api/brokerages/:id/listings
  if (segments.length === 4 && segments[3] === "listings" && method === "GET") {
    const brokerageId = segments[2];
    return handleGetBrokerageListings(req, res, brokerageId, authUser);
  }

  // POST /api/brokerages/:id/invite
  if (segments.length === 4 && segments[3] === "invite" && method === "POST") {
    const brokerageId = segments[2];
    return handleInviteBroker(req, res, brokerageId, readJsonBody, authUser);
  }

  // POST /api/brokerages/:id/join
  if (segments.length === 4 && segments[3] === "join" && method === "POST") {
    const brokerageId = segments[2];
    return handleJoinBrokerage(req, res, brokerageId, authUser);
  }

  return sendError(res, 404, "Brokerage route not found");
}
