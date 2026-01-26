/**
 * Legal Vault API Routes
 *
 * Provides bulk document management and cross-document queries.
 * All routes require GP Counsel or General Counsel role.
 *
 * Routes:
 *   GET    /api/legal/vaults                     - List vaults
 *   POST   /api/legal/vaults                     - Create vault
 *   GET    /api/legal/vaults/:id                 - Get vault details
 *   PATCH  /api/legal/vaults/:id                 - Update vault
 *   DELETE /api/legal/vaults/:id                 - Delete vault
 *   GET    /api/legal/vaults/:id/documents       - List vault documents
 *   POST   /api/legal/vaults/:id/documents       - Add documents to vault
 *   DELETE /api/legal/vaults/:id/documents/:docId - Remove from vault
 *   POST   /api/legal/vaults/:id/query           - Query across all docs
 *   GET    /api/legal/vaults/:id/queries         - Query history
 *   POST   /api/legal/vaults/:id/compare         - Compare documents
 *   POST   /api/legal/vaults/:id/reports/generate - Generate report
 */

import { getPrisma } from "../db.js";
import {
  requireGPCounsel,
  sendJson,
  sendError,
  logPermissionAction
} from "../middleware/auth.js";
import {
  addDocumentToVault,
  removeDocumentFromVault,
  queryVault,
  compareDocuments,
  generateAggregateReport
} from "../services/legal/vault-service.js";

// Valid vault statuses
const VALID_STATUSES = ['ACTIVE', 'ARCHIVED', 'PROCESSING'];

// Valid vault types
const VALID_VAULT_TYPES = ['GENERAL', 'DUE_DILIGENCE', 'LEASE_PORTFOLIO', 'CLOSING'];

// Valid report types
const VALID_REPORT_TYPES = ['RISK_SUMMARY', 'TERM_COMPARISON', 'CLAUSE_INVENTORY'];

/**
 * GET /api/legal/vaults - List vaults
 */
export async function handleListVaults(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();
  const url = new URL(req.url, `http://${req.headers.host}`);

  const status = url.searchParams.get('status');
  const vaultType = url.searchParams.get('vaultType');
  const matterId = url.searchParams.get('matterId');

  try {
    const where = {
      organizationId: authUser.organizationId
    };

    if (status && VALID_STATUSES.includes(status)) {
      where.status = status;
    }

    if (vaultType && VALID_VAULT_TYPES.includes(vaultType)) {
      where.vaultType = vaultType;
    }

    if (matterId) {
      where.matterId = matterId;
    }

    const vaults = await prisma.legalVault.findMany({
      where,
      orderBy: [
        { status: 'asc' },
        { updatedAt: 'desc' }
      ]
    });

    sendJson(res, 200, { vaults, count: vaults.length });
  } catch (error) {
    console.error('[LEGAL-VAULT] Error listing vaults:', error);
    sendError(res, 500, 'Failed to list vaults');
  }
}

/**
 * POST /api/legal/vaults - Create vault
 */
export async function handleCreateVault(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();

  try {
    let body;
    if (typeof req.body === 'string') {
      body = JSON.parse(req.body);
    } else {
      body = req.body;
    }

    const { name, description, vaultType, matterId } = body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return sendError(res, 400, 'name is required');
    }

    if (vaultType && !VALID_VAULT_TYPES.includes(vaultType)) {
      return sendError(res, 400, `Invalid vaultType. Must be one of: ${VALID_VAULT_TYPES.join(', ')}`);
    }

    // If matterId provided, verify access
    if (matterId) {
      const matter = await prisma.legalMatter.findUnique({
        where: { id: matterId }
      });

      if (!matter) {
        return sendError(res, 404, 'Matter not found');
      }

      if (matter.organizationId !== authUser.organizationId) {
        return sendError(res, 403, 'Access denied - cross-org violation');
      }
    }

    // Create vault
    const vault = await prisma.legalVault.create({
      data: {
        organizationId: authUser.organizationId,
        matterId: matterId || null,
        name: name.trim(),
        description: description || null,
        vaultType: vaultType || 'GENERAL',
        status: 'ACTIVE',
        documentCount: 0,
        createdBy: authUser.id,
        createdByName: authUser.name
      }
    });

    // Log action
    await logPermissionAction({
      actorId: authUser.id,
      actorRole: authUser.role,
      action: 'VAULT_CREATE',
      resourceType: 'LegalVault',
      resourceId: vault.id,
      organizationId: authUser.organizationId,
      metadata: { name: vault.name }
    });

    sendJson(res, 201, { vault });
  } catch (error) {
    console.error('[LEGAL-VAULT] Error creating vault:', error);
    sendError(res, 500, 'Failed to create vault');
  }
}

