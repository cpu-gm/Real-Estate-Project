/**
 * Batch 1: Financial Routes Validation Tests
 *
 * Tests Zod schema validation for capital calls, distributions,
 * investor updates, and share classes routes.
 */

import { jest } from '@jest/globals';
import {
  CreateCapitalCallSchema,
  UpdateCapitalCallSchema,
  MarkWireInitiatedSchema,
  UploadWireProofSchema,
  MarkFundedSchema,
  CreateDistributionSchema,
  MarkDistributionPaidSchema,
  CreateInvestorUpdateSchema,
  CreateShareClassSchema
} from '../middleware/route-schemas.js';

describe('Batch 1: Financial Routes Validation', () => {

  // ===== Capital Call Schemas =====

  describe('CreateCapitalCallSchema', () => {
    test('rejects missing title', () => {
      const result = CreateCapitalCallSchema.safeParse({
        totalAmount: 100000,
        dueDate: '2026-03-01'
      });
      expect(result.success).toBe(false);
      expect(result.error.errors.some(e => e.path.includes('title'))).toBe(true);
    });

    test('rejects missing totalAmount', () => {
      const result = CreateCapitalCallSchema.safeParse({
        title: 'Q1 Capital Call',
        dueDate: '2026-03-01'
      });
      expect(result.success).toBe(false);
      expect(result.error.errors.some(e => e.path.includes('totalAmount'))).toBe(true);
    });

    test('rejects missing dueDate', () => {
      const result = CreateCapitalCallSchema.safeParse({
        title: 'Q1 Capital Call',
        totalAmount: 100000
      });
      expect(result.success).toBe(false);
      expect(result.error.errors.some(e => e.path.includes('dueDate'))).toBe(true);
    });

    test('rejects negative totalAmount', () => {
      const result = CreateCapitalCallSchema.safeParse({
        title: 'Q1 Call',
        totalAmount: -100,
        dueDate: '2026-03-01'
      });
      expect(result.success).toBe(false);
      expect(result.error.errors.some(e => e.message.includes('positive'))).toBe(true);
    });

    test('rejects zero totalAmount', () => {
      const result = CreateCapitalCallSchema.safeParse({
        title: 'Q1 Call',
        totalAmount: 0,
        dueDate: '2026-03-01'
      });
      expect(result.success).toBe(false);
    });

    test('rejects invalid date format', () => {
      const result = CreateCapitalCallSchema.safeParse({
        title: 'Q1 Call',
        totalAmount: 100000,
        dueDate: 'March 1, 2026'
      });
      expect(result.success).toBe(false);
      expect(result.error.errors.some(e => e.path.includes('dueDate'))).toBe(true);
    });

    test('accepts valid payload with required fields only', () => {
      const result = CreateCapitalCallSchema.safeParse({
        title: 'Q1 Capital Call',
        totalAmount: 100000,
        dueDate: '2026-03-01'
      });
      expect(result.success).toBe(true);
      expect(result.data.title).toBe('Q1 Capital Call');
      expect(result.data.totalAmount).toBe(100000);
    });

    test('accepts valid payload with optional fields', () => {
      const result = CreateCapitalCallSchema.safeParse({
        title: 'Q1 Capital Call',
        totalAmount: 100000,
        dueDate: '2026-03-01',
        description: 'Initial funding round',
        wireInstructions: 'Wire to account XXX',
        purpose: 'Acquisition'
      });
      expect(result.success).toBe(true);
      expect(result.data.description).toBe('Initial funding round');
    });

    test('coerces string numbers to numbers', () => {
      const result = CreateCapitalCallSchema.safeParse({
        title: 'Q1 Call',
        totalAmount: '100000',
        dueDate: '2026-03-01'
      });
      expect(result.success).toBe(true);
      expect(result.data.totalAmount).toBe(100000);
      expect(typeof result.data.totalAmount).toBe('number');
    });
  });

  describe('UpdateCapitalCallSchema', () => {
    test('accepts empty object (all fields optional)', () => {
      const result = UpdateCapitalCallSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test('accepts partial updates', () => {
      const result = UpdateCapitalCallSchema.safeParse({
        description: 'Updated description'
      });
      expect(result.success).toBe(true);
      expect(result.data.description).toBe('Updated description');
    });

    test('rejects empty title if provided', () => {
      const result = UpdateCapitalCallSchema.safeParse({
        title: ''
      });
      expect(result.success).toBe(false);
    });

    test('rejects negative totalAmount if provided', () => {
      const result = UpdateCapitalCallSchema.safeParse({
        totalAmount: -500
      });
      expect(result.success).toBe(false);
    });
  });

  describe('MarkWireInitiatedSchema', () => {
    test('accepts empty object', () => {
      const result = MarkWireInitiatedSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test('accepts wireReference', () => {
      const result = MarkWireInitiatedSchema.safeParse({
        wireReference: 'WIRE-12345'
      });
      expect(result.success).toBe(true);
      expect(result.data.wireReference).toBe('WIRE-12345');
    });
  });

  describe('UploadWireProofSchema', () => {
    test('rejects missing documentId', () => {
      const result = UploadWireProofSchema.safeParse({});
      expect(result.success).toBe(false);
      expect(result.error.errors.some(e => e.path.includes('documentId'))).toBe(true);
    });

    test('rejects invalid documentId UUID', () => {
      const result = UploadWireProofSchema.safeParse({
        documentId: 'not-a-uuid'
      });
      expect(result.success).toBe(false);
      expect(result.error.errors.some(e => e.message.includes('UUID'))).toBe(true);
    });

    test('accepts valid documentId UUID', () => {
      const result = UploadWireProofSchema.safeParse({
        documentId: '550e8400-e29b-41d4-a716-446655440000'
      });
      expect(result.success).toBe(true);
    });

    test('accepts documentId with optional wireReference', () => {
      const result = UploadWireProofSchema.safeParse({
        documentId: '550e8400-e29b-41d4-a716-446655440000',
        wireReference: 'WIRE-REF-123'
      });
      expect(result.success).toBe(true);
      expect(result.data.wireReference).toBe('WIRE-REF-123');
    });
  });

  describe('MarkFundedSchema', () => {
    test('accepts empty object (all fields optional)', () => {
      const result = MarkFundedSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test('accepts fundedAmount', () => {
      const result = MarkFundedSchema.safeParse({
        fundedAmount: 50000
      });
      expect(result.success).toBe(true);
      expect(result.data.fundedAmount).toBe(50000);
    });

    test('rejects negative fundedAmount', () => {
      const result = MarkFundedSchema.safeParse({
        fundedAmount: -100
      });
      expect(result.success).toBe(false);
    });

    test('accepts expectedVersion as integer', () => {
      const result = MarkFundedSchema.safeParse({
        expectedVersion: 5
      });
      expect(result.success).toBe(true);
      expect(result.data.expectedVersion).toBe(5);
    });

    test('coerces string expectedVersion to integer', () => {
      const result = MarkFundedSchema.safeParse({
        expectedVersion: '3'
      });
      expect(result.success).toBe(true);
      expect(result.data.expectedVersion).toBe(3);
    });
  });

  // ===== Distribution Schemas =====

  describe('CreateDistributionSchema', () => {
    test('rejects missing required fields', () => {
      const result = CreateDistributionSchema.safeParse({
        totalAmount: 50000
      });
      expect(result.success).toBe(false);
      // Should fail for title and distributionDate
    });

    test('rejects negative totalAmount', () => {
      const result = CreateDistributionSchema.safeParse({
        title: 'Q1 Distribution',
        totalAmount: -50000,
        distributionDate: '2026-03-15'
      });
      expect(result.success).toBe(false);
    });

    test('rejects invalid distribution type enum', () => {
      const result = CreateDistributionSchema.safeParse({
        title: 'Q1 Distribution',
        totalAmount: 50000,
        distributionDate: '2026-03-15',
        type: 'INVALID_TYPE'
      });
      expect(result.success).toBe(false);
    });

    test('accepts valid distribution type enum', () => {
      const result = CreateDistributionSchema.safeParse({
        title: 'Q1 Distribution',
        totalAmount: 50000,
        distributionDate: '2026-03-15',
        type: 'CASH_DISTRIBUTION'
      });
      expect(result.success).toBe(true);
      expect(result.data.type).toBe('CASH_DISTRIBUTION');
    });

    test('accepts valid payload', () => {
      const result = CreateDistributionSchema.safeParse({
        title: 'Q1 Distribution',
        totalAmount: 50000,
        distributionDate: '2026-03-15'
      });
      expect(result.success).toBe(true);
    });

    test('accepts useWaterfall boolean', () => {
      const result = CreateDistributionSchema.safeParse({
        title: 'Q1 Distribution',
        totalAmount: 50000,
        distributionDate: '2026-03-15',
        useWaterfall: true
      });
      expect(result.success).toBe(true);
      expect(result.data.useWaterfall).toBe(true);
    });
  });

  describe('MarkDistributionPaidSchema', () => {
    test('accepts empty object', () => {
      const result = MarkDistributionPaidSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test('accepts confirmationRef', () => {
      const result = MarkDistributionPaidSchema.safeParse({
        confirmationRef: 'CONF-12345'
      });
      expect(result.success).toBe(true);
      expect(result.data.confirmationRef).toBe('CONF-12345');
    });
  });

  // ===== Investor Update Schemas =====

  describe('CreateInvestorUpdateSchema', () => {
    test('rejects missing title', () => {
      const result = CreateInvestorUpdateSchema.safeParse({
        updateType: 'QUARTERLY'
      });
      expect(result.success).toBe(false);
      expect(result.error.errors.some(e => e.path.includes('title'))).toBe(true);
    });

    test('accepts title only', () => {
      const result = CreateInvestorUpdateSchema.safeParse({
        title: 'Q1 2026 Update'
      });
      expect(result.success).toBe(true);
      expect(result.data.title).toBe('Q1 2026 Update');
    });

    test('accepts complex JSON in optional fields', () => {
      const result = CreateInvestorUpdateSchema.safeParse({
        title: 'Q1 2026 Update',
        metrics: { noi: 125000, occupancy: 0.95 },
        whatChanged: { highlights: ['New tenant signed', 'Rent increase'] }
      });
      expect(result.success).toBe(true);
      expect(result.data.metrics.noi).toBe(125000);
    });

    test('accepts attachmentIds as UUID array', () => {
      const result = CreateInvestorUpdateSchema.safeParse({
        title: 'Q1 2026 Update',
        attachmentIds: [
          '550e8400-e29b-41d4-a716-446655440000',
          '550e8400-e29b-41d4-a716-446655440001'
        ]
      });
      expect(result.success).toBe(true);
      expect(result.data.attachmentIds).toHaveLength(2);
    });

    test('rejects invalid UUID in attachmentIds', () => {
      const result = CreateInvestorUpdateSchema.safeParse({
        title: 'Q1 2026 Update',
        attachmentIds: ['not-a-uuid']
      });
      expect(result.success).toBe(false);
    });
  });

  // ===== Share Class Schemas =====

  describe('CreateShareClassSchema', () => {
    test('rejects missing name', () => {
      const result = CreateShareClassSchema.safeParse({
        code: 'A'
      });
      expect(result.success).toBe(false);
      expect(result.error.errors.some(e => e.path.includes('name'))).toBe(true);
    });

    test('rejects missing code', () => {
      const result = CreateShareClassSchema.safeParse({
        name: 'Class A'
      });
      expect(result.success).toBe(false);
      expect(result.error.errors.some(e => e.path.includes('code'))).toBe(true);
    });

    test('rejects code longer than 10 chars', () => {
      const result = CreateShareClassSchema.safeParse({
        name: 'Class A',
        code: 'VERYLONGCODE'
      });
      expect(result.success).toBe(false);
    });

    test('rejects non-alphanumeric code', () => {
      const result = CreateShareClassSchema.safeParse({
        name: 'Class A',
        code: 'A-1'
      });
      expect(result.success).toBe(false);
    });

    test('rejects preferredReturn > 1', () => {
      const result = CreateShareClassSchema.safeParse({
        name: 'Class A',
        code: 'A',
        preferredReturn: 1.5
      });
      expect(result.success).toBe(false);
    });

    test('rejects preferredReturn < 0', () => {
      const result = CreateShareClassSchema.safeParse({
        name: 'Class A',
        code: 'A',
        preferredReturn: -0.08
      });
      expect(result.success).toBe(false);
    });

    test('accepts preferredReturn as decimal (0.08 for 8%)', () => {
      const result = CreateShareClassSchema.safeParse({
        name: 'Class A',
        code: 'A',
        preferredReturn: 0.08
      });
      expect(result.success).toBe(true);
      expect(result.data.preferredReturn).toBe(0.08);
    });

    test('rejects non-integer priority', () => {
      const result = CreateShareClassSchema.safeParse({
        name: 'Class A',
        code: 'A',
        priority: 1.5
      });
      expect(result.success).toBe(false);
    });

    test('rejects priority less than 1', () => {
      const result = CreateShareClassSchema.safeParse({
        name: 'Class A',
        code: 'A',
        priority: 0
      });
      expect(result.success).toBe(false);
    });

    test('accepts valid share class', () => {
      const result = CreateShareClassSchema.safeParse({
        name: 'Class A Preferred',
        code: 'A',
        preferredReturn: 0.08,
        priority: 1
      });
      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Class A Preferred');
      expect(result.data.code).toBe('A');
    });

    test('accepts null for optional numeric fields', () => {
      const result = CreateShareClassSchema.safeParse({
        name: 'Class B',
        code: 'B',
        preferredReturn: null,
        managementFee: null,
        carryPercent: null
      });
      expect(result.success).toBe(true);
    });
  });
});
