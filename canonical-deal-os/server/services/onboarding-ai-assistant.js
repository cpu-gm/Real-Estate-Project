/**
 * Onboarding AI Assistant Service
 *
 * Handles:
 * - Real-time question generation when confidence is low
 * - Suggested quick responses for common clarifications
 * - Chat-based interaction for complex queries
 * - Insight generation for data improvements
 *
 * Integrates with OnboardingLogger for full traceability.
 */

import { getPrisma } from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import { createOnboardingLogger, COMPONENTS } from './onboarding-logger.js';

// OpenAI configuration
const OPENAI_API_KEY = process.env.BFF_OPENAI_API_KEY;
const OPENAI_MODEL = process.env.BFF_OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_BASE_URL = process.env.BFF_OPENAI_BASE_URL || 'https://api.openai.com/v1';

// Question types with templates
const QUESTION_TEMPLATES = {
  DUPLICATE_ENTITY: {
    template: 'I found two entries that might be the same {entityType}. Is "{valueA}" the same as "{valueB}"?',
    quickResponses: [
      { label: 'Yes, same entity', value: 'SAME' },
      { label: 'No, different', value: 'DIFFERENT' },
      { label: 'Not sure', value: 'UNSURE' }
    ]
  },
  LOW_CONFIDENCE: {
    template: 'I extracted "{value}" for {fieldLabel} but I\'m not very confident. Is this correct?',
    quickResponses: [
      { label: 'Yes, correct', value: 'CONFIRM' },
      { label: 'No, incorrect', value: 'REJECT' }
    ]
  },
  MISSING_REQUIRED: {
    template: 'I couldn\'t find {fieldLabel} in the documents. Can you provide it?',
    quickResponses: []
  },
  AMBIGUOUS_VALUE: {
    template: 'I found multiple possible values for {fieldLabel}: {options}. Which one is correct?',
    quickResponses: [] // Dynamically generated from options
  },
  ENTITY_TYPE: {
    template: 'I\'m not sure what type of entity "{entityName}" is. Is it a {options}?',
    quickResponses: [] // Dynamically generated
  },
  DATE_FORMAT: {
    template: 'I found a date "{rawValue}" but I\'m not sure how to interpret it. Is it {options}?',
    quickResponses: []
  },
  RELATIONSHIP: {
    template: 'Is "{entityA}" related to "{entityB}"? If so, how?',
    quickResponses: [
      { label: 'Yes, same person/company', value: 'SAME' },
      { label: 'Yes, affiliated', value: 'AFFILIATED' },
      { label: 'No relationship', value: 'NONE' }
    ]
  }
};

// Confidence thresholds
const THRESHOLDS = {
  LOW_CONFIDENCE: 0.6,      // Ask for confirmation below this
  VERY_LOW_CONFIDENCE: 0.4, // Flag for manual review
  DUPLICATE_SIMILARITY: 0.8 // Similarity score to trigger duplicate check
};

// Add new log component
const AI_ASSISTANT = 'AI_ASSISTANT';

class OnboardingAIAssistantService {
  constructor() {
    this.prisma = null;
    this.logger = null;
  }

  /**
   * Initialize with session context
   */
  init(sessionId) {
    this.prisma = getPrisma();
    this.logger = createOnboardingLogger(this.prisma, sessionId);
    this.sessionId = sessionId;
    return this;
  }

