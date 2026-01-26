/**
 * Legal Playbook API Routes
 *
 * Provides CRUD operations for contract playbooks and rules.
 * All routes require GP Counsel or General Counsel role.
 *
 * Routes:
 *   GET    /api/legal/playbooks              - List playbooks
 *   POST   /api/legal/playbooks              - Create playbook
 *   GET    /api/legal/playbooks/:id          - Get playbook with rules
 *   PATCH  /api/legal/playbooks/:id          - Update playbook
 *   DELETE /api/legal/playbooks/:id          - Delete playbook
 *   POST   /api/legal/playbooks/:id/rules    - Add rule
 *   PATCH  /api/legal/playbooks/:id/rules/:ruleId - Update rule
 *   DELETE /api/legal/playbooks/:id/rules/:ruleId - Delete rule
 *   POST   /api/legal/playbooks/:id/test     - Test against sample doc
 */

import { getPrisma } from "../db.js";
import {
  requireGPCounsel,
  sendJson,
  sendError,
  logPermissionAction,
  AUDIT_ACTIONS
} from "../middleware/auth.js";
import {
  evaluatePlaybook,
  validateRuleSyntax,
  suggestRulesForDocType,
  RULE_TYPES,
  SEVERITIES,
  CLAUSE_CATEGORIES
} from "../services/legal/playbook-engine.js";
import { parseDocument } from "../services/legal/document-parser.js";

// Valid playbook statuses
const VALID_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'];

// Valid document types for playbooks
const VALID_DOCUMENT_TYPES = [
  'CONTRACT', 'LEASE', 'SUBLEASE', 'AMENDMENT', 'SIDE_LETTER',
  'PSA', 'LOI', 'OPERATING_AGREEMENT', 'LOAN_AGREEMENT', 'GUARANTY',
  'ESTOPPEL', 'SNDA', 'OTHER'
];

/**
 * GET /api/legal/playbooks - List playbooks
 */
export async function handleListPlaybooks(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();
  const url = new URL(req.url, `http://${req.headers.host}`);

  const status = url.searchParams.get('status');
  const documentType = url.searchParams.get('documentType');

  try {
    const where = {
      organizationId: authUser.organizationId
    };

    if (status && VALID_STATUSES.includes(status)) {
      where.status = status;
    }

    const playbooks = await prisma.contractPlaybook.findMany({
      where,
      include: {
        _count: {
          select: { rules: true }
        }
      },
      orderBy: [
        { status: 'asc' }, // ACTIVE first, then DRAFT, then ARCHIVED
        { name: 'asc' }
      ]
    });

    // Filter by document type if specified
    let filtered = playbooks;
    if (documentType) {
      filtered = playbooks.filter(p => {
        const types = JSON.parse(p.documentTypes || '[]');
        return types.includes(documentType);
      });
    }

    // Transform for response
    const response = filtered.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      documentTypes: JSON.parse(p.documentTypes || '[]'),
      status: p.status,
      version: p.version,
      ruleCount: p._count.rules,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      createdBy: p.createdBy,
      createdByName: p.createdByName
    }));

    sendJson(res, 200, { playbooks: response, count: response.length });
  } catch (error) {
    console.error('[LEGAL-PLAYBOOK] Error listing playbooks:', error);
    sendError(res, 500, 'Failed to list playbooks');
  }
}

/**
 * POST /api/legal/playbooks - Create playbook
 */
