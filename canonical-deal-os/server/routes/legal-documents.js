/**
 * Legal Documents API Routes
 *
 * Provides document management and AI analysis for GP Counsel.
 * All routes require GP Counsel or General Counsel role.
 *
 * Routes:
 *   GET    /api/legal/matters/:matterId/documents   - List documents for matter
 *   POST   /api/legal/matters/:matterId/documents   - Upload document to matter
 *   GET    /api/legal/documents/:id                  - Get document details
 *   DELETE /api/legal/documents/:id                  - Delete document
 *   POST   /api/legal/documents/:id/analyze          - Trigger AI analysis
 *   GET    /api/legal/documents/:id/analysis         - Get analysis results
 *   POST   /api/legal/documents/:id/analyze/playbook - Analyze against playbook
 */

import { getPrisma } from "../db.js";
import {
  requireGPCounsel,
  sendJson,
  sendError,
  logPermissionAction,
  AUDIT_ACTIONS
} from "../middleware/auth.js";
import { analyzeDocument, analyzeWithPlaybook } from "../services/legal/document-analyzer.js";

// Valid document types
const VALID_DOCUMENT_TYPES = [
  'CONTRACT', 'LEASE', 'SUBLEASE', 'AMENDMENT', 'SIDE_LETTER',
  'PSA', 'LOI', 'OPERATING_AGREEMENT', 'LOAN_AGREEMENT', 'GUARANTY',
  'ESTOPPEL', 'SNDA', 'TITLE_COMMITMENT', 'SURVEY', 'APPRAISAL',
  'ENVIRONMENTAL', 'INSURANCE', 'OTHER'
];

// Valid document statuses
const VALID_STATUSES = ['UPLOADED', 'ANALYZING', 'ANALYZED', 'FAILED'];

/**
 * GET /api/legal/matters/:matterId/documents - List documents for a matter
 */
export async function handleListMatterDocuments(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();
  const matterId = req.params.matterId;

  try {
    // Verify matter exists and user has access
    const matter = await prisma.legalMatter.findUnique({
      where: { id: matterId }
    });

    if (!matter) {
      return sendError(res, 404, 'Matter not found');
    }

    if (matter.organizationId !== authUser.organizationId) {
      return sendError(res, 403, 'Access denied - cross-org violation');
    }

    // Get documents with latest analysis
    const documents = await prisma.legalMatterDocument.findMany({
      where: { matterId },
      include: {
        analyses: {
          orderBy: { analyzedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            analysisType: true,
            riskScore: true,
            status: true,
            analyzedAt: true
          }
        }
      },
      orderBy: { uploadedAt: 'desc' }
    });

    // Transform for response
    const response = documents.map(doc => ({
      id: doc.id,
      filename: doc.filename,
      documentType: doc.documentType,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      pageCount: doc.pageCount,
      status: doc.status,
      uploadedAt: doc.uploadedAt,
      uploadedBy: doc.uploadedBy,
      uploadedByName: doc.uploadedByName,
      latestAnalysis: doc.analyses[0] || null
    }));

    sendJson(res, 200, { documents: response, count: documents.length });
  } catch (error) {
    console.error('[LEGAL-DOCS] Error listing documents:', error);
    sendError(res, 500, 'Failed to list documents');
  }
}

/**
 * POST /api/legal/matters/:matterId/documents - Upload document to matter
 */
