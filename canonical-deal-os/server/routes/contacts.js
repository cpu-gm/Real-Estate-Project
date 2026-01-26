/**
 * Contact Management API Routes
 *
 * Provides CRUD operations for the unified contact/vendor database.
 * All contacts are org-isolated for multi-tenant security.
 */

import { requireGP, requireAuth } from '../middleware/auth.js';
import { logPermissionAction } from '../middleware/auth.js';
import { createValidationLogger } from '../services/validation-logger.js';
import {
  CreateContactSchema,
  UpdateContactSchema,
  AddCredentialSchema,
  UpdateCredentialSchema,
  LogActivitySchema,
  AddRatingSchema,
  AssignContactToDealSchema,
  UpdateDealContactSchema
} from '../middleware/route-schemas.js';

// ============================================================================
// Helpers
// ============================================================================

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message, details = null) {
  sendJson(res, status, { error: message, details });
}

// Get Prisma client
function getPrisma() {
  return global.__bffPrisma;
}

// ============================================================================
// Contact Types
// ============================================================================

export const CONTACT_TYPES = [
  'BROKER',
  'LENDER',
  'ATTORNEY',
  'TITLE_COMPANY',
  'APPRAISER',
  'INSPECTOR',
  'ENVIRONMENTAL',
  'PROPERTY_MANAGER',
  'ESCROW_AGENT',
  'INSURANCE_AGENT',
  'TAX_ADVISOR',
  'CONTRACTOR',
  'INVESTOR',
  'OTHER'
];

export const CONTACT_STATUSES = ['ACTIVE', 'INACTIVE', 'ARCHIVED'];
export const CREDENTIAL_TYPES = ['LICENSE', 'CERTIFICATION', 'INSURANCE', 'BOND'];
export const CREDENTIAL_STATUSES = ['ACTIVE', 'EXPIRED', 'EXPIRING_SOON', 'PENDING'];
export const DEAL_CONTACT_STATUSES = ['ACTIVE', 'COMPLETED', 'CANCELLED'];
export const FEE_TYPES = ['FLAT', 'PERCENTAGE', 'HOURLY'];
export const ACTIVITY_TYPES = [
  'EMAIL_SENT', 'EMAIL_RECEIVED', 'CALL', 'MEETING',
  'NOTE', 'DOCUMENT_SHARED', 'PORTAL_ACCESS', 'DEAL_ASSIGNED'
];

// ============================================================================
// LIST CONTACTS
// ============================================================================
// GET /api/contacts
// Query params: type, status, search, page, pageSize, recent, favorites

export async function handleListContacts(req, res, authUser, query) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  const prisma = getPrisma();
  const {
    type,
    status = 'ACTIVE',
    search,
    page = '1',
    pageSize = '50',
    recent,
    favorites
  } = query;

  try {
    const where = {
      organizationId: authUser.organizationId
    };

    // Filter by type
    if (type && CONTACT_TYPES.includes(type)) {
      where.contactType = type;
    }

    // Filter by status
    if (status && status !== 'ALL') {
      where.status = status;
    }

    // Search by name, email, or company
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { companyName: { contains: search } }
      ];
    }

    // Get user's favorites if requested
    let favoriteContactIds = [];
    if (favorites === 'true') {
      const userFavorites = await prisma.userContactFavorite.findMany({
        where: { userId: authUser.id },
        select: { contactId: true }
      });
      favoriteContactIds = userFavorites.map(f => f.contactId);
      where.id = { in: favoriteContactIds };
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    const take = parseInt(pageSize);

    // Order by recent usage or name
    const orderBy = recent === 'true'
      ? { lastUsedAt: 'desc' }
      : { name: 'asc' };

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          credentials: {
            where: { status: 'ACTIVE' },
            take: 3
          },
          _count: {
            select: {
              dealAssignments: true,
              ratings: true
            }
          }
        }
      }),
      prisma.contact.count({ where })
    ]);

    // Get user's favorites for all returned contacts
    const userFavoritesAll = await prisma.userContactFavorite.findMany({
      where: {
        userId: authUser.id,
        contactId: { in: contacts.map(c => c.id) }
      },
      select: { contactId: true }
    });
    const favoriteSet = new Set(userFavoritesAll.map(f => f.contactId));

    // Add isFavorite flag to each contact
    const contactsWithFavorites = contacts.map(c => ({
      ...c,
      isFavorite: favoriteSet.has(c.id)
    }));

    return sendJson(res, 200, {
      items: contactsWithFavorites,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      totalPages: Math.ceil(total / parseInt(pageSize))
    });
  } catch (error) {
    console.error('[Contacts] List error:', error);
    return sendError(res, 500, error.message);
  }
}

// ============================================================================
// SEARCH CONTACTS (Quick search for picker)
// ============================================================================
// GET /api/contacts/search
// Query params: q, type, limit

