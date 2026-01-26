/**
 * Batch 9: Broker & Contact Routes Validation Tests
 *
 * Tests Zod schema validation for brokerages, contacts, credentials,
 * activities, ratings, and listing agreements.
 */

import { jest } from '@jest/globals';
import {
  CreateBrokerageSchema,
  InviteBrokerSchema,
  CreateContactSchema,
  UpdateContactSchema,
  AddCredentialSchema,
  UpdateCredentialSchema,
  LogActivitySchema,
  AddRatingSchema,
  AssignContactToDealSchema,
  UpdateDealContactSchema,
  CreateListingAgreementSchema,
  UpdateListingAgreementSchema,
  TerminateAgreementSchema
} from '../middleware/route-schemas.js';

describe('Batch 9: Broker & Contact Routes Validation', () => {

  // ===== Brokerage Schemas =====

  describe('CreateBrokerageSchema', () => {
    test('rejects missing name', () => {
      const result = CreateBrokerageSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('rejects empty name', () => {
      const result = CreateBrokerageSchema.safeParse({ name: '' });
      expect(result.success).toBe(false);
    });

    test('accepts valid name', () => {
      const result = CreateBrokerageSchema.safeParse({ name: 'CBRE' });
      expect(result.success).toBe(true);
    });

    test('accepts optional domain', () => {
      const result = CreateBrokerageSchema.safeParse({
        name: 'CBRE',
        domain: 'cbre.com'
      });
      expect(result.success).toBe(true);
    });
  });

  describe('InviteBrokerSchema', () => {
    test('rejects missing email', () => {
      const result = InviteBrokerSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('rejects invalid email', () => {
      const result = InviteBrokerSchema.safeParse({ email: 'not-email' });
      expect(result.success).toBe(false);
    });

    test('accepts valid email', () => {
      const result = InviteBrokerSchema.safeParse({ email: 'broker@cbre.com' });
      expect(result.success).toBe(true);
    });

    test('accepts optional name', () => {
      const result = InviteBrokerSchema.safeParse({
        email: 'broker@cbre.com',
        name: 'John Smith'
      });
      expect(result.success).toBe(true);
    });
  });

  // ===== Contact Schemas =====

  describe('CreateContactSchema', () => {
    test('rejects missing name', () => {
      const result = CreateContactSchema.safeParse({ contactType: 'BROKER' });
      expect(result.success).toBe(false);
    });

    test('rejects missing contactType', () => {
      const result = CreateContactSchema.safeParse({ name: 'Test Contact' });
      expect(result.success).toBe(false);
    });

    test('rejects invalid contactType', () => {
      const result = CreateContactSchema.safeParse({
        name: 'Test',
        contactType: 'INVALID'
      });
      expect(result.success).toBe(false);
    });

    test('accepts valid BROKER contactType', () => {
      const result = CreateContactSchema.safeParse({
        name: 'John Smith',
        contactType: 'BROKER'
      });
      expect(result.success).toBe(true);
    });

    test('accepts valid LENDER contactType', () => {
      const result = CreateContactSchema.safeParse({
        name: 'First National Bank',
        contactType: 'LENDER'
      });
      expect(result.success).toBe(true);
    });

    test('accepts valid ATTORNEY contactType', () => {
      const result = CreateContactSchema.safeParse({
        name: 'Legal Partners LLC',
        contactType: 'ATTORNEY'
      });
      expect(result.success).toBe(true);
    });

    test('defaults isPerson to true', () => {
      const result = CreateContactSchema.safeParse({
        name: 'John Smith',
        contactType: 'BROKER'
      });
      expect(result.success).toBe(true);
      expect(result.data.isPerson).toBe(true);
    });

    test('rejects invalid email format', () => {
      const result = CreateContactSchema.safeParse({
        name: 'Test',
        contactType: 'BROKER',
        email: 'not-email'
      });
      expect(result.success).toBe(false);
    });

    test('rejects invalid website URL', () => {
      const result = CreateContactSchema.safeParse({
        name: 'Test',
        contactType: 'BROKER',
        website: 'not-a-url'
      });
      expect(result.success).toBe(false);
    });

    test('accepts full contact with all fields', () => {
      const result = CreateContactSchema.safeParse({
        name: 'John Smith',
        contactType: 'BROKER',
        email: 'john@example.com',
        phone: '555-1234',
        website: 'https://example.com',
        tags: ['preferred', 'retail'],
        preferredMethod: 'EMAIL'
      });
      expect(result.success).toBe(true);
    });
  });

  describe('UpdateContactSchema', () => {
    test('accepts empty object (all optional)', () => {
      const result = UpdateContactSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test('rejects invalid status', () => {
      const result = UpdateContactSchema.safeParse({ status: 'INVALID' });
      expect(result.success).toBe(false);
    });

    test('accepts ACTIVE status', () => {
      const result = UpdateContactSchema.safeParse({ status: 'ACTIVE' });
      expect(result.success).toBe(true);
    });

    test('accepts ARCHIVED status', () => {
      const result = UpdateContactSchema.safeParse({ status: 'ARCHIVED' });
      expect(result.success).toBe(true);
    });
  });

  describe('AddCredentialSchema', () => {
    test('rejects missing credentialType', () => {
      const result = AddCredentialSchema.safeParse({ credentialName: 'License' });
      expect(result.success).toBe(false);
    });

    test('rejects missing credentialName', () => {
      const result = AddCredentialSchema.safeParse({ credentialType: 'LICENSE' });
      expect(result.success).toBe(false);
    });

    test('rejects invalid credentialType', () => {
      const result = AddCredentialSchema.safeParse({
        credentialType: 'INVALID',
        credentialName: 'Test'
      });
      expect(result.success).toBe(false);
    });

    test('accepts LICENSE type', () => {
      const result = AddCredentialSchema.safeParse({
        credentialType: 'LICENSE',
        credentialName: 'Real Estate License'
      });
      expect(result.success).toBe(true);
    });

    test('accepts CERTIFICATION type', () => {
      const result = AddCredentialSchema.safeParse({
        credentialType: 'CERTIFICATION',
        credentialName: 'CCIM'
      });
      expect(result.success).toBe(true);
    });

    test('accepts INSURANCE type', () => {
      const result = AddCredentialSchema.safeParse({
        credentialType: 'INSURANCE',
        credentialName: 'E&O Insurance'
      });
      expect(result.success).toBe(true);
    });

    test('rejects invalid date format', () => {
      const result = AddCredentialSchema.safeParse({
        credentialType: 'LICENSE',
        credentialName: 'Test',
        expirationDate: 'March 1, 2026'
      });
      expect(result.success).toBe(false);
    });

    test('accepts valid date format', () => {
      const result = AddCredentialSchema.safeParse({
        credentialType: 'LICENSE',
        credentialName: 'Real Estate License',
        expirationDate: '2026-12-31',
        state: 'CA'
      });
      expect(result.success).toBe(true);
    });
  });

  describe('LogActivitySchema', () => {
    test('rejects missing activityType', () => {
      const result = LogActivitySchema.safeParse({ summary: 'Test' });
      expect(result.success).toBe(false);
    });

    test('rejects missing summary', () => {
      const result = LogActivitySchema.safeParse({ activityType: 'CALL' });
      expect(result.success).toBe(false);
    });

    test('rejects invalid activityType', () => {
      const result = LogActivitySchema.safeParse({
        activityType: 'INVALID',
        summary: 'Test'
      });
      expect(result.success).toBe(false);
    });

    test('accepts EMAIL_SENT type', () => {
      const result = LogActivitySchema.safeParse({
        activityType: 'EMAIL_SENT',
        summary: 'Sent offering memo'
      });
      expect(result.success).toBe(true);
    });

    test('accepts CALL type with direction', () => {
      const result = LogActivitySchema.safeParse({
        activityType: 'CALL',
        summary: 'Discussed deal terms',
        direction: 'OUTBOUND'
      });
      expect(result.success).toBe(true);
    });

    test('accepts MEETING type', () => {
      const result = LogActivitySchema.safeParse({
        activityType: 'MEETING',
        summary: 'Property tour'
      });
      expect(result.success).toBe(true);
    });
  });

  describe('AddRatingSchema', () => {
    test('rejects missing overallRating', () => {
      const result = AddRatingSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('rejects rating less than 1', () => {
      const result = AddRatingSchema.safeParse({ overallRating: 0 });
      expect(result.success).toBe(false);
    });

    test('rejects rating greater than 5', () => {
      const result = AddRatingSchema.safeParse({ overallRating: 6 });
      expect(result.success).toBe(false);
    });

    test('accepts valid rating 1', () => {
      const result = AddRatingSchema.safeParse({ overallRating: 1 });
      expect(result.success).toBe(true);
    });

    test('accepts valid rating 5', () => {
      const result = AddRatingSchema.safeParse({ overallRating: 5 });
      expect(result.success).toBe(true);
    });

    test('coerces string to number', () => {
      const result = AddRatingSchema.safeParse({ overallRating: '4' });
      expect(result.success).toBe(true);
      expect(result.data.overallRating).toBe(4);
    });

    test('defaults wouldRecommend to true', () => {
      const result = AddRatingSchema.safeParse({ overallRating: 5 });
      expect(result.success).toBe(true);
      expect(result.data.wouldRecommend).toBe(true);
    });

    test('accepts full rating with all fields', () => {
      const result = AddRatingSchema.safeParse({
        overallRating: 5,
        qualityRating: 5,
        timelinessRating: 4,
        communicationRating: 5,
        comments: 'Excellent service',
        wouldRecommend: true
      });
      expect(result.success).toBe(true);
    });
  });

  describe('AssignContactToDealSchema', () => {
    test('rejects missing contactId', () => {
      const result = AssignContactToDealSchema.safeParse({ role: 'broker' });
      expect(result.success).toBe(false);
    });

    test('rejects missing role', () => {
      const result = AssignContactToDealSchema.safeParse({ contactId: 'c1' });
      expect(result.success).toBe(false);
    });

    test('accepts valid assignment', () => {
      const result = AssignContactToDealSchema.safeParse({
        contactId: 'contact-123',
        role: 'listing_broker'
      });
      expect(result.success).toBe(true);
    });

    test('defaults dealType to DRAFT', () => {
      const result = AssignContactToDealSchema.safeParse({
        contactId: 'c1',
        role: 'broker'
      });
      expect(result.success).toBe(true);
      expect(result.data.dealType).toBe('DRAFT');
    });

    test('accepts fee information', () => {
      const result = AssignContactToDealSchema.safeParse({
        contactId: 'contact-123',
        role: 'broker',
        feeType: 'PERCENTAGE',
        estimatedFee: 50000
      });
      expect(result.success).toBe(true);
    });
  });

  describe('UpdateDealContactSchema', () => {
    test('accepts empty object', () => {
      const result = UpdateDealContactSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test('rejects invalid feeType', () => {
      const result = UpdateDealContactSchema.safeParse({ feeType: 'INVALID' });
      expect(result.success).toBe(false);
    });

    test('accepts FLAT feeType', () => {
      const result = UpdateDealContactSchema.safeParse({ feeType: 'FLAT' });
      expect(result.success).toBe(true);
    });

    test('accepts actualFee', () => {
      const result = UpdateDealContactSchema.safeParse({
        actualFee: 75000,
        status: 'COMPLETED'
      });
      expect(result.success).toBe(true);
    });
  });

  // ===== Listing Agreement Schemas =====

  describe('CreateListingAgreementSchema', () => {
    test('rejects missing dealDraftId', () => {
      const result = CreateListingAgreementSchema.safeParse({
        agreementType: 'EXCLUSIVE_RIGHT_TO_SELL',
        termStartDate: '2026-01-01',
        termEndDate: '2026-12-31'
      });
      expect(result.success).toBe(false);
    });

    test('rejects missing agreementType', () => {
      const result = CreateListingAgreementSchema.safeParse({
        dealDraftId: 'deal-1',
        termStartDate: '2026-01-01',
        termEndDate: '2026-12-31'
      });
      expect(result.success).toBe(false);
    });

    test('rejects invalid agreementType', () => {
      const result = CreateListingAgreementSchema.safeParse({
        dealDraftId: 'deal-1',
        agreementType: 'INVALID',
        termStartDate: '2026-01-01',
        termEndDate: '2026-12-31'
      });
      expect(result.success).toBe(false);
    });

    test('rejects termEndDate before termStartDate', () => {
      const result = CreateListingAgreementSchema.safeParse({
        dealDraftId: 'deal-1',
        agreementType: 'EXCLUSIVE_RIGHT_TO_SELL',
        termStartDate: '2026-06-01',
        termEndDate: '2026-01-01'
      });
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('termEndDate');
    });

    test('accepts EXCLUSIVE_RIGHT_TO_SELL', () => {
      const result = CreateListingAgreementSchema.safeParse({
        dealDraftId: 'deal-1',
        agreementType: 'EXCLUSIVE_RIGHT_TO_SELL',
        termStartDate: '2026-01-01',
        termEndDate: '2026-12-31'
      });
      expect(result.success).toBe(true);
    });

    test('accepts EXCLUSIVE_AGENCY', () => {
      const result = CreateListingAgreementSchema.safeParse({
        dealDraftId: 'deal-1',
        agreementType: 'EXCLUSIVE_AGENCY',
        termStartDate: '2026-01-01',
        termEndDate: '2026-06-30'
      });
      expect(result.success).toBe(true);
    });

    test('accepts OPEN listing', () => {
      const result = CreateListingAgreementSchema.safeParse({
        dealDraftId: 'deal-1',
        agreementType: 'OPEN',
        termStartDate: '2026-01-01',
        termEndDate: '2026-03-31'
      });
      expect(result.success).toBe(true);
    });

    test('accepts commission fields', () => {
      const result = CreateListingAgreementSchema.safeParse({
        dealDraftId: 'deal-1',
        agreementType: 'EXCLUSIVE_RIGHT_TO_SELL',
        termStartDate: '2026-01-01',
        termEndDate: '2026-12-31',
        commissionPercent: 5,
        listingPriceMin: 1000000,
        listingPriceMax: 1500000
      });
      expect(result.success).toBe(true);
    });
  });

  describe('UpdateListingAgreementSchema', () => {
    test('accepts empty object', () => {
      const result = UpdateListingAgreementSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test('accepts commission update', () => {
      const result = UpdateListingAgreementSchema.safeParse({
        commissionPercent: 6
      });
      expect(result.success).toBe(true);
    });

    test('rejects commission > 100', () => {
      const result = UpdateListingAgreementSchema.safeParse({
        commissionPercent: 150
      });
      expect(result.success).toBe(false);
    });
  });

  describe('TerminateAgreementSchema', () => {
    test('accepts empty object', () => {
      const result = TerminateAgreementSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test('accepts optional reason', () => {
      const result = TerminateAgreementSchema.safeParse({
        reason: 'Property sold by owner'
      });
      expect(result.success).toBe(true);
    });
  });
});