/**
 * GET /api/legal/vaults/:id - Get vault details
 */
export async function handleGetVault(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();
  const vaultId = req.params.id;

  try {
    const vault = await prisma.legalVault.findUnique({
      where: { id: vaultId },
      include: {
        documents: {
          include: {
            document: {
              select: {
                id: true,
                filename: true,
                documentType: true,
                mimeType: true,
                sizeBytes: true,
                status: true,
                uploadedAt: true
              }
            }
          },
          orderBy: { addedAt: 'desc' }
        },
        _count: {
          select: { queries: true }
        }
      }
    });

    if (!vault) {
      return sendError(res, 404, 'Vault not found');
    }

    if (vault.organizationId !== authUser.organizationId) {
      return sendError(res, 403, 'Access denied - cross-org violation');
    }

    // Transform for response
    const response = {
      ...vault,
      documents: vault.documents.map(vd => ({
        vaultDocumentId: vd.id,
        documentId: vd.documentId,
        addedAt: vd.addedAt,
        addedBy: vd.addedBy,
        embeddingStatus: vd.embeddingStatus,
        ...vd.document
      })),
      queryCount: vault._count.queries
    };
    delete response._count;

    sendJson(res, 200, { vault: response });
  } catch (error) {
    console.error('[LEGAL-VAULT] Error getting vault:', error);
    sendError(res, 500, 'Failed to get vault');
  }
}

/**
 * PATCH /api/legal/vaults/:id - Update vault
 */
