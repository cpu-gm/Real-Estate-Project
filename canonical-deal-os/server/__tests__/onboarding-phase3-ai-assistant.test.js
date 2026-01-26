/**
 * Onboarding Phase 3: AI Assistant Unit Tests
 *
 * Tests for:
 * - Question generation based on confidence thresholds
 * - Response parsing and application
 * - Chat message handling
 * - Insight generation
 * - AI assistant metrics tracking
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  OnboardingLogger,
  createOnboardingLogger,
  COMPONENTS
} from '../services/onboarding-logger.js';

// Mock Prisma
const mockPrisma = {
  onboardingProcessingLog: {
    create: jest.fn().mockResolvedValue({ id: 'log-1' })
  },
  onboardingActivity: {
    create: jest.fn().mockResolvedValue({ id: 'activity-1' })
  },
  onboardingAIQuestion: {
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn()
  },
  onboardingClaim: {
    findMany: jest.fn(),
    update: jest.fn()
  },
  onboardingConflict: {
    findMany: jest.fn(),
    update: jest.fn()
  },
  onboardingDataLink: {
    findMany: jest.fn(),
    update: jest.fn()
  }
};

describe('Phase 3: AI Assistant', () => {
  let logger;
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(() => {}),
      error: jest.spyOn(console, 'error').mockImplementation(() => {}),
      warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
      debug: jest.spyOn(console, 'debug').mockImplementation(() => {})
    };

    jest.clearAllMocks();

    logger = createOnboardingLogger(mockPrisma, 'session-123', {
      consoleOutput: false,
      persistToDb: false
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Question Generation Logging', () => {
    it('should log question generated with all details', async () => {
      const logSpy = jest.spyOn(logger, 'info');

      await logger.logQuestionGenerated('q-1', 'LOW_CONFIDENCE', 'claim-1', 0.45);

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.QUESTION_GENERATOR,
        'Question generated: LOW_CONFIDENCE',
        {
          questionId: 'q-1',
          questionType: 'LOW_CONFIDENCE',
          claimId: 'claim-1',
          confidence: 0.45
        }
      );
    });

    it('should log duplicate entity question', async () => {
      const logSpy = jest.spyOn(logger, 'info');

      await logger.logQuestionGenerated('q-2', 'DUPLICATE_ENTITY', 'claim-2', 0.85);

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.QUESTION_GENERATOR,
        'Question generated: DUPLICATE_ENTITY',
        expect.objectContaining({
          questionType: 'DUPLICATE_ENTITY',
          confidence: 0.85
        })
      );
    });

    it('should log ambiguous value question', async () => {
      const logSpy = jest.spyOn(logger, 'info');

      await logger.logQuestionGenerated('q-3', 'AMBIGUOUS_VALUE', 'claim-3', 0.55);

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.QUESTION_GENERATOR,
        'Question generated: AMBIGUOUS_VALUE',
        expect.objectContaining({
          questionType: 'AMBIGUOUS_VALUE'
        })
      );
    });
  });

  describe('Question Answer Logging', () => {
    it('should log question answered with quick response', async () => {
      const logSpy = jest.spyOn(logger, 'info');

      await logger.logQuestionAnswered('q-1', 'keep_original', 'Keep Original', true, 1500);

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.QUESTION_GENERATOR,
        'Question answered: q-1',
        {
          questionId: 'q-1',
          answerValue: 'keep_original',
          answerLabel: 'Keep Original',
          wasQuickResponse: true,
          duration: 1500
        }
      );
    });

    it('should log question answered with custom response', async () => {
      const logSpy = jest.spyOn(logger, 'info');

      await logger.logQuestionAnswered('q-2', 'Custom corrected value', 'Custom corrected value', false, 5000);

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.QUESTION_GENERATOR,
        'Question answered: q-2',
        expect.objectContaining({
          wasQuickResponse: false,
          duration: 5000
        })
      );
    });

    it('should log question dismissed', async () => {
      const logSpy = jest.spyOn(logger, 'info');

      await logger.logQuestionDismissed('q-3', 'user-1');

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.QUESTION_GENERATOR,
        'Question dismissed: q-3',
        {
          questionId: 'q-3',
          userId: 'user-1'
        }
      );
    });
  });

  describe('Chat Logging', () => {
    it('should log user chat message', async () => {
      const logSpy = jest.spyOn(logger, 'debug');

      await logger.logChatMessage('user', 'What is the correct rent amount?', 'q-1', 'user-1');

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.CHAT,
        'Chat message: user',
        {
          messageType: 'user',
          contentLength: 32,
          activeQuestionId: 'q-1',
          userId: 'user-1'
        }
      );
    });

    it('should log AI chat response generation', async () => {
      const logSpy = jest.spyOn(logger, 'debug');

      await logger.logChatResponse('Based on the rent roll, the average rent is $1,250/unit.', 150, 2500);

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.CHAT,
        'Chat response generated',
        {
          responseLength: 56,
          tokensUsed: 150,
          duration: 2500
        }
      );
    });

    it('should handle undefined content gracefully', async () => {
      const logSpy = jest.spyOn(logger, 'debug');

      await logger.logChatMessage('user', undefined, null, 'user-1');

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.CHAT,
        'Chat message: user',
        {
          messageType: 'user',
          contentLength: undefined,
          activeQuestionId: null,
          userId: 'user-1'
        }
      );
    });
  });

  describe('Insight Generation Logging', () => {
    it('should log insight generated', async () => {
      const logSpy = jest.spyOn(logger, 'info');

      await logger.logInsightGenerated(
        'insight-1',
        'POTENTIAL_DUPLICATE',
        'Found potential duplicate contact',
        0.92
      );

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.INSIGHT_GENERATOR,
        'Insight generated: POTENTIAL_DUPLICATE',
        {
          insightId: 'insight-1',
          insightType: 'POTENTIAL_DUPLICATE',
          title: 'Found potential duplicate contact',
          confidence: 0.92
        }
      );
    });

    it('should log insight accepted with applied changes', async () => {
      const logSpy = jest.spyOn(logger, 'info');

      await logger.logInsightAccepted('insight-1', 'user-1', {
        mergedRecords: ['record-1', 'record-2'],
        updatedFields: 3
      });

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.INSIGHT_GENERATOR,
        'Insight accepted: insight-1',
        {
          insightId: 'insight-1',
          userId: 'user-1',
          appliedChanges: {
            mergedRecords: ['record-1', 'record-2'],
            updatedFields: 3
          }
        }
      );
    });

    it('should log insight dismissed', async () => {
      const logSpy = jest.spyOn(logger, 'info');

      await logger.logInsightDismissed('insight-2', 'user-1');

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.INSIGHT_GENERATOR,
        'Insight dismissed: insight-2',
        {
          insightId: 'insight-2',
          userId: 'user-1'
        }
      );
    });
  });

  describe('AI Assistant Metrics Logging', () => {
    it('should log session metrics with rates', async () => {
      const logSpy = jest.spyOn(logger, 'info');

      await logger.logAIAssistantMetrics(10, 8, 5, 3);

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.AI_ASSISTANT,
        'AI Assistant session metrics',
        {
          questionsGenerated: 10,
          questionsAnswered: 8,
          insightsGenerated: 5,
          insightsAccepted: 3,
          questionAnswerRate: '80.0%',
          insightAcceptRate: '60.0%'
        }
      );
    });

    it('should handle zero questions/insights gracefully', async () => {
      const logSpy = jest.spyOn(logger, 'info');

      await logger.logAIAssistantMetrics(0, 0, 0, 0);

      const callArgs = logSpy.mock.calls[0][2];
      expect(callArgs.questionAnswerRate).toBe('N/A');
      expect(callArgs.insightAcceptRate).toBe('N/A');
    });

    it('should log AI assistant error with context', async () => {
      const logSpy = jest.spyOn(logger, 'error');
      const testError = new Error('OpenAI API timeout');

      await logger.logAIAssistantError('generateQuestions', testError, {
        claimCount: 50,
        retryAttempt: 2
      });

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.AI_ASSISTANT,
        'AI Assistant error: generateQuestions',
        expect.objectContaining({
          operation: 'generateQuestions',
          error: 'OpenAI API timeout',
          claimCount: 50,
          retryAttempt: 2
        })
      );
    });
  });

  describe('Phase 3 COMPONENTS', () => {
    it('should have all Phase 3 component identifiers', () => {
      expect(COMPONENTS.AI_ASSISTANT).toBe('AI_ASSISTANT');
      expect(COMPONENTS.QUESTION_GENERATOR).toBe('QUESTION_GENERATOR');
      expect(COMPONENTS.CHAT).toBe('CHAT');
      expect(COMPONENTS.INSIGHT_GENERATOR).toBe('INSIGHT_GENERATOR');
    });
  });
});

describe('Question Generation Logic', () => {
  const THRESHOLDS = {
    LOW_CONFIDENCE: 0.6,
    VERY_LOW_CONFIDENCE: 0.4,
    DUPLICATE_SIMILARITY: 0.8
  };

  describe('shouldGenerateQuestion', () => {
    it('should generate question for low confidence claim', () => {
      const claim = { confidence: 0.45, status: 'UNVERIFIED' };

      expect(shouldGenerateQuestion(claim, THRESHOLDS)).toBe(true);
    });

    it('should not generate question for high confidence claim', () => {
      const claim = { confidence: 0.85, status: 'UNVERIFIED' };

      expect(shouldGenerateQuestion(claim, THRESHOLDS)).toBe(false);
    });

    it('should not generate question for already verified claim', () => {
      const claim = { confidence: 0.45, status: 'VERIFIED' };

      expect(shouldGenerateQuestion(claim, THRESHOLDS)).toBe(false);
    });

    it('should generate question for very low confidence regardless of field', () => {
      const claim = { confidence: 0.3, status: 'UNVERIFIED' };

      expect(shouldGenerateQuestion(claim, THRESHOLDS)).toBe(true);
    });
  });

  describe('determineQuestionType', () => {
    it('should return VERY_LOW_CONFIDENCE for confidence below 0.4', () => {
      const claim = { confidence: 0.35, value: 'Some Value' };

      expect(determineQuestionType(claim, THRESHOLDS)).toBe('VERY_LOW_CONFIDENCE');
    });

    it('should return LOW_CONFIDENCE for confidence between 0.4 and 0.6', () => {
      const claim = { confidence: 0.5, value: 'Some Value' };

      expect(determineQuestionType(claim, THRESHOLDS)).toBe('LOW_CONFIDENCE');
    });

    it('should return AMBIGUOUS_VALUE for ambiguous values', () => {
      const claim = { confidence: 0.55, value: '~50' };

      expect(determineQuestionType(claim, THRESHOLDS)).toBe('AMBIGUOUS_VALUE');
    });

    it('should return INCOMPLETE_DATA for claims with partial values', () => {
      const claim = { confidence: 0.55, value: 'N/A' };

      expect(determineQuestionType(claim, THRESHOLDS)).toBe('INCOMPLETE_DATA');
    });
  });

  describe('generateQuickResponses', () => {
    it('should generate appropriate responses for LOW_CONFIDENCE', () => {
      const responses = generateQuickResponses('LOW_CONFIDENCE', 'property.units', '48');

      expect(responses).toContainEqual(
        expect.objectContaining({ label: 'Keep Value', value: 'keep' })
      );
      expect(responses).toContainEqual(
        expect.objectContaining({ label: 'Remove', value: 'remove' })
      );
    });

    it('should generate merge options for DUPLICATE_ENTITY', () => {
      const responses = generateQuickResponses('DUPLICATE_ENTITY', 'contact.name', 'John Doe');

      expect(responses).toContainEqual(
        expect.objectContaining({ label: 'Merge Records', value: 'merge' })
      );
      expect(responses).toContainEqual(
        expect.objectContaining({ label: 'Keep Separate', value: 'keep_separate' })
      );
    });

    it('should generate yes/no for AMBIGUOUS_VALUE', () => {
      const responses = generateQuickResponses('AMBIGUOUS_VALUE', 'property.sqft', '~5000');

      expect(responses).toContainEqual(
        expect.objectContaining({ value: 'confirm' })
      );
      expect(responses).toContainEqual(
        expect.objectContaining({ value: 'correct' })
      );
    });
  });
});

describe('Response Application Logic', () => {
  describe('applyQuestionResponse', () => {
    it('should update claim when response is "keep"', async () => {
      const claim = { id: 'c1', value: '48', status: 'UNVERIFIED' };
      const response = { value: 'keep', label: 'Keep Value' };

      const result = applyQuestionResponse(claim, response);

      expect(result.status).toBe('VERIFIED');
      expect(result.value).toBe('48');
    });

    it('should remove claim when response is "remove"', async () => {
      const claim = { id: 'c1', value: '48', status: 'UNVERIFIED' };
      const response = { value: 'remove', label: 'Remove' };

      const result = applyQuestionResponse(claim, response);

      expect(result.status).toBe('REJECTED');
    });

    it('should update value when response provides correction', async () => {
      const claim = { id: 'c1', value: '~50', status: 'UNVERIFIED' };
      const response = { value: 'correct', label: 'Correct', correctedValue: '52' };

      const result = applyQuestionResponse(claim, response);

      expect(result.status).toBe('VERIFIED');
      expect(result.value).toBe('52');
    });

    it('should mark as needs_review when response is unclear', async () => {
      const claim = { id: 'c1', value: 'Mixed Use', status: 'UNVERIFIED' };
      const response = { value: 'unclear', label: 'Not Sure' };

      const result = applyQuestionResponse(claim, response);

      expect(result.status).toBe('NEEDS_REVIEW');
    });
  });

  describe('applyDuplicateResponse', () => {
    it('should merge records when response is "merge"', () => {
      // r1 has more non-null fields so becomes primary
      // r2 has phone that r1 is missing - phone should be merged
      const records = [
        { id: 'r1', name: 'John Doe', email: 'john@example.com', phone: null },
        { id: 'r2', name: 'John D.', email: null, phone: '555-1234' }
      ];
      const response = { value: 'merge' };

      const result = applyDuplicateResponse(records, response);

      expect(result.action).toBe('MERGED');
      expect(result.primaryRecordId).toBe('r1'); // r1 has 2 non-null, r2 has 2 non-null, r1 wins as first
      expect(result.mergedFields).toContain('phone');
    });

    it('should keep records separate when response is "keep_separate"', () => {
      const records = [
        { id: 'r1', name: 'John Doe' },
        { id: 'r2', name: 'John Smith' }
      ];
      const response = { value: 'keep_separate' };

      const result = applyDuplicateResponse(records, response);

      expect(result.action).toBe('KEPT_SEPARATE');
      expect(result.markedAsDistinct).toBe(true);
    });
  });
});

describe('Insight Generation Logic', () => {
  describe('detectPotentialInsights', () => {
    it('should detect missing required fields', () => {
      const claims = [
        { fieldPath: 'property.name', value: 'Sunset Apartments' },
        { fieldPath: 'property.address', value: '123 Main St' }
        // Missing property.units
      ];
      const requiredFields = ['property.name', 'property.address', 'property.units'];

      const insights = detectPotentialInsights(claims, requiredFields);

      expect(insights).toContainEqual(
        expect.objectContaining({
          type: 'MISSING_REQUIRED_FIELD',
          field: 'property.units'
        })
      );
    });

    it('should detect unusual values based on field type', () => {
      const claims = [
        { fieldPath: 'property.units', value: '999999', confidence: 0.7 }
      ];

      const insights = detectPotentialInsights(claims, []);

      expect(insights).toContainEqual(
        expect.objectContaining({
          type: 'UNUSUAL_VALUE',
          claimId: expect.any(String)
        })
      );
    });

    it('should detect potential data quality issues', () => {
      const claims = [
        { fieldPath: 'property.rent', value: '$0', confidence: 0.9 }
      ];

      const insights = detectPotentialInsights(claims, []);

      expect(insights).toContainEqual(
        expect.objectContaining({
          type: 'DATA_QUALITY_ISSUE'
        })
      );
    });
  });

  describe('generateInsightSuggestion', () => {
    it('should suggest adding missing field', () => {
      const insight = { type: 'MISSING_REQUIRED_FIELD', field: 'property.units' };

      const suggestion = generateInsightSuggestion(insight);

      expect(suggestion.action).toBe('ADD_FIELD');
      expect(suggestion.description).toContain('property.units');
    });

    it('should suggest reviewing unusual value', () => {
      const insight = { type: 'UNUSUAL_VALUE', field: 'property.units', value: '999999' };

      const suggestion = generateInsightSuggestion(insight);

      expect(suggestion.action).toBe('REVIEW_VALUE');
      expect(suggestion.confidence).toBeGreaterThan(0);
    });
  });
});

// Helper functions that would be in actual service files

function shouldGenerateQuestion(claim, thresholds) {
  if (claim.status === 'VERIFIED' || claim.status === 'REJECTED') {
    return false;
  }
  return claim.confidence < thresholds.LOW_CONFIDENCE;
}

function determineQuestionType(claim, thresholds) {
  if (claim.confidence < thresholds.VERY_LOW_CONFIDENCE) {
    return 'VERY_LOW_CONFIDENCE';
  }

  if (isAmbiguous(claim.value)) {
    return 'AMBIGUOUS_VALUE';
  }

  if (isIncomplete(claim.value)) {
    return 'INCOMPLETE_DATA';
  }

  return 'LOW_CONFIDENCE';
}

function isAmbiguous(value) {
  if (!value) return false;
  return /^[~≈]/.test(value) || /\?$/.test(value) || /approximately|about|around/i.test(value);
}

function isIncomplete(value) {
  if (!value) return true;
  const incompletePatterns = ['N/A', 'TBD', 'Unknown', '-', 'n/a', 'pending'];
  return incompletePatterns.some(p => value.toLowerCase().includes(p.toLowerCase()));
}

function generateQuickResponses(questionType, fieldPath, value) {
  switch (questionType) {
    case 'LOW_CONFIDENCE':
    case 'VERY_LOW_CONFIDENCE':
      return [
        { label: 'Keep Value', value: 'keep' },
        { label: 'Remove', value: 'remove' }
      ];

    case 'DUPLICATE_ENTITY':
      return [
        { label: 'Merge Records', value: 'merge' },
        { label: 'Keep Separate', value: 'keep_separate' }
      ];

    case 'AMBIGUOUS_VALUE':
      return [
        { label: `Confirm "${value}"`, value: 'confirm' },
        { label: 'Enter Correct Value', value: 'correct' }
      ];

    case 'INCOMPLETE_DATA':
      return [
        { label: 'Skip This Field', value: 'skip' },
        { label: 'Enter Value', value: 'enter' }
      ];

    default:
      return [];
  }
}

function applyQuestionResponse(claim, response) {
  switch (response.value) {
    case 'keep':
    case 'confirm':
      return { ...claim, status: 'VERIFIED' };

    case 'remove':
      return { ...claim, status: 'REJECTED' };

    case 'correct':
      return {
        ...claim,
        status: 'VERIFIED',
        value: response.correctedValue || claim.value
      };

    case 'unclear':
      return { ...claim, status: 'NEEDS_REVIEW' };

    default:
      return claim;
  }
}

function applyDuplicateResponse(records, response) {
  if (response.value === 'merge') {
    // Pick the record with the most complete data
    const primary = records.reduce((best, record) => {
      const score = Object.values(record).filter(v => v != null).length;
      const bestScore = Object.values(best).filter(v => v != null).length;
      return score > bestScore ? record : best;
    }, records[0]);

    // Find fields to merge from other records
    const mergedFields = [];
    for (const record of records) {
      if (record.id === primary.id) continue;
      for (const [key, value] of Object.entries(record)) {
        if (primary[key] == null && value != null) {
          mergedFields.push(key);
        }
      }
    }

    return {
      action: 'MERGED',
      primaryRecordId: primary.id,
      mergedFields
    };
  }

  return {
    action: 'KEPT_SEPARATE',
    markedAsDistinct: true
  };
}

function detectPotentialInsights(claims, requiredFields) {
  const insights = [];
  const claimFields = new Set(claims.map(c => c.fieldPath));

  // Check for missing required fields
  for (const field of requiredFields) {
    if (!claimFields.has(field)) {
      insights.push({
        type: 'MISSING_REQUIRED_FIELD',
        field
      });
    }
  }

  // Check for unusual values
  for (const claim of claims) {
    if (isUnusualValue(claim.fieldPath, claim.value)) {
      insights.push({
        type: 'UNUSUAL_VALUE',
        claimId: claim.id || 'unknown',
        field: claim.fieldPath,
        value: claim.value
      });
    }

    if (isDataQualityIssue(claim.fieldPath, claim.value)) {
      insights.push({
        type: 'DATA_QUALITY_ISSUE',
        claimId: claim.id || 'unknown',
        field: claim.fieldPath,
        value: claim.value
      });
    }
  }

  return insights;
}

function isUnusualValue(fieldPath, value) {
  // Check for obviously wrong numbers
  if (fieldPath.includes('units') && parseInt(value) > 10000) return true;
  if (fieldPath.includes('sqft') && parseInt(value) > 100000000) return true;
  return false;
}

function isDataQualityIssue(fieldPath, value) {
  // Check for zero values in fields that shouldn't be zero
  if (fieldPath.includes('rent') && (value === '$0' || value === '0')) return true;
  if (fieldPath.includes('price') && (value === '$0' || value === '0')) return true;
  return false;
}

function generateInsightSuggestion(insight) {
  switch (insight.type) {
    case 'MISSING_REQUIRED_FIELD':
      return {
        action: 'ADD_FIELD',
        description: `Add missing required field: ${insight.field}`,
        confidence: 1.0
      };

    case 'UNUSUAL_VALUE':
      return {
        action: 'REVIEW_VALUE',
        description: `Review unusual value for ${insight.field}: ${insight.value}`,
        confidence: 0.8
      };

    case 'DATA_QUALITY_ISSUE':
      return {
        action: 'VERIFY_DATA',
        description: `Verify data quality for ${insight.field}`,
        confidence: 0.9
      };

    default:
      return {
        action: 'REVIEW',
        description: 'Review this item',
        confidence: 0.5
      };
  }
}