export async function handleSearchContacts(req, res, authUser, query) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  const prisma = getPrisma();
  const { q, type, limit = '10' } = query;

  if (!q || q.length < 2) {
    return sendJson(res, 200, { items: [] });
  }

  try {
    const where = {
      organizationId: authUser.organizationId,
      status: 'ACTIVE',
      OR: [
        { name: { contains: q } },
        { email: { contains: q } },
        { companyName: { contains: q } }
      ]
    };

    if (type && CONTACT_TYPES.includes(type)) {
      where.contactType = type;
    }

    const contacts = await prisma.contact.findMany({
      where,
      take: parseInt(limit),
      orderBy: [
        { isOrgPreferred: 'desc' },
        { lastUsedAt: 'desc' },
        { name: 'asc' }
      ],
      select: {
        id: true,
        name: true,
        email: true,
        companyName: true,
        contactType: true,
        avgRating: true,
        dealCount: true,
        isOrgPreferred: true
      }
    });

    return sendJson(res, 200, { items: contacts });
  } catch (error) {
    console.error('[Contacts] Search error:', error);
    return sendError(res, 500, error.message);
  }
}

// ============================================================================
// GET RECENT CONTACTS
// ============================================================================
// GET /api/contacts/recent
// Query params: type, limit

export async function handleGetRecentContacts(req, res, authUser, query) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  const prisma = getPrisma();
  const { type, limit = '5' } = query;

  try {
    const where = {
      organizationId: authUser.organizationId,
      status: 'ACTIVE',
      lastUsedAt: { not: null }
    };

    if (type && CONTACT_TYPES.includes(type)) {
      where.contactType = type;
    }

    const contacts = await prisma.contact.findMany({
      where,
      take: parseInt(limit),
      orderBy: { lastUsedAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        companyName: true,
        contactType: true,
        avgRating: true,
        dealCount: true,
        isOrgPreferred: true,
        lastUsedAt: true
      }
    });

    return sendJson(res, 200, { items: contacts });
  } catch (error) {
    console.error('[Contacts] Recent error:', error);
    return sendError(res, 500, error.message);
  }
}

// ============================================================================
// GET EXPIRING CREDENTIALS
// ============================================================================
// GET /api/contacts/expiring-credentials
// Query params: days (default 30)

export async function handleGetExpiringCredentials(req, res, authUser, query) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  const prisma = getPrisma();
  const days = parseInt(query.days || '30');
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);

  try {
    const credentials = await prisma.contactCredential.findMany({
      where: {
        contact: {
          organizationId: authUser.organizationId,
          status: 'ACTIVE'
        },
        expirationDate: {
          lte: futureDate,
          gte: new Date()
        },
        status: { in: ['ACTIVE', 'EXPIRING_SOON'] }
      },
      include: {
        contact: {
          select: {
            id: true,
            name: true,
            companyName: true,
            contactType: true
          }
        }
      },
      orderBy: { expirationDate: 'asc' }
    });

    // Group by urgency
    const now = new Date();
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const urgent = credentials.filter(c => new Date(c.expirationDate) <= sevenDaysFromNow);
    const warning = credentials.filter(c => new Date(c.expirationDate) > sevenDaysFromNow);

    return sendJson(res, 200, {
      urgent,
      warning,
      total: credentials.length
    });
  } catch (error) {
    console.error('[Contacts] Expiring credentials error:', error);
    return sendError(res, 500, error.message);
  }
}

// ============================================================================
// CREATE CONTACT
// ============================================================================
// POST /api/contacts

export async function handleCreateContact(req, res, readJsonBody, authUser) {
  // Only GP/Admin can create contacts
  if (!authUser || !['GP', 'GP Analyst', 'Admin', 'Broker'].includes(authUser.role)) {
    return sendError(res, 403, 'Only GP, Analyst, Broker, or Admin can create contacts');
  }

  const prisma = getPrisma();
  const body = await readJsonBody(req);

  // ========== VALIDATION ==========
  const validationLog = createValidationLogger('handleCreateContact');
  validationLog.beforeValidation(body);

  const parsed = CreateContactSchema.safeParse(body);
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

  const validatedData = parsed.data;

  try {
    // Check for duplicate by email if email provided
    if (validatedData.email) {
      const existing = await prisma.contact.findFirst({
        where: {
          organizationId: authUser.organizationId,
          email: validatedData.email,
          status: { not: 'ARCHIVED' }
        }
      });

      if (existing) {
        return sendJson(res, 200, {
          duplicate: true,
          existingContact: existing,
          message: `A contact with email ${validatedData.email} already exists`
        });
      }
    }

    const contact = await prisma.contact.create({
      data: {
        organizationId: authUser.organizationId,
        contactType: validatedData.contactType,
        isPerson: validatedData.isPerson !== false,
        name: validatedData.name,
        companyName: validatedData.companyName || null,
        title: validatedData.title || null,
        email: validatedData.email || null,
        phone: validatedData.phone || null,
        phoneAlt: validatedData.phoneAlt || null,
        address: validatedData.address ? JSON.stringify(validatedData.address) : null,
        website: validatedData.website || null,
        notes: validatedData.notes || null,
        tags: validatedData.tags ? JSON.stringify(validatedData.tags) : null,
        preferredMethod: validatedData.preferredMethod || null,
        typeFields: body.typeFields ? JSON.stringify(body.typeFields) : null,
        isOrgPreferred: validatedData.isOrgPreferred || false,
        createdBy: authUser.id,
        createdByName: authUser.name
      }
    });

    // Log the action
    await logPermissionAction({
      actorId: authUser.id,
      actorName: authUser.name,
      action: 'CONTACT_CREATED',
      targetType: 'Contact',
      targetId: contact.id,
      afterValue: { name: contact.name, type: contact.contactType }
    });

    console.log('[Contacts] Created:', { id: contact.id, name: contact.name, type: contact.contactType });

    return sendJson(res, 201, contact);
  } catch (error) {
    console.error('[Contacts] Create error:', error);
    return sendError(res, 500, error.message);
  }
}

