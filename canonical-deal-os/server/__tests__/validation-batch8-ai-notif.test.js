/**
 * Batch 8: AI Assistant & Notifications Validation Tests
 *
 * Tests Zod schema validation for AI assistant operations, document extraction,
 * task management, notification snoozing, and preferences.
 */

import { jest } from '@jest/globals';
import {
  AskAISchema,
  ExtractDocumentSchema,
  SynthesizeDocumentsSchema,
  AIResolveConflictSchema,
  DismissConflictSchema,
  VerifyFieldSchema,
  MarkNeedsReviewSchema,
  TrackLineageSchema,
  BulkVerifySchema,
  CreateAssumptionSnapshotSchema,
  CompareAssumptionsSchema,
  GetAssumptionSuggestionsSchema,
  SmartParseSchema,
  SmartParseApplySchema,
  CreateTaskSchema,
  UpdateTaskSchema,
  SnoozeNotificationSchema,
  DismissNotificationSchema,
  UpdateNotificationPreferencesSchema
} from '../middleware/route-schemas.js';

describe('Batch 8: AI Assistant & Notifications Validation', () => {

  // ===== AI Assistant Schemas =====

  describe('AskAISchema', () => {
    test('rejects missing question', () => {
      const result = AskAISchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('rejects empty question', () => {
      const result = AskAISchema.safeParse({ question: '' });
      expect(result.success).toBe(false);
    });

    test('accepts valid question', () => {
      const result = AskAISchema.safeParse({ question: 'What is the cap rate?' });
      expect(result.success).toBe(true);
    });

    test('accepts question with optional conversationId', () => {
      const result = AskAISchema.safeParse({
        question: 'Follow up question',
        conversationId: 'conv-123'
      });
      expect(result.success).toBe(true);
    });

    test('rejects invalid dealId UUID', () => {
      const result = AskAISchema.safeParse({
        question: 'About this deal',
        dealId: 'not-a-uuid'
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ExtractDocumentSchema', () => {
    test('rejects missing documentId', () => {
      const result = ExtractDocumentSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('rejects invalid documentId UUID', () => {
      const result = ExtractDocumentSchema.safeParse({ documentId: 'not-uuid' });
      expect(result.success).toBe(false);
    });

    test('accepts valid documentId', () => {
      const result = ExtractDocumentSchema.safeParse({
        documentId: '550e8400-e29b-41d4-a716-446655440000'
      });
      expect(result.success).toBe(true);
    });

    test('accepts optional extractionType', () => {
      const result = ExtractDocumentSchema.safeParse({
        documentId: '550e8400-e29b-41d4-a716-446655440000',
        extractionType: 'LEASE_ABSTRACT'
      });
      expect(result.success).toBe(true);
    });
  });

  describe('SynthesizeDocumentsSchema', () => {
    test('rejects missing documentIds', () => {
      const result = SynthesizeDocumentsSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('rejects empty documentIds array', () => {
      const result = SynthesizeDocumentsSchema.safeParse({ documentIds: [] });
      expect(result.success).toBe(false);
    });

    test('rejects invalid UUIDs in array', () => {
      const result = SynthesizeDocumentsSchema.safeParse({
        documentIds: ['not-a-uuid']
      });
      expect(result.success).toBe(false);
    });

    test('accepts valid documentIds array', () => {
      const result = SynthesizeDocumentsSchema.safeParse({
        documentIds: [
          '550e8400-e29b-41d4-a716-446655440000',
          '550e8400-e29b-41d4-a716-446655440001'
        ]
      });
      expect(result.success).toBe(true);
      expect(result.data.documentIds).toHaveLength(2);
    });
  });

  describe('BulkVerifySchema', () => {
    test('rejects missing fieldIds', () => {
      const result = BulkVerifySchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('rejects empty fieldIds array', () => {
      const result = BulkVerifySchema.safeParse({ fieldIds: [] });
      expect(result.success).toBe(false);
    });

    test('accepts valid fieldIds', () => {
      const result = BulkVerifySchema.safeParse({
        fieldIds: ['field-1', 'field-2']
      });
      expect(result.success).toBe(true);
    });

    test('accepts optional verificationNotes', () => {
      const result = BulkVerifySchema.safeParse({
        fieldIds: ['field-1'],
        verificationNotes: 'All fields verified against source'
      });
      expect(result.success).toBe(true);
    });
  });

  describe('CreateAssumptionSnapshotSchema', () => {
    test('rejects missing snapshotType', () => {
      const result = CreateAssumptionSnapshotSchema.safeParse({
        assumptions: { capRate: 0.06 }
      });
      expect(result.success).toBe(false);
    });

    test('rejects missing assumptions', () => {
      const result = CreateAssumptionSnapshotSchema.safeParse({
        snapshotType: 'UNDERWRITING'
      });
      expect(result.success).toBe(false);
    });

    test('accepts valid snapshot', () => {
      const result = CreateAssumptionSnapshotSchema.safeParse({
        snapshotType: 'UNDERWRITING',
        assumptions: { capRate: 0.06, growthRate: 0.03 },
        metrics: { noi: 500000 }
      });
      expect(result.success).toBe(true);
    });
  });

  describe('CompareAssumptionsSchema', () => {
    test('rejects missing period', () => {
      const result = CompareAssumptionsSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('accepts valid period', () => {
      const result = CompareAssumptionsSchema.safeParse({ period: 'Q1-2026' });
      expect(result.success).toBe(true);
    });
  });

  describe('SmartParseSchema', () => {
    test('rejects missing artifactId', () => {
      const result = SmartParseSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('accepts valid artifactId', () => {
      const result = SmartParseSchema.safeParse({ artifactId: 'artifact-123' });
      expect(result.success).toBe(true);
    });

    test('accepts optional targetFields', () => {
      const result = SmartParseSchema.safeParse({
        artifactId: 'artifact-123',
        targetFields: ['noi', 'capRate', 'askingPrice']
      });
      expect(result.success).toBe(true);
    });
  });

  describe('SmartParseApplySchema', () => {
    test('rejects missing artifactId', () => {
      const result = SmartParseApplySchema.safeParse({ fields: {} });
      expect(result.success).toBe(false);
    });

    test('rejects missing fields', () => {
      const result = SmartParseApplySchema.safeParse({ artifactId: 'art-1' });
      expect(result.success).toBe(false);
    });

    test('accepts valid apply request', () => {
      const result = SmartParseApplySchema.safeParse({
        artifactId: 'artifact-123',
        fields: { noi: 500000, capRate: 0.06 }
      });
      expect(result.success).toBe(true);
    });
  });

  // ===== Notifications Schemas =====

  describe('CreateTaskSchema', () => {
    test('rejects missing title', () => {
      const result = CreateTaskSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('rejects empty title', () => {
      const result = CreateTaskSchema.safeParse({ title: '' });
      expect(result.success).toBe(false);
    });

    test('accepts valid title', () => {
      const result = CreateTaskSchema.safeParse({ title: 'Review documents' });
      expect(result.success).toBe(true);
    });

    test('defaults priority to MEDIUM', () => {
      const result = CreateTaskSchema.safeParse({ title: 'Test task' });
      expect(result.success).toBe(true);
      expect(result.data.priority).toBe('MEDIUM');
    });

    test('accepts HIGH priority', () => {
      const result = CreateTaskSchema.safeParse({
        title: 'Urgent task',
        priority: 'HIGH'
      });
      expect(result.success).toBe(true);
      expect(result.data.priority).toBe('HIGH');
    });

    test('accepts URGENT priority', () => {
      const result = CreateTaskSchema.safeParse({
        title: 'Critical task',
        priority: 'URGENT'
      });
      expect(result.success).toBe(true);
    });

    test('rejects invalid priority', () => {
      const result = CreateTaskSchema.safeParse({
        title: 'Test',
        priority: 'INVALID'
      });
      expect(result.success).toBe(false);
    });

    test('rejects invalid dealId UUID', () => {
      const result = CreateTaskSchema.safeParse({
        title: 'Test',
        dealId: 'not-uuid'
      });
      expect(result.success).toBe(false);
    });
  });

  describe('UpdateTaskSchema', () => {
    test('accepts empty object (all optional)', () => {
      const result = UpdateTaskSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test('accepts status update', () => {
      const result = UpdateTaskSchema.safeParse({ status: 'IN_PROGRESS' });
      expect(result.success).toBe(true);
    });

    test('rejects invalid status', () => {
      const result = UpdateTaskSchema.safeParse({ status: 'INVALID' });
      expect(result.success).toBe(false);
    });

    test('accepts DONE status', () => {
      const result = UpdateTaskSchema.safeParse({ status: 'DONE' });
      expect(result.success).toBe(true);
    });

    test('accepts CANCELLED status', () => {
      const result = UpdateTaskSchema.safeParse({ status: 'CANCELLED' });
      expect(result.success).toBe(true);
    });

    test('accepts nullable dueDate', () => {
      const result = UpdateTaskSchema.safeParse({ dueDate: null });
      expect(result.success).toBe(true);
    });
  });

  describe('SnoozeNotificationSchema', () => {
    test('rejects when neither duration nor until provided', () => {
      const result = SnoozeNotificationSchema.safeParse({});
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('duration or until');
    });

    test('accepts valid duration 1h', () => {
      const result = SnoozeNotificationSchema.safeParse({ duration: '1h' });
      expect(result.success).toBe(true);
    });

    test('accepts valid duration 1d', () => {
      const result = SnoozeNotificationSchema.safeParse({ duration: '1d' });
      expect(result.success).toBe(true);
    });

    test('accepts valid duration 1w', () => {
      const result = SnoozeNotificationSchema.safeParse({ duration: '1w' });
      expect(result.success).toBe(true);
    });

    test('rejects invalid duration', () => {
      const result = SnoozeNotificationSchema.safeParse({ duration: '2h' });
      expect(result.success).toBe(false);
    });

    test('accepts until datetime', () => {
      const result = SnoozeNotificationSchema.safeParse({
        until: '2026-03-15T10:00:00Z'
      });
      expect(result.success).toBe(true);
    });
  });

  describe('DismissNotificationSchema', () => {
    test('accepts empty object', () => {
      const result = DismissNotificationSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test('accepts completed reason', () => {
      const result = DismissNotificationSchema.safeParse({ reason: 'completed' });
      expect(result.success).toBe(true);
    });

    test('accepts not_relevant reason', () => {
      const result = DismissNotificationSchema.safeParse({ reason: 'not_relevant' });
      expect(result.success).toBe(true);
    });

    test('rejects invalid reason', () => {
      const result = DismissNotificationSchema.safeParse({ reason: 'invalid' });
      expect(result.success).toBe(false);
    });
  });

  describe('UpdateNotificationPreferencesSchema', () => {
    test('accepts empty object (all optional)', () => {
      const result = UpdateNotificationPreferencesSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test('accepts emailEnabled boolean', () => {
      const result = UpdateNotificationPreferencesSchema.safeParse({
        emailEnabled: false
      });
      expect(result.success).toBe(true);
    });

    test('accepts valid quietStart time', () => {
      const result = UpdateNotificationPreferencesSchema.safeParse({
        quietStart: '22:00'
      });
      expect(result.success).toBe(true);
    });

    test('rejects invalid quietStart format', () => {
      const result = UpdateNotificationPreferencesSchema.safeParse({
        quietStart: '25:00'
      });
      expect(result.success).toBe(false);
    });

    test('rejects invalid quietEnd format', () => {
      const result = UpdateNotificationPreferencesSchema.safeParse({
        quietEnd: '10:61'
      });
      expect(result.success).toBe(false);
    });

    test('accepts valid reminder days', () => {
      const result = UpdateNotificationPreferencesSchema.safeParse({
        reminderDays: [1, 3, 7]
      });
      expect(result.success).toBe(true);
    });

    test('rejects reminder days > 30', () => {
      const result = UpdateNotificationPreferencesSchema.safeParse({
        reminderDays: [35]
      });
      expect(result.success).toBe(false);
    });

    test('accepts escalateAfterDays', () => {
      const result = UpdateNotificationPreferencesSchema.safeParse({
        escalateAfterDays: 14
      });
      expect(result.success).toBe(true);
    });

    test('rejects escalateAfterDays > 30', () => {
      const result = UpdateNotificationPreferencesSchema.safeParse({
        escalateAfterDays: 45
      });
      expect(result.success).toBe(false);
    });
  });
});
