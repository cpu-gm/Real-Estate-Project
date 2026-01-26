/**
 * Batch 6: Admin Routes Validation Tests
 *
 * Tests Zod schema validation for admin verification, user role/status updates,
 * and bulk operations.
 */

import { jest } from '@jest/globals';
import {
  RejectVerificationSchema,
  UpdateUserRoleSchema,
  UpdateUserStatusSchema,
  BulkApproveVerificationSchema,
  BulkRejectVerificationSchema,
  ActionPayloadSchema
} from '../middleware/route-schemas.js';

describe('Batch 6: Admin Routes Validation', () => {

  describe('RejectVerificationSchema', () => {
    test('accepts empty object', () => {
      const result = RejectVerificationSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test('accepts optional note', () => {
      const result = RejectVerificationSchema.safeParse({
        note: 'License expired'
      });
      expect(result.success).toBe(true);
      expect(result.data.note).toBe('License expired');
    });
  });

  describe('UpdateUserRoleSchema', () => {
    test('rejects missing role', () => {
      const result = UpdateUserRoleSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('rejects invalid role', () => {
      const result = UpdateUserRoleSchema.safeParse({ role: 'INVALID_ROLE' });
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('Invalid role');
    });

    test('accepts valid GP role', () => {
      const result = UpdateUserRoleSchema.safeParse({ role: 'GP' });
      expect(result.success).toBe(true);
      expect(result.data.role).toBe('GP');
    });

    test('accepts valid GP Analyst role', () => {
      const result = UpdateUserRoleSchema.safeParse({ role: 'GP Analyst' });
      expect(result.success).toBe(true);
    });

    test('accepts valid Admin role', () => {
      const result = UpdateUserRoleSchema.safeParse({ role: 'Admin' });
      expect(result.success).toBe(true);
    });

    test('accepts valid LP role', () => {
      const result = UpdateUserRoleSchema.safeParse({ role: 'LP' });
      expect(result.success).toBe(true);
    });

    test('accepts valid Broker role', () => {
      const result = UpdateUserRoleSchema.safeParse({ role: 'Broker' });
      expect(result.success).toBe(true);
    });

    test('accepts valid Lender role', () => {
      const result = UpdateUserRoleSchema.safeParse({ role: 'Lender' });
      expect(result.success).toBe(true);
    });

    test('accepts valid Counsel role', () => {
      const result = UpdateUserRoleSchema.safeParse({ role: 'Counsel' });
      expect(result.success).toBe(true);
    });
  });

  describe('UpdateUserStatusSchema', () => {
    test('rejects missing status', () => {
      const result = UpdateUserStatusSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('rejects invalid status', () => {
      const result = UpdateUserStatusSchema.safeParse({ status: 'INVALID' });
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('ACTIVE or SUSPENDED');
    });

    test('accepts ACTIVE status', () => {
      const result = UpdateUserStatusSchema.safeParse({ status: 'ACTIVE' });
      expect(result.success).toBe(true);
      expect(result.data.status).toBe('ACTIVE');
    });

    test('accepts SUSPENDED status', () => {
      const result = UpdateUserStatusSchema.safeParse({ status: 'SUSPENDED' });
      expect(result.success).toBe(true);
      expect(result.data.status).toBe('SUSPENDED');
    });
  });

  describe('BulkApproveVerificationSchema', () => {
    test('rejects missing requestIds', () => {
      const result = BulkApproveVerificationSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('rejects empty requestIds array', () => {
      const result = BulkApproveVerificationSchema.safeParse({ requestIds: [] });
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('requestIds');
    });

    test('accepts valid requestIds array', () => {
      const result = BulkApproveVerificationSchema.safeParse({
        requestIds: ['req-1', 'req-2', 'req-3']
      });
      expect(result.success).toBe(true);
      expect(result.data.requestIds).toHaveLength(3);
    });
  });

  describe('BulkRejectVerificationSchema', () => {
    test('rejects missing requestIds', () => {
      const result = BulkRejectVerificationSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('rejects empty requestIds array', () => {
      const result = BulkRejectVerificationSchema.safeParse({ requestIds: [] });
      expect(result.success).toBe(false);
    });

    test('accepts requestIds without note', () => {
      const result = BulkRejectVerificationSchema.safeParse({
        requestIds: ['req-1']
      });
      expect(result.success).toBe(true);
    });

    test('accepts requestIds with note', () => {
      const result = BulkRejectVerificationSchema.safeParse({
        requestIds: ['req-1', 'req-2'],
        note: 'Invalid documentation'
      });
      expect(result.success).toBe(true);
      expect(result.data.note).toBe('Invalid documentation');
    });
  });

  describe('ActionPayloadSchema', () => {
    test('accepts empty object', () => {
      const result = ActionPayloadSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test('accepts payload object', () => {
      const result = ActionPayloadSchema.safeParse({
        payload: { key: 'value', count: 42 }
      });
      expect(result.success).toBe(true);
      expect(result.data.payload.key).toBe('value');
    });
  });
});