export async function handleCreatePlaybook(req, res) {
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

    const { name, description, documentTypes, status } = body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return sendError(res, 400, 'name is required');
    }

    if (!documentTypes || !Array.isArray(documentTypes) || documentTypes.length === 0) {
      return sendError(res, 400, 'documentTypes must be a non-empty array');
    }

    // Validate document types
    for (const dt of documentTypes) {
      if (!VALID_DOCUMENT_TYPES.includes(dt)) {
        return sendError(res, 400, `Invalid documentType: ${dt}. Must be one of: ${VALID_DOCUMENT_TYPES.join(', ')}`);
      }
    }

    // Check for duplicate name
    const existing = await prisma.contractPlaybook.findFirst({
      where: {
        organizationId: authUser.organizationId,
        name: name.trim()
      }
    });

    if (existing) {
      return sendError(res, 409, 'A playbook with this name already exists');
    }

    // Create playbook
    const playbook = await prisma.contractPlaybook.create({
      data: {
        organizationId: authUser.organizationId,
        name: name.trim(),
        description: description || null,
        documentTypes: JSON.stringify(documentTypes),
        status: status && VALID_STATUSES.includes(status) ? status : 'DRAFT',
        version: 1,
        createdBy: authUser.id,
        createdByName: authUser.name
      }
    });

    // Log action
    await logPermissionAction({
      actorId: authUser.id,
      actorRole: authUser.role,
      action: 'PLAYBOOK_CREATE',
      resourceType: 'ContractPlaybook',
      resourceId: playbook.id,
      organizationId: authUser.organizationId,
      metadata: { name: playbook.name }
    });

    sendJson(res, 201, {
      playbook: {
        ...playbook,
        documentTypes: JSON.parse(playbook.documentTypes)
      }
    });
  } catch (error) {
    console.error('[LEGAL-PLAYBOOK] Error creating playbook:', error);
    sendError(res, 500, 'Failed to create playbook');
  }
}

/**
 * GET /api/legal/playbooks/:id - Get playbook with rules
 */