  /**
   * Generate questions based on extraction results
   */
  async generateQuestions(claims, conflicts = [], dataLinks = []) {
    const questions = [];

    // 1. Low confidence claims
    const lowConfidenceClaims = claims.filter(c =>
      c.status === 'UNVERIFIED' && c.confidence < THRESHOLDS.LOW_CONFIDENCE
    );

    for (const claim of lowConfidenceClaims) {
      const question = await this.createQuestion('LOW_CONFIDENCE', {
        claimId: claim.id,
        value: claim.displayValue || claim.value,
        fieldLabel: claim.fieldLabel || claim.fieldPath,
        confidence: claim.confidence,
        context: `From ${claim.documentName}`
      });
      questions.push(question);

      await this.logger?.debug(AI_ASSISTANT, 'Generated low confidence question', {
        claimId: claim.id,
        confidence: claim.confidence
      });
    }

    // 2. Potential duplicates from data links
    const potentialDuplicates = dataLinks.filter(link =>
      link.status === 'PENDING' && link.matchConfidence >= THRESHOLDS.DUPLICATE_SIMILARITY
    );

    for (const link of potentialDuplicates) {
      const question = await this.createQuestion('DUPLICATE_ENTITY', {
        linkId: link.id,
        entityType: link.linkType.replace('_', ' ').toLowerCase(),
        valueA: link.sourceRecordTitle,
        valueB: link.targetRecordTitle,
        confidence: link.matchConfidence
      });
      questions.push(question);

      await this.logger?.debug(AI_ASSISTANT, 'Generated duplicate check question', {
        linkId: link.id,
        confidence: link.matchConfidence
      });
    }

    // 3. Unresolved conflicts
    const unresolvedConflicts = conflicts.filter(c => c.status === 'UNRESOLVED');

    for (const conflict of unresolvedConflicts) {
      const question = await this.createQuestion('AMBIGUOUS_VALUE', {
        conflictId: conflict.id,
        fieldLabel: conflict.fieldLabel || conflict.fieldPath,
        options: `"${conflict.claimA?.value}" or "${conflict.claimB?.value}"`,
        context: `Conflict between ${conflict.claimA?.documentName} and ${conflict.claimB?.documentName}`
      });
      questions.push(question);
    }

    await this.logger?.info(AI_ASSISTANT, `Generated ${questions.length} questions`, {
      lowConfidence: lowConfidenceClaims.length,
      duplicates: potentialDuplicates.length,
      conflicts: unresolvedConflicts.length
    });

    return questions;
  }