export async function handleUpdateVault(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();
  const vaultId = req.params.id;

  try {
    let body;
    if (typeof req.body === 'string') {
      body = JSON.parse(req.body);
    } else {
      body = req.body;
    }

    // Verify access
    const existing = await prisma.legalVault.findUnique({
      where: { id: vaultId }
    });

    if (!existing) {
      return sendError(res, 404, 'Vault not found');
    }

    if (existing.organizationId !== authUser.organizationId) {
      return sendError(res, 403, 'Access denied - cross-org violation');
    }

    // Build update data
    const updateData = {};

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim().length === 0) {
        return sendError(res, 400, 'name must be a non-empty string');
      }
      updateData.name = body.name.trim();
    }

    if (body.description !== undefined) {
      updateData.description = body.description;
    }

    if (body.vaultType !== undefined) {
      if (!VALID_VAULT_TYPES.includes(body.vaultType)) {
        return sendError(res, 400, `Invalid vaultType. Must be one of: ${VALID_VAULT_TYPES.join(', ')}`);
      }
      updateData.vaultType = body.vaultType;
    }

    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        return sendError(res, 400, `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
      }
      updateData.status = body.status;
    }

    const vault = await prisma.legalVault.update({
      where: { id: vaultId },
      data: updateData
    });

    sendJson(res, 200, { vault });
  } catch (error) {
    console.error('[LEGAL-VAULT] Error updating vault:', error);
    sendError(res, 500, 'Failed to update vault');
  }
}

/**
 * DELETE /api/legal/vaults/:id - Delete vault
 */
export async function handleDeleteVault(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();
  const vaultId = req.params.id;

  try {
    const existing = await prisma.legalVault.findUnique({
      where: { id: vaultId }
    });

    if (!existing) {
      return sendError(res, 404, 'Vault not found');
    }

    if (existing.organizationId !== authUser.organizationId) {
      return sendError(res, 403, 'Access denied - cross-org violation');
    }

    // Delete vault (cascades to documents and queries)
    await prisma.legalVault.delete({
      where: { id: vaultId }
    });

    // Log action
    await logPermissionAction({
      actorId: authUser.id,
      actorRole: authUser.role,
      action: 'VAULT_DELETE',
      resourceType: 'LegalVault',
      resourceId: vaultId,
      organizationId: authUser.organizationId,
      metadata: { name: existing.name }
    });

    sendJson(res, 200, { success: true, message: 'Vault deleted' });
  } catch (error) {
    console.error('[LEGAL-VAULT] Error deleting vault:', error);
    sendError(res, 500, 'Failed to delete vault');
  }
}

/**
 * GET /api/legal/vaults/:id/documents - List vault documents
 */
export async function handleListVaultDocuments(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();
  const vaultId = req.params.id;

  try {
    const vault = await prisma.legalVault.findUnique({
      where: { id: vaultId }
    });

    if (!vault) {
      return sendError(res, 404, 'Vault not found');
    }

    if (vault.organizationId !== authUser.organizationId) {
      return sendError(res, 403, 'Access denied - cross-org violation');
    }

    const documents = await prisma.legalVaultDocument.findMany({
      where: { vaultId },
      include: {
        document: {
          include: {
            analyses: {
              orderBy: { analyzedAt: 'desc' },
              take: 1,
              select: {
                id: true,
                riskScore: true,
                status: true,
                analyzedAt: true
              }
            }
          }
        }
      },
      orderBy: { addedAt: 'desc' }
    });

    const response = documents.map(vd => ({
      vaultDocumentId: vd.id,
      documentId: vd.documentId,
      addedAt: vd.addedAt,
      addedBy: vd.addedBy,
      embeddingStatus: vd.embeddingStatus,
      filename: vd.document.filename,
      documentType: vd.document.documentType,
      mimeType: vd.document.mimeType,
      sizeBytes: vd.document.sizeBytes,
      status: vd.document.status,
      latestAnalysis: vd.document.analyses[0] || null
    }));

    sendJson(res, 200, { documents: response, count: response.length });
  } catch (error) {
    console.error('[LEGAL-VAULT] Error listing vault documents:', error);
    sendError(res, 500, 'Failed to list vault documents');
  }
}

/**
 * POST /api/legal/vaults/:id/documents - Add documents to vault
 */
export async function handleAddVaultDocuments(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();
  const vaultId = req.params.id;

  try {
    let body;
    if (typeof req.body === 'string') {
      body = JSON.parse(req.body);
    } else {
      body = req.body;
    }

    const { documentIds } = body;

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return sendError(res, 400, 'documentIds must be a non-empty array');
    }

    // Verify vault access
    const vault = await prisma.legalVault.findUnique({
      where: { id: vaultId }
    });

    if (!vault) {
      return sendError(res, 404, 'Vault not found');
    }

    if (vault.organizationId !== authUser.organizationId) {
      return sendError(res, 403, 'Access denied - cross-org violation');
    }

    // Add each document
    const results = [];
    for (const docId of documentIds) {
      // Verify document access
      const doc = await prisma.legalMatterDocument.findUnique({
        where: { id: docId }
      });

      if (!doc) {
        results.push({ documentId: docId, success: false, error: 'Document not found' });
        continue;
      }

      if (doc.organizationId !== authUser.organizationId) {
        results.push({ documentId: docId, success: false, error: 'Access denied' });
        continue;
      }

      const result = await addDocumentToVault(vaultId, docId, {
        addedBy: authUser.id
      });

      results.push({ documentId: docId, ...result });
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    sendJson(res, successCount > 0 ? 200 : 400, {
      results,
      summary: {
        successCount,
        failCount,
        totalRequested: documentIds.length
      }
    });
  } catch (error) {
    console.error('[LEGAL-VAULT] Error adding documents:', error);
    sendError(res, 500, 'Failed to add documents');
  }
}

/**
 * DELETE /api/legal/vaults/:id/documents/:docId - Remove from vault
 */
export async function handleRemoveVaultDocument(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();
  const { id: vaultId, docId: documentId } = req.params;

  try {
    // Verify vault access
    const vault = await prisma.legalVault.findUnique({
      where: { id: vaultId }
    });

    if (!vault) {
      return sendError(res, 404, 'Vault not found');
    }

    if (vault.organizationId !== authUser.organizationId) {
      return sendError(res, 403, 'Access denied - cross-org violation');
    }

    const result = await removeDocumentFromVault(vaultId, documentId);

    if (!result.success) {
      return sendError(res, 404, result.error);
    }

    sendJson(res, 200, { success: true, message: 'Document removed from vault' });
  } catch (error) {
    console.error('[LEGAL-VAULT] Error removing document:', error);
    sendError(res, 500, 'Failed to remove document');
  }
}

/**
 * POST /api/legal/vaults/:id/query - Query across all docs
 */
export async function handleVaultQuery(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();
  const vaultId = req.params.id;

  try {
    let body;
    if (typeof req.body === 'string') {
      body = JSON.parse(req.body);
    } else {
      body = req.body;
    }

    const { query, queryType } = body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return sendError(res, 400, 'query is required');
    }

    // Verify vault access
    const vault = await prisma.legalVault.findUnique({
      where: { id: vaultId }
    });

    if (!vault) {
      return sendError(res, 404, 'Vault not found');
    }

    if (vault.organizationId !== authUser.organizationId) {
      return sendError(res, 403, 'Access denied - cross-org violation');
    }

    // Execute query
    const result = await queryVault(vaultId, query.trim(), {
      queryType: queryType || 'SEARCH',
      organizationId: authUser.organizationId,
      queriedBy: authUser.id,
      queriedByName: authUser.name
    });

    if (!result.success) {
      return sendError(res, 500, result.error);
    }

    sendJson(res, 200, result);
  } catch (error) {
    console.error('[LEGAL-VAULT] Error querying vault:', error);
    sendError(res, 500, 'Failed to query vault');
  }
}

/**
 * GET /api/legal/vaults/:id/queries - Query history
 */
export async function handleListQueries(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();
  const vaultId = req.params.id;
  const url = new URL(req.url, `http://${req.headers.host}`);

  const limit = parseInt(url.searchParams.get('limit') || '20', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  try {
    // Verify vault access
    const vault = await prisma.legalVault.findUnique({
      where: { id: vaultId }
    });

    if (!vault) {
      return sendError(res, 404, 'Vault not found');
    }

    if (vault.organizationId !== authUser.organizationId) {
      return sendError(res, 403, 'Access denied - cross-org violation');
    }

    const [queries, total] = await Promise.all([
      prisma.legalVaultQuery.findMany({
        where: { vaultId },
        orderBy: { queriedAt: 'desc' },
        take: limit,
        skip: offset
      }),
      prisma.legalVaultQuery.count({
        where: { vaultId }
      })
    ]);

    // Parse results JSON
    const response = queries.map(q => ({
      ...q,
      results: q.results ? JSON.parse(q.results) : []
    }));

    sendJson(res, 200, {
      queries: response,
      count: response.length,
      total,
      limit,
      offset
    });
  } catch (error) {
    console.error('[LEGAL-VAULT] Error listing queries:', error);
    sendError(res, 500, 'Failed to list queries');
  }
}

/**
 * POST /api/legal/vaults/:id/compare - Compare documents
 */
export async function handleCompareDocuments(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();
  const vaultId = req.params.id;

  try {
    let body;
    if (typeof req.body === 'string') {
      body = JSON.parse(req.body);
    } else {
      body = req.body;
    }

    const { documentIds, criteria } = body;

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length < 2) {
      return sendError(res, 400, 'documentIds must be an array with at least 2 documents');
    }

    // Verify vault access
    const vault = await prisma.legalVault.findUnique({
      where: { id: vaultId }
    });

    if (!vault) {
      return sendError(res, 404, 'Vault not found');
    }

    if (vault.organizationId !== authUser.organizationId) {
      return sendError(res, 403, 'Access denied - cross-org violation');
    }

    // Execute comparison
    const result = await compareDocuments(vaultId, documentIds, {
      criteria,
      organizationId: authUser.organizationId,
      queriedBy: authUser.id,
      queriedByName: authUser.name
    });

    if (!result.success) {
      return sendError(res, 500, result.error);
    }

    sendJson(res, 200, result);
  } catch (error) {
    console.error('[LEGAL-VAULT] Error comparing documents:', error);
    sendError(res, 500, 'Failed to compare documents');
  }
}

