/**
 * Playbook Engine Service
 *
 * Executes custom clause checking rules against documents:
 * - Pattern matching (regex + semantic)
 * - Threshold validation
 * - Missing clause detection
 * - Compliance scoring
 *
 * Rule types:
 * - MUST_HAVE: Clause must be present
 * - MUST_NOT_HAVE: Clause must NOT be present
 * - THRESHOLD: Numeric value must meet condition
 * - PATTERN: Specific pattern matching
 */

import { callOpenAI } from "../../llm.js";
import { sanitizeUserInput } from "../ai-security.js";

// Configuration
const ENGINE_CONFIG = {
  model: process.env.LEGAL_AI_MODEL || 'gpt-4o-mini',
  debug: process.env.DEBUG_PLAYBOOK_ENGINE === 'true',
};

// Valid rule types
export const RULE_TYPES = ['MUST_HAVE', 'MUST_NOT_HAVE', 'THRESHOLD', 'PATTERN'];

// Valid severities
export const SEVERITIES = ['INFO', 'WARNING', 'ERROR', 'CRITICAL'];

// Valid threshold operators
export const THRESHOLD_OPERATORS = ['GT', 'LT', 'GTE', 'LTE', 'EQ'];

// Common clause categories
export const CLAUSE_CATEGORIES = [
  'indemnification',
  'termination',
  'liability_cap',
  'insurance',
  'assignment',
  'default',
  'representations',
  'warranties',
  'confidentiality',
  'dispute_resolution',
  'force_majeure',
  'governing_law',
  'notices',
  'amendment',
  'waiver',
  'severability',
  'entire_agreement',
  'counterparts',
  'rent',
  'security_deposit',
  'maintenance',
  'use_restrictions',
  'common_area',
  'purchase_price',
  'earnest_money',
  'due_diligence',
  'closing',
  'title',
  'environmental',
  'survival',
  'other'
];

/**
 * Evaluate a playbook against document text
 *
 * @param {Object} playbook - Playbook with rules array
 * @param {string} documentText - Document text to analyze
 * @param {Object} clauses - Pre-identified clauses (optional)
 * @returns {Object} Evaluation results
 */
