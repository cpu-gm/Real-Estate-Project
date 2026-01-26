/**
 * Unit tests for vault-service.js
 * Tests bulk document analysis and querying for legal vaults
 */

import { jest } from '@jest/globals';

// Mock Prisma
const mockPrisma = {
  legalVault: {
    findUnique: jest.fn(),
    update: jest.fn()
  },
  legalVaultDocument: {
    create: jest.fn(),
    findMany: jest.fn(),
    delete: jest.fn()
  },
  legalVaultQuery: {
    create: jest.fn(),
    findMany: jest.fn()
  },
  legalMatterDocument: {
    findUnique: jest.fn()
  }
};

jest.unstable_mockModule('../prisma.js', () => ({
  default: mockPrisma
}));

// Mock callOpenAI
const mockCallOpenAI = jest.fn();
jest.unstable_mockModule('../llm.js', () => ({
  callOpenAI: mockCallOpenAI
}));

// Mock document parser
jest.unstable_mockModule('../services/legal/document-parser.js', () => ({
  getDocumentText: jest.fn().mockResolvedValue('Sample document content')
}));

describe('Vault Service', () => {
  let queryVault, compareDocuments, generateAggregateReport;

  beforeAll(async () => {
    const module = await import('../services/legal/vault-service.js');
    queryVault = module.queryVault;
    compareDocuments = module.compareDocuments;
    generateAggregateReport = module.generateAggregateReport;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('queryVault', () => {
    it('should query across vault documents and return results', async () => {
      // Setup mock data
      mockPrisma.legalVault.findUnique.mockResolvedValue({
        id: 'vault-1',
        organizationId: 'org-1',
        name: 'Test Vault'
      });

      mockPrisma.legalVaultDocument.findMany.mockResolvedValue([
        {
          documentId: 'doc-1',
          document: {
            id: 'doc-1',
            filename: 'contract1.pdf',
            documentType: 'PSA',
            storageKey: 'path/to/doc1.pdf'
          }
        },
        {
          documentId: 'doc-2',
          document: {
            id: 'doc-2',
            filename: 'contract2.pdf',
            documentType: 'LEASE',
            storageKey: 'path/to/doc2.pdf'
          }
        }
      ]);

      mockCallOpenAI.mockResolvedValue(JSON.stringify({
        results: [
          {
            documentId: 'doc-1',
            documentTitle: 'contract1.pdf',
            relevanceScore: 0.9,
            excerpts: [{ text: 'Indemnification clause found here', pageNumber: 5 }]
          }
        ],
        summary: 'Found indemnification clauses in 1 document'
      }));

      mockPrisma.legalVaultQuery.create.mockResolvedValue({
        id: 'query-1'
      });

      const result = await queryVault('vault-1', 'Find indemnification clauses', {
        organizationId: 'org-1',
        userId: 'user-1',
        userName: 'Test User'
      });

      expect(result.results).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(mockCallOpenAI).toHaveBeenCalled();
    });

    it('should handle empty vault gracefully', async () => {
      mockPrisma.legalVault.findUnique.mockResolvedValue({
        id: 'vault-1',
        organizationId: 'org-1',
        name: 'Empty Vault'
      });

      mockPrisma.legalVaultDocument.findMany.mockResolvedValue([]);

      const result = await queryVault('vault-1', 'Any query', {
        organizationId: 'org-1',
        userId: 'user-1'
      });

      expect(result.results).toEqual([]);
      expect(result.documentHits).toBe(0);
    });
  });

  describe('compareDocuments', () => {
    it('should compare specified documents on given criteria', async () => {
      mockPrisma.legalVault.findUnique.mockResolvedValue({
        id: 'vault-1',
        organizationId: 'org-1'
      });

      mockPrisma.legalMatterDocument.findUnique.mockResolvedValue({
        id: 'doc-1',
        filename: 'doc1.pdf',
        storageKey: 'path/doc1.pdf'
      });

      mockCallOpenAI.mockResolvedValue(JSON.stringify({
        comparison: [
          {
            criterion: 'Purchase Price',
            documents: {
              'doc-1': '$45M',
              'doc-2': '$50M'
            },
            notes: 'Doc-2 has higher price'
          }
        ],
        summary: 'Two documents compared on price'
      }));

      const result = await compareDocuments(
        'vault-1',
        ['doc-1', 'doc-2'],
        ['Purchase Price', 'DD Period'],
        { organizationId: 'org-1' }
      );

      expect(result.comparison).toBeDefined();
      expect(result.summary).toBeDefined();
    });
  });

  describe('generateAggregateReport', () => {
    it('should generate RISK_SUMMARY report', async () => {
      mockPrisma.legalVault.findUnique.mockResolvedValue({
        id: 'vault-1',
        organizationId: 'org-1'
      });

      mockPrisma.legalVaultDocument.findMany.mockResolvedValue([
        {
          documentId: 'doc-1',
          document: {
            id: 'doc-1',
            filename: 'doc1.pdf',
            analyses: [{ riskScore: 5, riskExplanation: 'Moderate risk' }]
          }
        },
        {
          documentId: 'doc-2',
          document: {
            id: 'doc-2',
            filename: 'doc2.pdf',
            analyses: [{ riskScore: 8, riskExplanation: 'High risk' }]
          }
        }
      ]);

      mockCallOpenAI.mockResolvedValue(JSON.stringify({
        averageRisk: 6.5,
        highRiskCount: 1,
        riskDistribution: { low: 0, medium: 1, high: 1 },
        summary: 'Vault contains moderate to high risk documents'
      }));

      const result = await generateAggregateReport('vault-1', 'RISK_SUMMARY', {
        organizationId: 'org-1'
      });

      expect(result.reportType).toBe('RISK_SUMMARY');
      expect(result.data).toBeDefined();
    });

    it('should generate TERM_COMPARISON report', async () => {
      mockPrisma.legalVault.findUnique.mockResolvedValue({
        id: 'vault-1',
        organizationId: 'org-1'
      });

      mockPrisma.legalVaultDocument.findMany.mockResolvedValue([
        {
          document: {
            filename: 'doc1.pdf',
            analyses: [{ extractedTerms: JSON.stringify({ purchasePrice: 45000000 }) }]
          }
        }
      ]);

      mockCallOpenAI.mockResolvedValue(JSON.stringify({
        terms: [
          { termName: 'Purchase Price', values: [{ doc: 'doc1.pdf', value: '$45M' }] }
        ]
      }));

      const result = await generateAggregateReport('vault-1', 'TERM_COMPARISON', {
        organizationId: 'org-1'
      });

      expect(result.reportType).toBe('TERM_COMPARISON');
    });

    it('should generate CLAUSE_INVENTORY report', async () => {
      mockPrisma.legalVault.findUnique.mockResolvedValue({
        id: 'vault-1',
        organizationId: 'org-1'
      });

      mockPrisma.legalVaultDocument.findMany.mockResolvedValue([
        {
          document: {
            filename: 'doc1.pdf',
            analyses: [{
              identifiedClauses: JSON.stringify([
                { type: 'indemnification' },
                { type: 'termination' }
              ])
            }]
          }
        }
      ]);

      mockCallOpenAI.mockResolvedValue(JSON.stringify({
        clauseTypes: ['indemnification', 'termination'],
        inventory: [
          { type: 'indemnification', count: 1, documents: ['doc1.pdf'] }
        ]
      }));

      const result = await generateAggregateReport('vault-1', 'CLAUSE_INVENTORY', {
        organizationId: 'org-1'
      });

      expect(result.reportType).toBe('CLAUSE_INVENTORY');
    });

    it('should reject invalid report type', async () => {
      await expect(
        generateAggregateReport('vault-1', 'INVALID_REPORT', { organizationId: 'org-1' })
      ).rejects.toThrow();
    });
  });
});

describe('Report Types', () => {
  const validReportTypes = ['RISK_SUMMARY', 'TERM_COMPARISON', 'CLAUSE_INVENTORY'];

  it('should have defined report types', () => {
    expect(validReportTypes).toContain('RISK_SUMMARY');
    expect(validReportTypes).toContain('TERM_COMPARISON');
    expect(validReportTypes).toContain('CLAUSE_INVENTORY');
  });
});