export async function handleUploadDocument(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();
  const matterId = req.params.matterId;

  try {
    // Parse request body
    let body;
    if (typeof req.body === 'string') {
      body = JSON.parse(req.body);
    } else {
      body = req.body;
    }

    const {
      filename,
      storageKey,
      mimeType,
      sizeBytes,
      documentType,
      documentSubType,
      pageCount,
      documentDate,
      effectiveDate,
      expirationDate,
      parties
    } = body;

    // Validate required fields
    if (!filename || !storageKey || !mimeType || !sizeBytes) {
      return sendError(res, 400, 'Missing required fields: filename, storageKey, mimeType, sizeBytes');
    }

    if (!documentType || !VALID_DOCUMENT_TYPES.includes(documentType)) {
      return sendError(res, 400, `Invalid documentType. Must be one of: ${VALID_DOCUMENT_TYPES.join(', ')}`);
    }

    // Verify matter exists and user has access
    const matter = await prisma.legalMatter.findUnique({
      where: { id: matterId }
    });

    if (!matter) {
      return sendError(res, 404, 'Matter not found');
    }

    if (matter.organizationId !== authUser.organizationId) {
      return sendError(res, 403, 'Access denied - cross-org violation');
    }

    // Create document record
    const document = await prisma.legalMatterDocument.create({
      data: {
        matterId,
        organizationId: authUser.organizationId,
        storageKey,
        filename,
        mimeType,
        sizeBytes: parseInt(sizeBytes, 10),
        pageCount: pageCount ? parseInt(pageCount, 10) : null,
        documentType,
        documentSubType: documentSubType || null,
        status: 'UPLOADED',
        uploadedBy: authUser.id,
        uploadedByName: authUser.name,
        documentDate: documentDate ? new Date(documentDate) : null,
        effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
        expirationDate: expirationDate ? new Date(expirationDate) : null,
        parties: parties ? JSON.stringify(parties) : null
      }
    });

    // Log the action
    await logPermissionAction({
      actorId: authUser.id,
      actorRole: authUser.role,
      action: AUDIT_ACTIONS.DOCUMENT_UPLOAD || 'DOCUMENT_UPLOAD',
      resourceType: 'LegalMatterDocument',
      resourceId: document.id,
      organizationId: authUser.organizationId,
      metadata: { matterId, filename, documentType }
    });

    // Add activity to matter
    await prisma.legalMatterActivity.create({
      data: {
        matterId,
        activityType: 'COMMENT',
        content: `Document uploaded: ${filename}`,
        createdBy: authUser.id,
        createdByName: authUser.name
      }
    });

    sendJson(res, 201, { document });
  } catch (error) {
    console.error('[LEGAL-DOCS] Error uploading document:', error);
    sendError(res, 500, 'Failed to upload document');
  }
}

/**
 * GET /api/legal/documents/:id - Get document details
 */
export async function handleGetDocument(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();
  const documentId = req.params.id;

  try {
    const document = await prisma.legalMatterDocument.findUnique({
      where: { id: documentId },
      include: {
        matter: {
          select: {
            id: true,
            title: true,
            matterNumber: true
          }
        },
        analyses: {
          orderBy: { analyzedAt: 'desc' }
        }
      }
    });

    if (!document) {
      return sendError(res, 404, 'Document not found');
    }

    if (document.organizationId !== authUser.organizationId) {
      return sendError(res, 403, 'Access denied - cross-org violation');
    }

    sendJson(res, 200, { document });
  } catch (error) {
    console.error('[LEGAL-DOCS] Error getting document:', error);
    sendError(res, 500, 'Failed to get document');
  }
}

/**
 * DELETE /api/legal/documents/:id - Delete document
 */
export async function handleDeleteDocument(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();
  const documentId = req.params.id;

  try {
    const document = await prisma.legalMatterDocument.findUnique({
      where: { id: documentId },
      include: { matter: true }
    });

    if (!document) {
      return sendError(res, 404, 'Document not found');
    }

    if (document.organizationId !== authUser.organizationId) {
      return sendError(res, 403, 'Access denied - cross-org violation');
    }

    // Delete document (cascades to analyses)
    await prisma.legalMatterDocument.delete({
      where: { id: documentId }
    });

    // Log the action
    await logPermissionAction({
      actorId: authUser.id,
      actorRole: authUser.role,
      action: AUDIT_ACTIONS.DOCUMENT_DELETE || 'DOCUMENT_DELETE',
      resourceType: 'LegalMatterDocument',
      resourceId: documentId,
      organizationId: authUser.organizationId,
      metadata: { filename: document.filename, matterId: document.matterId }
    });

    // Add activity to matter
    await prisma.legalMatterActivity.create({
      data: {
        matterId: document.matterId,
        activityType: 'COMMENT',
        content: `Document deleted: ${document.filename}`,
        createdBy: authUser.id,
        createdByName: authUser.name
      }
    });

    sendJson(res, 200, { success: true, message: 'Document deleted' });
  } catch (error) {
    console.error('[LEGAL-DOCS] Error deleting document:', error);
    sendError(res, 500, 'Failed to delete document');
  }
}