// ============================================================================
// GET CONTACT BY ID
// ============================================================================
// GET /api/contacts/:id

export async function handleGetContact(req, res, contactId, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  const prisma = getPrisma();

  try {
    const contact = await prisma.contact.findFirst({
      where: {
        id: contactId,
        organizationId: authUser.organizationId
      },
      include: {
        credentials: {
          orderBy: { expirationDate: 'asc' }
        },
        dealAssignments: {
          take: 10,
          orderBy: { assignedAt: 'desc' },
          include: {
            contact: false
          }
        },
        ratings: {
          take: 5,
          orderBy: { ratedAt: 'desc' }
        },
        _count: {
          select: {
            dealAssignments: true,
            communications: true,
            ratings: true
          }
        }
      }
    });

    if (!contact) {
      return sendError(res, 404, 'Contact not found');
    }

    // Check if user has favorited
    const favorite = await prisma.userContactFavorite.findUnique({
      where: {
        userId_contactId: {
          userId: authUser.id,
          contactId
        }
      }
    });

    return sendJson(res, 200, {
      ...contact,
      isFavorite: !!favorite
    });
  } catch (error) {
    console.error('[Contacts] Get error:', error);
    return sendError(res, 500, error.message);
  }
}

// ============================================================================
// UPDATE CONTACT
// ============================================================================
// PATCH /api/contacts/:id

