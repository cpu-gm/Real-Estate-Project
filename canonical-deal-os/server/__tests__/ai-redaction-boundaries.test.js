/**
 * AI Redaction Boundaries Tests
 *
 * Sprint 1, Days 8-9: Production Readiness
 *
 * These tests verify AI boundary controls:
 * - Sensitive fields are redacted from AI context
 * - AI-generated content is labeled correctly
 * - AI claims cannot directly modify authoritative data
 * - Truth class promotion follows proper workflow
 *
 * Key Invariant:
 * AI-generated content MUST be clearly labeled and CANNOT directly
 * modify authoritative data without human approval.
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createTestLogger } from './utils/security-assertions.js';
import crypto from 'crypto';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Fields that MUST be redacted from AI context
 */
const SENSITIVE_FIELDS = [
  'ssn',
  'socialSecurityNumber',
  'taxId',
  'ein',
  'bankAccount',
  'bankAccountNumber',
  'routingNumber',
  'password',
  'passwordHash',
  'apiKey',
  'secretKey',
  'privateKey',
  'accessToken',
  'refreshToken',
  'creditCardNumber',
  'cvv',
  'pin'
];

/**
 * Fields that should be partially masked
 */
const PARTIALLY_MASKED_FIELDS = [
  'email',
  'phone',
  'phoneNumber',
  'address',
  'driverLicense'
];

// =============================================================================
// REDACTION UTILITIES
// =============================================================================

/**
 * Redact sensitive fields from an object
 */
function redactSensitiveFields(data, sensitiveFields = SENSITIVE_FIELDS) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const redacted = Array.isArray(data) ? [] : {};

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();

    // Check if field is sensitive
    const isSensitive = sensitiveFields.some(f => lowerKey.includes(f.toLowerCase()));

    if (isSensitive) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSensitiveFields(value, sensitiveFields);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Partially mask a value (show first/last chars)
 */
function partialMask(value, showChars = 4) {
  if (!value || typeof value !== 'string') return value;
  if (value.length <= showChars * 2) return '[MASKED]';

  const start = value.substring(0, showChars);
  const end = value.substring(value.length - showChars);
  const masked = '*'.repeat(Math.min(value.length - showChars * 2, 6));

  return `${start}${masked}${end}`;
}

/**
 * Prepare data for AI context with all redactions
 */
function prepareForAI(data) {
  // First pass: fully redact sensitive fields
  let prepared = redactSensitiveFields(data, SENSITIVE_FIELDS);

  // Second pass: partially mask semi-sensitive fields
  prepared = applyPartialMasking(prepared, PARTIALLY_MASKED_FIELDS);

  return prepared;
}

/**
 * Apply partial masking to specific fields
 */
function applyPartialMasking(data, maskFields) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const masked = Array.isArray(data) ? [] : {};

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    const shouldMask = maskFields.some(f => lowerKey.includes(f.toLowerCase()));

    if (shouldMask && typeof value === 'string') {
      masked[key] = partialMask(value);
    } else if (typeof value === 'object' && value !== null) {
      masked[key] = applyPartialMasking(value, maskFields);
    } else {
      masked[key] = value;
    }
  }

  return masked;
}

/**
 * Check if any sensitive data leaked into AI context
 */
function checkForLeaks(originalData, preparedData) {
  const leaks = [];

  function findLeaks(original, prepared, path = '') {
    if (!original || typeof original !== 'object') return;

    for (const [key, value] of Object.entries(original)) {
      const currentPath = path ? `${path}.${key}` : key;
      const lowerKey = key.toLowerCase();

      // Check if this is a sensitive field
      const isSensitive = SENSITIVE_FIELDS.some(f => lowerKey.includes(f.toLowerCase()));

      if (isSensitive && prepared[key] !== '[REDACTED]') {
        leaks.push({
          path: currentPath,
          field: key,
          leaked: true
        });
      }

      // Recurse into nested objects
      if (typeof value === 'object' && value !== null && prepared[key]) {
        findLeaks(value, prepared[key], currentPath);
      }
    }
  }

  findLeaks(originalData, preparedData);
  return leaks;
}

// =============================================================================
// AI CLAIM MANAGER
// =============================================================================

