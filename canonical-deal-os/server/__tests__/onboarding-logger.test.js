/**
 * Onboarding Logger Service Tests
 *
 * Tests for:
 * - Log level filtering
 * - Correlation ID generation
 * - Activity creation
 * - Structured logging methods
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  OnboardingLogger,
  createOnboardingLogger,
  createStandaloneLogger,
  COMPONENTS,
  LOG_LEVELS
} from '../services/onboarding-logger.js';

// Mock Prisma
const mockPrisma = {
  onboardingProcessingLog: {
    create: jest.fn().mockResolvedValue({ id: 'log-1' })
  },
  onboardingActivity: {
    create: jest.fn().mockResolvedValue({ id: 'activity-1' })
  }
};

describe('OnboardingLogger', () => {
  let logger;
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(() => {}),
      error: jest.spyOn(console, 'error').mockImplementation(() => {}),
      warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
      debug: jest.spyOn(console, 'debug').mockImplementation(() => {})
    };

    mockPrisma.onboardingProcessingLog.create.mockClear();
    mockPrisma.onboardingActivity.create.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create logger with default options', () => {
      logger = new OnboardingLogger(mockPrisma, {});

      expect(logger.prisma).toBe(mockPrisma);
      expect(logger.correlationId).toBeDefined();
      expect(logger.correlationId.length).toBe(36); // UUID format
      expect(logger.minLevel).toBe(LOG_LEVELS.DEBUG);
      expect(logger.consoleOutput).toBe(true);
      expect(logger.persistToDb).toBe(true);
    });

    it('should use provided options', () => {
      logger = new OnboardingLogger(mockPrisma, {
        sessionId: 'session-123',
        correlationId: 'custom-correlation',
        minLevel: 'WARN',
        consoleOutput: false,
        persistToDb: false
      });

      expect(logger.sessionId).toBe('session-123');
      expect(logger.correlationId).toBe('custom-correlation');
      expect(logger.minLevel).toBe(LOG_LEVELS.WARN);
      expect(logger.consoleOutput).toBe(false);
      expect(logger.persistToDb).toBe(false);
    });
  });

  describe('child', () => {
    it('should create child logger with same session but new correlation ID', () => {
      logger = new OnboardingLogger(mockPrisma, { sessionId: 'session-123' });
      const child = logger.child();

      expect(child.sessionId).toBe('session-123');
      expect(child.correlationId).not.toBe(logger.correlationId);
      expect(child.minLevel).toBe(logger.minLevel);
    });

    it('should allow overriding sessionId in child', () => {
      logger = new OnboardingLogger(mockPrisma, { sessionId: 'session-123' });
      const child = logger.child({ sessionId: 'session-456' });

      expect(child.sessionId).toBe('session-456');
    });
  });

  describe('withContext', () => {
    it('should create logger with additional context', () => {
      logger = new OnboardingLogger(mockPrisma, { sessionId: 'session-123' });
      const contextLogger = logger.withContext({ sourceId: 'source-1' });

      expect(contextLogger._context).toEqual({ sourceId: 'source-1' });
      expect(contextLogger.correlationId).toBe(logger.correlationId);
    });

    it('should merge contexts', () => {
      logger = new OnboardingLogger(mockPrisma, { sessionId: 'session-123' });
      logger._context = { existingKey: 'value' };
      const contextLogger = logger.withContext({ sourceId: 'source-1' });

      expect(contextLogger._context).toEqual({
        existingKey: 'value',
        sourceId: 'source-1'
      });
    });
  });

  describe('log level filtering', () => {
    it('should log all levels when minLevel is DEBUG', async () => {
      logger = new OnboardingLogger(mockPrisma, {
        sessionId: 'session-123',
        minLevel: 'DEBUG',
        persistToDb: false
      });

      await logger.debug('TEST', 'debug message');
      await logger.info('TEST', 'info message');
      await logger.warn('TEST', 'warn message');
      await logger.error('TEST', 'error message');

      expect(consoleSpy.debug).toHaveBeenCalled();
      expect(consoleSpy.log).toHaveBeenCalled();
      expect(consoleSpy.warn).toHaveBeenCalled();
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('should filter DEBUG when minLevel is INFO', async () => {
      logger = new OnboardingLogger(mockPrisma, {
        sessionId: 'session-123',
        minLevel: 'INFO',
        persistToDb: false
      });

      await logger.debug('TEST', 'debug message');
      await logger.info('TEST', 'info message');

      expect(consoleSpy.debug).not.toHaveBeenCalled();
      expect(consoleSpy.log).toHaveBeenCalled();
    });

    it('should filter DEBUG and INFO when minLevel is WARN', async () => {
      logger = new OnboardingLogger(mockPrisma, {
        sessionId: 'session-123',
        minLevel: 'WARN',
        persistToDb: false
      });

      await logger.debug('TEST', 'debug message');
      await logger.info('TEST', 'info message');
      await logger.warn('TEST', 'warn message');

      expect(consoleSpy.debug).not.toHaveBeenCalled();
      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.warn).toHaveBeenCalled();
    });

    it('should only log ERROR when minLevel is ERROR', async () => {
      logger = new OnboardingLogger(mockPrisma, {
        sessionId: 'session-123',
        minLevel: 'ERROR',
        persistToDb: false
      });

      await logger.debug('TEST', 'debug message');
      await logger.info('TEST', 'info message');
      await logger.warn('TEST', 'warn message');
      await logger.error('TEST', 'error message');

      expect(consoleSpy.debug).not.toHaveBeenCalled();
      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });

  describe('database persistence', () => {
    it('should persist log to database when enabled', async () => {
      logger = new OnboardingLogger(mockPrisma, {
        sessionId: 'session-123',
        persistToDb: true,
        consoleOutput: false
      });

      await logger.info(COMPONENTS.SESSION, 'Test message', { key: 'value' });

      expect(mockPrisma.onboardingProcessingLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sessionId: 'session-123',
          level: 'INFO',
          component: 'SESSION',
          message: 'Test message',
          details: JSON.stringify({ key: 'value' })
        })
      });
    });

    it('should not persist when persistToDb is false', async () => {
      logger = new OnboardingLogger(mockPrisma, {
        sessionId: 'session-123',
        persistToDb: false,
        consoleOutput: false
      });

      await logger.info(COMPONENTS.SESSION, 'Test message');

      expect(mockPrisma.onboardingProcessingLog.create).not.toHaveBeenCalled();
    });

    it('should not persist when sessionId is missing', async () => {
      logger = new OnboardingLogger(mockPrisma, {
        persistToDb: true,
        consoleOutput: false
      });

      await logger.info(COMPONENTS.SESSION, 'Test message');

      expect(mockPrisma.onboardingProcessingLog.create).not.toHaveBeenCalled();
    });
  });

  describe('specialized logging methods', () => {
    beforeEach(() => {
      logger = new OnboardingLogger(mockPrisma, {
        sessionId: 'session-123',
        persistToDb: false,
        consoleOutput: false
      });
    });

    it('logFileUpload should log file details', async () => {
      const logSpy = jest.spyOn(logger, 'info');

      await logger.logFileUpload('test.pdf', 1024000, 'application/pdf');

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.FILE_PROCESSOR,
        'File uploaded: test.pdf',
        { fileName: 'test.pdf', fileSize: 1024000, mimeType: 'application/pdf' }
      );
    });

    it('logExtractionStart should log source info', async () => {
      const logSpy = jest.spyOn(logger, 'info');

      await logger.logExtractionStart('source-1', 'document.pdf');

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.EXTRACTOR,
        'Starting extraction: document.pdf',
        { sourceId: 'source-1', fileName: 'document.pdf' }
      );
    });

    it('logExtractionComplete should log stats', async () => {
      const logSpy = jest.spyOn(logger, 'info');

      await logger.logExtractionComplete('source-1', 'doc.pdf', 10, 5000, 1500);

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.EXTRACTOR,
        'Extraction complete: doc.pdf - 10 claims',
        {
          sourceId: 'source-1',
          fileName: 'doc.pdf',
          claimCount: 10,
          duration: 5000,
          tokensUsed: 1500
        }
      );
    });

    it('logExtractionError should log error details', async () => {
      const logSpy = jest.spyOn(logger, 'error');
      const testError = new Error('Test error');

      await logger.logExtractionError('source-1', 'doc.pdf', testError);

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.EXTRACTOR,
        'Extraction failed: doc.pdf',
        expect.objectContaining({
          sourceId: 'source-1',
          fileName: 'doc.pdf',
          error: 'Test error'
        })
      );
    });

    it('logStageTransition should log status change', async () => {
      const logSpy = jest.spyOn(logger, 'info');

      await logger.logStageTransition('PROCESSING', 'REVIEW', 50);

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.SESSION,
        'Stage transition: PROCESSING -> REVIEW',
        { fromStatus: 'PROCESSING', toStatus: 'REVIEW', recordCount: 50 }
      );
    });

    it('logVerification should log verification action', async () => {
      const logSpy = jest.spyOn(logger, 'info');

      await logger.logVerification('claim-1', 'VERIFY', 'user-1', 'John Doe');

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.VALIDATOR,
        'Claim VERIFY: claim-1',
        { claimId: 'claim-1', action: 'VERIFY', userId: 'user-1', userName: 'John Doe' }
      );
    });
  });

  describe('createActivity', () => {
    it('should create activity record', async () => {
      logger = new OnboardingLogger(mockPrisma, { sessionId: 'session-123' });

      const activity = await logger.createActivity('EXTRACTION', 'Extracted 10 claims', {
        sourceId: 'source-1'
      });

      expect(mockPrisma.onboardingActivity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sessionId: 'session-123',
          activityType: 'EXTRACTION',
          message: 'Extracted 10 claims',
          sourceId: 'source-1'
        })
      });
    });

    it('should return null when sessionId is missing', async () => {
      logger = new OnboardingLogger(mockPrisma, {});

      const activity = await logger.createActivity('EXTRACTION', 'Test');

      expect(activity).toBeNull();
      expect(mockPrisma.onboardingActivity.create).not.toHaveBeenCalled();
    });
  });
});

describe('factory functions', () => {
  it('createOnboardingLogger should create logger with sessionId', () => {
    const logger = createOnboardingLogger(mockPrisma, 'session-123');

    expect(logger.sessionId).toBe('session-123');
    expect(logger.prisma).toBe(mockPrisma);
  });

  it('createStandaloneLogger should create logger without DB persistence', () => {
    const logger = createStandaloneLogger(mockPrisma);

    expect(logger.persistToDb).toBe(false);
    expect(logger.prisma).toBe(mockPrisma);
  });
});

describe('COMPONENTS', () => {
  it('should define all Phase 1 component identifiers', () => {
    expect(COMPONENTS.SESSION).toBe('SESSION');
    expect(COMPONENTS.EXTRACTOR).toBe('EXTRACTOR');
    expect(COMPONENTS.LINKER).toBe('LINKER');
    expect(COMPONENTS.VALIDATOR).toBe('VALIDATOR');
    expect(COMPONENTS.CONFLICT_RESOLVER).toBe('CONFLICT_RESOLVER');
    expect(COMPONENTS.FILE_PROCESSOR).toBe('FILE_PROCESSOR');
    expect(COMPONENTS.OAUTH_SYNC).toBe('OAUTH_SYNC');
    expect(COMPONENTS.EMAIL_INTAKE).toBe('EMAIL_INTAKE');
    expect(COMPONENTS.ACTIVITY).toBe('ACTIVITY');
    expect(COMPONENTS.QUIZ_GENERATOR).toBe('QUIZ_GENERATOR');
  });

  it('should define all Phase 2 component identifiers', () => {
    expect(COMPONENTS.DOCUMENT_VIEWER).toBe('DOCUMENT_VIEWER');
    expect(COMPONENTS.PROVENANCE).toBe('PROVENANCE');
    expect(COMPONENTS.REVIEW_WORKFLOW).toBe('REVIEW_WORKFLOW');
    expect(COMPONENTS.BULK_VERIFICATION).toBe('BULK_VERIFICATION');
  });

  it('should define all Phase 3 component identifiers', () => {
    expect(COMPONENTS.AI_ASSISTANT).toBe('AI_ASSISTANT');
    expect(COMPONENTS.QUESTION_GENERATOR).toBe('QUESTION_GENERATOR');
    expect(COMPONENTS.CHAT).toBe('CHAT');
    expect(COMPONENTS.INSIGHT_GENERATOR).toBe('INSIGHT_GENERATOR');
  });
});

describe('Phase 2 specialized logging methods', () => {
  let logger;

  beforeEach(() => {
    logger = new OnboardingLogger(mockPrisma, {
      sessionId: 'session-123',
      persistToDb: false,
      consoleOutput: false
    });
  });

  it('logDocumentView should log document viewing', async () => {
    const logSpy = jest.spyOn(logger, 'info');

    await logger.logDocumentView('source-1', 'rent-roll.xlsx', 'spreadsheet', 'user-1');

    expect(logSpy).toHaveBeenCalledWith(
      COMPONENTS.DOCUMENT_VIEWER,
      'Document viewed: rent-roll.xlsx',
      { sourceId: 'source-1', documentName: 'rent-roll.xlsx', docType: 'spreadsheet', userId: 'user-1' }
    );
  });

  it('logProvenanceClick should log provenance navigation', async () => {
    const logSpy = jest.spyOn(logger, 'debug');

    await logger.logProvenanceClick('claim-1', 'source-1', 5, 'B12');

    expect(logSpy).toHaveBeenCalledWith(
      COMPONENTS.PROVENANCE,
      'Provenance navigated: claim claim-1',
      { claimId: 'claim-1', sourceId: 'source-1', pageNumber: 5, cellReference: 'B12' }
    );
  });

  it('logProvenanceHighlight should log provenance highlighting', async () => {
    const logSpy = jest.spyOn(logger, 'debug');

    await logger.logProvenanceHighlight('claim-1', 'Total Units: 48', 'doc.pdf');

    expect(logSpy).toHaveBeenCalledWith(
      COMPONENTS.PROVENANCE,
      'Provenance highlighted: doc.pdf',
      { claimId: 'claim-1', textSnippet: 'Total Units: 48', documentName: 'doc.pdf' }
    );
  });

  it('logConflictResolution should log resolution decision', async () => {
    const logSpy = jest.spyOn(logger, 'info');

    await logger.logConflictResolution('conflict-1', 'AI_SUGGESTION', '$1,500,000', 'user-1');

    expect(logSpy).toHaveBeenCalledWith(
      COMPONENTS.CONFLICT_RESOLVER,
      'Conflict resolved: conflict-1',
      { conflictId: 'conflict-1', resolutionMethod: 'AI_SUGGESTION', resolvedValue: '$1,500,000', userId: 'user-1' }
    );
  });

  it('logConflictSkipped should log skip action', async () => {
    const logSpy = jest.spyOn(logger, 'info');

    await logger.logConflictSkipped('conflict-1', 'user-1');

    expect(logSpy).toHaveBeenCalledWith(
      COMPONENTS.CONFLICT_RESOLVER,
      'Conflict skipped: conflict-1',
      { conflictId: 'conflict-1', userId: 'user-1' }
    );
  });

  it('logBulkVerification should log bulk action', async () => {
    const logSpy = jest.spyOn(logger, 'info');
    const claimIds = ['c1', 'c2', 'c3'];

    await logger.logBulkVerification(claimIds, 'VERIFY', 'user-1', 1500);

    expect(logSpy).toHaveBeenCalledWith(
      COMPONENTS.BULK_VERIFICATION,
      'Bulk VERIFY: 3 claims',
      expect.objectContaining({ claimCount: 3, action: 'VERIFY', userId: 'user-1', duration: 1500 })
    );
  });

  it('logReviewWorkflowStep should log workflow step', async () => {
    const logSpy = jest.spyOn(logger, 'info');

    await logger.logReviewWorkflowStep('VERIFY', 'claim-1', 'UNVERIFIED', 'VERIFIED', 'user-1');

    expect(logSpy).toHaveBeenCalledWith(
      COMPONENTS.REVIEW_WORKFLOW,
      'Review step: VERIFY',
      { step: 'VERIFY', claimId: 'claim-1', fromStatus: 'UNVERIFIED', toStatus: 'VERIFIED', userId: 'user-1' }
    );
  });

  it('logReviewSessionStart should log session start', async () => {
    const logSpy = jest.spyOn(logger, 'info');

    await logger.logReviewSessionStart('user-1', 100, 5);

    expect(logSpy).toHaveBeenCalledWith(
      COMPONENTS.REVIEW_WORKFLOW,
      'Review session started',
      { userId: 'user-1', claimCount: 100, conflictCount: 5 }
    );
  });

  it('logReviewSessionComplete should log session complete', async () => {
    const logSpy = jest.spyOn(logger, 'info');

    await logger.logReviewSessionComplete('user-1', 95, 5, 120000);

    expect(logSpy).toHaveBeenCalledWith(
      COMPONENTS.REVIEW_WORKFLOW,
      'Review session completed',
      { userId: 'user-1', verifiedCount: 95, rejectedCount: 5, duration: 120000 }
    );
  });
});

describe('Phase 3 specialized logging methods', () => {
  let logger;

  beforeEach(() => {
    logger = new OnboardingLogger(mockPrisma, {
      sessionId: 'session-123',
      persistToDb: false,
      consoleOutput: false
    });
  });

  it('logQuestionGenerated should log question generation', async () => {
    const logSpy = jest.spyOn(logger, 'info');

    await logger.logQuestionGenerated('q-1', 'LOW_CONFIDENCE', 'claim-1', 0.45);

    expect(logSpy).toHaveBeenCalledWith(
      COMPONENTS.QUESTION_GENERATOR,
      'Question generated: LOW_CONFIDENCE',
      { questionId: 'q-1', questionType: 'LOW_CONFIDENCE', claimId: 'claim-1', confidence: 0.45 }
    );
  });

  it('logQuestionAnswered should log answer', async () => {
    const logSpy = jest.spyOn(logger, 'info');

    await logger.logQuestionAnswered('q-1', 'keep', 'Keep Original', true, 1500);

    expect(logSpy).toHaveBeenCalledWith(
      COMPONENTS.QUESTION_GENERATOR,
      'Question answered: q-1',
      { questionId: 'q-1', answerValue: 'keep', answerLabel: 'Keep Original', wasQuickResponse: true, duration: 1500 }
    );
  });

  it('logQuestionDismissed should log dismissal', async () => {
    const logSpy = jest.spyOn(logger, 'info');

    await logger.logQuestionDismissed('q-1', 'user-1');

    expect(logSpy).toHaveBeenCalledWith(
      COMPONENTS.QUESTION_GENERATOR,
      'Question dismissed: q-1',
      { questionId: 'q-1', userId: 'user-1' }
    );
  });

  it('logChatMessage should log chat message', async () => {
    const logSpy = jest.spyOn(logger, 'debug');

    await logger.logChatMessage('user', 'Test message', 'q-1', 'user-1');

    expect(logSpy).toHaveBeenCalledWith(
      COMPONENTS.CHAT,
      'Chat message: user',
      { messageType: 'user', contentLength: 12, activeQuestionId: 'q-1', userId: 'user-1' }
    );
  });

  it('logChatResponse should log AI response', async () => {
    const logSpy = jest.spyOn(logger, 'debug');

    await logger.logChatResponse('Response text here', 150, 2500);

    expect(logSpy).toHaveBeenCalledWith(
      COMPONENTS.CHAT,
      'Chat response generated',
      { responseLength: 18, tokensUsed: 150, duration: 2500 }
    );
  });

  it('logInsightGenerated should log insight', async () => {
    const logSpy = jest.spyOn(logger, 'info');

    await logger.logInsightGenerated('insight-1', 'DUPLICATE_ENTITY', 'Found potential duplicate', 0.92);

    expect(logSpy).toHaveBeenCalledWith(
      COMPONENTS.INSIGHT_GENERATOR,
      'Insight generated: DUPLICATE_ENTITY',
      { insightId: 'insight-1', insightType: 'DUPLICATE_ENTITY', title: 'Found potential duplicate', confidence: 0.92 }
    );
  });

  it('logInsightAccepted should log acceptance', async () => {
    const logSpy = jest.spyOn(logger, 'info');
    const changes = { mergedRecords: ['r1', 'r2'] };

    await logger.logInsightAccepted('insight-1', 'user-1', changes);

    expect(logSpy).toHaveBeenCalledWith(
      COMPONENTS.INSIGHT_GENERATOR,
      'Insight accepted: insight-1',
      { insightId: 'insight-1', userId: 'user-1', appliedChanges: changes }
    );
  });

  it('logInsightDismissed should log dismissal', async () => {
    const logSpy = jest.spyOn(logger, 'info');

    await logger.logInsightDismissed('insight-1', 'user-1');

    expect(logSpy).toHaveBeenCalledWith(
      COMPONENTS.INSIGHT_GENERATOR,
      'Insight dismissed: insight-1',
      { insightId: 'insight-1', userId: 'user-1' }
    );
  });

  it('logAIAssistantMetrics should log session metrics', async () => {
    const logSpy = jest.spyOn(logger, 'info');

    await logger.logAIAssistantMetrics(10, 8, 5, 3);

    expect(logSpy).toHaveBeenCalledWith(
      COMPONENTS.AI_ASSISTANT,
      'AI Assistant session metrics',
      expect.objectContaining({
        questionsGenerated: 10,
        questionsAnswered: 8,
        insightsGenerated: 5,
        insightsAccepted: 3,
        questionAnswerRate: '80.0%',
        insightAcceptRate: '60.0%'
      })
    );
  });

  it('logAIAssistantError should log errors with context', async () => {
    const logSpy = jest.spyOn(logger, 'error');
    const error = new Error('API timeout');

    await logger.logAIAssistantError('generateQuestions', error, { retryCount: 2 });

    expect(logSpy).toHaveBeenCalledWith(
      COMPONENTS.AI_ASSISTANT,
      'AI Assistant error: generateQuestions',
      expect.objectContaining({
        operation: 'generateQuestions',
        error: 'API timeout',
        retryCount: 2
      })
    );
  });
});

describe('LOG_LEVELS', () => {
  it('should have correct numeric priorities', () => {
    expect(LOG_LEVELS.DEBUG).toBe(0);
    expect(LOG_LEVELS.INFO).toBe(1);
    expect(LOG_LEVELS.WARN).toBe(2);
    expect(LOG_LEVELS.ERROR).toBe(3);
  });

  it('should have correct ordering (DEBUG < INFO < WARN < ERROR)', () => {
    expect(LOG_LEVELS.DEBUG).toBeLessThan(LOG_LEVELS.INFO);
    expect(LOG_LEVELS.INFO).toBeLessThan(LOG_LEVELS.WARN);
    expect(LOG_LEVELS.WARN).toBeLessThan(LOG_LEVELS.ERROR);
  });
});