/**
 * POST /api/legal/documents/:id/analyze - Trigger AI analysis
 */
export async function handleAnalyzeDocument(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();
  const documentId = req.params.id;

  try {
    // Parse options from body
    let options = {};
    if (req.body) {
      if (typeof req.body === 'string') {
        options = JSON.parse(req.body);
      } else {
        options = req.body;
      }
    }

    const { analysisType = 'FULL' } = options;

    // Verify document exists and user has access
    const document = await prisma.legalMatterDocument.findUnique({
      where: { id: documentId }
    });

    if (!document) {
      return sendError(res, 404, 'Document not found');
    }

    if (document.organizationId !== authUser.organizationId) {
      return sendError(res, 403, 'Access denied - cross-org violation');
    }

    // Update document status
    await prisma.legalMatterDocument.update({
      where: { id: documentId },
      data: { status: 'ANALYZING' }
    });

    // Run analysis (async, but we wait for completion)
    const analysisResult = await analyzeDocument(documentId, {
      analysisType,
      analyzedBy: authUser.id,
      organizationId: authUser.organizationId
    });

    // Update document status based on result
    const newStatus = analysisResult.success ? 'ANALYZED' : 'FAILED';
    await prisma.legalMatterDocument.update({
      where: { id: documentId },
      data: { status: newStatus }
    });

    // Add activity to matter
    await prisma.legalMatterActivity.create({
      data: {
        matterId: document.matterId,
        activityType: 'AI_ANALYSIS',
        content: analysisResult.success
          ? `AI analysis completed: Risk score ${analysisResult.analysis?.riskScore}/10`
          : `AI analysis failed: ${analysisResult.error}`,
        metadata: JSON.stringify({
          analysisId: analysisResult.analysis?.id,
          riskScore: analysisResult.analysis?.riskScore
        }),
        createdBy: authUser.id,
        createdByName: authUser.name
      }
    });

    if (!analysisResult.success) {
      return sendError(res, 500, analysisResult.error || 'Analysis failed');
    }

    sendJson(res, 200, {
      success: true,
      analysis: analysisResult.analysis
    });
  } catch (error) {
    console.error('[LEGAL-DOCS] Error analyzing document:', error);

    // Update status to failed
    try {
      await prisma.legalMatterDocument.update({
        where: { id: documentId },
        data: { status: 'FAILED' }
      });
    } catch (e) {
      // Ignore update error
    }

    sendError(res, 500, 'Failed to analyze document');
  }
}

/**
 * GET /api/legal/documents/:id/analysis - Get analysis results
 */
