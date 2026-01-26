/**
 * OnboardingLogger - Structured logging for onboarding pipeline
 *
 * Provides:
 * - Correlation IDs for tracing related operations
 * - Structured log levels (DEBUG, INFO, WARN, ERROR)
 * - Automatic persistence to OnboardingProcessingLog
 * - Performance timing for AI operations
 * - Token usage tracking
 */

import { v4 as uuidv4 } from 'uuid';

// Log levels with numeric priority for filtering
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

// Component identifiers for categorizing log sources
const COMPONENTS = {
  // Phase 1: Core extraction
  SESSION: 'SESSION',
  EXTRACTOR: 'EXTRACTOR',
  LINKER: 'LINKER',
  VALIDATOR: 'VALIDATOR',
  CONFLICT_RESOLVER: 'CONFLICT_RESOLVER',
  QUIZ_GENERATOR: 'QUIZ_GENERATOR',
  FILE_PROCESSOR: 'FILE_PROCESSOR',
  OAUTH_SYNC: 'OAUTH_SYNC',
  EMAIL_INTAKE: 'EMAIL_INTAKE',
  ACTIVITY: 'ACTIVITY',

  // Phase 2: Split Review
  DOCUMENT_VIEWER: 'DOCUMENT_VIEWER',
  PROVENANCE: 'PROVENANCE',
  REVIEW_WORKFLOW: 'REVIEW_WORKFLOW',
  BULK_VERIFICATION: 'BULK_VERIFICATION',

  // Phase 3: AI Assistant
  AI_ASSISTANT: 'AI_ASSISTANT',
  QUESTION_GENERATOR: 'QUESTION_GENERATOR',
  CHAT: 'CHAT',
  INSIGHT_GENERATOR: 'INSIGHT_GENERATOR',

  // Phase 4: OAuth & Email Integration
  OAUTH: 'OAUTH',
  OAUTH_CALLBACK: 'OAUTH_CALLBACK',
  OAUTH_REFRESH: 'OAUTH_REFRESH',
  EMAIL_FORWARDER: 'EMAIL_FORWARDER',
  EMAIL_CLASSIFY: 'EMAIL_CLASSIFY',

  // Phase 5: Enhanced Data Linking (placeholder)
  LINKER_ML: 'LINKER_ML',
  LINKER_BATCH: 'LINKER_BATCH',
  LINKER_CROSS_SESSION: 'LINKER_CROSS_SESSION',
  NETWORK_GRAPH: 'NETWORK_GRAPH',

  // Phase 6: Verification System (placeholder)
  QUIZ_ANSWER: 'QUIZ_ANSWER',
  SIGNOFF_CHECKLIST: 'SIGNOFF_CHECKLIST',
  SIGNOFF_EXECUTE: 'SIGNOFF_EXECUTE',
  REPORT_GENERATOR: 'REPORT_GENERATOR'
};

class OnboardingLogger {
  constructor(prisma, options = {}) {
    this.prisma = prisma;
    this.sessionId = options.sessionId;
    this.correlationId = options.correlationId || uuidv4();
    this.minLevel = LOG_LEVELS[options.minLevel || 'DEBUG'];
    this.consoleOutput = options.consoleOutput !== false; // Default true
    this.persistToDb = options.persistToDb !== false; // Default true
  }

  /**
   * Create a child logger with the same session but new correlation ID
   */
  child(options = {}) {
    return new OnboardingLogger(this.prisma, {
      sessionId: options.sessionId || this.sessionId,
      correlationId: options.correlationId || uuidv4(),
      minLevel: options.minLevel || Object.keys(LOG_LEVELS).find(k => LOG_LEVELS[k] === this.minLevel),
      consoleOutput: this.consoleOutput,
      persistToDb: this.persistToDb
    });
  }

  /**
   * Create a scoped logger for a specific source/claim
   */
  withContext(context) {
    const logger = this.child({ correlationId: this.correlationId });
    logger._context = { ...this._context, ...context };
    return logger;
  }