export async function handleUpdateContact(req, res, contactId, readJsonBody, authUser) {
  if (!authUser || !['GP', 'GP Analyst', 'Admin', 'Broker'].includes(authUser.role)) {
    return sendError(res, 403, 'Only GP, Analyst, Broker, or Admin can update contacts');
  }

  const prisma = getPrisma();
  const body = await readJsonBody(req);

  // ========== VALIDATION ==========
  const validationLog = createValidationLogger('handleUpdateContact');
  validationLog.beforeValidation(body);

  const parsed = UpdateContactSchema.safeParse(body);
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

  try {
    // Verify contact exists and belongs to org
    const existing = await prisma.contact.findFirst({
      where: {
        id: contactId,
        organizationId: authUser.organizationId
      }
    });

    if (!existing) {
      return sendError(res, 404, 'Contact not found');
    }

    // Brokers can only edit contacts they created
    if (authUser.role === 'Broker' && existing.createdBy !== authUser.id) {
      return sendError(res, 403, 'Brokers can only edit contacts they created');
    }

    // Build update data
    const updateData = {};
    const allowedFields = [
      'name', 'companyName', 'title', 'email', 'phone', 'phoneAlt',
      'website', 'notes', 'preferredMethod', 'isPerson', 'status'
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // Handle JSON fields
    if (body.address !== undefined) {
      updateData.address = body.address ? JSON.stringify(body.address) : null;
    }
    if (body.tags !== undefined) {
      updateData.tags = body.tags ? JSON.stringify(body.tags) : null;
    }
    if (body.typeFields !== undefined) {
      updateData.typeFields = body.typeFields ? JSON.stringify(body.typeFields) : null;
    }

    // Only GP/Admin can set org preferred
    if (body.isOrgPreferred !== undefined && ['GP', 'Admin'].includes(authUser.role)) {
      updateData.isOrgPreferred = body.isOrgPreferred;
    }

    updateData.updatedAt = new Date();

    const contact = await prisma.contact.update({
      where: { id: contactId },
      data: updateData
    });

    console.log('[Contacts] Updated:', { id: contactId, fields: Object.keys(updateData) });

    return sendJson(res, 200, contact);
  } catch (error) {
    console.error('[Contacts] Update error:', error);
    return sendError(res, 500, error.message);
  }
}

// ============================================================================
// DELETE (ARCHIVE) CONTACT
// ============================================================================
// DELETE /api/contacts/:id

export async function handleDeleteContact(req, res, contactId, authUser) {
  if (!authUser || !['GP', 'Admin'].includes(authUser.role)) {
    return sendError(res, 403, 'Only GP or Admin can archive contacts');
  }

  const prisma = getPrisma();

  try {
    const existing = await prisma.contact.findFirst({
      where: {
        id: contactId,
        organizationId: authUser.organizationId
      }
    });

    if (!existing) {
      return sendError(res, 404, 'Contact not found');
    }

    // Soft delete (archive)
    await prisma.contact.update({
      where: { id: contactId },
      data: {
        status: 'ARCHIVED',
        updatedAt: new Date()
      }
    });

    await logPermissionAction({
      actorId: authUser.id,
      actorName: authUser.name,
      action: 'CONTACT_ARCHIVED',
      targetType: 'Contact',
      targetId: contactId,
      beforeValue: { status: existing.status },
      afterValue: { status: 'ARCHIVED' }
    });

    console.log('[Contacts] Archived:', { id: contactId });

    return sendJson(res, 200, { success: true, message: 'Contact archived' });
  } catch (error) {
    console.error('[Contacts] Delete error:', error);
    return sendError(res, 500, error.message);
  }
}

// ============================================================================
// TOGGLE FAVORITE
// ============================================================================
// POST /api/contacts/:id/favorite

export async function handleToggleFavorite(req, res, contactId, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  const prisma = getPrisma();

  try {
    // Verify contact exists in org
    const contact = await prisma.contact.findFirst({
      where: {
        id: contactId,
        organizationId: authUser.organizationId
      }
    });

    if (!contact) {
      return sendError(res, 404, 'Contact not found');
    }

    // Check if already favorited
    const existing = await prisma.userContactFavorite.findUnique({
      where: {
        userId_contactId: {
          userId: authUser.id,
          contactId
        }
      }
    });

    if (existing) {
      // Remove favorite
      await prisma.userContactFavorite.delete({
        where: { id: existing.id }
      });
      return sendJson(res, 200, { isFavorite: false });
    } else {
      // Add favorite
      await prisma.userContactFavorite.create({
        data: {
          userId: authUser.id,
          contactId
        }
      });
      return sendJson(res, 200, { isFavorite: true });
    }
  } catch (error) {
    console.error('[Contacts] Toggle favorite error:', error);
    return sendError(res, 500, error.message);
  }
}

// ============================================================================
// CREDENTIALS - ADD
// ============================================================================
// POST /api/contacts/:id/credentials

export async function handleAddCredential(req, res, contactId, readJsonBody, authUser) {
  if (!authUser || !['GP', 'GP Analyst', 'Admin', 'Broker'].includes(authUser.role)) {
    return sendError(res, 403, 'Insufficient permissions');
  }

  const prisma = getPrisma();
  const body = await readJsonBody(req);

  // ========== VALIDATION ==========
  const validationLog = createValidationLogger('handleAddCredential');
  validationLog.beforeValidation(body);

  const parsed = AddCredentialSchema.safeParse(body);
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

  try {
    // Verify contact exists in org
    const contact = await prisma.contact.findFirst({
      where: {
        id: contactId,
        organizationId: authUser.organizationId
      }
    });

    if (!contact) {
      return sendError(res, 404, 'Contact not found');
    }

    const validatedData = parsed.data;
    const credential = await prisma.contactCredential.create({
      data: {
        contactId,
        credentialType: validatedData.credentialType,
        credentialName: validatedData.credentialName,
        issuingAuthority: validatedData.issuingAuthority || null,
        credentialNumber: validatedData.credentialNumber || null,
        state: validatedData.state || null,
        jurisdiction: validatedData.jurisdiction || null,
        issuedDate: validatedData.issuedDate ? new Date(validatedData.issuedDate) : null,
        expirationDate: validatedData.expirationDate ? new Date(validatedData.expirationDate) : null,
        documentId: validatedData.documentId || null
      }
    });

    console.log('[Contacts] Credential added:', { contactId, credentialId: credential.id });

    return sendJson(res, 201, credential);
  } catch (error) {
    console.error('[Contacts] Add credential error:', error);
    return sendError(res, 500, error.message);
  }
}

// ============================================================================
// CREDENTIALS - UPDATE
// ============================================================================
// PATCH /api/contacts/:id/credentials/:credentialId

export async function handleUpdateCredential(req, res, contactId, credentialId, readJsonBody, authUser) {
  if (!authUser || !['GP', 'GP Analyst', 'Admin', 'Broker'].includes(authUser.role)) {
    return sendError(res, 403, 'Insufficient permissions');
  }

  const prisma = getPrisma();
  const body = await readJsonBody(req);

  // ========== VALIDATION ==========
  const validationLog = createValidationLogger('handleUpdateCredential');
  validationLog.beforeValidation(body);

  const parsed = UpdateCredentialSchema.safeParse(body);
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

  try {
    // Verify credential belongs to contact in org
    const credential = await prisma.contactCredential.findFirst({
      where: {
        id: credentialId,
        contactId,
        contact: {
          organizationId: authUser.organizationId
        }
      }
    });

    if (!credential) {
      return sendError(res, 404, 'Credential not found');
    }

    const updateData = {};
    const allowedFields = [
      'credentialName', 'issuingAuthority', 'credentialNumber',
      'state', 'jurisdiction', 'status', 'documentId'
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    if (body.issuedDate !== undefined) {
      updateData.issuedDate = body.issuedDate ? new Date(body.issuedDate) : null;
    }
    if (body.expirationDate !== undefined) {
      updateData.expirationDate = body.expirationDate ? new Date(body.expirationDate) : null;
    }

    // Handle verification
    if (body.verified && !credential.verifiedAt) {
      updateData.verifiedAt = new Date();
      updateData.verifiedBy = authUser.id;
    }

    updateData.updatedAt = new Date();

    const updated = await prisma.contactCredential.update({
      where: { id: credentialId },
      data: updateData
    });

    return sendJson(res, 200, updated);
  } catch (error) {
    console.error('[Contacts] Update credential error:', error);
    return sendError(res, 500, error.message);
  }
}

// ============================================================================
// CREDENTIALS - DELETE
// ============================================================================
// DELETE /api/contacts/:id/credentials/:credentialId

export async function handleDeleteCredential(req, res, contactId, credentialId, authUser) {
  if (!authUser || !['GP', 'GP Analyst', 'Admin'].includes(authUser.role)) {
    return sendError(res, 403, 'Insufficient permissions');
  }

  const prisma = getPrisma();

  try {
    const credential = await prisma.contactCredential.findFirst({
      where: {
        id: credentialId,
        contactId,
        contact: {
          organizationId: authUser.organizationId
        }
      }
    });

    if (!credential) {
      return sendError(res, 404, 'Credential not found');
    }

    await prisma.contactCredential.delete({
      where: { id: credentialId }
    });

    return sendJson(res, 200, { success: true });
  } catch (error) {
    console.error('[Contacts] Delete credential error:', error);
    return sendError(res, 500, error.message);
  }
}

// ============================================================================
// ACTIVITY - GET
// ============================================================================
// GET /api/contacts/:id/activity

export async function handleGetActivity(req, res, contactId, authUser, query) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  const prisma = getPrisma();
  const { page = '1', pageSize = '20' } = query;

  try {
    // Verify contact exists in org
    const contact = await prisma.contact.findFirst({
      where: {
        id: contactId,
        organizationId: authUser.organizationId
      }
    });

    if (!contact) {
      return sendError(res, 404, 'Contact not found');
    }

    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    const take = parseInt(pageSize);

    const [activities, total] = await Promise.all([
      prisma.contactCommunication.findMany({
        where: { contactId },
        skip,
        take,
        orderBy: { occurredAt: 'desc' }
      }),
      prisma.contactCommunication.count({ where: { contactId } })
    ]);

    return sendJson(res, 200, {
      items: activities,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    });
  } catch (error) {
    console.error('[Contacts] Get activity error:', error);
    return sendError(res, 500, error.message);
  }
}

// ============================================================================
// ACTIVITY - LOG
// ============================================================================
// POST /api/contacts/:id/activity

export async function handleLogActivity(req, res, contactId, readJsonBody, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  const prisma = getPrisma();
  const body = await readJsonBody(req);

  // ========== VALIDATION ==========
  const validationLog = createValidationLogger('handleLogActivity');
  validationLog.beforeValidation(body);

  const parsed = LogActivitySchema.safeParse(body);
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

  try {
    // Verify contact exists in org
    const contact = await prisma.contact.findFirst({
      where: {
        id: contactId,
        organizationId: authUser.organizationId
      }
    });

    if (!contact) {
      return sendError(res, 404, 'Contact not found');
    }

    const validatedData = parsed.data;
    const activity = await prisma.contactCommunication.create({
      data: {
        contactId,
        dealId: validatedData.dealId || null,
        activityType: validatedData.activityType,
        direction: validatedData.direction || null,
        subject: validatedData.subject || null,
        summary: validatedData.summary,
        occurredAt: validatedData.occurredAt ? new Date(validatedData.occurredAt) : new Date(),
        recordedBy: authUser.id,
        recordedByName: authUser.name,
        attachmentIds: validatedData.attachmentIds ? JSON.stringify(validatedData.attachmentIds) : null,
        isAutoLogged: false
      }
    });

    // Update contact lastUsedAt
    await prisma.contact.update({
      where: { id: contactId },
      data: { lastUsedAt: new Date() }
    });

    return sendJson(res, 201, activity);
  } catch (error) {
    console.error('[Contacts] Log activity error:', error);
    return sendError(res, 500, error.message);
  }
}

// ============================================================================
// RATINGS - GET
// ============================================================================
// GET /api/contacts/:id/ratings

export async function handleGetRatings(req, res, contactId, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  const prisma = getPrisma();

  try {
    // Verify contact exists in org
    const contact = await prisma.contact.findFirst({
      where: {
        id: contactId,
        organizationId: authUser.organizationId
      }
    });

    if (!contact) {
      return sendError(res, 404, 'Contact not found');
    }

    const ratings = await prisma.contactRating.findMany({
      where: { contactId },
      orderBy: { ratedAt: 'desc' }
    });

    // Calculate aggregates
    const count = ratings.length;
    const avgOverall = count > 0
      ? ratings.reduce((sum, r) => sum + r.overallRating, 0) / count
      : null;

    return sendJson(res, 200, {
      items: ratings,
      summary: {
        count,
        avgOverall: avgOverall ? Math.round(avgOverall * 10) / 10 : null,
        wouldRecommendPercent: count > 0
          ? Math.round((ratings.filter(r => r.wouldRecommend).length / count) * 100)
          : null
      }
    });
  } catch (error) {
    console.error('[Contacts] Get ratings error:', error);
    return sendError(res, 500, error.message);
  }
}

// ============================================================================
// RATINGS - ADD
// ============================================================================
// POST /api/contacts/:id/ratings

export async function handleAddRating(req, res, contactId, readJsonBody, authUser) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  const prisma = getPrisma();
  const body = await readJsonBody(req);

  // ========== VALIDATION ==========
  const validationLog = createValidationLogger('handleAddRating');
  validationLog.beforeValidation(body);

  const parsed = AddRatingSchema.safeParse(body);
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

  try {
    // Verify contact exists in org
    const contact = await prisma.contact.findFirst({
      where: {
        id: contactId,
        organizationId: authUser.organizationId
      }
    });

    if (!contact) {
      return sendError(res, 404, 'Contact not found');
    }

    const validatedData = parsed.data;
    const rating = await prisma.contactRating.create({
      data: {
        contactId,
        dealId: validatedData.dealId || null,
        overallRating: validatedData.overallRating,
        qualityRating: validatedData.qualityRating || null,
        timelinessRating: validatedData.timelinessRating || null,
        communicationRating: validatedData.communicationRating || null,
        valueRating: validatedData.valueRating || null,
        comments: validatedData.comments || null,
        wouldRecommend: validatedData.wouldRecommend !== false,
        ratedBy: authUser.id,
        ratedByName: authUser.name
      }
    });

    // Update contact's average rating
    const allRatings = await prisma.contactRating.findMany({
      where: { contactId },
      select: { overallRating: true }
    });

    const avgRating = allRatings.reduce((sum, r) => sum + r.overallRating, 0) / allRatings.length;

    await prisma.contact.update({
      where: { id: contactId },
      data: { avgRating: Math.round(avgRating * 10) / 10 }
    });

    return sendJson(res, 201, rating);
  } catch (error) {
    console.error('[Contacts] Add rating error:', error);
    return sendError(res, 500, error.message);
  }
}