  /**
   * Create a question with quick responses
   */
  async createQuestion(type, params) {
    const template = QUESTION_TEMPLATES[type];
    if (!template) {
      throw new Error(`Unknown question type: ${type}`);
    }

    // Build question text from template
    let questionText = template.template;
    for (const [key, value] of Object.entries(params)) {
      questionText = questionText.replace(`{${key}}`, value);
    }

    // Build quick responses
    let quickResponses = [...template.quickResponses];

    // Add dynamic options for certain types
    if (type === 'AMBIGUOUS_VALUE' && params.options) {
      const options = params.options.split(' or ');
      quickResponses = options.map((opt, idx) => ({
        label: opt.replace(/"/g, ''),
        value: `OPTION_${idx}`
      }));
    }

    const question = {
      id: uuidv4(),
      type,
      question: questionText,
      quickResponses,
      context: params.context,
      priority: this.calculatePriority(type, params),
      status: 'PENDING',
      metadata: params,
      createdAt: new Date().toISOString()
    };

    // Persist to database
    if (this.prisma && this.sessionId) {
      await this.prisma.onboardingActivity.create({
        data: {
          sessionId: this.sessionId,
          activityType: 'AI_QUESTION',
          message: questionText,
          details: JSON.stringify(question)
        }
      });
    }

    return question;
  }

  /**
   * Calculate question priority (higher = more urgent)
   */
  calculatePriority(type, params) {
    const basePriorities = {
      MISSING_REQUIRED: 100,
      LOW_CONFIDENCE: 80,
      AMBIGUOUS_VALUE: 70,
      DUPLICATE_ENTITY: 60,
      RELATIONSHIP: 50,
      ENTITY_TYPE: 40,
      DATE_FORMAT: 30
    };

    let priority = basePriorities[type] || 50;

    // Adjust based on confidence (lower confidence = higher priority)
    if (params.confidence) {
      priority += Math.round((1 - params.confidence) * 20);
    }

    return priority;
  }

  /**
   * Process user's answer to a question
   */
  async processAnswer(questionId, answer, answerLabel) {
    await this.logger?.info(AI_ASSISTANT, 'Processing question answer', {
      questionId,
      answer,
      answerLabel
    });

    // Get the question from activity log
    const activity = await this.prisma?.onboardingActivity.findFirst({
      where: {
        sessionId: this.sessionId,
        activityType: 'AI_QUESTION',
        details: { contains: questionId }
      }
    });

    if (!activity) {
      await this.logger?.warn(AI_ASSISTANT, 'Question not found', { questionId });
      return { success: false, error: 'Question not found' };
    }

    const question = JSON.parse(activity.details);

    // Apply the answer based on question type
    let result;
    switch (question.type) {
      case 'LOW_CONFIDENCE':
        result = await this.applyConfidenceAnswer(question.metadata, answer);
        break;
      case 'DUPLICATE_ENTITY':
        result = await this.applyDuplicateAnswer(question.metadata, answer);
        break;
      case 'AMBIGUOUS_VALUE':
        result = await this.applyAmbiguousAnswer(question.metadata, answer);
        break;
      default:
        result = { applied: false };
    }

    // Log the answer application
    await this.logger?.info(AI_ASSISTANT, 'Applied question answer', {
      questionId,
      questionType: question.type,
      answer,
      result
    });

    // Create activity for the answer
    await this.prisma?.onboardingActivity.create({
      data: {
        sessionId: this.sessionId,
        activityType: 'AI_ANSWER',
        message: `Answered: ${answerLabel}`,
        details: JSON.stringify({
          questionId,
          answer,
          answerLabel,
          result
        })
      }
    });

    return { success: true, result };
  }

  /**
   * Apply answer to low confidence claim
   */
  async applyConfidenceAnswer(metadata, answer) {
    const { claimId } = metadata;

    if (answer === 'CONFIRM') {
      // Boost confidence and mark as verified
      await this.prisma?.onboardingClaim.update({
        where: { id: claimId },
        data: {
          confidence: 1.0,
          status: 'VERIFIED',
          verifiedAt: new Date(),
          verifiedByName: 'AI Assistant (User Confirmed)'
        }
      });
      return { applied: true, action: 'VERIFIED' };
    } else if (answer === 'REJECT') {
      // Mark as rejected
      await this.prisma?.onboardingClaim.update({
        where: { id: claimId },
        data: {
          status: 'REJECTED',
          rejectionReason: 'User indicated value is incorrect'
        }
      });
      return { applied: true, action: 'REJECTED' };
    }

    return { applied: false };
  }

  /**
   * Apply answer to duplicate entity question
   */
  async applyDuplicateAnswer(metadata, answer) {
    const { linkId } = metadata;

    if (answer === 'SAME') {
      await this.prisma?.onboardingDataLink.update({
        where: { id: linkId },
        data: {
          status: 'CONFIRMED',
          verifiedAt: new Date(),
          verifiedByName: 'AI Assistant (User Confirmed)'
        }
      });
      return { applied: true, action: 'CONFIRMED_DUPLICATE' };
    } else if (answer === 'DIFFERENT') {
      await this.prisma?.onboardingDataLink.update({
        where: { id: linkId },
        data: {
          status: 'REJECTED',
          rejectionReason: 'User confirmed entities are different'
        }
      });
      return { applied: true, action: 'REJECTED_DUPLICATE' };
    }

    return { applied: false };
  }

  /**
   * Apply answer to ambiguous value question
   */
  async applyAmbiguousAnswer(metadata, answer) {
    const { conflictId } = metadata;

    if (answer.startsWith('OPTION_')) {
      const optionIndex = parseInt(answer.replace('OPTION_', ''));

      // Get the conflict
      const conflict = await this.prisma?.onboardingConflict.findUnique({
        where: { id: conflictId },
        include: { claimA: true, claimB: true }
      });

      if (conflict) {
        const selectedClaim = optionIndex === 0 ? conflict.claimA : conflict.claimB;

        await this.prisma?.onboardingConflict.update({
          where: { id: conflictId },
          data: {
            status: 'USER_RESOLVED',
            resolutionMethod: `USER_SELECTED_${optionIndex === 0 ? 'A' : 'B'}`,
            resolvedValue: selectedClaim?.value,
            resolvedAt: new Date(),
            resolvedByName: 'AI Assistant'
          }
        });

        return { applied: true, action: 'CONFLICT_RESOLVED', selectedValue: selectedClaim?.value };
      }
    }

    return { applied: false };
  }

  /**
   * Generate chat response for free-form user message
   */
  async generateChatResponse(userMessage, context = {}) {
    if (!OPENAI_API_KEY) {
      return {
        message: "I'm unable to process your message right now. Please try again later.",
        error: 'api_key_not_configured'
      };
    }

    const timer = Date.now();

    try {
      // Build context for the AI
      const systemPrompt = `You are an AI assistant helping with Commercial Real Estate data import.
You help users clarify data, resolve conflicts, and answer questions about the import process.

Current session context:
- Session ID: ${this.sessionId}
- Total claims: ${context.claimCount || 'unknown'}
- Pending verification: ${context.pendingCount || 'unknown'}

Be concise, professional, and helpful. If you don't know something, say so.`;

      const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          temperature: 0.7,
          max_tokens: 500
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const aiMessage = data.choices?.[0]?.message?.content || "I couldn't generate a response.";
      const tokensUsed = data.usage?.total_tokens || 0;
      const duration = Date.now() - timer;

      await this.logger?.logAICall('chat_response', userMessage.slice(0, 100), aiMessage.slice(0, 100), tokensUsed, duration);

      return { message: aiMessage, tokensUsed, duration };

    } catch (error) {
      await this.logger?.error(AI_ASSISTANT, 'Chat response failed', { error: error.message });
      return {
        message: "I encountered an error processing your message. Please try again.",
        error: error.message
      };
    }
  }

  /**
   * Generate insights based on extracted data
   */
  async generateInsights(claims, dataLinks) {
    const insights = [];

    // 1. Check for potential missing data
    const requiredFields = ['propertyName', 'propertyAddress', 'askingPrice'];
    const extractedFields = new Set(claims.map(c => c.fieldPath));

    for (const field of requiredFields) {
      if (!extractedFields.has(field)) {
        insights.push({
          id: uuidv4(),
          type: 'MISSING_DATA',
          title: 'Missing Required Field',
          description: `The ${field.replace(/([A-Z])/g, ' $1').toLowerCase()} field was not found in any documents.`,
          confidence: 0.9,
          action: 'ADD_MANUALLY',
          priority: 'high'
        });
      }
    }

    // 2. Check for high-value data links
    const confirmedLinks = dataLinks.filter(l => l.status === 'CONFIRMED');
    if (confirmedLinks.length > 0) {
      insights.push({
        id: uuidv4(),
        type: 'DATA_LINKED',
        title: 'Data Connections Found',
        description: `Found ${confirmedLinks.length} verified connections between records.`,
        confidence: 1.0,
        action: 'REVIEW',
        priority: 'low'
      });
    }

    // 3. Check for verification progress
    const verifiedCount = claims.filter(c => c.status === 'VERIFIED').length;
    const totalCount = claims.length;
    const progress = totalCount > 0 ? verifiedCount / totalCount : 0;

    if (progress >= 0.8) {
      insights.push({
        id: uuidv4(),
        type: 'READY_FOR_REVIEW',
        title: 'Almost Ready',
        description: `${Math.round(progress * 100)}% of data has been verified. Consider finalizing the import.`,
        confidence: 0.95,
        action: 'FINALIZE',
        priority: 'medium'
      });
    }

    await this.logger?.info(AI_ASSISTANT, `Generated ${insights.length} insights`);

    return insights;
  }

  /**
   * Dismiss a question (user chose to skip)
   */
  async dismissQuestion(questionId) {
    await this.logger?.info(AI_ASSISTANT, 'Question dismissed', { questionId });

    await this.prisma?.onboardingActivity.create({
      data: {
        sessionId: this.sessionId,
        activityType: 'AI_QUESTION_DISMISSED',
        message: 'User skipped question',
        details: JSON.stringify({ questionId })
      }
    });

    return { success: true };
  }
}

// Export singleton and class
const onboardingAIAssistantService = new OnboardingAIAssistantService();

export {
  onboardingAIAssistantService,
  OnboardingAIAssistantService,
  QUESTION_TEMPLATES,
  THRESHOLDS
};
