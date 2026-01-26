/**
 * Batch 5: Deal Intake & DD Checklist Validation Tests
 *
 * Tests Zod schema validation for deal drafts, DD checklist,
 * deal assignments, review requests, deal state, and deal submissions.
 */

import { jest } from '@jest/globals';
import {
  CreateDraftSchema,
  PasteTextSchema,
  UploadDocumentsSchema,
  AddBrokerSchema,
  SetSellerSchema,
  VerifyClaimSchema,
  ResolveConflictSchema,
  AdvanceStatusSchema,
  ConvertToDealSchema,
  UpdateDraftSchema,
  CreateListingSchema,
  CounterOfferSchema,
  CreateListingConfigSchema,
  ConfirmAgreementSchema,
  InitializeChecklistSchema,
  UpdateDDItemSchema,
  AssignDDItemSchema,
  LinkDocumentSchema,
  VerifyDDItemSchema,
  MarkNASchema,
  AddCustomDDItemSchema,
  ProcessDocumentSchema,
  ApproveMatchSchema,
  RejectMatchSchema,
  AssignAnalystSchema,
  BulkAssignAnalystSchema,
  CreateReviewRequestSchema,
  RespondToReviewSchema,
  TransitionStateSchema,
  SubmitDealSchema
} from '../middleware/route-schemas.js';