// ============================================================================
// DEAL CONTACTS - LIST
// ============================================================================
// GET /api/deals/:dealId/contacts

export async function handleGetDealContacts(req, res, dealId, authUser, query) {
  if (!authUser) {
    return sendError(res, 401, 'Not authenticated');
  }

  const prisma = getPrisma();
  const { dealType = 'DRAFT' } = query;

  try {
    const dealContacts = await prisma.dealContact.findMany({
      where: {
        dealId,
        dealType,
        organizationId: authUser.organizationId
      },
      include: {
        contact: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            companyName: true,
            contactType: true,
            avgRating: true
          }
        }
      },
      orderBy: [
        { isPrimary: 'desc' },
        { role: 'asc' }
      ]
    });

    return sendJson(res, 200, { items: dealContacts });
  } catch (error) {
    console.error('[Contacts] Get deal contacts error:', error);
    return sendError(res, 500, error.message);
  }
}

// ============================================================================
// DEAL CONTACTS - ASSIGN
// ============================================================================
// POST /api/deals/:dealId/contacts

export async function handleAssignContactToDeal(req, res, dealId, readJsonBody, authUser) {
  if (!authUser || !['GP', 'GP Analyst', 'Admin', 'Broker'].includes(authUser.role)) {
    return sendError(res, 403, 'Insufficient permissions');
  }

  const prisma = getPrisma();
  const body = await readJsonBody(req);

  // ========== VALIDATION ==========
  const validationLog = createValidationLogger('handleAssignContactToDeal');
  validationLog.beforeValidation(body);

  const parsed = AssignContactToDealSchema.safeParse(body);
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

  const validatedData = parsed.data;

  try {
    // Verify contact exists in org
    const contact = await prisma.contact.findFirst({
      where: {
        id: validatedData.contactId,
        organizationId: authUser.organizationId
      }
    });

    if (!contact) {
      return sendError(res, 404, 'Contact not found');
    }

    const dealContact = await prisma.dealContact.create({
      data: {
        dealId,
        dealType: validatedData.dealType || 'DRAFT',
        contactId: validatedData.contactId,
        organizationId: authUser.organizationId,
        role: validatedData.role,
        isPrimary: validatedData.isPrimary || false,
        feeType: validatedData.feeType || null,
        estimatedFee: validatedData.estimatedFee || null,
        feeNotes: validatedData.feeNotes || null,
        assignedBy: authUser.id,
        assignedByName: authUser.name
      },
      include: {
        contact: true
      }
    });

    // Update contact metrics
    await prisma.contact.update({
      where: { id: validatedData.contactId },
      data: {
        dealCount: { increment: 1 },
        lastUsedAt: new Date()
      }
    });

    // Log activity
    await prisma.contactCommunication.create({
      data: {
        contactId: validatedData.contactId,
        dealId,
        activityType: 'DEAL_ASSIGNED',
        summary: `Assigned to deal as ${validatedData.role}`,
        recordedBy: authUser.id,
        recordedByName: authUser.name,
        isAutoLogged: true,
        sourceSystem: 'SYSTEM'
      }
    });

    console.log('[Contacts] Assigned to deal:', { dealId, contactId: validatedData.contactId, role: validatedData.role });

    return sendJson(res, 201, dealContact);
  } catch (error) {
    if (error.code === 'P2002') {
      return sendError(res, 400, 'Contact already assigned to this deal with this role');
    }
    console.error('[Contacts] Assign to deal error:', error);
    return sendError(res, 500, error.message);
  }
}