export async function evaluatePlaybook(playbook, documentText, clauses = null) {
  const startTime = Date.now();
  const evalId = `eval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  if (ENGINE_CONFIG.debug) {
    console.log(`[PLAYBOOK-ENGINE] [${evalId}] Evaluating playbook ${playbook.id} with ${playbook.rules?.length || 0} rules`);
  }

  const sanitizedText = sanitizeUserInput(documentText);
  const results = [];
  let passCount = 0;
  let failCount = 0;

  // Evaluate each rule
  for (const rule of (playbook.rules || [])) {
    try {
      const ruleResult = await evaluateRule(rule, sanitizedText, clauses, evalId);
      results.push({
        ruleId: rule.id,
        ruleName: rule.ruleName,
        clauseCategory: rule.clauseCategory,
        ruleType: rule.ruleType,
        severity: rule.severity,
        ...ruleResult
      });

      if (ruleResult.passed) {
        passCount++;
      } else {
        failCount++;
      }
    } catch (error) {
      console.error(`[PLAYBOOK-ENGINE] [${evalId}] Rule ${rule.id} error:`, error.message);
      results.push({
        ruleId: rule.id,
        ruleName: rule.ruleName,
        passed: false,
        violation: {
          failureMessage: error.message,
          severity: rule.severity
        },
        severity: rule.severity
      });
      failCount++;
    }
  }

  // Calculate scores
  const totalRules = passCount + failCount;
  const complianceScore = totalRules > 0 ? Math.round((passCount / totalRules) * 100) : 100;

  // Calculate weighted score (CRITICAL = 4, ERROR = 3, WARNING = 2, INFO = 1)
  const severityWeights = { CRITICAL: 4, ERROR: 3, WARNING: 2, INFO: 1 };
  let weightedPass = 0;
  let weightedTotal = 0;

  for (const result of results) {
    const weight = severityWeights[result.severity] || 1;
    weightedTotal += weight;
    if (result.passed) {
      weightedPass += weight;
    }
  }

  const weightedScore = weightedTotal > 0 ? Math.round((weightedPass / weightedTotal) * 100) : 100;

  const latencyMs = Date.now() - startTime;

  if (ENGINE_CONFIG.debug) {
    console.log(`[PLAYBOOK-ENGINE] [${evalId}] Complete: ${complianceScore}% (weighted: ${weightedScore}%), ${latencyMs}ms`);
  }

  // Extract violations for summary
  const violations = results.filter(r => !r.passed);

  return {
    evalId,
    playbookId: playbook.id,
    playbookName: playbook.name,
    results,
    violations,  // Add violations array for tests
    playbookScore: complianceScore,  // Add playbookScore alias for tests
    summary: {
      passCount,
      failCount,
      totalRules,
      complianceScore,
      weightedScore,
      criticalViolations: results.filter(r => !r.passed && r.severity === 'CRITICAL').length,
      errorViolations: results.filter(r => !r.passed && r.severity === 'ERROR').length,
      warningViolations: results.filter(r => !r.passed && r.severity === 'WARNING').length,
      infoViolations: results.filter(r => !r.passed && r.severity === 'INFO').length
    },
    latencyMs
  };
}

/**
 * Evaluate a single rule against document text
 *
 * @param {Object} rule - Rule to evaluate
 * @param {string} text - Document text
 * @param {Object} clauses - Pre-identified clauses (optional)
 * @param {string} evalId - Evaluation ID for logging
 * @returns {Object} Rule evaluation result
 */
export async function evaluateRule(rule, text, clauses = null, evalId = 'unknown') {
  if (ENGINE_CONFIG.debug) {
    console.log(`[PLAYBOOK-ENGINE] [${evalId}] Evaluating rule: ${rule.ruleName} (${rule.ruleType})`);
  }

  // Parse patterns from JSON if needed
  let searchPatterns = rule.searchPatterns;
  if (typeof searchPatterns === 'string') {
    try {
      searchPatterns = JSON.parse(searchPatterns);
    } catch {
      searchPatterns = [searchPatterns];
    }
  }

  let antiPatterns = rule.antiPatterns;
  if (typeof antiPatterns === 'string') {
    try {
      antiPatterns = JSON.parse(antiPatterns);
    } catch {
      antiPatterns = antiPatterns ? [antiPatterns] : [];
    }
  }

  // First try regex matching for efficiency
  const regexResult = evaluateWithRegex(rule.ruleType, searchPatterns, antiPatterns, text);

  if (regexResult.definitive) {
    return regexResult;
  }

  // Fall back to AI evaluation for semantic matching
  return await evaluateWithAI(rule, text, evalId);
}

/**
 * Evaluate rule using regex patterns (fast path)
 */
function evaluateWithRegex(ruleType, searchPatterns, antiPatterns, text) {
  const lowerText = text.toLowerCase();

  // Check search patterns
  let foundPatterns = [];
  for (const pattern of searchPatterns || []) {
    try {
      const regex = new RegExp(pattern, 'gi');
      const matches = text.match(regex);
      if (matches) {
        foundPatterns.push(...matches);
      }
    } catch {
      // Invalid regex, will need AI evaluation
      return { definitive: false };
    }
  }

  // Check anti-patterns
  let foundAntiPatterns = [];
  for (const pattern of antiPatterns || []) {
    try {
      const regex = new RegExp(pattern, 'gi');
      const matches = text.match(regex);
      if (matches) {
        foundAntiPatterns.push(...matches);
      }
    } catch {
      // Invalid regex, skip
    }
  }

  // Evaluate based on rule type
  switch (ruleType) {
    case 'MUST_HAVE':
      if (foundPatterns.length > 0) {
        return {
          definitive: true,
          passed: true,
          matchedText: foundPatterns[0],
          reasoning: `Found matching pattern: "${foundPatterns[0]}"`
        };
      }
      // Not found by regex - needs AI for semantic check
      return { definitive: false };

    case 'MUST_NOT_HAVE':
      if (foundAntiPatterns.length > 0) {
        return {
          definitive: true,
          passed: false,
          violation: {
            failureMessage: `Found prohibited pattern: "${foundAntiPatterns[0]}"`,
            severity: ruleType
          },
          matchedText: foundAntiPatterns[0],
          reasoning: `Found prohibited pattern: "${foundAntiPatterns[0]}"`
        };
      }
      if (foundPatterns.length > 0) {
        return {
          definitive: true,
          passed: false,
          violation: {
            failureMessage: `Found pattern that should not be present: "${foundPatterns[0]}"`,
            severity: ruleType
          },
          matchedText: foundPatterns[0],
          reasoning: `Found pattern that should not be present: "${foundPatterns[0]}"`
        };
      }
      // Not found - but need AI to confirm it's really not present semantically
      return { definitive: false };

    case 'PATTERN':
      if (foundPatterns.length > 0) {
        return {
          definitive: true,
          passed: true,
          matchedText: foundPatterns[0],
          reasoning: `Pattern matched: "${foundPatterns[0]}"`
        };
      }
      return {
        definitive: true,
        passed: false,
        violation: {
          failureMessage: 'Pattern not found in document',
          severity: ruleType
        },
        reasoning: 'Pattern not found in document'
      };

    case 'THRESHOLD':
      // Threshold requires AI to extract numeric value
      return { definitive: false };

    default:
      return { definitive: false };
  }
}

/**
 * Evaluate rule using AI (semantic matching)
 */
async function evaluateWithAI(rule, text, evalId) {
  const prompt = `Evaluate if this document satisfies the following legal contract rule:

RULE NAME: ${rule.ruleName}
RULE TYPE: ${rule.ruleType}
CATEGORY: ${rule.clauseCategory}
DESCRIPTION: ${rule.ruleDescription || 'N/A'}

WHAT TO CHECK:
${rule.ruleType === 'MUST_HAVE' ? '- This clause/provision MUST be present in the document' : ''}
${rule.ruleType === 'MUST_NOT_HAVE' ? '- This clause/provision must NOT be present in the document' : ''}
${rule.ruleType === 'THRESHOLD' ? `- The value for ${rule.thresholdField} must be ${formatOperator(rule.thresholdOperator)} ${rule.thresholdValue}` : ''}
${rule.ruleType === 'PATTERN' ? '- The specific pattern must be present' : ''}

PATTERNS TO LOOK FOR: ${JSON.stringify(rule.searchPatterns)}
${rule.exampleText ? `EXAMPLE OF COMPLIANT LANGUAGE: "${rule.exampleText}"` : ''}
${rule.antiPatterns ? `PATTERNS INDICATING VIOLATION: ${JSON.stringify(rule.antiPatterns)}` : ''}

Document excerpt (first 25000 chars):
"""
${text.substring(0, 25000)}
"""

IMPORTANT: Be precise. Quote exact text from the document when relevant.

Return JSON:
{
  "passes": true or false,
  "reasoning": "Brief explanation of why the rule passes or fails",
  "excerpt": "Exact quote from document that is relevant (or null if not applicable)",
  "extractedValue": "For THRESHOLD rules, the numeric value found (or null)"
}`;

  try {
    const response = await callOpenAI([
      {
        role: 'system',
        content: 'You are a legal document analyst checking compliance with specific contract rules. Be precise and accurate.'
      },
      { role: 'user', content: prompt }
    ], {
      model: ENGINE_CONFIG.model,
      response_format: { type: 'json_object' },
      temperature: 0
    });

    const content = response.choices?.[0]?.message?.content;
    const result = content ? JSON.parse(content) : null;

    if (!result) {
      return {
        passed: false,
        violation: {
          failureMessage: 'Unable to parse AI response',
          severity: rule.severity
        },
        reasoning: 'Unable to parse AI response'
      };
    }

    // For threshold rules, validate the extracted value
    if (rule.ruleType === 'THRESHOLD' && result.extractedValue !== null) {
      const passed = evaluateThreshold(
        parseFloat(result.extractedValue),
        rule.thresholdOperator,
        rule.thresholdValue
      );
      return {
        passed,
        matchedText: result.excerpt,
        reasoning: result.reasoning,
        extractedValue: result.extractedValue,
        violation: !passed ? {
          failureMessage: result.reasoning || `Threshold not met: ${result.extractedValue}`,
          severity: rule.severity
        } : undefined
      };
    }

    // Map AI response to expected format
    const passed = result.passes;
    return {
      passed,
      matchedText: result.excerpt,
      reasoning: result.reasoning,
      extractedValue: result.extractedValue,
      violation: !passed ? {
        failureMessage: result.reasoning || rule.failureMessage || 'Rule not satisfied',
        severity: rule.severity
      } : undefined
    };
  } catch (error) {
    console.error(`[PLAYBOOK-ENGINE] [${evalId}] AI evaluation error:`, error.message);
    return {
      passed: false,
      violation: {
        failureMessage: `AI evaluation error: ${error.message}`,
        severity: rule.severity
      },
      reasoning: `AI evaluation error: ${error.message}`
    };
  }
}

/**
 * Evaluate threshold condition
 */
function evaluateThreshold(value, operator, threshold) {
  if (value === null || value === undefined || isNaN(value)) {
    return false;
  }

  // Parse threshold - could be numeric or expression like "2x_contract_value"
  let thresholdValue = parseFloat(threshold);
  if (isNaN(thresholdValue)) {
    // Complex threshold expression - default to fail
    console.warn('[PLAYBOOK-ENGINE] Complex threshold expression not supported:', threshold);
    return false;
  }

  switch (operator) {
    case 'GT': return value > thresholdValue;
    case 'LT': return value < thresholdValue;
    case 'GTE': return value >= thresholdValue;
    case 'LTE': return value <= thresholdValue;
    case 'EQ': return value === thresholdValue;
    default: return false;
  }
}

/**
 * Format operator for display
 */
function formatOperator(operator) {
  switch (operator) {
    case 'GT': return 'greater than';
    case 'LT': return 'less than';
    case 'GTE': return 'greater than or equal to';
    case 'LTE': return 'less than or equal to';
    case 'EQ': return 'equal to';
    default: return operator;
  }
}

/**
 * Validate rule syntax
 */
export function validateRuleSyntax(rule) {
  const errors = [];

  // Required fields
  if (!rule.ruleName || typeof rule.ruleName !== 'string') {
    errors.push('ruleName is required and must be a string');
  }

  if (!rule.ruleType || !RULE_TYPES.includes(rule.ruleType)) {
    errors.push(`ruleType must be one of: ${RULE_TYPES.join(', ')}`);
  }

  if (!rule.clauseCategory || !CLAUSE_CATEGORIES.includes(rule.clauseCategory)) {
    errors.push(`clauseCategory must be one of: ${CLAUSE_CATEGORIES.join(', ')}`);
  }

  if (!rule.severity || !SEVERITIES.includes(rule.severity)) {
    errors.push(`severity must be one of: ${SEVERITIES.join(', ')}`);
  }

  if (!rule.failureMessage || typeof rule.failureMessage !== 'string') {
    errors.push('failureMessage is required and must be a string');
  }

  // Search patterns
  if (!rule.searchPatterns) {
    errors.push('searchPatterns is required');
  } else {
    let patterns = rule.searchPatterns;
    if (typeof patterns === 'string') {
      try {
        patterns = JSON.parse(patterns);
      } catch {
        patterns = [patterns];
      }
    }
    if (!Array.isArray(patterns) || patterns.length === 0) {
      errors.push('searchPatterns must be a non-empty array');
    }
    // Validate regex patterns
    for (const pattern of patterns) {
      try {
        new RegExp(pattern);
      } catch (e) {
        errors.push(`Invalid regex pattern: ${pattern}`);
      }
    }
  }

  // Threshold-specific validation
  if (rule.ruleType === 'THRESHOLD') {
    if (!rule.thresholdField) {
      errors.push('thresholdField is required for THRESHOLD rules');
    }
    if (!rule.thresholdOperator || !THRESHOLD_OPERATORS.includes(rule.thresholdOperator)) {
      errors.push(`thresholdOperator must be one of: ${THRESHOLD_OPERATORS.join(', ')}`);
    }
    if (!rule.thresholdValue) {
      errors.push('thresholdValue is required for THRESHOLD rules');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Calculate compliance score from violations
 */
export function calculateComplianceScore(violations) {
  if (!violations || violations.length === 0) {
    return 100;
  }

  // Weight by severity
  const weights = { CRITICAL: 20, ERROR: 10, WARNING: 5, INFO: 1 };
  let totalWeight = 0;

  for (const v of violations) {
    totalWeight += weights[v.severity] || 1;
  }

  // Cap deduction at 100
  const deduction = Math.min(totalWeight, 100);
  return 100 - deduction;
}

/**
 * Suggest rules for a document type
 */
export function suggestRulesForDocType(documentType) {
  const suggestions = {
    LEASE: [
      {
        ruleName: 'Tenant Indemnification Required',
        ruleType: 'MUST_HAVE',
        clauseCategory: 'indemnification',
        searchPatterns: ['tenant.*indemnif', 'lessee.*hold harmless'],
        severity: 'ERROR',
        failureMessage: 'Missing tenant indemnification clause'
      },
      {
        ruleName: 'Insurance Requirements',
        ruleType: 'MUST_HAVE',
        clauseCategory: 'insurance',
        searchPatterns: ['general liability', 'commercial general liability', 'CGL'],
        severity: 'ERROR',
        failureMessage: 'Missing CGL insurance requirement'
      },
      {
        ruleName: 'No Tenant Termination for Convenience',
        ruleType: 'MUST_NOT_HAVE',
        clauseCategory: 'termination',
        antiPatterns: ['tenant.*terminate.*convenience', 'lessee.*cancel.*at will'],
        severity: 'CRITICAL',
        failureMessage: 'Contains tenant termination for convenience'
      }
    ],
    PSA: [
      {
        ruleName: 'Earnest Money Deposit',
        ruleType: 'MUST_HAVE',
        clauseCategory: 'earnest_money',
        searchPatterns: ['earnest money', 'deposit', 'good faith deposit'],
        severity: 'ERROR',
        failureMessage: 'No earnest money provision found'
      },
      {
        ruleName: 'Due Diligence Period',
        ruleType: 'MUST_HAVE',
        clauseCategory: 'due_diligence',
        searchPatterns: ['due diligence', 'inspection period', 'feasibility period'],
        severity: 'ERROR',
        failureMessage: 'No due diligence period defined'
      },
      {
        ruleName: 'Environmental Representations',
        ruleType: 'MUST_HAVE',
        clauseCategory: 'environmental',
        searchPatterns: ['environmental', 'hazardous', 'contamination'],
        severity: 'WARNING',
        failureMessage: 'Missing environmental representations'
      }
    ],
    LOAN_AGREEMENT: [
      {
        ruleName: 'Interest Rate Defined',
        ruleType: 'MUST_HAVE',
        clauseCategory: 'other',
        searchPatterns: ['interest rate', 'annual percentage', 'APR'],
        severity: 'ERROR',
        failureMessage: 'Interest rate not clearly defined'
      },
      {
        ruleName: 'Prepayment Terms',
        ruleType: 'MUST_HAVE',
        clauseCategory: 'other',
        searchPatterns: ['prepayment', 'early repayment', 'prepay'],
        severity: 'WARNING',
        failureMessage: 'Prepayment terms not addressed'
      }
    ]
  };

  return suggestions[documentType] || [];
}

export default {
  evaluatePlaybook,
  evaluateRule,
  validateRuleSyntax,
  calculateComplianceScore,
  suggestRulesForDocType,
  RULE_TYPES,
  SEVERITIES,
  THRESHOLD_OPERATORS,
  CLAUSE_CATEGORIES
};