describe('Batch 5: Deal Intake & DD Checklist Validation', () => {

  // ===== Deal Intake Schemas =====

  describe('CreateDraftSchema', () => {
    test('rejects missing ingestSource', () => {
      const result = CreateDraftSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('rejects invalid ingestSource', () => {
      const result = CreateDraftSchema.safeParse({ ingestSource: 'INVALID' });
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('ingestSource');
    });

    test('accepts valid MANUAL source', () => {
      const result = CreateDraftSchema.safeParse({ ingestSource: 'MANUAL' });
      expect(result.success).toBe(true);
      expect(result.data.ingestSource).toBe('MANUAL');
    });

    test('accepts valid EMAIL source', () => {
      const result = CreateDraftSchema.safeParse({ ingestSource: 'EMAIL' });
      expect(result.success).toBe(true);
    });

    test('accepts valid PDF source', () => {
      const result = CreateDraftSchema.safeParse({ ingestSource: 'PDF' });
      expect(result.success).toBe(true);
    });

    test('accepts optional seller object', () => {
      const result = CreateDraftSchema.safeParse({
        ingestSource: 'MANUAL',
        seller: { email: 'seller@example.com', name: 'Test Seller' }
      });
      expect(result.success).toBe(true);
      expect(result.data.seller.email).toBe('seller@example.com');
    });
  });

  describe('PasteTextSchema', () => {
    test('rejects missing text', () => {
      const result = PasteTextSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('rejects empty text', () => {
      const result = PasteTextSchema.safeParse({ text: '' });
      expect(result.success).toBe(false);
    });

    test('accepts valid text', () => {
      const result = PasteTextSchema.safeParse({ text: 'Property details here' });
      expect(result.success).toBe(true);
    });

    test('uses default sourceName', () => {
      const result = PasteTextSchema.safeParse({ text: 'Some text' });
      expect(result.success).toBe(true);
      expect(result.data.sourceName).toBe('Pasted Text');
    });
  });

  describe('UploadDocumentsSchema', () => {
    test('rejects missing documents', () => {
      const result = UploadDocumentsSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('rejects empty documents array', () => {
      const result = UploadDocumentsSchema.safeParse({ documents: [] });
      expect(result.success).toBe(false);
    });

    test('accepts valid documents array', () => {
      const result = UploadDocumentsSchema.safeParse({
        documents: [{ name: 'doc.pdf', type: 'pdf', size: 1024 }]
      });
      expect(result.success).toBe(true);
      expect(result.data.documents).toHaveLength(1);
    });
  });

  describe('AddBrokerSchema', () => {
    test('rejects missing email', () => {
      const result = AddBrokerSchema.safeParse({ name: 'Test Broker' });
      expect(result.success).toBe(false);
    });

    test('rejects invalid email format', () => {
      const result = AddBrokerSchema.safeParse({ email: 'not-email', name: 'Test' });
      expect(result.success).toBe(false);
      expect(result.error.errors.some(e => e.path.includes('email'))).toBe(true);
    });

    test('rejects missing name', () => {
      const result = AddBrokerSchema.safeParse({ email: 'broker@example.com' });
      expect(result.success).toBe(false);
    });

    test('accepts valid broker', () => {
      const result = AddBrokerSchema.safeParse({
        email: 'broker@example.com',
        name: 'Test Broker',
        firmName: 'Test Firm'
      });
      expect(result.success).toBe(true);
    });
  });

  describe('SetSellerSchema', () => {
    test('rejects missing email', () => {
      const result = SetSellerSchema.safeParse({ name: 'Test Seller' });
      expect(result.success).toBe(false);
    });

    test('rejects missing name', () => {
      const result = SetSellerSchema.safeParse({ email: 'seller@example.com' });
      expect(result.success).toBe(false);
    });

    test('accepts valid seller with optional fields', () => {
      const result = SetSellerSchema.safeParse({
        email: 'seller@example.com',
        name: 'Test Seller',
        entityName: 'Seller LLC',
        hasDirectAccess: true,
        receiveNotifications: true
      });
      expect(result.success).toBe(true);
      expect(result.data.hasDirectAccess).toBe(true);
    });
  });

  describe('VerifyClaimSchema', () => {
    test('rejects missing action', () => {
      const result = VerifyClaimSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('rejects invalid action', () => {
      const result = VerifyClaimSchema.safeParse({ action: 'invalid' });
      expect(result.success).toBe(false);
    });

    test('accepts confirm action', () => {
      const result = VerifyClaimSchema.safeParse({ action: 'confirm' });
      expect(result.success).toBe(true);
    });

    test('accepts reject action with reason', () => {
      const result = VerifyClaimSchema.safeParse({
        action: 'reject',
        rejectionReason: 'Incorrect value'
      });
      expect(result.success).toBe(true);
    });
  });

  describe('ResolveConflictSchema', () => {
    test('rejects missing method', () => {
      const result = ResolveConflictSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('rejects invalid method', () => {
      const result = ResolveConflictSchema.safeParse({ method: 'INVALID' });
      expect(result.success).toBe(false);
    });

    test('accepts CHOSE_CLAIM_A', () => {
      const result = ResolveConflictSchema.safeParse({ method: 'CHOSE_CLAIM_A' });
      expect(result.success).toBe(true);
    });

    test('accepts MANUAL_OVERRIDE with resolvedValue', () => {
      const result = ResolveConflictSchema.safeParse({
        method: 'MANUAL_OVERRIDE',
        resolvedValue: 'Custom value'
      });
      expect(result.success).toBe(true);
    });
  });

  describe('CreateListingSchema', () => {
    test('accepts empty object (all optional)', () => {
      const result = CreateListingSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test('rejects range pricing without priceMin/priceMax', () => {
      const result = CreateListingSchema.safeParse({ pricingType: 'range' });
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('priceMin and priceMax');
    });

    test('rejects priceMax less than priceMin', () => {
      const result = CreateListingSchema.safeParse({
        pricingType: 'range',
        priceMin: 100000,
        priceMax: 50000
      });
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('priceMax must be greater');
    });

    test('accepts valid range pricing', () => {
      const result = CreateListingSchema.safeParse({
        pricingType: 'range',
        priceMin: 100000,
        priceMax: 200000
      });
      expect(result.success).toBe(true);
    });

    test('accepts fixed pricing', () => {
      const result = CreateListingSchema.safeParse({
        pricingType: 'fixed',
        askingPrice: 150000
      });
      expect(result.success).toBe(true);
    });
  });

  describe('CounterOfferSchema', () => {
    test('rejects missing commissionType', () => {
      const result = CounterOfferSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('rejects invalid commissionType', () => {
      const result = CounterOfferSchema.safeParse({ commissionType: 'INVALID' });
      expect(result.success).toBe(false);
    });

    test('accepts PERCENTAGE with rate', () => {
      const result = CounterOfferSchema.safeParse({
        commissionType: 'PERCENTAGE',
        commissionRate: 5
      });
      expect(result.success).toBe(true);
    });

    test('accepts FLAT with amount', () => {
      const result = CounterOfferSchema.safeParse({
        commissionType: 'FLAT',
        commissionAmount: 10000
      });
      expect(result.success).toBe(true);
    });
  });

  describe('CreateListingConfigSchema', () => {
    test('uses default visibility PLATFORM', () => {
      const result = CreateListingConfigSchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data.visibility).toBe('PLATFORM');
    });

    test('accepts INVITE_ONLY visibility', () => {
      const result = CreateListingConfigSchema.safeParse({ visibility: 'INVITE_ONLY' });
      expect(result.success).toBe(true);
    });

    test('rejects invalid visibility', () => {
      const result = CreateListingConfigSchema.safeParse({ visibility: 'INVALID' });
      expect(result.success).toBe(false);
    });
  });

  describe('ConfirmAgreementSchema', () => {
    test('rejects missing agreementId', () => {
      const result = ConfirmAgreementSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('accepts valid agreementId', () => {
      const result = ConfirmAgreementSchema.safeParse({ agreementId: 'agreement-123' });
      expect(result.success).toBe(true);
    });

    test('accepts optional role', () => {
      const result = ConfirmAgreementSchema.safeParse({
        agreementId: 'agreement-123',
        role: 'SELLER'
      });
      expect(result.success).toBe(true);
    });
  });

  // ===== DD Checklist Schemas =====

  describe('InitializeChecklistSchema', () => {
    test('accepts empty object (all optional)', () => {
      const result = InitializeChecklistSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test('rejects invalid date format', () => {
      const result = InitializeChecklistSchema.safeParse({
        psaEffectiveDate: 'March 1, 2026'
      });
      expect(result.success).toBe(false);
    });

    test('accepts valid dates', () => {
      const result = InitializeChecklistSchema.safeParse({
        psaEffectiveDate: '2026-03-01',
        ddExpirationDate: '2026-04-01',
        targetClosingDate: '2026-05-01'
      });
      expect(result.success).toBe(true);
    });
  });

  describe('UpdateDDItemSchema', () => {
    test('rejects missing status', () => {
      const result = UpdateDDItemSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('rejects invalid status', () => {
      const result = UpdateDDItemSchema.safeParse({ status: 'INVALID' });
      expect(result.success).toBe(false);
    });

    test('accepts IN_PROGRESS status', () => {
      const result = UpdateDDItemSchema.safeParse({ status: 'IN_PROGRESS' });
      expect(result.success).toBe(true);
    });

    test('accepts COMPLETE with notes', () => {
      const result = UpdateDDItemSchema.safeParse({
        status: 'COMPLETE',
        notes: 'All documents verified'
      });
      expect(result.success).toBe(true);
    });
  });

  describe('AssignDDItemSchema', () => {
    test('rejects missing assigneeUserId', () => {
      const result = AssignDDItemSchema.safeParse({ assigneeName: 'Test User' });
      expect(result.success).toBe(false);
    });

    test('rejects missing assigneeName', () => {
      const result = AssignDDItemSchema.safeParse({ assigneeUserId: 'user-123' });
      expect(result.success).toBe(false);
    });

    test('accepts valid assignment', () => {
      const result = AssignDDItemSchema.safeParse({
        assigneeUserId: 'user-123',
        assigneeName: 'Test User'
      });
      expect(result.success).toBe(true);
    });
  });

  describe('MarkNASchema', () => {
    test('rejects missing reason', () => {
      const result = MarkNASchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('rejects empty reason', () => {
      const result = MarkNASchema.safeParse({ reason: '' });
      expect(result.success).toBe(false);
    });

    test('accepts valid reason', () => {
      const result = MarkNASchema.safeParse({ reason: 'Not applicable for this deal type' });
      expect(result.success).toBe(true);
    });
  });

  describe('AddCustomDDItemSchema', () => {
    test('rejects missing title', () => {
      const result = AddCustomDDItemSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('accepts title with optional fields', () => {
      const result = AddCustomDDItemSchema.safeParse({
        title: 'Custom Inspection',
        priority: 'HIGH',
        dueDate: '2026-04-15'
      });
      expect(result.success).toBe(true);
    });
  });

  describe('RejectMatchSchema', () => {
    test('rejects missing reason', () => {
      const result = RejectMatchSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('accepts valid reason', () => {
      const result = RejectMatchSchema.safeParse({ reason: 'Document does not match' });
      expect(result.success).toBe(true);
    });
  });

  // ===== Deal Assignments Schemas =====

  describe('AssignAnalystSchema', () => {
    test('rejects missing userId', () => {
      const result = AssignAnalystSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('accepts userId with default role', () => {
      const result = AssignAnalystSchema.safeParse({ userId: 'user-123' });
      expect(result.success).toBe(true);
      expect(result.data.role).toBe('analyst');
    });
  });

  describe('BulkAssignAnalystSchema', () => {
    test('rejects empty dealIds array', () => {
      const result = BulkAssignAnalystSchema.safeParse({ dealIds: [], userId: 'user-1' });
      expect(result.success).toBe(false);
    });

    test('rejects missing userId', () => {
      const result = BulkAssignAnalystSchema.safeParse({ dealIds: ['deal-1'] });
      expect(result.success).toBe(false);
    });

    test('accepts valid bulk assignment', () => {
      const result = BulkAssignAnalystSchema.safeParse({
        dealIds: ['deal-1', 'deal-2'],
        userId: 'user-1',
        userName: 'Test User'
      });
      expect(result.success).toBe(true);
      expect(result.data.dealIds).toHaveLength(2);
    });
  });

  // ===== Review Requests Schemas =====

  describe('CreateReviewRequestSchema', () => {
    test('accepts empty object', () => {
      const result = CreateReviewRequestSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test('accepts optional message', () => {
      const result = CreateReviewRequestSchema.safeParse({ message: 'Please review' });
      expect(result.success).toBe(true);
    });
  });

  describe('RespondToReviewSchema', () => {
    test('rejects missing action', () => {
      const result = RespondToReviewSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('rejects invalid action', () => {
      const result = RespondToReviewSchema.safeParse({ action: 'invalid' });
      expect(result.success).toBe(false);
    });

    test('accepts approve action', () => {
      const result = RespondToReviewSchema.safeParse({ action: 'approve' });
      expect(result.success).toBe(true);
    });

    test('accepts feedback action with message', () => {
      const result = RespondToReviewSchema.safeParse({
        action: 'feedback',
        message: 'Please update the valuation'
      });
      expect(result.success).toBe(true);
    });
  });

  // ===== Deal State Schemas =====

  describe('TransitionStateSchema', () => {
    test('rejects missing toState', () => {
      const result = TransitionStateSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('accepts valid toState', () => {
      const result = TransitionStateSchema.safeParse({ toState: 'UNDER_CONTRACT' });
      expect(result.success).toBe(true);
    });

    test('accepts optional force flag', () => {
      const result = TransitionStateSchema.safeParse({
        toState: 'CLOSED',
        force: true,
        reason: 'Admin override'
      });
      expect(result.success).toBe(true);
    });
  });

  // ===== Deal Submissions Schemas =====

  describe('SubmitDealSchema', () => {
    test('rejects missing recipientEmail', () => {
      const result = SubmitDealSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('rejects invalid email', () => {
      const result = SubmitDealSchema.safeParse({ recipientEmail: 'not-email' });
      expect(result.success).toBe(false);
    });

    test('accepts valid submission', () => {
      const result = SubmitDealSchema.safeParse({
        recipientEmail: 'buyer@example.com',
        recipientName: 'Test Buyer',
        message: 'Please review this deal'
      });
      expect(result.success).toBe(true);
    });
  });
});