export async function handleGetAnalysis(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();
  const documentId = req.params.id;
  const url = new URL(req.url, `http://${req.headers.host}`);
  const analysisId = url.searchParams.get('analysisId');

  try {
    // Verify document access
    const document = await prisma.legalMatterDocument.findUnique({
      where: { id: documentId }
    });

    if (!document) {
      return sendError(res, 404, 'Document not found');
    }

    if (document.organizationId !== authUser.organizationId) {
      return sendError(res, 403, 'Access denied - cross-org violation');
    }

    // Get analysis(es)
    let analyses;
    if (analysisId) {
      analyses = await prisma.legalDocumentAnalysis.findMany({
        where: { id: analysisId, documentId }
      });
    } else {
      analyses = await prisma.legalDocumentAnalysis.findMany({
        where: { documentId },
        orderBy: { analyzedAt: 'desc' }
      });
    }

    // Parse JSON fields
    const parsedAnalyses = analyses.map(a => ({
      ...a,
      extractedTerms: a.extractedTerms ? JSON.parse(a.extractedTerms) : null,
      identifiedClauses: a.identifiedClauses ? JSON.parse(a.identifiedClauses) : null,
      missingClauses: a.missingClauses ? JSON.parse(a.missingClauses) : null,
      unusualClauses: a.unusualClauses ? JSON.parse(a.unusualClauses) : null,
      playbookViolations: a.playbookViolations ? JSON.parse(a.playbookViolations) : null
    }));

    sendJson(res, 200, {
      analyses: parsedAnalyses,
      latest: parsedAnalyses[0] || null
    });
  } catch (error) {
    console.error('[LEGAL-DOCS] Error getting analysis:', error);
    sendError(res, 500, 'Failed to get analysis');
  }
}

/**
 * POST /api/legal/documents/:id/analyze/playbook - Analyze against playbook
 */
export async function handleAnalyzeWithPlaybook(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();
  const documentId = req.params.id;

  try {
    // Parse request body
    let body;
    if (typeof req.body === 'string') {
      body = JSON.parse(req.body);
    } else {
      body = req.body;
    }

    const { playbookId } = body;

    if (!playbookId) {
      return sendError(res, 400, 'Missing required field: playbookId');
    }

    // Verify document exists and user has access
    const document = await prisma.legalMatterDocument.findUnique({
      where: { id: documentId }
    });

    if (!document) {
      return sendError(res, 404, 'Document not found');
    }

    if (document.organizationId !== authUser.organizationId) {
      return sendError(res, 403, 'Access denied - cross-org violation');
    }

    // Verify playbook exists and user has access
    const playbook = await prisma.contractPlaybook.findUnique({
      where: { id: playbookId },
      include: { rules: { orderBy: { sortOrder: 'asc' } } }
    });

    if (!playbook) {
      return sendError(res, 404, 'Playbook not found');
    }

    if (playbook.organizationId !== authUser.organizationId) {
      return sendError(res, 403, 'Access denied - cross-org violation');
    }

    // Update document status
    await prisma.legalMatterDocument.update({
      where: { id: documentId },
      data: { status: 'ANALYZING' }
    });

    // Run playbook analysis
    const analysisResult = await analyzeWithPlaybook(documentId, playbook, {
      analyzedBy: authUser.id,
      organizationId: authUser.organizationId
    });

    // Update document status
    const newStatus = analysisResult.success ? 'ANALYZED' : 'FAILED';
    await prisma.legalMatterDocument.update({
      where: { id: documentId },
      data: { status: newStatus }
    });

    // Add activity
    await prisma.legalMatterActivity.create({
      data: {
        matterId: document.matterId,
        activityType: 'AI_ANALYSIS',
        content: analysisResult.success
          ? `Playbook analysis completed: ${analysisResult.analysis?.playbookScore}% compliance`
          : `Playbook analysis failed: ${analysisResult.error}`,
        metadata: JSON.stringify({
          analysisId: analysisResult.analysis?.id,
          playbookId,
          playbookScore: analysisResult.analysis?.playbookScore
        }),
        createdBy: authUser.id,
        createdByName: authUser.name
      }
    });

    if (!analysisResult.success) {
      return sendError(res, 500, analysisResult.error || 'Playbook analysis failed');
    }

    sendJson(res, 200, {
      success: true,
      analysis: analysisResult.analysis
    });
  } catch (error) {
    console.error('[LEGAL-DOCS] Error analyzing with playbook:', error);
    sendError(res, 500, 'Failed to analyze with playbook');
  }
}

export default {
  handleListMatterDocuments,
  handleUploadDocument,
  handleGetDocument,
  handleDeleteDocument,
  handleAnalyzeDocument,
  handleGetAnalysis,
  handleAnalyzeWithPlaybook,
  VALID_DOCUMENT_TYPES,
  VALID_STATUSES
};
