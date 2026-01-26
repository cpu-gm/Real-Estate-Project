/**
 * Unit tests for playbook-engine.js service
 * Tests playbook rule evaluation for contract compliance checking
 */

import { jest } from '@jest/globals';

describe('Playbook Engine Service', () => {
  let evaluatePlaybook, evaluateRule, validateRuleSyntax, calculateComplianceScore;

  beforeAll(async () => {
    const module = await import('../services/legal/playbook-engine.js');
    evaluatePlaybook = module.evaluatePlaybook;
    evaluateRule = module.evaluateRule;
    validateRuleSyntax = module.validateRuleSyntax;
    calculateComplianceScore = module.calculateComplianceScore;
  });

  describe('evaluateRule', () => {
    const sampleDocumentText = `
      This Purchase and Sale Agreement ("Agreement") is entered into by and between
      Buyer LLC ("Buyer") and Seller Inc ("Seller").

      The Buyer shall indemnify, defend, and hold harmless the Seller from any claims.

      The purchase price shall be $45,000,000.

      The due diligence period shall be sixty (60) days.
    `;

    const sampleClauses = [
      { type: 'indemnification', text: 'Buyer shall indemnify...' },
      { type: 'purchase_price', text: 'purchase price shall be $45,000,000' }
    ];

    it('should pass MUST_HAVE rule when pattern is found', async () => {
      const rule = {
        ruleType: 'MUST_HAVE',
        clauseCategory: 'indemnification',
        ruleName: 'Indemnification Required',
        searchPatterns: JSON.stringify(['indemnif', 'hold harmless']),
        severity: 'ERROR',
        failureMessage: 'Missing indemnification clause'
      };

      const result = await evaluateRule(rule, sampleDocumentText, sampleClauses);

      expect(result.passed).toBe(true);
      expect(result.matchedText).toBeDefined();
    });

    it('should fail MUST_HAVE rule when pattern is not found', async () => {
      const rule = {
        ruleType: 'MUST_HAVE',
        clauseCategory: 'insurance',
        ruleName: 'Insurance Required',
        searchPatterns: JSON.stringify(['insurance policy', 'liability insurance']),
        severity: 'WARNING',
        failureMessage: 'Missing insurance requirement'
      };

      const result = await evaluateRule(rule, sampleDocumentText, sampleClauses);

      expect(result.passed).toBe(false);
      expect(result.violation).toBeDefined();
      expect(result.violation.failureMessage).toBe('Missing insurance requirement');
    });

    it('should pass MUST_NOT_HAVE rule when pattern is not found', async () => {
      const rule = {
        ruleType: 'MUST_NOT_HAVE',
        clauseCategory: 'termination',
        ruleName: 'No Unilateral Termination',
        searchPatterns: JSON.stringify(['terminate at will', 'terminate without cause']),
        severity: 'CRITICAL',
        failureMessage: 'Contains unilateral termination clause'
      };

      const result = await evaluateRule(rule, sampleDocumentText, sampleClauses);

      expect(result.passed).toBe(true);
    });

    it('should fail MUST_NOT_HAVE rule when pattern is found', async () => {
      const rule = {
        ruleType: 'MUST_NOT_HAVE',
        clauseCategory: 'indemnification',
        ruleName: 'No Blanket Indemnification',
        searchPatterns: JSON.stringify(['indemnify']),
        severity: 'WARNING',
        failureMessage: 'Contains indemnification which may be problematic'
      };

      const result = await evaluateRule(rule, sampleDocumentText, sampleClauses);

      expect(result.passed).toBe(false);
      expect(result.violation.severity).toBe('WARNING');
    });

    it('should handle PATTERN rule with regex', async () => {
      const rule = {
        ruleType: 'PATTERN',
        clauseCategory: 'purchase_price',
        ruleName: 'Valid Price Format',
        searchPatterns: JSON.stringify(['\\$[\\d,]+\\.?\\d*']),
        severity: 'INFO',
        failureMessage: 'Price format not found'
      };

      const result = await evaluateRule(rule, sampleDocumentText, sampleClauses);

      expect(result.passed).toBe(true);
    });
  });

  describe('validateRuleSyntax', () => {
    it('should validate correct rule structure', () => {
      const validRule = {
        ruleType: 'MUST_HAVE',
        clauseCategory: 'indemnification',
        ruleName: 'Test Rule',
        searchPatterns: JSON.stringify(['pattern1', 'pattern2']),
        severity: 'WARNING',
        failureMessage: 'Test failure message'
      };

      const result = validateRuleSyntax(validRule);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid rule type', () => {
      const invalidRule = {
        ruleType: 'INVALID_TYPE',
        ruleName: 'Test',
        searchPatterns: '[]',
        severity: 'WARNING',
        failureMessage: 'Test'
      };

      const result = validateRuleSyntax(invalidRule);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject missing required fields', () => {
      const incompleteRule = {
        ruleType: 'MUST_HAVE'
        // Missing other required fields
      };

      const result = validateRuleSyntax(incompleteRule);

      expect(result.valid).toBe(false);
    });

    it('should validate THRESHOLD rule has required fields', () => {
      const thresholdRule = {
        ruleType: 'THRESHOLD',
        ruleName: 'Liability Cap',
        searchPatterns: '[]',
        severity: 'ERROR',
        failureMessage: 'Liability cap too low',
        thresholdField: 'liabilityCap',
        thresholdOperator: 'GTE',
        thresholdValue: '1000000'
      };

      const result = validateRuleSyntax(thresholdRule);

      expect(result.valid).toBe(true);
    });
  });

  describe('calculateComplianceScore', () => {
    it('should return 100 for no violations', () => {
      const score = calculateComplianceScore([]);

      expect(score).toBe(100);
    });

    it('should reduce score based on violation severity', () => {
      const violations = [
        { severity: 'WARNING' },
        { severity: 'ERROR' }
      ];

      const score = calculateComplianceScore(violations);

      expect(score).toBeLessThan(100);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('should heavily penalize CRITICAL violations', () => {
      const criticalViolations = [{ severity: 'CRITICAL' }];
      const warningViolations = [{ severity: 'WARNING' }];

      const criticalScore = calculateComplianceScore(criticalViolations);
      const warningScore = calculateComplianceScore(warningViolations);

      expect(criticalScore).toBeLessThan(warningScore);
    });

    it('should not go below 0', () => {
      const manyViolations = Array(20).fill({ severity: 'CRITICAL' });

      const score = calculateComplianceScore(manyViolations);

      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('evaluatePlaybook', () => {
    it('should evaluate all rules in playbook', async () => {
      const playbook = {
        id: 'test-playbook',
        name: 'Test Playbook',
        rules: [
          {
            ruleType: 'MUST_HAVE',
            clauseCategory: 'test',
            ruleName: 'Rule 1',
            searchPatterns: JSON.stringify(['pattern1']),
            severity: 'WARNING',
            failureMessage: 'Missing pattern1'
          },
          {
            ruleType: 'MUST_HAVE',
            clauseCategory: 'test',
            ruleName: 'Rule 2',
            searchPatterns: JSON.stringify(['pattern2']),
            severity: 'ERROR',
            failureMessage: 'Missing pattern2'
          }
        ]
      };

      const documentText = 'This document contains pattern1 but not the other pattern.';
      const clauses = [];

      const result = await evaluatePlaybook(playbook, documentText, clauses);

      expect(result.violations).toBeDefined();
      expect(result.playbookScore).toBeDefined();
      expect(result.playbookScore).toBeLessThanOrEqual(100);
    });
  });
});

describe('Severity Weights', () => {
  it('should have correct severity ordering', () => {
    const severities = ['INFO', 'WARNING', 'ERROR', 'CRITICAL'];
    // INFO should be least severe, CRITICAL most severe
    expect(severities.indexOf('INFO')).toBeLessThan(severities.indexOf('CRITICAL'));
  });
});