  /**
   * Start a timer for measuring operation duration
   */
  startTimer() {
    return {
      startTime: Date.now(),
      elapsed: () => Date.now() - this.startTime
    };
  }

  /**
   * Core logging method
   */
  async _log(level, component, message, details = {}) {
    if (LOG_LEVELS[level] < this.minLevel) return;

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      component,
      correlationId: this.correlationId,
      sessionId: this.sessionId,
      message,
      ...this._context,
      ...details
    };

    // Console output
    if (this.consoleOutput) {
      const prefix = `[${timestamp}] [${level}] [${component}] [${this.correlationId.slice(0, 8)}]`;
      const detailStr = Object.keys(details).length > 0 ? ` ${JSON.stringify(details)}` : '';

      switch (level) {
        case 'ERROR':
          console.error(`${prefix} ${message}${detailStr}`);
          break;
        case 'WARN':
          console.warn(`${prefix} ${message}${detailStr}`);
          break;
        case 'DEBUG':
          console.debug(`${prefix} ${message}${detailStr}`);
          break;
        default:
          console.log(`${prefix} ${message}${detailStr}`);
      }
    }

    // Persist to database
    if (this.persistToDb && this.sessionId && this.prisma) {
      try {
        await this.prisma.onboardingProcessingLog.create({
          data: {
            sessionId: this.sessionId,
            correlationId: this.correlationId,
            level,
            component,
            message,
            sourceId: details.sourceId || this._context?.sourceId,
            claimId: details.claimId || this._context?.claimId,
            details: Object.keys(details).length > 0 ? JSON.stringify(details) : null,
            duration: details.duration,
            tokensUsed: details.tokensUsed
          }
        });
      } catch (err) {
        console.error('[OnboardingLogger] Failed to persist log:', err.message);
      }
    }