/**
 * POST /api/legal/vaults/:id/reports/generate - Generate report
 */
export async function handleGenerateReport(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();
  const vaultId = req.params.id;

  try {
    let body;
    if (typeof req.body === 'string') {
      body = JSON.parse(req.body);
    } else {
      body = req.body;
    }

    const { reportType } = body;

    if (!reportType || !VALID_REPORT_TYPES.includes(reportType)) {
      return sendError(res, 400, `reportType must be one of: ${VALID_REPORT_TYPES.join(', ')}`);
    }

    // Verify vault access
    const vault = await prisma.legalVault.findUnique({
      where: { id: vaultId }
    });

    if (!vault) {
      return sendError(res, 404, 'Vault not found');
    }

    if (vault.organizationId !== authUser.organizationId) {
      return sendError(res, 403, 'Access denied - cross-org violation');
    }

    // Generate report
    const result = await generateAggregateReport(vaultId, reportType, {
      organizationId: authUser.organizationId,
      generatedBy: authUser.id
    });

    if (!result.success) {
      return sendError(res, 500, result.error);
    }

    sendJson(res, 200, result);
  } catch (error) {
    console.error('[LEGAL-VAULT] Error generating report:', error);
    sendError(res, 500, 'Failed to generate report');
  }
}

export default {
  handleListVaults,
  handleCreateVault,
  handleGetVault,
  handleUpdateVault,
  handleDeleteVault,
  handleListVaultDocuments,
  handleAddVaultDocuments,
  handleRemoveVaultDocument,
  handleVaultQuery,
  handleListQueries,
  handleCompareDocuments,
  handleGenerateReport,
  VALID_STATUSES,
  VALID_VAULT_TYPES,
  VALID_REPORT_TYPES
};
