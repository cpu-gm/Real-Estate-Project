/**
 * Legal Entities API Routes
 *
 * Provides entity management functionality for GP Counsel to track and manage
 * legal entities (LLCs, LPs, Corporations, Trusts) with ownership structures
 * and annual filing reminders.
 *
 * Routes:
 *   GET    /api/legal/entities                    - List all entities (with filters)
 *   POST   /api/legal/entities                    - Create a new entity
 *   GET    /api/legal/entities/:id                - Get entity by ID
 *   PATCH  /api/legal/entities/:id                - Update entity
 *   DELETE /api/legal/entities/:id                - Dissolve/archive entity
 *   GET    /api/legal/entities/:id/org-chart      - Get ownership org chart
 *   POST   /api/legal/entities/:id/documents      - Add document
 *   GET    /api/legal/entities/:id/documents      - List documents
 *   DELETE /api/legal/entities/:id/documents/:docId - Remove document
 *   GET    /api/legal/entities/:id/related-deals  - Get related deals
 *   GET    /api/legal/entities/filing-reminders   - Upcoming annual filings
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
  createEntity,
  getEntity,
  listEntities,
  getOrgChart,
  getFilingReminders,
  getRelatedDeals
} from "../services/legal/entity-service.js";

// Valid entity types
const VALID_ENTITY_TYPES = ['LLC', 'LP', 'CORP', 'TRUST'];
const VALID_ENTITY_STATUS = ['ACTIVE', 'DISSOLVED', 'PENDING'];
const VALID_DOCUMENT_TYPES = ['OPERATING_AGREEMENT', 'CERTIFICATE', 'AMENDMENT', 'ANNUAL_REPORT'];

/**
 * GET /api/legal/entities - List all entities with filters
 */
export async function handleListEntities(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const url = new URL(req.url, `http://${req.headers.host}`);

  // Parse filters
  const filters = {
    entityType: url.searchParams.get('entityType'),
    status: url.searchParams.get('status'),
    search: url.searchParams.get('search')
  };

  try {
    const entities = await listEntities(authUser.organizationId, filters);
    return sendJson(res, { entities });
  } catch (err) {
    console.error('[handleListEntities] Error:', err);
    return sendError(res, 500, 'Failed to list entities', 'ENTITY_LIST_FAILED');
  }
}

/**
 * POST /api/legal/entities - Create a new entity
 */
export async function handleCreateEntity(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const {
    name,
    entityType,
    jurisdiction,
    einNumber,
    status,
    formationDate,
    registeredAgent,
    registeredAddress,
    ownershipStructure,
    parentEntityId,
    nextAnnualFiling
  } = req.body;

  // Validation
  if (!entityType || !VALID_ENTITY_TYPES.includes(entityType)) {
    return sendError(res, 400, 'Invalid or missing entityType', 'VALIDATION_FAILED');
  }
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return sendError(res, 400, 'Entity name is required', 'VALIDATION_FAILED');
  }

  try {
    const entity = await createEntity(
      authUser.organizationId,
      {
        name,
        entityType,
        jurisdiction,
        einNumber,
        status,
        formationDate,
        registeredAgent,
        registeredAddress,
        ownershipStructure,
        parentEntityId,
        nextAnnualFiling
      },
      authUser.id
    );

    // Log the creation
    await logPermissionAction({
      actorId: authUser.id,
      action: AUDIT_ACTIONS.ENTITY_CREATE,
      resource: 'LegalEntity',
      resourceId: entity.id,
      afterValue: JSON.stringify({ entityType, name })
    });

    return sendJson(res, { entity }, 201);
  } catch (err) {
    console.error('[handleCreateEntity] Error:', err);
    return sendError(res, 500, 'Failed to create entity', 'ENTITY_CREATE_FAILED');
  }
}

/**
 * GET /api/legal/entities/:id - Get entity by ID
 */
export async function handleGetEntity(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const { id } = req.params;

  try {
    const entity = await getEntity(id, authUser.organizationId);

    if (!entity) {
      return sendError(res, 404, 'Entity not found', 'ENTITY_NOT_FOUND');
    }

    return sendJson(res, { entity });
  } catch (err) {
    console.error('[handleGetEntity] Error:', err);
    return sendError(res, 500, 'Failed to get entity', 'ENTITY_GET_FAILED');
  }
}

/**
 * PATCH /api/legal/entities/:id - Update entity
 */