    return logEntry;
  }

  // Convenience methods for each level
  debug(component, message, details) {
    return this._log('DEBUG', component, message, details);
  }

  info(component, message, details) {
    return this._log('INFO', component, message, details);
  }

  warn(component, message, details) {
    return this._log('WARN', component, message, details);
  }

  error(component, message, details) {
    return this._log('ERROR', component, message, details);
  }

  // Specialized logging methods for common operations

  /**
   * Log file upload
   */
  async logFileUpload(fileName, fileSize, mimeType) {
    return this.info(COMPONENTS.FILE_PROCESSOR, `File uploaded: ${fileName}`, {
      fileName,
      fileSize,
      mimeType
    });
  }

  /**
   * Log extraction start
   */
  async logExtractionStart(sourceId, fileName) {
    return this.info(COMPONENTS.EXTRACTOR, `Starting extraction: ${fileName}`, {
      sourceId,
      fileName
    });
  }

  /**
   * Log extraction complete with stats
   */
  async logExtractionComplete(sourceId, fileName, claimCount, duration, tokensUsed) {
    return this.info(COMPONENTS.EXTRACTOR, `Extraction complete: ${fileName} - ${claimCount} claims`, {
      sourceId,
      fileName,
      claimCount,
      duration,
      tokensUsed
    });
  }

  /**
   * Log extraction error
   */
  async logExtractionError(sourceId, fileName, error) {
    return this.error(COMPONENTS.EXTRACTOR, `Extraction failed: ${fileName}`, {
      sourceId,
      fileName,
      error: error.message,
      stack: error.stack
    });
  }

  /**
   * Log data link discovery
   */
  async logLinkDiscovered(linkType, sourceKey, targetKey, confidence, method) {
    return this.info(COMPONENTS.LINKER, `Link discovered: ${linkType}`, {
      linkType,
      sourceKey,
      targetKey,
      confidence,
      method
    });
  }

  /**
   * Log conflict detected
   */
  async logConflictDetected(fieldPath, valueA, valueB, sourceA, sourceB) {
    return this.warn(COMPONENTS.CONFLICT_RESOLVER, `Conflict detected: ${fieldPath}`, {
      fieldPath,
      valueA,
      valueB,
      sourceA,
      sourceB
    });
  }

  /**
   * Log AI prompt and response
   */
  async logAICall(operation, prompt, response, tokensUsed, duration) {
    return this.debug(COMPONENTS.EXTRACTOR, `AI call: ${operation}`, {
      operation,
      promptLength: prompt?.length,
      responseLength: response?.length,
      tokensUsed,
      duration
    });
  }

  /**
   * Log stage transition
   */
  async logStageTransition(fromStatus, toStatus, recordCount) {
    return this.info(COMPONENTS.SESSION, `Stage transition: ${fromStatus} -> ${toStatus}`, {
      fromStatus,
      toStatus,
      recordCount
    });
  }

  /**
   * Log verification action
   */
  async logVerification(claimId, action, userId, userName) {
    return this.info(COMPONENTS.VALIDATOR, `Claim ${action}: ${claimId}`, {
      claimId,
      action,
      userId,
      userName
    });
  }

  // ============================================
  // Phase 2: Split Review Logging Methods
  // ============================================

  /**
   * Log document view in split review
   */
  async logDocumentView(sourceId, documentName, docType, userId) {
    return this.info(COMPONENTS.DOCUMENT_VIEWER, `Document viewed: ${documentName}`, {
      sourceId,
      documentName,
      docType,
      userId
    });
  }

  /**
   * Log provenance click-through
   */
  async logProvenanceClick(claimId, sourceId, pageNumber, cellReference) {
    return this.debug(COMPONENTS.PROVENANCE, `Provenance navigated: claim ${claimId}`, {
      claimId,
      sourceId,
      pageNumber,
      cellReference
    });
  }

  /**
   * Log provenance highlight shown
   */
  async logProvenanceHighlight(claimId, textSnippet, documentName) {
    return this.debug(COMPONENTS.PROVENANCE, `Provenance highlighted: ${documentName}`, {
      claimId,
      textSnippet: textSnippet?.slice(0, 100),
      documentName
    });
  }

  /**
   * Log conflict resolution decision
   */
  async logConflictResolution(conflictId, resolutionMethod, resolvedValue, userId) {
    return this.info(COMPONENTS.CONFLICT_RESOLVER, `Conflict resolved: ${conflictId}`, {
      conflictId,
      resolutionMethod,
      resolvedValue,
      userId
    });
  }

  /**
   * Log conflict skipped
   */
  async logConflictSkipped(conflictId, userId) {
    return this.info(COMPONENTS.CONFLICT_RESOLVER, `Conflict skipped: ${conflictId}`, {
      conflictId,
      userId
    });
  }

  /**
   * Log bulk verification action
   */
  async logBulkVerification(claimIds, action, userId, duration) {
    return this.info(COMPONENTS.BULK_VERIFICATION, `Bulk ${action}: ${claimIds.length} claims`, {
      claimCount: claimIds.length,
      claimIds: claimIds.slice(0, 10), // First 10 for debugging
      action,
      userId,
      duration
    });
  }

  /**
   * Log review workflow step
   */
  async logReviewWorkflowStep(step, claimId, fromStatus, toStatus, userId) {
    return this.info(COMPONENTS.REVIEW_WORKFLOW, `Review step: ${step}`, {
      step,
      claimId,
      fromStatus,
      toStatus,
      userId
    });
  }

  /**
   * Log review session start
   */
  async logReviewSessionStart(userId, claimCount, conflictCount) {
    return this.info(COMPONENTS.REVIEW_WORKFLOW, `Review session started`, {
      userId,
      claimCount,
      conflictCount
    });
  }

  /**
   * Log review session complete
   */
  async logReviewSessionComplete(userId, verifiedCount, rejectedCount, duration) {
    return this.info(COMPONENTS.REVIEW_WORKFLOW, `Review session completed`, {
      userId,
      verifiedCount,
      rejectedCount,
      duration
    });
  }

  // ============================================
  // Phase 3: AI Assistant Logging Methods
  // ============================================

  /**
   * Log AI question generated
   */
  async logQuestionGenerated(questionId, questionType, claimId, confidence) {
    return this.info(COMPONENTS.QUESTION_GENERATOR, `Question generated: ${questionType}`, {
      questionId,
      questionType,
      claimId,
      confidence
    });
  }

  /**
   * Log AI question answered
   */
  async logQuestionAnswered(questionId, answerValue, answerLabel, wasQuickResponse, duration) {
    return this.info(COMPONENTS.QUESTION_GENERATOR, `Question answered: ${questionId}`, {
      questionId,
      answerValue,
      answerLabel,
      wasQuickResponse,
      duration
    });
  }

  /**
   * Log AI question dismissed/skipped
   */
  async logQuestionDismissed(questionId, userId) {
    return this.info(COMPONENTS.QUESTION_GENERATOR, `Question dismissed: ${questionId}`, {
      questionId,
      userId
    });
  }

  /**
   * Log chat message sent
   */
  async logChatMessage(messageType, content, activeQuestionId, userId) {
    return this.debug(COMPONENTS.CHAT, `Chat message: ${messageType}`, {
      messageType,
      contentLength: content?.length,
      activeQuestionId,
      userId
    });
  }

  /**
   * Log chat response generated
   */
  async logChatResponse(responseContent, tokensUsed, duration) {
    return this.debug(COMPONENTS.CHAT, `Chat response generated`, {
      responseLength: responseContent?.length,
      tokensUsed,
      duration
    });
  }

  /**
   * Log AI insight generated
   */
  async logInsightGenerated(insightId, insightType, title, confidence) {
    return this.info(COMPONENTS.INSIGHT_GENERATOR, `Insight generated: ${insightType}`, {
      insightId,
      insightType,
      title,
      confidence
    });
  }

  /**
   * Log AI insight accepted
   */
  async logInsightAccepted(insightId, userId, appliedChanges) {
    return this.info(COMPONENTS.INSIGHT_GENERATOR, `Insight accepted: ${insightId}`, {
      insightId,
      userId,
      appliedChanges
    });
  }

  /**
   * Log AI insight dismissed
   */
  async logInsightDismissed(insightId, userId) {
    return this.info(COMPONENTS.INSIGHT_GENERATOR, `Insight dismissed: ${insightId}`, {
      insightId,
      userId
    });
  }

  /**
   * Log AI assistant session metrics
   */
  async logAIAssistantMetrics(questionsGenerated, questionsAnswered, insightsGenerated, insightsAccepted) {
    return this.info(COMPONENTS.AI_ASSISTANT, `AI Assistant session metrics`, {
      questionsGenerated,
      questionsAnswered,
      insightsGenerated,
      insightsAccepted,
      questionAnswerRate: questionsGenerated > 0 ? (questionsAnswered / questionsGenerated * 100).toFixed(1) + '%' : 'N/A',
      insightAcceptRate: insightsGenerated > 0 ? (insightsAccepted / insightsGenerated * 100).toFixed(1) + '%' : 'N/A'
    });
  }

  /**
   * Log AI assistant error
   */
  async logAIAssistantError(operation, error, context = {}) {
    return this.error(COMPONENTS.AI_ASSISTANT, `AI Assistant error: ${operation}`, {
      operation,
      error: error.message,
      stack: error.stack,
      ...context
    });
  }

  // ============================================
  // Phase 4: OAuth & Email Logging Methods
  // ============================================

  /**
   * Log OAuth flow initiation
   */
  async logOAuthInitiate(provider, userId, sessionId) {
    return this.info(COMPONENTS.OAUTH, `OAuth initiated: ${provider}`, {
      provider,
      userId,
      sessionId
    });
  }

  /**
   * Log OAuth callback result
   */
  async logOAuthCallback(provider, success, error, duration) {
    if (success) {
      return this.info(COMPONENTS.OAUTH_CALLBACK, `OAuth connected: ${provider}`, {
        provider,
        duration
      });
    } else {
      return this.error(COMPONENTS.OAUTH_CALLBACK, `OAuth failed: ${provider}`, {
        provider,
        error,
        duration
      });
    }
  }

  /**
   * Log OAuth sync operation
   */
  async logOAuthSync(connectionId, provider, recordCount, duration, tokensUsed = 0) {
    return this.info(COMPONENTS.OAUTH_SYNC, `OAuth sync: ${provider} - ${recordCount} records`, {
      connectionId,
      provider,
      recordCount,
      duration,
      tokensUsed
    });
  }

  /**
   * Log OAuth token refresh
   */
  async logOAuthRefresh(connectionId, provider, success, error) {
    if (success) {
      return this.debug(COMPONENTS.OAUTH_REFRESH, `Token refreshed: ${provider}`, {
        connectionId,
        provider
      });
    } else {
      return this.warn(COMPONENTS.OAUTH_REFRESH, `Token refresh failed: ${provider}`, {
        connectionId,
        provider,
        error
      });
    }
  }

  /**
   * Log email forwarder creation
   */
  async logEmailForwarderCreated(forwarderId, inboundEmail, organizationId) {
    return this.info(COMPONENTS.EMAIL_FORWARDER, `Forwarder created: ${inboundEmail}`, {
      forwarderId,
      inboundEmail,
      organizationId
    });
  }

  /**
   * Log email received
   */
  async logEmailReceived(forwarderId, messageId, fromEmail, attachmentCount) {
    return this.info(COMPONENTS.EMAIL_INTAKE, `Email received from ${fromEmail}`, {
      forwarderId,
      messageId,
      fromEmail,
      attachmentCount
    });
  }

  /**
   * Log email processed
   */
  async logEmailProcessed(forwarderId, messageId, claimsExtracted, duration) {
    return this.info(COMPONENTS.EMAIL_INTAKE, `Email processed: ${claimsExtracted} claims`, {
      forwarderId,
      messageId,
      claimsExtracted,
      duration
    });
  }

  /**
   * Log email rejected
   */
  async logEmailRejected(forwarderId, messageId, fromEmail, reason) {
    return this.warn(COMPONENTS.EMAIL_INTAKE, `Email rejected: ${reason}`, {
      forwarderId,
      messageId,
      fromEmail,
      reason
    });
  }

  /**
   * Log email classification
   */
  async logEmailClassify(emailLogId, category, confidence, duration) {
    return this.info(COMPONENTS.EMAIL_CLASSIFY, `Email classified: ${category}`, {
      emailLogId,
      category,
      confidence,
      duration
    });
  }

  // ============================================
  // Activity Methods
  // ============================================

  /**
   * Create activity record for user-visible feed
   */
  async createActivity(activityType, message, details = {}) {
    if (!this.sessionId || !this.prisma) return null;

    try {
      return await this.prisma.onboardingActivity.create({
        data: {
          sessionId: this.sessionId,
          activityType,
          message,
          details: Object.keys(details).length > 0 ? JSON.stringify(details) : null,
          sourceId: details.sourceId,
          claimId: details.claimId,
          conflictId: details.conflictId,
          linkId: details.linkId
        }
      });
    } catch (err) {
      this.error(COMPONENTS.ACTIVITY, `Failed to create activity: ${err.message}`);
      return null;
    }
  }
}

/**
 * Create a logger for a specific session
 */
function createOnboardingLogger(prisma, sessionId, options = {}) {
  return new OnboardingLogger(prisma, {
    sessionId,
    ...options
  });
}

/**
 * Create a standalone logger (without session - for pre-session operations)
 */
function createStandaloneLogger(prisma, options = {}) {
  return new OnboardingLogger(prisma, {
    persistToDb: false,
    ...options
  });
}

export {
  OnboardingLogger,
  createOnboardingLogger,
  createStandaloneLogger,
  COMPONENTS,
  LOG_LEVELS
};
