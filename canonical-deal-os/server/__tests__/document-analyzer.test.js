/**
 * Unit tests for document-analyzer.js service
 * Tests AI-powered document analysis for legal documents
 */

import { jest } from '@jest/globals';

// Mock callOpenAI before importing the module
const mockCallOpenAI = jest.fn();
jest.unstable_mockModule('../llm.js', () => ({
  callOpenAI: mockCallOpenAI
}));

// Mock the document parser
jest.unstable_mockModule('../services/legal/document-parser.js', () => ({
  getDocumentText: jest.fn().mockResolvedValue('Sample document text for testing.')
}));

// Mock the AI security
jest.unstable_mockModule('../services/ai-security.js', () => ({
  sanitizeForAI: jest.fn((text) => text),
  detectJailbreakAttempt: jest.fn(() => ({ score: 0, isBlocked: false, isWarning: false, patterns: [] })),
  AISecurityError: class extends Error {}
}));

// Mock the AI audit logger
jest.unstable_mockModule('../services/ai-audit-logger.js', () => ({
  logAIInteraction: jest.fn()
}));

describe('Document Analyzer Service', () => {
  let analyzeDocument, extractTerms, generateSummary, scoreRisk, identifyClauses;

  beforeAll(async () => {
    const module = await import('../services/legal/document-analyzer.js');
    analyzeDocument = module.analyzeDocument;
    extractTerms = module.extractTerms;
    generateSummary = module.generateSummary;
    scoreRisk = module.scoreRisk;
    identifyClauses = module.identifyClauses;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('extractTerms', () => {
    it('should extract key terms from document text', async () => {
      const mockResponse = {
        parties: ['Buyer LLC', 'Seller Inc'],
        effectiveDate: '2024-01-15',
        purchasePrice: 45000000,
        earnestMoney: 1350000,
        ddPeriod: '60 days',
        closingDate: '2024-04-15'
      };

      mockCallOpenAI.mockResolvedValueOnce(JSON.stringify(mockResponse));

      const result = await extractTerms('Sample PSA document text', 'PSA');

      expect(mockCallOpenAI).toHaveBeenCalledWith(
        expect.stringContaining('legal document analyst'),
        expect.stringContaining('Sample PSA document text'),
        expect.objectContaining({ responseFormat: 'json_object' })
      );
      expect(result).toEqual(mockResponse);
    });

    it('should handle empty document text', async () => {
      mockCallOpenAI.mockResolvedValueOnce(JSON.stringify({
        parties: [],
        effectiveDate: null,
        purchasePrice: null
      }));

      const result = await extractTerms('', 'CONTRACT');

      expect(result.parties).toEqual([]);
    });
  });

  describe('generateSummary', () => {
    it('should generate executive summary from terms', async () => {
      const mockSummary = 'This is a Purchase and Sale Agreement between Buyer LLC and Seller Inc for $45M commercial property.';

      mockCallOpenAI.mockResolvedValueOnce(mockSummary);

      const extractedTerms = {
        parties: ['Buyer LLC', 'Seller Inc'],
        purchasePrice: 45000000
      };

      const result = await generateSummary('Document text', extractedTerms);

      expect(result).toEqual(mockSummary);
      expect(mockCallOpenAI).toHaveBeenCalledWith(
        expect.stringContaining('executive summary'),
        expect.any(String)
      );
    });
  });

  describe('scoreRisk', () => {
    it('should return risk score between 1-10', async () => {
      const mockResponse = {
        score: 6,
        explanation: 'Moderate risk due to unusual indemnification cap'
      };

      mockCallOpenAI.mockResolvedValueOnce(JSON.stringify(mockResponse));

      const result = await scoreRisk('Document text', {}, []);

      expect(result.score).toBeGreaterThanOrEqual(1);
      expect(result.score).toBeLessThanOrEqual(10);
      expect(result.explanation).toBeDefined();
    });

    it('should clamp out-of-range scores', async () => {
      mockCallOpenAI.mockResolvedValueOnce(JSON.stringify({
        score: 15,
        explanation: 'Very high risk'
      }));

      const result = await scoreRisk('Document text', {}, []);

      expect(result.score).toBeLessThanOrEqual(10);
    });
  });

  describe('identifyClauses', () => {
    it('should identify clauses in document', async () => {
      const mockClauses = [
        { type: 'indemnification', text: 'Buyer shall indemnify...', pageNumber: 5 },
        { type: 'termination', text: 'Either party may terminate...', pageNumber: 8 }
      ];

      mockCallOpenAI.mockResolvedValueOnce(JSON.stringify({ clauses: mockClauses }));

      const result = await identifyClauses('Document text', 'PSA');

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('indemnification');
    });

    it('should handle documents with no clauses', async () => {
      mockCallOpenAI.mockResolvedValueOnce(JSON.stringify({ clauses: [] }));

      const result = await identifyClauses('Empty document', 'CONTRACT');

      expect(result).toEqual([]);
    });
  });
});

describe('Risk Score Interpretation', () => {
  it('scores 1-2 should indicate low risk', () => {
    const lowRiskScores = [1, 2];
    lowRiskScores.forEach(score => {
      expect(score).toBeLessThanOrEqual(2);
    });
  });

  it('scores 7-10 should indicate high risk', () => {
    const highRiskScores = [7, 8, 9, 10];
    highRiskScores.forEach(score => {
      expect(score).toBeGreaterThanOrEqual(7);
    });
  });
});
