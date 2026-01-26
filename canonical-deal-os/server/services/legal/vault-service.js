/**
 * Legal Vault Service
 *
 * Manages bulk document analysis in vaults:
 * - Document indexing and embedding
 * - Semantic search across documents
 * - Natural language query processing
 * - Cross-document comparison
 * - Aggregate report generation
 *
 * Note: This is a simplified version without vector embeddings.
 * For production, integrate with a vector database like Pinecone or pgvector.
 */

import { getPrisma } from "../../db.js";
import { callOpenAI } from "../../llm.js";
import { sanitizeUserInput } from "../ai-security.js";
import { logAIInteraction } from "../ai-audit-logger.js";
import { parseDocument, chunkDocument } from "./document-parser.js";

// Configuration
const VAULT_CONFIG = {
  enabled: process.env.LEGAL_VAULT_ENABLED !== 'false',
  model: process.env.LEGAL_AI_MODEL || 'gpt-4o-mini',
  maxDocumentsPerQuery: parseInt(process.env.LEGAL_MAX_DOCS_PER_QUERY) || 10,
  maxCharsPerDocument: parseInt(process.env.LEGAL_MAX_CHARS_PER_DOC) || 30000,
  debug: process.env.DEBUG_LEGAL_VAULT === 'true',
};

/**
 * Add a document to a vault
 *
 * @param {string} vaultId - Vault ID
 * @param {string} documentId - Document ID to add
 * @param {Object} options - Options
 * @returns {Object} Result
 */