// ============================================================================
// DEAL CONTACTS - UPDATE
// ============================================================================
// PATCH /api/deals/:dealId/contacts/:assignmentId

export async function handleUpdateDealContact(req, res, dealId, assignmentId, readJsonBody, authUser) {
  if (!authUser || !['GP', 'GP Analyst', 'Admin'].includes(authUser.role)) {
    return sendError(res, 403, 'Insufficient permissions');
  }

  const prisma = getPrisma();
  const body = await readJsonBody(req);

  // ========== VALIDATION ==========
  const validationLog = createValidationLogger('handleUpdateDealContact');
  validationLog.beforeValidation(body);

  const parsed = UpdateDealContactSchema.safeParse(body);
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

  try {
    const existing = await prisma.dealContact.findFirst({
      where: {
        id: assignmentId,
        dealId,
        organizationId: authUser.organizationId
      }
    });

    if (!existing) {
      return sendError(res, 404, 'Deal contact assignment not found');
    }

    const updateData = {};
    const allowedFields = [
      'isPrimary', 'feeType', 'estimatedFee', 'actualFee', 'feeNotes', 'status'
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    if (body.status === 'COMPLETED' && !existing.completedAt) {
      updateData.completedAt = new Date();
    }

    updateData.updatedAt = new Date();

    const updated = await prisma.dealContact.update({
      where: { id: assignmentId },
      data: updateData,
      include: { contact: true }
    });

    return sendJson(res, 200, updated);
  } catch (error) {
    console.error('[Contacts] Update deal contact error:', error);
    return sendError(res, 500, error.message);
  }
}

// ============================================================================
// DEAL CONTACTS - REMOVE
// ============================================================================
// DELETE /api/deals/:dealId/contacts/:assignmentId

export async function handleRemoveDealContact(req, res, dealId, assignmentId, authUser) {
  if (!authUser || !['GP', 'GP Analyst', 'Admin'].includes(authUser.role)) {
    return sendError(res, 403, 'Insufficient permissions');
  }

  const prisma = getPrisma();

  try {
    const existing = await prisma.dealContact.findFirst({
      where: {
        id: assignmentId,
        dealId,
        organizationId: authUser.organizationId
      }
    });

    if (!existing) {
      return sendError(res, 404, 'Deal contact assignment not found');
    }

    await prisma.dealContact.delete({
      where: { id: assignmentId }
    });

    // Decrement contact's deal count
    await prisma.contact.update({
      where: { id: existing.contactId },
      data: { dealCount: { decrement: 1 } }
    });

    return sendJson(res, 200, { success: true });
  } catch (error) {
    console.error('[Contacts] Remove deal contact error:', error);
    return sendError(res, 500, error.message);
  }
}

// ============================================================================
// ROUTE DISPATCHER
// ============================================================================

export function dispatchContactRoutes(req, res, segments, readJsonBody, authUser) {
  const method = req.method;
  const url = new URL(req.url, `http://${req.headers.host}`);
  const query = Object.fromEntries(url.searchParams);

  // GET /api/contacts - List contacts
  if (method === 'GET' && segments.length === 2) {
    return handleListContacts(req, res, authUser, query);
  }

  // GET /api/contacts/search - Search contacts
  if (method === 'GET' && segments.length === 3 && segments[2] === 'search') {
    return handleSearchContacts(req, res, authUser, query);
  }

  // GET /api/contacts/recent - Recent contacts
  if (method === 'GET' && segments.length === 3 && segments[2] === 'recent') {
    return handleGetRecentContacts(req, res, authUser, query);
  }

  // GET /api/contacts/expiring-credentials - Expiring credentials
  if (method === 'GET' && segments.length === 3 && segments[2] === 'expiring-credentials') {
    return handleGetExpiringCredentials(req, res, authUser, query);
  }

  // POST /api/contacts - Create contact
  if (method === 'POST' && segments.length === 2) {
    return handleCreateContact(req, res, readJsonBody, authUser);
  }

  // GET /api/contacts/:id - Get contact
  if (method === 'GET' && segments.length === 3) {
    return handleGetContact(req, res, segments[2], authUser);
  }

  // PATCH /api/contacts/:id - Update contact
  if (method === 'PATCH' && segments.length === 3) {
    return handleUpdateContact(req, res, segments[2], readJsonBody, authUser);
  }

  // DELETE /api/contacts/:id - Archive contact
  if (method === 'DELETE' && segments.length === 3) {
    return handleDeleteContact(req, res, segments[2], authUser);
  }

  // POST /api/contacts/:id/favorite - Toggle favorite
  if (method === 'POST' && segments.length === 4 && segments[3] === 'favorite') {
    return handleToggleFavorite(req, res, segments[2], authUser);
  }

  // POST /api/contacts/:id/credentials - Add credential
  if (method === 'POST' && segments.length === 4 && segments[3] === 'credentials') {
    return handleAddCredential(req, res, segments[2], readJsonBody, authUser);
  }

  // PATCH /api/contacts/:id/credentials/:credId - Update credential
  if (method === 'PATCH' && segments.length === 5 && segments[3] === 'credentials') {
    return handleUpdateCredential(req, res, segments[2], segments[4], readJsonBody, authUser);
  }

  // DELETE /api/contacts/:id/credentials/:credId - Delete credential
  if (method === 'DELETE' && segments.length === 5 && segments[3] === 'credentials') {
    return handleDeleteCredential(req, res, segments[2], segments[4], authUser);
  }

  // GET /api/contacts/:id/activity - Get activity
  if (method === 'GET' && segments.length === 4 && segments[3] === 'activity') {
    return handleGetActivity(req, res, segments[2], authUser, query);
  }

  // POST /api/contacts/:id/activity - Log activity
  if (method === 'POST' && segments.length === 4 && segments[3] === 'activity') {
    return handleLogActivity(req, res, segments[2], readJsonBody, authUser);
  }

  // GET /api/contacts/:id/ratings - Get ratings
  if (method === 'GET' && segments.length === 4 && segments[3] === 'ratings') {
    return handleGetRatings(req, res, segments[2], authUser);
  }

  // POST /api/contacts/:id/ratings - Add rating
  if (method === 'POST' && segments.length === 4 && segments[3] === 'ratings') {
    return handleAddRating(req, res, segments[2], readJsonBody, authUser);
  }

  // Not found
  console.log('[Contacts] Route not found', { method, segments });
  return sendError(res, 404, 'Route not found');
}

// Deal contacts dispatcher (called from deals routes)
export function dispatchDealContactRoutes(req, res, dealId, segments, readJsonBody, authUser) {
  const method = req.method;
  const url = new URL(req.url, `http://${req.headers.host}`);
  const query = Object.fromEntries(url.searchParams);

  // GET /api/deals/:dealId/contacts - List deal contacts
  if (method === 'GET' && segments.length === 0) {
    return handleGetDealContacts(req, res, dealId, authUser, query);
  }

  // POST /api/deals/:dealId/contacts - Assign contact to deal
  if (method === 'POST' && segments.length === 0) {
    return handleAssignContactToDeal(req, res, dealId, readJsonBody, authUser);
  }

  // PATCH /api/deals/:dealId/contacts/:assignmentId - Update assignment
  if (method === 'PATCH' && segments.length === 1) {
    return handleUpdateDealContact(req, res, dealId, segments[0], readJsonBody, authUser);
  }

  // DELETE /api/deals/:dealId/contacts/:assignmentId - Remove from deal
  if (method === 'DELETE' && segments.length === 1) {
    return handleRemoveDealContact(req, res, dealId, segments[0], authUser);
  }

  return sendError(res, 404, 'Route not found');
}
