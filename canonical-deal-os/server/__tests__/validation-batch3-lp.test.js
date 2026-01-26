/**
 * Batch 3: LP Routes Validation Tests
 *
 * Tests Zod schema validation for LP portal magic links, LP documents,
 * LP transfers, and lender portal routes.
 */

import { jest } from '@jest/globals';
import {
  GenerateLPMagicLinkSchema,
  UploadLPDocumentSchema,
  CreateLPTransferSchema,
  LenderApproveSchema
} from '../middleware/route-schemas.js';

describe('Batch 3: LP Routes Validation', () => {

  // ===== LP Magic Link Schema =====

  describe('GenerateLPMagicLinkSchema', () => {
    test('rejects missing lpActorId', () => {
      const result = GenerateLPMagicLinkSchema.safeParse({});
      expect(result.success).toBe(false);
      expect(result.error.errors.some(e => e.path.includes('lpActorId'))).toBe(true);
    });

    test('rejects invalid lpActorId UUID', () => {
      const result = GenerateLPMagicLinkSchema.safeParse({
        lpActorId: 'not-a-uuid'
      });
      expect(result.success).toBe(false);
    });

    test('accepts valid lpActorId UUID', () => {
      const result = GenerateLPMagicLinkSchema.safeParse({
        lpActorId: '550e8400-e29b-41d4-a716-446655440000'
      });
      expect(result.success).toBe(true);
      expect(result.data.lpActorId).toBe('550e8400-e29b-41d4-a716-446655440000');
    });
  });

  // ===== LP Document Schema =====

  describe('UploadLPDocumentSchema', () => {
    test('rejects missing dealId', () => {
      const result = UploadLPDocumentSchema.safeParse({
        filename: 'doc.pdf',
        documentType: 'K1',
        category: 'TAX'
      });
      expect(result.success).toBe(false);
      expect(result.error.errors.some(e => e.path.includes('dealId'))).toBe(true);
    });

    test('rejects invalid dealId UUID', () => {
      const result = UploadLPDocumentSchema.safeParse({
        dealId: 'not-a-uuid',
        filename: 'doc.pdf',
        documentType: 'K1',
        category: 'TAX'
      });
      expect(result.success).toBe(false);
    });

    test('rejects missing filename', () => {
      const result = UploadLPDocumentSchema.safeParse({
        dealId: '550e8400-e29b-41d4-a716-446655440000',
        documentType: 'K1',
        category: 'TAX'
      });
      expect(result.success).toBe(false);
      expect(result.error.errors.some(e => e.path.includes('filename'))).toBe(true);
    });

    test('rejects empty filename', () => {
      const result = UploadLPDocumentSchema.safeParse({
        dealId: '550e8400-e29b-41d4-a716-446655440000',
        filename: '',
        documentType: 'K1',
        category: 'TAX'
      });
      expect(result.success).toBe(false);
    });

    test('rejects missing documentType', () => {
      const result = UploadLPDocumentSchema.safeParse({
        dealId: '550e8400-e29b-41d4-a716-446655440000',
        filename: 'doc.pdf',
        category: 'TAX'
      });
      expect(result.success).toBe(false);
      expect(result.error.errors.some(e => e.path.includes('documentType'))).toBe(true);
    });

    test('rejects invalid category enum', () => {
      const result = UploadLPDocumentSchema.safeParse({
        dealId: '550e8400-e29b-41d4-a716-446655440000',
        filename: 'doc.pdf',
        documentType: 'K1',
        category: 'INVALID'
      });
      expect(result.success).toBe(false);
    });

    test('accepts valid category TAX', () => {
      const result = UploadLPDocumentSchema.safeParse({
        dealId: '550e8400-e29b-41d4-a716-446655440000',
        filename: 'doc.pdf',
        documentType: 'K1',
        category: 'TAX'
      });
      expect(result.success).toBe(true);
      expect(result.data.category).toBe('TAX');
    });

    test('accepts valid category LEGAL', () => {
      const result = UploadLPDocumentSchema.safeParse({
        dealId: '550e8400-e29b-41d4-a716-446655440000',
        filename: 'agreement.pdf',
        documentType: 'OPERATING_AGREEMENT',
        category: 'LEGAL'
      });
      expect(result.success).toBe(true);
    });

    test('accepts valid quarter enum', () => {
      const result = UploadLPDocumentSchema.safeParse({
        dealId: '550e8400-e29b-41d4-a716-446655440000',
        filename: 'q1-report.pdf',
        documentType: 'QUARTERLY_REPORT',
        category: 'FINANCIAL',
        quarter: 'Q1'
      });
      expect(result.success).toBe(true);
      expect(result.data.quarter).toBe('Q1');
    });

    test('rejects invalid quarter', () => {
      const result = UploadLPDocumentSchema.safeParse({
        dealId: '550e8400-e29b-41d4-a716-446655440000',
        filename: 'report.pdf',
        documentType: 'QUARTERLY_REPORT',
        category: 'FINANCIAL',
        quarter: 'Q5'
      });
      expect(result.success).toBe(false);
    });

    test('uses default visibility ALL_LPS', () => {
      const result = UploadLPDocumentSchema.safeParse({
        dealId: '550e8400-e29b-41d4-a716-446655440000',
        filename: 'doc.pdf',
        documentType: 'K1',
        category: 'TAX'
      });
      expect(result.success).toBe(true);
      expect(result.data.visibility).toBe('ALL_LPS');
    });

    test('accepts SPECIFIC_LPS visibility with lpActorIds', () => {
      const result = UploadLPDocumentSchema.safeParse({
        dealId: '550e8400-e29b-41d4-a716-446655440000',
        filename: 'side-letter.pdf',
        documentType: 'SIDE_LETTER',
        category: 'LEGAL',
        visibility: 'SPECIFIC_LPS',
        lpActorIds: ['550e8400-e29b-41d4-a716-446655440001']
      });
      expect(result.success).toBe(true);
      expect(result.data.visibility).toBe('SPECIFIC_LPS');
    });

    test('rejects invalid UUID in lpActorIds array', () => {
      const result = UploadLPDocumentSchema.safeParse({
        dealId: '550e8400-e29b-41d4-a716-446655440000',
        filename: 'doc.pdf',
        documentType: 'K1',
        category: 'TAX',
        lpActorIds: ['not-a-uuid']
      });
      expect(result.success).toBe(false);
    });

    test('accepts year in valid range', () => {
      const result = UploadLPDocumentSchema.safeParse({
        dealId: '550e8400-e29b-41d4-a716-446655440000',
        filename: '2025-k1.pdf',
        documentType: 'K1',
        category: 'TAX',
        year: 2025
      });
      expect(result.success).toBe(true);
      expect(result.data.year).toBe(2025);
    });

    test('rejects year before 2000', () => {
      const result = UploadLPDocumentSchema.safeParse({
        dealId: '550e8400-e29b-41d4-a716-446655440000',
        filename: 'doc.pdf',
        documentType: 'K1',
        category: 'TAX',
        year: 1999
      });
      expect(result.success).toBe(false);
    });

    test('rejects year after 2100', () => {
      const result = UploadLPDocumentSchema.safeParse({
        dealId: '550e8400-e29b-41d4-a716-446655440000',
        filename: 'doc.pdf',
        documentType: 'K1',
        category: 'TAX',
        year: 2101
      });
      expect(result.success).toBe(false);
    });
  });

  // ===== LP Transfer Schema =====

  describe('CreateLPTransferSchema', () => {
    const validTransfer = {
      fromLpActorId: '550e8400-e29b-41d4-a716-446655440001',
      toLpActorId: '550e8400-e29b-41d4-a716-446655440002',
      transferAmount: 10000,
      transferPct: 10,
      effectiveDate: '2026-03-01'
    };

    test('rejects self-transfer', () => {
      const sameId = '550e8400-e29b-41d4-a716-446655440000';
      const result = CreateLPTransferSchema.safeParse({
        fromLpActorId: sameId,
        toLpActorId: sameId,
        transferAmount: 10000,
        transferPct: 10,
        effectiveDate: '2026-03-01'
      });
      expect(result.success).toBe(false);
      expect(result.error.errors.some(e => e.message.includes('same LP'))).toBe(true);
    });

    test('rejects missing fromLpActorId', () => {
      const result = CreateLPTransferSchema.safeParse({
        toLpActorId: '550e8400-e29b-41d4-a716-446655440002',
        transferAmount: 10000,
        transferPct: 10,
        effectiveDate: '2026-03-01'
      });
      expect(result.success).toBe(false);
    });

    test('rejects invalid fromLpActorId UUID', () => {
      const result = CreateLPTransferSchema.safeParse({
        ...validTransfer,
        fromLpActorId: 'not-a-uuid'
      });
      expect(result.success).toBe(false);
    });

    test('rejects missing toLpActorId', () => {
      const result = CreateLPTransferSchema.safeParse({
        fromLpActorId: '550e8400-e29b-41d4-a716-446655440001',
        transferAmount: 10000,
        transferPct: 10,
        effectiveDate: '2026-03-01'
      });
      expect(result.success).toBe(false);
    });

    test('rejects missing transferAmount', () => {
      const result = CreateLPTransferSchema.safeParse({
        fromLpActorId: '550e8400-e29b-41d4-a716-446655440001',
        toLpActorId: '550e8400-e29b-41d4-a716-446655440002',
        transferPct: 10,
        effectiveDate: '2026-03-01'
      });
      expect(result.success).toBe(false);
    });

    test('rejects negative transferAmount', () => {
      const result = CreateLPTransferSchema.safeParse({
        ...validTransfer,
        transferAmount: -100
      });
      expect(result.success).toBe(false);
    });

    test('rejects zero transferAmount', () => {
      const result = CreateLPTransferSchema.safeParse({
        ...validTransfer,
        transferAmount: 0
      });
      expect(result.success).toBe(false);
    });

    test('rejects transferPct > 100', () => {
      const result = CreateLPTransferSchema.safeParse({
        ...validTransfer,
        transferPct: 150
      });
      expect(result.success).toBe(false);
    });

    test('rejects transferPct < 0.01', () => {
      const result = CreateLPTransferSchema.safeParse({
        ...validTransfer,
        transferPct: 0.001
      });
      expect(result.success).toBe(false);
    });

    test('rejects invalid date format', () => {
      const result = CreateLPTransferSchema.safeParse({
        ...validTransfer,
        effectiveDate: 'March 1, 2026'
      });
      expect(result.success).toBe(false);
    });

    test('accepts valid transfer', () => {
      const result = CreateLPTransferSchema.safeParse(validTransfer);
      expect(result.success).toBe(true);
      expect(result.data.transferAmount).toBe(10000);
      expect(result.data.transferPct).toBe(10);
    });

    test('accepts optional reason', () => {
      const result = CreateLPTransferSchema.safeParse({
        ...validTransfer,
        reason: 'Estate planning'
      });
      expect(result.success).toBe(true);
      expect(result.data.reason).toBe('Estate planning');
    });

    test('accepts optional documentId UUID', () => {
      const result = CreateLPTransferSchema.safeParse({
        ...validTransfer,
        documentId: '550e8400-e29b-41d4-a716-446655440003'
      });
      expect(result.success).toBe(true);
      expect(result.data.documentId).toBe('550e8400-e29b-41d4-a716-446655440003');
    });

    test('coerces string numbers', () => {
      const result = CreateLPTransferSchema.safeParse({
        ...validTransfer,
        transferAmount: '25000',
        transferPct: '25'
      });
      expect(result.success).toBe(true);
      expect(result.data.transferAmount).toBe(25000);
      expect(result.data.transferPct).toBe(25);
    });
  });

  // ===== Lender Approve Schema =====

  describe('LenderApproveSchema', () => {
    test('accepts empty object', () => {
      const result = LenderApproveSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test('accepts comment', () => {
      const result = LenderApproveSchema.safeParse({
        comment: 'Approved pending final documentation'
      });
      expect(result.success).toBe(true);
      expect(result.data.comment).toBe('Approved pending final documentation');
    });

    test('accepts undefined comment', () => {
      const result = LenderApproveSchema.safeParse({
        comment: undefined
      });
      expect(result.success).toBe(true);
    });
  });
});