export async function addDocumentToVault(vaultId, documentId, options = {}) {
  const prisma = getPrisma();

  if (VAULT_CONFIG.debug) {
    console.log(`[VAULT-SERVICE] Adding document ${documentId} to vault ${vaultId}`);
  }

  try {
    // Verify document exists
    const document = await prisma.legalMatterDocument.findUnique({
      where: { id: documentId }
    });

    if (!document) {
      return { success: false, error: 'Document not found' };
    }

    // Check if already in vault
    const existing = await prisma.legalVaultDocument.findFirst({
      where: { vaultId, documentId }
    });

    if (existing) {
      return { success: false, error: 'Document already in vault' };
    }

    // Create vault document entry
    const vaultDoc = await prisma.legalVaultDocument.create({
      data: {
        vaultId,
        documentId,
        addedBy: options.addedBy || 'SYSTEM',
        embeddingStatus: 'PENDING'
      }
    });

    // Update vault document count
    await prisma.legalVault.update({
      where: { id: vaultId },
      data: {
        documentCount: { increment: 1 }
      }
    });

    // Process embedding asynchronously (simplified - just mark as ready)
    // In production, this would create vector embeddings
    await prisma.legalVaultDocument.update({
      where: { id: vaultDoc.id },
      data: { embeddingStatus: 'READY' }
    });

    return { success: true, vaultDocument: vaultDoc };
  } catch (error) {
    console.error('[VAULT-SERVICE] Error adding document:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Remove a document from a vault
 */
export async function removeDocumentFromVault(vaultId, documentId) {
  const prisma = getPrisma();

  try {
    const vaultDoc = await prisma.legalVaultDocument.findFirst({
      where: { vaultId, documentId }
    });

    if (!vaultDoc) {
      return { success: false, error: 'Document not found in vault' };
    }

    await prisma.legalVaultDocument.delete({
      where: { id: vaultDoc.id }
    });

    await prisma.legalVault.update({
      where: { id: vaultId },
      data: {
        documentCount: { decrement: 1 }
      }
    });

    return { success: true };
  } catch (error) {
    console.error('[VAULT-SERVICE] Error removing document:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Query vault using natural language
 *
 * @param {string} vaultId - Vault ID
 * @param {string} query - Natural language query
 * @param {Object} options - Query options
 * @returns {Object} Query results
 */
export async function queryVault(vaultId, query, options = {}) {
  const startTime = Date.now();
  const queryId = `vquery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  if (VAULT_CONFIG.debug) {
    console.log(`[VAULT-SERVICE] [${queryId}] Query: "${query.substring(0, 50)}..."`);
  }

  if (!VAULT_CONFIG.enabled) {
    return { success: false, queryId, error: 'Vault service is disabled' };
  }

  const prisma = getPrisma();

  try {
    // Get vault with documents
    const vault = await prisma.legalVault.findUnique({
      where: { id: vaultId },
      include: {
        documents: {
          where: { embeddingStatus: 'READY' },
          include: {
            document: true
          }
        }
      }
    });

    if (!vault) {
      return { success: false, queryId, error: 'Vault not found' };
    }

    if (vault.documents.length === 0) {
      return {
        success: true,
        queryId,
        results: [],
        summary: 'No documents in vault to search.',
        documentHits: 0
      };
    }

    // Limit documents for query
    const docsToSearch = vault.documents.slice(0, VAULT_CONFIG.maxDocumentsPerQuery);

    // Parse and prepare document texts
    const documentTexts = [];
    for (const vd of docsToSearch) {
      try {
        const parseResult = await parseDocument(vd.document.storageKey, vd.document.mimeType);
        if (parseResult.success) {
          documentTexts.push({
            documentId: vd.documentId,
            filename: vd.document.filename,
            documentType: vd.document.documentType,
            text: parseResult.text.substring(0, VAULT_CONFIG.maxCharsPerDocument)
          });
        }
      } catch (e) {
        console.warn(`[VAULT-SERVICE] [${queryId}] Failed to parse document ${vd.documentId}:`, e.message);
      }
    }

    if (documentTexts.length === 0) {
      return {
        success: true,
        queryId,
        results: [],
        summary: 'Could not parse any documents in the vault.',
        documentHits: 0
      };
    }

    // Sanitize query
    const sanitizedQuery = sanitizeUserInput(query);

    // Build context for LLM
    const documentContext = documentTexts.map((d, i) =>
      `=== DOCUMENT ${i + 1}: ${d.filename} (${d.documentType}) ===\n${d.text}`
    ).join('\n\n');

    const prompt = `You are searching through a collection of legal documents to answer a question.

DOCUMENTS IN VAULT:
${documentContext}

USER QUESTION: ${sanitizedQuery}

Search through all documents and provide:
1. Which documents contain relevant information
2. Specific excerpts that answer the question (quote exactly)
3. A synthesized summary of findings

Return JSON:
{
  "results": [
    {
      "documentIndex": 0,
      "filename": "...",
      "relevance": 0.0-1.0,
      "excerpts": ["exact quote 1", "exact quote 2"],
      "summary": "Brief summary of what this doc says about the query"
    }
  ],
  "synthesis": "Overall summary answering the user's question",
  "noResultsReason": "If no results, explain why"
}`;

    const response = await callOpenAI([
      {
        role: 'system',
        content: 'You are a legal document search assistant. Find relevant information across multiple documents and provide accurate citations.'
      },
      { role: 'user', content: prompt }
    ], {
      model: VAULT_CONFIG.model,
      response_format: { type: 'json_object' },
      temperature: 0
    });

    const content = response.choices?.[0]?.message?.content;
    const aiResult = content ? JSON.parse(content) : { results: [], synthesis: 'No results' };

    // Map document indices back to IDs
    const results = (aiResult.results || []).map(r => ({
      documentId: documentTexts[r.documentIndex]?.documentId,
      filename: documentTexts[r.documentIndex]?.filename,
      documentType: documentTexts[r.documentIndex]?.documentType,
      relevance: r.relevance,
      excerpts: r.excerpts,
      summary: r.summary
    })).filter(r => r.documentId);

    // Save query to database
    const savedQuery = await prisma.legalVaultQuery.create({
      data: {
        vaultId,
        organizationId: options.organizationId || vault.organizationId,
        query,
        queryType: options.queryType || 'SEARCH',
        results: JSON.stringify(results),
        summary: aiResult.synthesis || null,
        documentHits: results.length,
        aiModel: VAULT_CONFIG.model,
        latencyMs: Date.now() - startTime,
        queriedBy: options.queriedBy || 'SYSTEM',
        queriedByName: options.queriedByName || null
      }
    });

    // Update vault last analyzed
    await prisma.legalVault.update({
      where: { id: vaultId },
      data: { lastAnalyzedAt: new Date() }
    });

    // Log AI interaction
    await logAIInteraction({
      userId: options.queriedBy || 'SYSTEM',
      organizationId: options.organizationId,
      feature: 'LEGAL_VAULT_QUERY',
      model: VAULT_CONFIG.model,
      inputTokens: Math.ceil(prompt.length / 4),
      outputTokens: Math.ceil((content?.length || 0) / 4),
      latencyMs: Date.now() - startTime,
      metadata: { vaultId, queryId, documentCount: documentTexts.length }
    }).catch(e => console.error('[VAULT-SERVICE] Audit log error:', e));

    if (VAULT_CONFIG.debug) {
      console.log(`[VAULT-SERVICE] [${queryId}] Found ${results.length} hits in ${Date.now() - startTime}ms`);
    }

    return {
      success: true,
      queryId,
      queryDbId: savedQuery.id,
      results,
      summary: aiResult.synthesis,
      documentHits: results.length,
      latencyMs: Date.now() - startTime
    };
  } catch (error) {
    console.error(`[VAULT-SERVICE] [${queryId}] Error:`, error);
    return { success: false, queryId, error: error.message };
  }
}

/**
 * Compare multiple documents
 *
 * @param {string} vaultId - Vault ID
 * @param {string[]} documentIds - Document IDs to compare
 * @param {Object} options - Comparison options
 * @returns {Object} Comparison results
 */
export async function compareDocuments(vaultId, documentIds, options = {}) {
  const startTime = Date.now();
  const compId = `comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  if (VAULT_CONFIG.debug) {
    console.log(`[VAULT-SERVICE] [${compId}] Comparing ${documentIds.length} documents`);
  }

  const prisma = getPrisma();

  try {
    // Get documents
    const documents = await prisma.legalMatterDocument.findMany({
      where: { id: { in: documentIds } }
    });

    if (documents.length < 2) {
      return { success: false, error: 'Need at least 2 documents to compare' };
    }

    // Parse documents
    const documentTexts = [];
    for (const doc of documents) {
      try {
        const parseResult = await parseDocument(doc.storageKey, doc.mimeType);
        if (parseResult.success) {
          documentTexts.push({
            documentId: doc.id,
            filename: doc.filename,
            documentType: doc.documentType,
            text: parseResult.text.substring(0, VAULT_CONFIG.maxCharsPerDocument)
          });
        }
      } catch (e) {
        console.warn(`[VAULT-SERVICE] [${compId}] Failed to parse document ${doc.id}:`, e.message);
      }
    }

    if (documentTexts.length < 2) {
      return { success: false, error: 'Could not parse enough documents for comparison' };
    }

    // Build comparison prompt
    const comparisonCriteria = options.criteria || [
      'key_terms', 'dates', 'amounts', 'parties',
      'indemnification', 'termination', 'liability', 'insurance'
    ];

    const documentContext = documentTexts.map((d, i) =>
      `=== DOCUMENT ${i + 1}: ${d.filename} (${d.documentType}) ===\n${d.text}`
    ).join('\n\n');

    const prompt = `Compare these legal documents across the following dimensions:

COMPARISON CRITERIA: ${comparisonCriteria.join(', ')}

DOCUMENTS:
${documentContext}

For each criterion, analyze how the documents differ. Note:
1. Which document is more favorable (and to whom)
2. Specific differences with exact quotes
3. Missing provisions in each document

Return JSON:
{
  "comparisons": [
    {
      "criterion": "...",
      "summary": "High-level comparison",
      "differences": [
        {
          "aspect": "...",
          "documents": [
            { "documentIndex": 0, "value": "...", "quote": "..." },
            { "documentIndex": 1, "value": "...", "quote": "..." }
          ],
          "analysis": "Which is more favorable and why"
        }
      ]
    }
  ],
  "overallAnalysis": "Summary of key differences and recommendations",
  "recommendedDocument": "Which document is overall more favorable (if applicable)"
}`;

    const response = await callOpenAI([
      {
        role: 'system',
        content: 'You are a legal document comparison expert. Provide precise, actionable comparisons with exact quotes.'
      },
      { role: 'user', content: prompt }
    ], {
      model: VAULT_CONFIG.model,
      response_format: { type: 'json_object' },
      temperature: 0
    });

    const content = response.choices?.[0]?.message?.content;
    const result = content ? JSON.parse(content) : { comparisons: [], overallAnalysis: 'Comparison failed' };

    // Map document indices to IDs
    const mappedComparisons = (result.comparisons || []).map(c => ({
      ...c,
      differences: (c.differences || []).map(d => ({
        ...d,
        documents: (d.documents || []).map(doc => ({
          ...doc,
          documentId: documentTexts[doc.documentIndex]?.documentId,
          filename: documentTexts[doc.documentIndex]?.filename
        }))
      }))
    }));

    // Save as query
    await prisma.legalVaultQuery.create({
      data: {
        vaultId,
        organizationId: options.organizationId,
        query: `Compare documents: ${documentIds.join(', ')}`,
        queryType: 'COMPARISON',
        results: JSON.stringify(mappedComparisons),
        summary: result.overallAnalysis,
        documentHits: documentTexts.length,
        aiModel: VAULT_CONFIG.model,
        latencyMs: Date.now() - startTime,
        queriedBy: options.queriedBy || 'SYSTEM',
        queriedByName: options.queriedByName || null
      }
    });

    if (VAULT_CONFIG.debug) {
      console.log(`[VAULT-SERVICE] [${compId}] Comparison complete in ${Date.now() - startTime}ms`);
    }

    return {
      success: true,
      comparisonId: compId,
      documents: documentTexts.map(d => ({ documentId: d.documentId, filename: d.filename })),
      comparisons: mappedComparisons,
      overallAnalysis: result.overallAnalysis,
      recommendedDocument: result.recommendedDocument,
      latencyMs: Date.now() - startTime
    };
  } catch (error) {
    console.error(`[VAULT-SERVICE] [${compId}] Error:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Generate aggregate report for vault
 *
 * @param {string} vaultId - Vault ID
 * @param {string} reportType - Type of report
 * @param {Object} options - Report options
 * @returns {Object} Generated report
 */
export async function generateAggregateReport(vaultId, reportType, options = {}) {
  const startTime = Date.now();
  const reportId = `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  if (VAULT_CONFIG.debug) {
    console.log(`[VAULT-SERVICE] [${reportId}] Generating ${reportType} report`);
  }

  const prisma = getPrisma();

  try {
    // Get vault with documents and analyses
    const vault = await prisma.legalVault.findUnique({
      where: { id: vaultId },
      include: {
        documents: {
          include: {
            document: {
              include: {
                analyses: {
                  orderBy: { analyzedAt: 'desc' },
                  take: 1
                }
              }
            }
          }
        }
      }
    });

    if (!vault) {
      return { success: false, error: 'Vault not found' };
    }

    // Build report based on type
    let reportContent;
    let reportData;

    switch (reportType) {
      case 'RISK_SUMMARY':
        ({ content: reportContent, data: reportData } = await generateRiskSummaryReport(vault, reportId));
        break;
      case 'TERM_COMPARISON':
        ({ content: reportContent, data: reportData } = await generateTermComparisonReport(vault, reportId));
        break;
      case 'CLAUSE_INVENTORY':
        ({ content: reportContent, data: reportData } = await generateClauseInventoryReport(vault, reportId));
        break;
      default:
        return { success: false, error: `Unknown report type: ${reportType}` };
    }

    if (VAULT_CONFIG.debug) {
      console.log(`[VAULT-SERVICE] [${reportId}] Report generated in ${Date.now() - startTime}ms`);
    }

    return {
      success: true,
      reportId,
      reportType,
      title: `${reportType.replace('_', ' ')} Report - ${vault.name}`,
      content: reportContent,
      data: reportData,
      generatedAt: new Date().toISOString(),
      latencyMs: Date.now() - startTime
    };
  } catch (error) {
    console.error(`[VAULT-SERVICE] [${reportId}] Error:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Generate risk summary report
 */
async function generateRiskSummaryReport(vault, reportId) {
  const documents = vault.documents.map(vd => ({
    filename: vd.document.filename,
    documentType: vd.document.documentType,
    analysis: vd.document.analyses[0] || null
  }));

  // Calculate risk distribution
  const riskDistribution = { low: 0, medium: 0, high: 0, unanalyzed: 0 };
  const riskDetails = [];

  for (const doc of documents) {
    if (!doc.analysis) {
      riskDistribution.unanalyzed++;
      continue;
    }

    const score = doc.analysis.riskScore;
    if (score <= 3) riskDistribution.low++;
    else if (score <= 6) riskDistribution.medium++;
    else riskDistribution.high++;

    riskDetails.push({
      filename: doc.filename,
      documentType: doc.documentType,
      riskScore: score,
      riskExplanation: doc.analysis.riskExplanation
    });
  }

  // Sort by risk score descending
  riskDetails.sort((a, b) => b.riskScore - a.riskScore);

  const content = `# Risk Summary Report: ${vault.name}

## Overview
- **Total Documents**: ${documents.length}
- **High Risk (7-10)**: ${riskDistribution.high}
- **Medium Risk (4-6)**: ${riskDistribution.medium}
- **Low Risk (1-3)**: ${riskDistribution.low}
- **Unanalyzed**: ${riskDistribution.unanalyzed}

## High Risk Documents

${riskDetails.filter(d => d.riskScore >= 7).map(d =>
  `### ${d.filename} (Score: ${d.riskScore}/10)\n${d.riskExplanation}\n`
).join('\n') || 'No high risk documents.'}

## Medium Risk Documents

${riskDetails.filter(d => d.riskScore >= 4 && d.riskScore < 7).map(d =>
  `### ${d.filename} (Score: ${d.riskScore}/10)\n${d.riskExplanation}\n`
).join('\n') || 'No medium risk documents.'}

## Recommendations

1. Review all high-risk documents immediately
2. Consider renegotiation of unfavorable terms
3. Ensure missing clauses are addressed
`;

  return {
    content,
    data: {
      riskDistribution,
      riskDetails,
      averageRisk: riskDetails.length > 0
        ? Math.round(riskDetails.reduce((sum, d) => sum + d.riskScore, 0) / riskDetails.length * 10) / 10
        : null
    }
  };
}

/**
 * Generate term comparison report
 */
async function generateTermComparisonReport(vault, reportId) {
  const documents = vault.documents.map(vd => ({
    filename: vd.document.filename,
    documentType: vd.document.documentType,
    analysis: vd.document.analyses[0] || null
  }));

  const termsComparison = [];

  for (const doc of documents) {
    if (!doc.analysis?.extractedTerms) continue;

    try {
      const terms = JSON.parse(doc.analysis.extractedTerms);
      termsComparison.push({
        filename: doc.filename,
        documentType: doc.documentType,
        parties: terms.parties || [],
        dates: terms.dates || {},
        financial: terms.financial || {}
      });
    } catch (e) {
      // Skip documents with invalid terms
    }
  }

  const content = `# Term Comparison Report: ${vault.name}

## Documents Analyzed: ${termsComparison.length}

## Party Summary

${termsComparison.map(d =>
  `### ${d.filename}\n${d.parties.map(p => `- ${p.name} (${p.role})`).join('\n') || 'No parties identified'}\n`
).join('\n')}

## Key Dates

| Document | Effective | Term Start | Term End |
|----------|-----------|------------|----------|
${termsComparison.map(d =>
  `| ${d.filename} | ${d.dates.effective || 'N/A'} | ${d.dates.termStart || 'N/A'} | ${d.dates.termEnd || 'N/A'} |`
).join('\n')}

## Financial Terms

| Document | Primary Amount | Description |
|----------|----------------|-------------|
${termsComparison.map(d =>
  `| ${d.filename} | ${d.financial.primaryAmount ? '$' + d.financial.primaryAmount.toLocaleString() : 'N/A'} | ${d.financial.primaryAmountLabel || 'N/A'} |`
).join('\n')}
`;

  return {
    content,
    data: { termsComparison }
  };
}

/**
 * Generate clause inventory report
 */
async function generateClauseInventoryReport(vault, reportId) {
  const documents = vault.documents.map(vd => ({
    filename: vd.document.filename,
    documentType: vd.document.documentType,
    analysis: vd.document.analyses[0] || null
  }));

  const clauseInventory = {};
  const missingClausesSummary = {};

  for (const doc of documents) {
    if (!doc.analysis) continue;

    // Identified clauses
    if (doc.analysis.identifiedClauses) {
      try {
        const clauses = JSON.parse(doc.analysis.identifiedClauses);
        for (const clause of clauses) {
          if (!clauseInventory[clause.type]) {
            clauseInventory[clause.type] = [];
          }
          clauseInventory[clause.type].push({
            filename: doc.filename,
            description: clause.description
          });
        }
      } catch (e) { /* skip */ }
    }

    // Missing clauses
    if (doc.analysis.missingClauses) {
      try {
        const missing = JSON.parse(doc.analysis.missingClauses);
        for (const clause of missing) {
          if (!missingClausesSummary[clause.clause]) {
            missingClausesSummary[clause.clause] = [];
          }
          missingClausesSummary[clause.clause].push(doc.filename);
        }
      } catch (e) { /* skip */ }
    }
  }

  const content = `# Clause Inventory Report: ${vault.name}

## Documents Analyzed: ${documents.filter(d => d.analysis).length}

## Identified Clauses by Type

${Object.entries(clauseInventory).map(([type, docs]) =>
  `### ${type}\nFound in ${docs.length} document(s):\n${docs.map(d => `- ${d.filename}: ${d.description || 'N/A'}`).join('\n')}\n`
).join('\n') || 'No clauses identified.'}

## Missing Clauses Summary

${Object.entries(missingClausesSummary).map(([clause, docs]) =>
  `### ${clause}\nMissing from:\n${docs.map(d => `- ${d}`).join('\n')}\n`
).join('\n') || 'No missing clauses identified.'}

## Recommendations

1. Review documents missing critical clauses
2. Consider standardizing clause language across documents
3. Update playbooks based on common patterns
`;

  return {
    content,
    data: {
      clauseInventory,
      missingClausesSummary,
      clauseTypeCount: Object.keys(clauseInventory).length,
      missingClauseTypeCount: Object.keys(missingClausesSummary).length
    }
  };
}

export default {
  addDocumentToVault,
  removeDocumentFromVault,
  queryVault,
  compareDocuments,
  generateAggregateReport,
  VAULT_CONFIG
};