export async function handleGetPlaybook(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();
  const playbookId = req.params.id;

  try {
    const playbook = await prisma.contractPlaybook.findUnique({
      where: { id: playbookId },
      include: {
        rules: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    });

    if (!playbook) {
      return sendError(res, 404, 'Playbook not found');
    }

    if (playbook.organizationId !== authUser.organizationId) {
      return sendError(res, 403, 'Access denied - cross-org violation');
    }

    // Transform rules
    const rules = playbook.rules.map(r => ({
      ...r,
      searchPatterns: JSON.parse(r.searchPatterns || '[]'),
      antiPatterns: r.antiPatterns ? JSON.parse(r.antiPatterns) : null
    }));

    sendJson(res, 200, {
      playbook: {
        ...playbook,
        documentTypes: JSON.parse(playbook.documentTypes),
        rules
      }
    });
  } catch (error) {
    console.error('[LEGAL-PLAYBOOK] Error getting playbook:', error);
    sendError(res, 500, 'Failed to get playbook');
  }
}

/**
 * PATCH /api/legal/playbooks/:id - Update playbook
 */
export async function handleUpdatePlaybook(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();
  const playbookId = req.params.id;

  try {
    let body;
    if (typeof req.body === 'string') {
      body = JSON.parse(req.body);
    } else {
      body = req.body;
    }

    // Verify access
    const existing = await prisma.contractPlaybook.findUnique({
      where: { id: playbookId }
    });

    if (!existing) {
      return sendError(res, 404, 'Playbook not found');
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

    if (body.documentTypes !== undefined) {
      if (!Array.isArray(body.documentTypes) || body.documentTypes.length === 0) {
        return sendError(res, 400, 'documentTypes must be a non-empty array');
      }
      for (const dt of body.documentTypes) {
        if (!VALID_DOCUMENT_TYPES.includes(dt)) {
          return sendError(res, 400, `Invalid documentType: ${dt}`);
        }
      }
      updateData.documentTypes = JSON.stringify(body.documentTypes);
    }

    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        return sendError(res, 400, `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
      }
      updateData.status = body.status;
    }

    // Increment version on significant changes
    if (updateData.documentTypes || Object.keys(updateData).length > 1) {
      updateData.version = existing.version + 1;
    }

    const playbook = await prisma.contractPlaybook.update({
      where: { id: playbookId },
      data: updateData
    });

    sendJson(res, 200, {
      playbook: {
        ...playbook,
        documentTypes: JSON.parse(playbook.documentTypes)
      }
    });
  } catch (error) {
    console.error('[LEGAL-PLAYBOOK] Error updating playbook:', error);
    sendError(res, 500, 'Failed to update playbook');
  }
}

/**
 * DELETE /api/legal/playbooks/:id - Delete playbook
 */
export async function handleDeletePlaybook(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();
  const playbookId = req.params.id;

  try {
    const existing = await prisma.contractPlaybook.findUnique({
      where: { id: playbookId }
    });

    if (!existing) {
      return sendError(res, 404, 'Playbook not found');
    }

    if (existing.organizationId !== authUser.organizationId) {
      return sendError(res, 403, 'Access denied - cross-org violation');
    }

    // Delete playbook (cascades to rules)
    await prisma.contractPlaybook.delete({
      where: { id: playbookId }
    });

    // Log action
    await logPermissionAction({
      actorId: authUser.id,
      actorRole: authUser.role,
      action: 'PLAYBOOK_DELETE',
      resourceType: 'ContractPlaybook',
      resourceId: playbookId,
      organizationId: authUser.organizationId,
      metadata: { name: existing.name }
    });

    sendJson(res, 200, { success: true, message: 'Playbook deleted' });
  } catch (error) {
    console.error('[LEGAL-PLAYBOOK] Error deleting playbook:', error);
    sendError(res, 500, 'Failed to delete playbook');
  }
}

/**
 * POST /api/legal/playbooks/:id/rules - Add rule
 */
export async function handleAddRule(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();
  const playbookId = req.params.id;

  try {
    let body;
    if (typeof req.body === 'string') {
      body = JSON.parse(req.body);
    } else {
      body = req.body;
    }

    // Verify playbook access
    const playbook = await prisma.contractPlaybook.findUnique({
      where: { id: playbookId },
      include: { rules: true }
    });

    if (!playbook) {
      return sendError(res, 404, 'Playbook not found');
    }

    if (playbook.organizationId !== authUser.organizationId) {
      return sendError(res, 403, 'Access denied - cross-org violation');
    }

    // Validate rule syntax
    const validation = validateRuleSyntax(body);
    if (!validation.valid) {
      return sendError(res, 400, `Invalid rule: ${validation.errors.join(', ')}`);
    }

    // Determine sort order
    const maxSortOrder = playbook.rules.reduce((max, r) => Math.max(max, r.sortOrder), 0);

    // Create rule
    const rule = await prisma.playbookRule.create({
      data: {
        playbookId,
        ruleType: body.ruleType,
        clauseCategory: body.clauseCategory,
        ruleName: body.ruleName,
        ruleDescription: body.ruleDescription || null,
        searchPatterns: JSON.stringify(
          Array.isArray(body.searchPatterns) ? body.searchPatterns : [body.searchPatterns]
        ),
        exampleText: body.exampleText || null,
        antiPatterns: body.antiPatterns
          ? JSON.stringify(Array.isArray(body.antiPatterns) ? body.antiPatterns : [body.antiPatterns])
          : null,
        severity: body.severity,
        failureMessage: body.failureMessage,
        suggestedFix: body.suggestedFix || null,
        thresholdField: body.thresholdField || null,
        thresholdOperator: body.thresholdOperator || null,
        thresholdValue: body.thresholdValue || null,
        sortOrder: body.sortOrder ?? (maxSortOrder + 1)
      }
    });

    // Increment playbook version
    await prisma.contractPlaybook.update({
      where: { id: playbookId },
      data: { version: playbook.version + 1 }
    });

    sendJson(res, 201, {
      rule: {
        ...rule,
        searchPatterns: JSON.parse(rule.searchPatterns),
        antiPatterns: rule.antiPatterns ? JSON.parse(rule.antiPatterns) : null
      }
    });
  } catch (error) {
    console.error('[LEGAL-PLAYBOOK] Error adding rule:', error);
    sendError(res, 500, 'Failed to add rule');
  }
}

/**
 * PATCH /api/legal/playbooks/:id/rules/:ruleId - Update rule
 */
export async function handleUpdateRule(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();
  const { id: playbookId, ruleId } = req.params;

  try {
    let body;
    if (typeof req.body === 'string') {
      body = JSON.parse(req.body);
    } else {
      body = req.body;
    }

    // Verify playbook access
    const playbook = await prisma.contractPlaybook.findUnique({
      where: { id: playbookId }
    });

    if (!playbook) {
      return sendError(res, 404, 'Playbook not found');
    }

    if (playbook.organizationId !== authUser.organizationId) {
      return sendError(res, 403, 'Access denied - cross-org violation');
    }

    // Verify rule exists
    const existingRule = await prisma.playbookRule.findUnique({
      where: { id: ruleId }
    });

    if (!existingRule || existingRule.playbookId !== playbookId) {
      return sendError(res, 404, 'Rule not found');
    }

    // Build update data
    const updateData = {};

    if (body.ruleType !== undefined) {
      if (!RULE_TYPES.includes(body.ruleType)) {
        return sendError(res, 400, `Invalid ruleType. Must be one of: ${RULE_TYPES.join(', ')}`);
      }
      updateData.ruleType = body.ruleType;
    }

    if (body.clauseCategory !== undefined) {
      if (!CLAUSE_CATEGORIES.includes(body.clauseCategory)) {
        return sendError(res, 400, `Invalid clauseCategory`);
      }
      updateData.clauseCategory = body.clauseCategory;
    }

    if (body.ruleName !== undefined) {
      updateData.ruleName = body.ruleName;
    }

    if (body.ruleDescription !== undefined) {
      updateData.ruleDescription = body.ruleDescription;
    }

    if (body.searchPatterns !== undefined) {
      updateData.searchPatterns = JSON.stringify(
        Array.isArray(body.searchPatterns) ? body.searchPatterns : [body.searchPatterns]
      );
    }

    if (body.exampleText !== undefined) {
      updateData.exampleText = body.exampleText;
    }

    if (body.antiPatterns !== undefined) {
      updateData.antiPatterns = body.antiPatterns
        ? JSON.stringify(Array.isArray(body.antiPatterns) ? body.antiPatterns : [body.antiPatterns])
        : null;
    }

    if (body.severity !== undefined) {
      if (!SEVERITIES.includes(body.severity)) {
        return sendError(res, 400, `Invalid severity. Must be one of: ${SEVERITIES.join(', ')}`);
      }
      updateData.severity = body.severity;
    }

    if (body.failureMessage !== undefined) {
      updateData.failureMessage = body.failureMessage;
    }

    if (body.suggestedFix !== undefined) {
      updateData.suggestedFix = body.suggestedFix;
    }

    if (body.thresholdField !== undefined) {
      updateData.thresholdField = body.thresholdField;
    }

    if (body.thresholdOperator !== undefined) {
      updateData.thresholdOperator = body.thresholdOperator;
    }

    if (body.thresholdValue !== undefined) {
      updateData.thresholdValue = body.thresholdValue;
    }

    if (body.sortOrder !== undefined) {
      updateData.sortOrder = body.sortOrder;
    }

    const rule = await prisma.playbookRule.update({
      where: { id: ruleId },
      data: updateData
    });

    // Increment playbook version
    await prisma.contractPlaybook.update({
      where: { id: playbookId },
      data: { version: playbook.version + 1 }
    });

    sendJson(res, 200, {
      rule: {
        ...rule,
        searchPatterns: JSON.parse(rule.searchPatterns),
        antiPatterns: rule.antiPatterns ? JSON.parse(rule.antiPatterns) : null
      }
    });
  } catch (error) {
    console.error('[LEGAL-PLAYBOOK] Error updating rule:', error);
    sendError(res, 500, 'Failed to update rule');
  }
}

/**
 * DELETE /api/legal/playbooks/:id/rules/:ruleId - Delete rule
 */
export async function handleDeleteRule(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();
  const { id: playbookId, ruleId } = req.params;

  try {
    // Verify playbook access
    const playbook = await prisma.contractPlaybook.findUnique({
      where: { id: playbookId }
    });

    if (!playbook) {
      return sendError(res, 404, 'Playbook not found');
    }

    if (playbook.organizationId !== authUser.organizationId) {
      return sendError(res, 403, 'Access denied - cross-org violation');
    }

    // Verify rule exists
    const rule = await prisma.playbookRule.findUnique({
      where: { id: ruleId }
    });

    if (!rule || rule.playbookId !== playbookId) {
      return sendError(res, 404, 'Rule not found');
    }

    // Delete rule
    await prisma.playbookRule.delete({
      where: { id: ruleId }
    });

    // Increment playbook version
    await prisma.contractPlaybook.update({
      where: { id: playbookId },
      data: { version: playbook.version + 1 }
    });

    sendJson(res, 200, { success: true, message: 'Rule deleted' });
  } catch (error) {
    console.error('[LEGAL-PLAYBOOK] Error deleting rule:', error);
    sendError(res, 500, 'Failed to delete rule');
  }
}

/**
 * POST /api/legal/playbooks/:id/test - Test playbook against document
 */
export async function handleTestPlaybook(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const prisma = getPrisma();
  const playbookId = req.params.id;

  try {
    let body;
    if (typeof req.body === 'string') {
      body = JSON.parse(req.body);
    } else {
      body = req.body;
    }

    const { documentId, documentText } = body;

    if (!documentId && !documentText) {
      return sendError(res, 400, 'Either documentId or documentText is required');
    }

    // Get playbook with rules
    const playbook = await prisma.contractPlaybook.findUnique({
      where: { id: playbookId },
      include: {
        rules: { orderBy: { sortOrder: 'asc' } }
      }
    });

    if (!playbook) {
      return sendError(res, 404, 'Playbook not found');
    }

    if (playbook.organizationId !== authUser.organizationId) {
      return sendError(res, 403, 'Access denied - cross-org violation');
    }

    // Get document text
    let text = documentText;
    if (documentId && !text) {
      const document = await prisma.legalMatterDocument.findUnique({
        where: { id: documentId }
      });

      if (!document) {
        return sendError(res, 404, 'Document not found');
      }

      if (document.organizationId !== authUser.organizationId) {
        return sendError(res, 403, 'Access denied - cross-org violation');
      }

      const parseResult = await parseDocument(document.storageKey, document.mimeType);
      if (!parseResult.success) {
        return sendError(res, 500, `Failed to parse document: ${parseResult.error}`);
      }
      text = parseResult.text;
    }

    // Evaluate playbook
    const result = await evaluatePlaybook(playbook, text);

    sendJson(res, 200, { result });
  } catch (error) {
    console.error('[LEGAL-PLAYBOOK] Error testing playbook:', error);
    sendError(res, 500, 'Failed to test playbook');
  }
}

/**
 * GET /api/legal/playbooks/suggestions/:documentType - Get rule suggestions
 */
export async function handleGetSuggestions(req, res) {
  const authUser = await requireGPCounsel(req, res);
  if (!authUser) return;

  const documentType = req.params.documentType;

  if (!VALID_DOCUMENT_TYPES.includes(documentType)) {
    return sendError(res, 400, `Invalid documentType. Must be one of: ${VALID_DOCUMENT_TYPES.join(', ')}`);
  }

  const suggestions = suggestRulesForDocType(documentType);

  sendJson(res, 200, {
    documentType,
    suggestions,
    ruleTypes: RULE_TYPES,
    severities: SEVERITIES,
    clauseCategories: CLAUSE_CATEGORIES
  });
}

export default {
  handleListPlaybooks,
  handleCreatePlaybook,
  handleGetPlaybook,
  handleUpdatePlaybook,
  handleDeletePlaybook,
  handleAddRule,
  handleUpdateRule,
  handleDeleteRule,
  handleTestPlaybook,
  handleGetSuggestions,
  VALID_DOCUMENT_TYPES,
  VALID_STATUSES
};
