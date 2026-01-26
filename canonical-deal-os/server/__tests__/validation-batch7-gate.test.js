/**
 * Batch 7: Permission Gate & Content Validation Tests
 *
 * Tests Zod schema validation for buyer authorization, NDA signing,
 * data room access, news insights, and provenance.
 */

import { jest } from '@jest/globals';
import {
  AuthorizeBuyerSchema,
  DeclineBuyerSchema,
  RevokeBuyerSchema,
  RecordNDASignedSchema,
  BulkAuthorizeBuyersSchema,
  BulkDeclineBuyersSchema,
  GrantDataRoomAccessSchema,
  NewsAskSchema,
  ProvenanceUpdateSchema
} from '../middleware/route-schemas.js';

describe('Batch 7: Permission Gate & Content Validation', () => {

  describe('AuthorizeBuyerSchema', () => {
    test('accepts empty object', () => {
      const result = AuthorizeBuyerSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test('accepts valid accessLevel TEASER', () => {
      const result = AuthorizeBuyerSchema.safeParse({ accessLevel: 'TEASER' });
      expect(result.success).toBe(true);
      expect(result.data.accessLevel).toBe('TEASER');
    });

    test('accepts valid accessLevel STANDARD', () => {
      const result = AuthorizeBuyerSchema.safeParse({ accessLevel: 'STANDARD' });
      expect(result.success).toBe(true);
    });

    test('accepts valid accessLevel FULL', () => {
      const result = AuthorizeBuyerSchema.safeParse({ accessLevel: 'FULL' });
      expect(result.success).toBe(true);
    });

    test('accepts valid accessLevel VDR_ACCESS', () => {
      const result = AuthorizeBuyerSchema.safeParse({ accessLevel: 'VDR_ACCESS' });
      expect(result.success).toBe(true);
    });

    test('rejects invalid accessLevel', () => {
      const result = AuthorizeBuyerSchema.safeParse({ accessLevel: 'INVALID' });
      expect(result.success).toBe(false);
    });
  });

  describe('DeclineBuyerSchema', () => {
    test('rejects missing reason', () => {
      const result = DeclineBuyerSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('rejects empty reason', () => {
      const result = DeclineBuyerSchema.safeParse({ reason: '' });
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('Reason');
    });

    test('accepts valid reason', () => {
      const result = DeclineBuyerSchema.safeParse({ reason: 'Not qualified' });
      expect(result.success).toBe(true);
      expect(result.data.reason).toBe('Not qualified');
    });
  });

  describe('RevokeBuyerSchema', () => {
    test('rejects missing reason', () => {
      const result = RevokeBuyerSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('accepts valid reason', () => {
      const result = RevokeBuyerSchema.safeParse({ reason: 'NDA violation' });
      expect(result.success).toBe(true);
    });
  });

  describe('RecordNDASignedSchema', () => {
    test('accepts empty object', () => {
      const result = RecordNDASignedSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test('rejects invalid UUID', () => {
      const result = RecordNDASignedSchema.safeParse({ ndaDocumentId: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });

    test('accepts valid UUID', () => {
      const result = RecordNDASignedSchema.safeParse({
        ndaDocumentId: '550e8400-e29b-41d4-a716-446655440000'
      });
      expect(result.success).toBe(true);
    });
  });

  describe('BulkAuthorizeBuyersSchema', () => {
    test('rejects missing buyerUserIds', () => {
      const result = BulkAuthorizeBuyersSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('rejects empty buyerUserIds array', () => {
      const result = BulkAuthorizeBuyersSchema.safeParse({ buyerUserIds: [] });
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('buyerUserIds');
    });

    test('accepts valid buyerUserIds array', () => {
      const result = BulkAuthorizeBuyersSchema.safeParse({
        buyerUserIds: ['buyer-1', 'buyer-2']
      });
      expect(result.success).toBe(true);
      expect(result.data.buyerUserIds).toHaveLength(2);
    });
  });

  describe('BulkDeclineBuyersSchema', () => {
    test('rejects missing buyerUserIds', () => {
      const result = BulkDeclineBuyersSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('rejects empty buyerUserIds array', () => {
      const result = BulkDeclineBuyersSchema.safeParse({ buyerUserIds: [] });
      expect(result.success).toBe(false);
    });

    test('uses default reason', () => {
      const result = BulkDeclineBuyersSchema.safeParse({
        buyerUserIds: ['buyer-1']
      });
      expect(result.success).toBe(true);
      expect(result.data.reason).toBe('Not a fit');
    });

    test('accepts custom reason', () => {
      const result = BulkDeclineBuyersSchema.safeParse({
        buyerUserIds: ['buyer-1'],
        reason: 'Investment criteria mismatch'
      });
      expect(result.success).toBe(true);
      expect(result.data.reason).toBe('Investment criteria mismatch');
    });
  });

  describe('GrantDataRoomAccessSchema', () => {
    test('uses default accessLevel STANDARD', () => {
      const result = GrantDataRoomAccessSchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data.accessLevel).toBe('STANDARD');
    });

    test('accepts FULL accessLevel', () => {
      const result = GrantDataRoomAccessSchema.safeParse({ accessLevel: 'FULL' });
      expect(result.success).toBe(true);
      expect(result.data.accessLevel).toBe('FULL');
    });

    test('rejects invalid accessLevel', () => {
      const result = GrantDataRoomAccessSchema.safeParse({ accessLevel: 'INVALID' });
      expect(result.success).toBe(false);
    });
  });

  describe('NewsAskSchema', () => {
    test('rejects missing insightId', () => {
      const result = NewsAskSchema.safeParse({ question: 'What is the market trend?' });
      expect(result.success).toBe(false);
    });

    test('rejects missing question', () => {
      const result = NewsAskSchema.safeParse({ insightId: 'insight-123' });
      expect(result.success).toBe(false);
    });

    test('rejects empty question', () => {
      const result = NewsAskSchema.safeParse({ insightId: 'insight-123', question: '' });
      expect(result.success).toBe(false);
    });

    test('accepts valid insight question', () => {
      const result = NewsAskSchema.safeParse({
        insightId: 'insight-123',
        question: 'What is the market trend for Q1?'
      });
      expect(result.success).toBe(true);
    });
  });

  describe('ProvenanceUpdateSchema', () => {
    test('rejects missing fieldPath', () => {
      const result = ProvenanceUpdateSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('rejects empty fieldPath', () => {
      const result = ProvenanceUpdateSchema.safeParse({ fieldPath: '' });
      expect(result.success).toBe(false);
    });

    test('accepts valid fieldPath', () => {
      const result = ProvenanceUpdateSchema.safeParse({ fieldPath: 'deal.askingPrice' });
      expect(result.success).toBe(true);
    });

    test('accepts fieldPath with optional artifactId', () => {
      const result = ProvenanceUpdateSchema.safeParse({
        fieldPath: 'deal.noi',
        artifactId: 'artifact-123'
      });
      expect(result.success).toBe(true);
    });
  });
});