export async function handleUpdateEntity(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const { id } = req.params;
  const prisma = getPrisma();

  // Verify entity exists and belongs to org
  const existing = await prisma.legalEntity.findFirst({
    where: { id, organizationId: authUser.organizationId }
  });

  if (!existing) {
    return sendError(res, 404, 'Entity not found', 'ENTITY_NOT_FOUND');
  }

  const {
    name,
    jurisdiction,
    einNumber,
    status,
    formationDate,
    dissolutionDate,
    registeredAgent,
    registeredAddress,
    ownershipStructure,
    parentEntityId,
    nextAnnualFiling
  } = req.body;

  try {
    const entity = await prisma.legalEntity.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(jurisdiction !== undefined && { jurisdiction }),
        ...(einNumber !== undefined && { einNumber }),
        ...(status !== undefined && VALID_ENTITY_STATUS.includes(status) && { status }),
        ...(formationDate !== undefined && { formationDate: formationDate ? new Date(formationDate) : null }),
        ...(dissolutionDate !== undefined && { dissolutionDate: dissolutionDate ? new Date(dissolutionDate) : null }),
        ...(registeredAgent !== undefined && { registeredAgent }),
        ...(registeredAddress !== undefined && { registeredAddress }),
        ...(ownershipStructure !== undefined && { ownershipStructure: ownershipStructure ? JSON.stringify(ownershipStructure) : null }),
        ...(parentEntityId !== undefined && { parentEntityId }),
        ...(nextAnnualFiling !== undefined && { nextAnnualFiling: nextAnnualFiling ? new Date(nextAnnualFiling) : null })
      },
      include: {
        documents: true
      }
    });

    await logPermissionAction({
      actorId: authUser.id,
      action: AUDIT_ACTIONS.ENTITY_UPDATE,
      resource: 'LegalEntity',
      resourceId: id,
      afterValue: JSON.stringify({ name, status })
    });

    // Parse ownershipStructure back to JSON
    if (entity.ownershipStructure) {
      try {
        entity.ownershipStructure = JSON.parse(entity.ownershipStructure);
      } catch (err) {
        entity.ownershipStructure = null;
      }
    }

    return sendJson(res, { entity });
  } catch (err) {
    console.error('[handleUpdateEntity] Error:', err);
    return sendError(res, 500, 'Failed to update entity', 'ENTITY_UPDATE_FAILED');
  }
}

/**
 * GET /api/legal/entities/:id/org-chart - Get ownership org chart
 */
export async function handleGetOrgChart(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const { id } = req.params;

  try {
    const orgChart = await getOrgChart(id, authUser.organizationId);

    if (!orgChart) {
      return sendError(res, 404, 'Entity not found', 'ENTITY_NOT_FOUND');
    }

    return sendJson(res, { orgChart });
  } catch (err) {
    console.error('[handleGetOrgChart] Error:', err);
    return sendError(res, 500, 'Failed to get org chart', 'ORG_CHART_FAILED');
  }
}

/**
 * POST /api/legal/entities/:id/documents - Add document
 */
export async function handleAddDocument(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const { id: entityId } = req.params;
  const { documentType, title, documentUrl, effectiveDate } = req.body;

  if (!documentType || !VALID_DOCUMENT_TYPES.includes(documentType)) {
    return sendError(res, 400, 'Invalid or missing documentType', 'VALIDATION_FAILED');
  }
  if (!title) {
    return sendError(res, 400, 'Document title is required', 'VALIDATION_FAILED');
  }

  const prisma = getPrisma();

  // Verify entity exists and belongs to org
  const entity = await prisma.legalEntity.findFirst({
    where: { id: entityId, organizationId: authUser.organizationId }
  });

  if (!entity) {
    return sendError(res, 404, 'Entity not found', 'ENTITY_NOT_FOUND');
  }

  try {
    const document = await prisma.legalEntityDocument.create({
      data: {
        entityId,
        documentType,
        title,
        documentUrl: documentUrl || null,
        effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
        addedBy: authUser.id
      }
    });

    return sendJson(res, { document }, 201);
  } catch (err) {
    console.error('[handleAddDocument] Error:', err);
    return sendError(res, 500, 'Failed to add document', 'DOCUMENT_ADD_FAILED');
  }
}

/**
 * GET /api/legal/entities/filing-reminders - Upcoming annual filings
 */
export async function handleFilingReminders(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const url = new URL(req.url, `http://${req.headers.host}`);
  const daysAhead = parseInt(url.searchParams.get('daysAhead') || '90', 10);

  try {
    const entities = await getFilingReminders(authUser.organizationId, daysAhead);
    return sendJson(res, { entities });
  } catch (err) {
    console.error('[handleFilingReminders] Error:', err);
    return sendError(res, 500, 'Failed to get filing reminders', 'FILING_REMINDERS_FAILED');
  }
}

/**
 * GET /api/legal/entities/:id/related-deals - Get related deals
 */
export async function handleRelatedDeals(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const { id } = req.params;

  try {
    const result = await getRelatedDeals(id, authUser.organizationId);
    return sendJson(res, result);
  } catch (err) {
    console.error('[handleRelatedDeals] Error:', err);
    return sendError(res, 500, 'Failed to get related deals', 'RELATED_DEALS_FAILED');
  }
}