class AIClaimManager {
  constructor() {
    this.claims = new Map();
    this.promotions = [];
  }

  reset() {
    this.claims.clear();
    this.promotions = [];
  }

  /**
   * Create an AI-derived claim
   * Claims start with truthClass 'AI' - cannot be DOC or HUMAN
   */
  createClaim(dealId, field, value, confidence, sourceDocument) {
    const id = crypto.randomUUID();

    const claim = {
      id,
      dealId,
      field,
      value,
      confidence,
      sourceDocument,
      truthClass: 'AI',  // ALWAYS starts as AI
      createdAt: new Date().toISOString(),
      promotedAt: null,
      promotedBy: null
    };

    this.claims.set(id, claim);
    return claim;
  }

  /**
   * Promote a claim from AI to HUMAN
   * Requires explicit human attestation
   */
  promoteClaim(claimId, userId, attestation) {
    const claim = this.claims.get(claimId);
    if (!claim) throw new Error('Claim not found');

    if (claim.truthClass !== 'AI') {
      throw new Error(`Cannot promote claim with truthClass ${claim.truthClass}`);
    }

    claim.truthClass = 'HUMAN';
    claim.promotedAt = new Date().toISOString();
    claim.promotedBy = userId;
    claim.attestation = attestation;

    this.promotions.push({
      claimId,
      userId,
      from: 'AI',
      to: 'HUMAN',
      timestamp: claim.promotedAt
    });

    return claim;
  }

  /**
   * Attempt to create a claim with non-AI truthClass
   * This SHOULD fail - AI cannot create DOC or HUMAN claims
   */
  createClaimWithTruth(dealId, field, value, truthClass) {
    if (truthClass !== 'AI') {
      throw new Error(`AI extraction cannot create claims with truthClass ${truthClass}`);
    }
    return this.createClaim(dealId, field, value, 0.5, null);
  }

  getClaim(id) {
    return this.claims.get(id);
  }

  getClaimsByDeal(dealId) {
    return Array.from(this.claims.values()).filter(c => c.dealId === dealId);
  }

  getPromotions() {
    return this.promotions;
  }
}

// =============================================================================
// TESTS
// =============================================================================

