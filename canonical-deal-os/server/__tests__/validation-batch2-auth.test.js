/**
 * Batch 2: Auth Routes Validation Tests
 *
 * Tests Zod schema validation for signup, magic links, and AI consent routes.
 */

import { jest } from '@jest/globals';
import {
  SignupSchema,
  CreateMagicLinkSchema,
  GrantConsentSchema
} from '../middleware/route-schemas.js';

describe('Batch 2: Auth Routes Validation', () => {

  // ===== Signup Schema =====

  describe('SignupSchema', () => {
    test('rejects missing email', () => {
      const result = SignupSchema.safeParse({
        password: 'password123',
        name: 'Test User'
      });
      expect(result.success).toBe(false);
      expect(result.error.errors.some(e => e.path.includes('email'))).toBe(true);
    });

    test('rejects invalid email format', () => {
      const result = SignupSchema.safeParse({
        email: 'not-an-email',
        password: 'password123',
        name: 'Test User'
      });
      expect(result.success).toBe(false);
      expect(result.error.errors.some(e => e.path.includes('email'))).toBe(true);
    });

    test('rejects missing password', () => {
      const result = SignupSchema.safeParse({
        email: 'test@example.com',
        name: 'Test User'
      });
      expect(result.success).toBe(false);
      expect(result.error.errors.some(e => e.path.includes('password'))).toBe(true);
    });

    test('rejects short password (< 8 chars)', () => {
      const result = SignupSchema.safeParse({
        email: 'test@example.com',
        password: 'short',
        name: 'Test User'
      });
      expect(result.success).toBe(false);
      expect(result.error.errors.some(e => e.message.includes('8 characters'))).toBe(true);
    });

    test('rejects missing name', () => {
      const result = SignupSchema.safeParse({
        email: 'test@example.com',
        password: 'password123'
      });
      expect(result.success).toBe(false);
      expect(result.error.errors.some(e => e.path.includes('name'))).toBe(true);
    });

    test('rejects empty name', () => {
      const result = SignupSchema.safeParse({
        email: 'test@example.com',
        password: 'password123',
        name: ''
      });
      expect(result.success).toBe(false);
    });

    test('rejects invalid role', () => {
      const result = SignupSchema.safeParse({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        role: 'INVALID_ROLE'
      });
      expect(result.success).toBe(false);
    });

    test('accepts valid role GP', () => {
      const result = SignupSchema.safeParse({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        role: 'GP'
      });
      expect(result.success).toBe(true);
      expect(result.data.role).toBe('GP');
    });

    test('requires broker license for Broker role', () => {
      const result = SignupSchema.safeParse({
        email: 'broker@example.com',
        password: 'password123',
        name: 'Broker User',
        role: 'Broker'
        // Missing brokerLicenseNo, brokerLicenseState
      });
      expect(result.success).toBe(false);
    });

    test('accepts Broker role with license info', () => {
      const result = SignupSchema.safeParse({
        email: 'broker@example.com',
        password: 'password123',
        name: 'Broker User',
        role: 'Broker',
        brokerLicenseNo: 'BRK-12345',
        brokerLicenseState: 'CA'
      });
      expect(result.success).toBe(true);
    });

    test('accepts valid signup with required fields only', () => {
      const result = SignupSchema.safeParse({
        email: 'newuser@example.com',
        password: 'securepassword123',
        name: 'New User'
      });
      expect(result.success).toBe(true);
      expect(result.data.email).toBe('newuser@example.com');
    });

    test('accepts valid signup with optional organizationId', () => {
      const result = SignupSchema.safeParse({
        email: 'newuser@example.com',
        password: 'securepassword123',
        name: 'New User',
        organizationId: '550e8400-e29b-41d4-a716-446655440000'
      });
      expect(result.success).toBe(true);
      expect(result.data.organizationId).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    test('rejects invalid organizationId UUID', () => {
      const result = SignupSchema.safeParse({
        email: 'newuser@example.com',
        password: 'securepassword123',
        name: 'New User',
        organizationId: 'not-a-uuid'
      });
      expect(result.success).toBe(false);
    });
  });

  // ===== Magic Link Schema =====

  describe('CreateMagicLinkSchema', () => {
    test('rejects missing dealId', () => {
      const result = CreateMagicLinkSchema.safeParse({
        recipientEmail: 'lender@bank.com',
        recipientRole: 'LENDER'
      });
      expect(result.success).toBe(false);
      expect(result.error.errors.some(e => e.path.includes('dealId'))).toBe(true);
    });

    test('rejects invalid dealId UUID', () => {
      const result = CreateMagicLinkSchema.safeParse({
        dealId: 'not-a-uuid',
        recipientEmail: 'lender@bank.com',
        recipientRole: 'LENDER'
      });
      expect(result.success).toBe(false);
    });

    test('rejects missing recipientEmail', () => {
      const result = CreateMagicLinkSchema.safeParse({
        dealId: '550e8400-e29b-41d4-a716-446655440000',
        recipientRole: 'LENDER'
      });
      expect(result.success).toBe(false);
      expect(result.error.errors.some(e => e.path.includes('recipientEmail'))).toBe(true);
    });

    test('rejects invalid recipientEmail', () => {
      const result = CreateMagicLinkSchema.safeParse({
        dealId: '550e8400-e29b-41d4-a716-446655440000',
        recipientEmail: 'not-an-email',
        recipientRole: 'LENDER'
      });
      expect(result.success).toBe(false);
    });

    test('rejects missing recipientRole', () => {
      const result = CreateMagicLinkSchema.safeParse({
        dealId: '550e8400-e29b-41d4-a716-446655440000',
        recipientEmail: 'lender@bank.com'
      });
      expect(result.success).toBe(false);
      expect(result.error.errors.some(e => e.path.includes('recipientRole'))).toBe(true);
    });

    test('rejects invalid recipientRole', () => {
      const result = CreateMagicLinkSchema.safeParse({
        dealId: '550e8400-e29b-41d4-a716-446655440000',
        recipientEmail: 'lender@bank.com',
        recipientRole: 'INVESTOR'
      });
      expect(result.success).toBe(false);
      expect(result.error.errors.some(e => e.message.includes('LENDER or COUNSEL'))).toBe(true);
    });

    test('accepts LENDER role', () => {
      const result = CreateMagicLinkSchema.safeParse({
        dealId: '550e8400-e29b-41d4-a716-446655440000',
        recipientEmail: 'lender@bank.com',
        recipientRole: 'LENDER'
      });
      expect(result.success).toBe(true);
      expect(result.data.recipientRole).toBe('LENDER');
    });

    test('accepts COUNSEL role', () => {
      const result = CreateMagicLinkSchema.safeParse({
        dealId: '550e8400-e29b-41d4-a716-446655440000',
        recipientEmail: 'counsel@lawfirm.com',
        recipientRole: 'COUNSEL'
      });
      expect(result.success).toBe(true);
      expect(result.data.recipientRole).toBe('COUNSEL');
    });

    test('uses default actionType', () => {
      const result = CreateMagicLinkSchema.safeParse({
        dealId: '550e8400-e29b-41d4-a716-446655440000',
        recipientEmail: 'lender@bank.com',
        recipientRole: 'LENDER'
      });
      expect(result.success).toBe(true);
      expect(result.data.actionType).toBe('view_deal');
    });

    test('uses default expiresInDays', () => {
      const result = CreateMagicLinkSchema.safeParse({
        dealId: '550e8400-e29b-41d4-a716-446655440000',
        recipientEmail: 'lender@bank.com',
        recipientRole: 'LENDER'
      });
      expect(result.success).toBe(true);
      expect(result.data.expiresInDays).toBe(7);
    });

    test('rejects expiresInDays > 30', () => {
      const result = CreateMagicLinkSchema.safeParse({
        dealId: '550e8400-e29b-41d4-a716-446655440000',
        recipientEmail: 'lender@bank.com',
        recipientRole: 'LENDER',
        expiresInDays: 60
      });
      expect(result.success).toBe(false);
    });

    test('rejects expiresInDays < 1', () => {
      const result = CreateMagicLinkSchema.safeParse({
        dealId: '550e8400-e29b-41d4-a716-446655440000',
        recipientEmail: 'lender@bank.com',
        recipientRole: 'LENDER',
        expiresInDays: 0
      });
      expect(result.success).toBe(false);
    });

    test('accepts valid expiresInDays', () => {
      const result = CreateMagicLinkSchema.safeParse({
        dealId: '550e8400-e29b-41d4-a716-446655440000',
        recipientEmail: 'lender@bank.com',
        recipientRole: 'LENDER',
        expiresInDays: 14
      });
      expect(result.success).toBe(true);
      expect(result.data.expiresInDays).toBe(14);
    });
  });

  // ===== Grant Consent Schema =====

  describe('GrantConsentSchema', () => {
    test('accepts empty body (all defaults)', () => {
      const result = GrantConsentSchema.safeParse({});
      expect(result.success).toBe(true);
      // All defaults should be true
      expect(result.data.allowDealParsing).toBe(true);
      expect(result.data.allowChatAssistant).toBe(true);
      expect(result.data.allowDocumentAnalysis).toBe(true);
      expect(result.data.allowInsights).toBe(true);
    });

    test('accepts explicit false values', () => {
      const result = GrantConsentSchema.safeParse({
        allowDealParsing: false,
        allowChatAssistant: true
      });
      expect(result.success).toBe(true);
      expect(result.data.allowDealParsing).toBe(false);
      expect(result.data.allowChatAssistant).toBe(true);
    });

    test('accepts all explicit values', () => {
      const result = GrantConsentSchema.safeParse({
        allowDealParsing: false,
        allowChatAssistant: false,
        allowDocumentAnalysis: false,
        allowInsights: false
      });
      expect(result.success).toBe(true);
      expect(result.data.allowDealParsing).toBe(false);
      expect(result.data.allowChatAssistant).toBe(false);
      expect(result.data.allowDocumentAnalysis).toBe(false);
      expect(result.data.allowInsights).toBe(false);
    });

    test('rejects non-boolean values', () => {
      const result = GrantConsentSchema.safeParse({
        allowDealParsing: 'yes'
      });
      expect(result.success).toBe(false);
    });
  });
});