describe('AI Redaction Boundaries', () => {
  let claimManager;
  let logger;

  beforeEach(() => {
    claimManager = new AIClaimManager();
    logger = createTestLogger('ai-redaction');
  });

  describe('Sensitive Field Redaction', () => {
    test('SSN is fully redacted', () => {
      logger.log('Testing SSN redaction');

      const data = {
        name: 'John Doe',
        ssn: '123-45-6789'
      };

      const redacted = redactSensitiveFields(data);

      expect(redacted.name).toBe('John Doe');
      expect(redacted.ssn).toBe('[REDACTED]');

      logger.log('SSN redacted successfully');
    });

    test('Bank account info is fully redacted', () => {
      logger.log('Testing bank info redaction');

      const data = {
        payee: 'Acme Corp',
        bankAccount: '1234567890',
        routingNumber: '021000021',
        bankAccountNumber: '9876543210'
      };

      const redacted = redactSensitiveFields(data);

      expect(redacted.payee).toBe('Acme Corp');
      expect(redacted.bankAccount).toBe('[REDACTED]');
      expect(redacted.routingNumber).toBe('[REDACTED]');
      expect(redacted.bankAccountNumber).toBe('[REDACTED]');

      logger.log('Bank info redacted successfully');
    });

    test('API keys and secrets are fully redacted', () => {
      logger.log('Testing API key redaction');

      const data = {
        service: 'payment-gateway',
        apiKey: 'sk_live_abc123xyz',
        secretKey: 'secret_xyz789',
        publicKey: 'pk_live_public'  // Should NOT be redacted
      };

      const redacted = redactSensitiveFields(data);

      expect(redacted.apiKey).toBe('[REDACTED]');
      expect(redacted.secretKey).toBe('[REDACTED]');
      expect(redacted.publicKey).toBe('pk_live_public');

      logger.log('API keys redacted successfully');
    });

    test('Nested sensitive fields are redacted', () => {
      logger.log('Testing nested redaction');

      const data = {
        deal: {
          name: 'Test Deal',
          seller: {
            name: 'Seller Corp',
            taxId: '12-3456789',
            contact: {
              email: 'seller@example.com',
              ssn: '987-65-4321'
            }
          }
        }
      };

      const redacted = redactSensitiveFields(data);

      expect(redacted.deal.name).toBe('Test Deal');
      expect(redacted.deal.seller.name).toBe('Seller Corp');
      expect(redacted.deal.seller.taxId).toBe('[REDACTED]');
      expect(redacted.deal.seller.contact.ssn).toBe('[REDACTED]');

      logger.log('Nested fields redacted successfully');
    });

    test('Arrays with sensitive fields are redacted', () => {
      logger.log('Testing array redaction');

      const data = {
        investors: [
          { name: 'Investor 1', ssn: '111-11-1111' },
          { name: 'Investor 2', ssn: '222-22-2222' }
        ]
      };

      const redacted = redactSensitiveFields(data);

      expect(redacted.investors[0].name).toBe('Investor 1');
      expect(redacted.investors[0].ssn).toBe('[REDACTED]');
      expect(redacted.investors[1].ssn).toBe('[REDACTED]');

      logger.log('Arrays redacted successfully');
    });
  });

  describe('Partial Masking', () => {
    test('Email is partially masked', () => {
      logger.log('Testing email masking');

      const data = { email: 'john.doe@example.com' };
      const masked = applyPartialMasking(data, PARTIALLY_MASKED_FIELDS);

      expect(masked.email).not.toBe(data.email);
      expect(masked.email).toMatch(/^john.*\.com$/);

      logger.log('Email masked', { original: data.email, masked: masked.email });
    });

    test('Phone number is partially masked', () => {
      logger.log('Testing phone masking');

      const data = { phoneNumber: '555-123-4567' };
      const masked = applyPartialMasking(data, PARTIALLY_MASKED_FIELDS);

      expect(masked.phoneNumber).not.toBe(data.phoneNumber);

      logger.log('Phone masked', { masked: masked.phoneNumber });
    });
  });

  describe('Leak Detection', () => {
    test('Detects unredacted sensitive fields', () => {
      logger.log('Testing leak detection');

      const original = {
        name: 'Test',
        ssn: '123-45-6789',
        bankAccount: '1234567890'
      };

      // Simulate broken redaction (fields not redacted)
      const broken = {
        name: 'Test',
        ssn: '123-45-6789',        // LEAKED
        bankAccount: '[REDACTED]'  // OK
      };

      const leaks = checkForLeaks(original, broken);

      expect(leaks.length).toBe(1);
      expect(leaks[0].field).toBe('ssn');

      logger.log('Leak detected', { leaks });
    });

    test('No leaks when properly redacted', () => {
      logger.log('Testing no leaks');

      const original = {
        ssn: '123-45-6789',
        bankAccount: '1234567890'
      };

      const redacted = redactSensitiveFields(original);
      const leaks = checkForLeaks(original, redacted);

      expect(leaks.length).toBe(0);

      logger.log('No leaks detected');
    });
  });

  describe('Full AI Context Preparation', () => {
    test('prepareForAI applies all protections', () => {
      logger.log('Testing full AI preparation');

      const data = {
        deal: {
          name: 'Test Deal',
          purchasePrice: 10000000
        },
        seller: {
          name: 'Seller Corp',
          taxId: '12-3456789',
          email: 'seller@company.com',
          bankAccount: '9876543210'
        }
      };

      const prepared = prepareForAI(data);

      // Business data preserved
      expect(prepared.deal.name).toBe('Test Deal');
      expect(prepared.deal.purchasePrice).toBe(10000000);

      // Sensitive fully redacted
      expect(prepared.seller.taxId).toBe('[REDACTED]');
      expect(prepared.seller.bankAccount).toBe('[REDACTED]');

      // Semi-sensitive masked
      expect(prepared.seller.email).not.toBe(data.seller.email);
      expect(prepared.seller.email).toMatch(/\*+/);

      logger.log('AI preparation complete');
    });
  });

  describe('AI Claim Truth Class', () => {
    test('AI claims start with truthClass AI', () => {
      logger.log('Testing claim creation');

      const claim = claimManager.createClaim(
        'deal-123',
        'purchasePrice',
        10000000,
        0.95,
        'document-456'
      );

      expect(claim.truthClass).toBe('AI');
      expect(claim.promotedBy).toBeNull();

      logger.log('Claim created with AI truth class');
    });

    test('AI cannot create claims with DOC truthClass', () => {
      logger.log('Testing DOC claim rejection');

      expect(() => {
        claimManager.createClaimWithTruth('deal-123', 'field', 'value', 'DOC');
      }).toThrow(/cannot create claims with truthClass DOC/);

      logger.log('DOC claim correctly rejected');
    });

    test('AI cannot create claims with HUMAN truthClass', () => {
      logger.log('Testing HUMAN claim rejection');

      expect(() => {
        claimManager.createClaimWithTruth('deal-123', 'field', 'value', 'HUMAN');
      }).toThrow(/cannot create claims with truthClass HUMAN/);

      logger.log('HUMAN claim correctly rejected');
    });
  });

  describe('Claim Promotion Workflow', () => {
    test('AI claim can be promoted to HUMAN with attestation', () => {
      logger.log('Testing claim promotion');

      const claim = claimManager.createClaim(
        'deal-123',
        'purchasePrice',
        10000000,
        0.95,
        'document-456'
      );

      expect(claim.truthClass).toBe('AI');

      const promoted = claimManager.promoteClaim(
        claim.id,
        'user-789',
        'Verified against signed contract'
      );

      expect(promoted.truthClass).toBe('HUMAN');
      expect(promoted.promotedBy).toBe('user-789');
      expect(promoted.promotedAt).toBeDefined();
      expect(promoted.attestation).toBe('Verified against signed contract');

      logger.log('Claim promoted to HUMAN');
    });

    test('Promotion is tracked in audit trail', () => {
      logger.log('Testing promotion audit');

      const claim = claimManager.createClaim('deal-123', 'field', 'value', 0.8, null);
      claimManager.promoteClaim(claim.id, 'user-123', 'Verified');

      const promotions = claimManager.getPromotions();

      expect(promotions.length).toBe(1);
      expect(promotions[0].from).toBe('AI');
      expect(promotions[0].to).toBe('HUMAN');
      expect(promotions[0].userId).toBe('user-123');

      logger.log('Promotion audit trail created');
    });

    test('Already promoted claim cannot be promoted again', () => {
      logger.log('Testing double promotion rejection');

      const claim = claimManager.createClaim('deal-123', 'field', 'value', 0.8, null);
      claimManager.promoteClaim(claim.id, 'user-123', 'Verified');

      expect(() => {
        claimManager.promoteClaim(claim.id, 'user-456', 'Second verification');
      }).toThrow(/Cannot promote claim with truthClass HUMAN/);

      logger.log('Double promotion correctly rejected');
    });
  });

  describe('AI Content Labeling', () => {
    test('AI claims include confidence score', () => {
      const claim = claimManager.createClaim(
        'deal-123',
        'noi',
        500000,
        0.87,
        'document-789'
      );

      expect(claim.confidence).toBe(0.87);
    });

    test('AI claims reference source document', () => {
      const claim = claimManager.createClaim(
        'deal-123',
        'capRate',
        0.065,
        0.92,
        'rent-roll-doc-456'
      );

      expect(claim.sourceDocument).toBe('rent-roll-doc-456');
    });
  });
});

describe('Redaction Edge Cases', () => {
  test('Handles null/undefined gracefully', () => {
    expect(redactSensitiveFields(null)).toBeNull();
    expect(redactSensitiveFields(undefined)).toBeUndefined();
  });

  test('Handles empty objects', () => {
    expect(redactSensitiveFields({})).toEqual({});
  });

  test('Handles primitive values', () => {
    expect(redactSensitiveFields('string')).toBe('string');
    expect(redactSensitiveFields(123)).toBe(123);
  });

  test('Case-insensitive field matching', () => {
    const data = {
      SSN: '123-45-6789',
      Ssn: '987-65-4321',
      BANKACCOUNT: '1111111111'
    };

    const redacted = redactSensitiveFields(data);

    expect(redacted.SSN).toBe('[REDACTED]');
    expect(redacted.Ssn).toBe('[REDACTED]');
    expect(redacted.BANKACCOUNT).toBe('[REDACTED]');
  });
});
