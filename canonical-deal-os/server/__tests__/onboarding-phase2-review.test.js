/**
 * Onboarding Phase 2: Split Review Unit Tests
 *
 * Tests for:
 * - Provenance tracking and display
 * - Conflict detection and resolution
 * - Document viewer integration
 * - Bulk verification
 * - Review workflow steps
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  OnboardingLogger,
  createOnboardingLogger,
  COMPONENTS
} from '../services/onboarding-logger.js';

// Mock Prisma
const mockPrisma = {
  onboardingProcessingLog: {
    create: jest.fn().mockResolvedValue({ id: 'log-1' })
  },
  onboardingActivity: {
    create: jest.fn().mockResolvedValue({ id: 'activity-1' })
  },
  onboardingClaim: {
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn()
  },
  onboardingConflict: {
    findMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn()
  },
  onboardingIntakeSource: {
    findUnique: jest.fn()
  }
};

describe('Phase 2: Split Review', () => {
  let logger;
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(() => {}),
      error: jest.spyOn(console, 'error').mockImplementation(() => {}),
      warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
      debug: jest.spyOn(console, 'debug').mockImplementation(() => {})
    };

    jest.clearAllMocks();

    logger = createOnboardingLogger(mockPrisma, 'session-123', {
      consoleOutput: false,
      persistToDb: false
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Provenance Logging', () => {
    it('should log provenance click-through with all details', async () => {
      const logSpy = jest.spyOn(logger, 'debug');

      await logger.logProvenanceClick('claim-1', 'source-1', 5, 'B12');

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.PROVENANCE,
        'Provenance navigated: claim claim-1',
        {
          claimId: 'claim-1',
          sourceId: 'source-1',
          pageNumber: 5,
          cellReference: 'B12'
        }
      );
    });

    it('should log provenance click without cell reference for PDFs', async () => {
      const logSpy = jest.spyOn(logger, 'debug');

      await logger.logProvenanceClick('claim-2', 'source-2', 3, null);

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.PROVENANCE,
        'Provenance navigated: claim claim-2',
        {
          claimId: 'claim-2',
          sourceId: 'source-2',
          pageNumber: 3,
          cellReference: null
        }
      );
    });

    it('should log provenance highlight with truncated text', async () => {
      const logSpy = jest.spyOn(logger, 'debug');
      const longText = 'A'.repeat(200);

      await logger.logProvenanceHighlight('claim-1', longText, 'document.pdf');

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.PROVENANCE,
        'Provenance highlighted: document.pdf',
        {
          claimId: 'claim-1',
          textSnippet: 'A'.repeat(100),
          documentName: 'document.pdf'
        }
      );
    });

    it('should handle undefined text snippet', async () => {
      const logSpy = jest.spyOn(logger, 'debug');

      await logger.logProvenanceHighlight('claim-1', undefined, 'doc.xlsx');

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.PROVENANCE,
        'Provenance highlighted: doc.xlsx',
        {
          claimId: 'claim-1',
          textSnippet: undefined,
          documentName: 'doc.xlsx'
        }
      );
    });
  });

  describe('Document Viewer Logging', () => {
    it('should log document view with all metadata', async () => {
      const logSpy = jest.spyOn(logger, 'info');

      await logger.logDocumentView('source-1', 'rent-roll.xlsx', 'spreadsheet', 'user-1');

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.DOCUMENT_VIEWER,
        'Document viewed: rent-roll.xlsx',
        {
          sourceId: 'source-1',
          documentName: 'rent-roll.xlsx',
          docType: 'spreadsheet',
          userId: 'user-1'
        }
      );
    });

    it('should log PDF document view', async () => {
      const logSpy = jest.spyOn(logger, 'info');

      await logger.logDocumentView('source-2', 'om.pdf', 'pdf', 'user-2');

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.DOCUMENT_VIEWER,
        'Document viewed: om.pdf',
        {
          sourceId: 'source-2',
          documentName: 'om.pdf',
          docType: 'pdf',
          userId: 'user-2'
        }
      );
    });

    it('should log image document view', async () => {
      const logSpy = jest.spyOn(logger, 'info');

      await logger.logDocumentView('source-3', 'property.jpg', 'image', 'user-1');

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.DOCUMENT_VIEWER,
        'Document viewed: property.jpg',
        {
          sourceId: 'source-3',
          documentName: 'property.jpg',
          docType: 'image',
          userId: 'user-1'
        }
      );
    });
  });

  describe('Conflict Resolution Logging', () => {
    it('should log conflict resolution with AI suggestion method', async () => {
      const logSpy = jest.spyOn(logger, 'info');

      await logger.logConflictResolution('conflict-1', 'AI_SUGGESTION', '$1,500,000', 'user-1');

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.CONFLICT_RESOLVER,
        'Conflict resolved: conflict-1',
        {
          conflictId: 'conflict-1',
          resolutionMethod: 'AI_SUGGESTION',
          resolvedValue: '$1,500,000',
          userId: 'user-1'
        }
      );
    });

    it('should log conflict resolution with source selection', async () => {
      const logSpy = jest.spyOn(logger, 'info');

      await logger.logConflictResolution('conflict-2', 'SOURCE_A', '48 units', 'user-2');

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.CONFLICT_RESOLVER,
        'Conflict resolved: conflict-2',
        {
          conflictId: 'conflict-2',
          resolutionMethod: 'SOURCE_A',
          resolvedValue: '48 units',
          userId: 'user-2'
        }
      );
    });

    it('should log conflict resolution with custom value', async () => {
      const logSpy = jest.spyOn(logger, 'info');

      await logger.logConflictResolution('conflict-3', 'CUSTOM', 'Custom Value', 'user-1');

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.CONFLICT_RESOLVER,
        'Conflict resolved: conflict-3',
        {
          conflictId: 'conflict-3',
          resolutionMethod: 'CUSTOM',
          resolvedValue: 'Custom Value',
          userId: 'user-1'
        }
      );
    });

    it('should log conflict skipped', async () => {
      const logSpy = jest.spyOn(logger, 'info');

      await logger.logConflictSkipped('conflict-4', 'user-1');

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.CONFLICT_RESOLVER,
        'Conflict skipped: conflict-4',
        {
          conflictId: 'conflict-4',
          userId: 'user-1'
        }
      );
    });
  });

  describe('Bulk Verification Logging', () => {
    it('should log bulk verification with claim count and duration', async () => {
      const logSpy = jest.spyOn(logger, 'info');
      const claimIds = ['claim-1', 'claim-2', 'claim-3', 'claim-4', 'claim-5'];

      await logger.logBulkVerification(claimIds, 'VERIFY', 'user-1', 1500);

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.BULK_VERIFICATION,
        'Bulk VERIFY: 5 claims',
        {
          claimCount: 5,
          claimIds: claimIds,
          action: 'VERIFY',
          userId: 'user-1',
          duration: 1500
        }
      );
    });

    it('should truncate claim IDs to first 10 for large batches', async () => {
      const logSpy = jest.spyOn(logger, 'info');
      const claimIds = Array.from({ length: 50 }, (_, i) => `claim-${i}`);

      await logger.logBulkVerification(claimIds, 'REJECT', 'user-1', 3000);

      const callArgs = logSpy.mock.calls[0][2];
      expect(callArgs.claimCount).toBe(50);
      expect(callArgs.claimIds.length).toBe(10);
      expect(callArgs.claimIds[0]).toBe('claim-0');
      expect(callArgs.claimIds[9]).toBe('claim-9');
    });

    it('should log bulk rejection action', async () => {
      const logSpy = jest.spyOn(logger, 'info');

      await logger.logBulkVerification(['claim-1'], 'REJECT', 'user-2', 500);

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.BULK_VERIFICATION,
        'Bulk REJECT: 1 claims',
        expect.objectContaining({
          action: 'REJECT'
        })
      );
    });
  });

  describe('Review Workflow Logging', () => {
    it('should log review workflow step with status transition', async () => {
      const logSpy = jest.spyOn(logger, 'info');

      await logger.logReviewWorkflowStep('VERIFY', 'claim-1', 'UNVERIFIED', 'VERIFIED', 'user-1');

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.REVIEW_WORKFLOW,
        'Review step: VERIFY',
        {
          step: 'VERIFY',
          claimId: 'claim-1',
          fromStatus: 'UNVERIFIED',
          toStatus: 'VERIFIED',
          userId: 'user-1'
        }
      );
    });

    it('should log review session start with counts', async () => {
      const logSpy = jest.spyOn(logger, 'info');

      await logger.logReviewSessionStart('user-1', 100, 5);

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.REVIEW_WORKFLOW,
        'Review session started',
        {
          userId: 'user-1',
          claimCount: 100,
          conflictCount: 5
        }
      );
    });

    it('should log review session complete with metrics', async () => {
      const logSpy = jest.spyOn(logger, 'info');

      await logger.logReviewSessionComplete('user-1', 95, 5, 120000);

      expect(logSpy).toHaveBeenCalledWith(
        COMPONENTS.REVIEW_WORKFLOW,
        'Review session completed',
        {
          userId: 'user-1',
          verifiedCount: 95,
          rejectedCount: 5,
          duration: 120000
        }
      );
    });
  });

  describe('Phase 2 COMPONENTS', () => {
    it('should have all Phase 2 component identifiers', () => {
      expect(COMPONENTS.DOCUMENT_VIEWER).toBe('DOCUMENT_VIEWER');
      expect(COMPONENTS.PROVENANCE).toBe('PROVENANCE');
      expect(COMPONENTS.REVIEW_WORKFLOW).toBe('REVIEW_WORKFLOW');
      expect(COMPONENTS.BULK_VERIFICATION).toBe('BULK_VERIFICATION');
    });
  });
});

describe('Conflict Detection Logic', () => {
  describe('detectConflicts', () => {
    it('should detect conflicts when same field has different values from different sources', () => {
      const claims = [
        { id: 'c1', fieldPath: 'property.units', value: '48', sourceId: 's1' },
        { id: 'c2', fieldPath: 'property.units', value: '52', sourceId: 's2' }
      ];

      const conflicts = detectConflicts(claims);

      expect(conflicts.length).toBe(1);
      expect(conflicts[0].fieldPath).toBe('property.units');
      expect(conflicts[0].claimAId).toBe('c1');
      expect(conflicts[0].claimBId).toBe('c2');
    });

    it('should not detect conflict when values match', () => {
      const claims = [
        { id: 'c1', fieldPath: 'property.name', value: 'Sunset Apartments', sourceId: 's1' },
        { id: 'c2', fieldPath: 'property.name', value: 'Sunset Apartments', sourceId: 's2' }
      ];

      const conflicts = detectConflicts(claims);

      expect(conflicts.length).toBe(0);
    });

    it('should detect multiple conflicts for different fields', () => {
      const claims = [
        { id: 'c1', fieldPath: 'property.units', value: '48', sourceId: 's1' },
        { id: 'c2', fieldPath: 'property.units', value: '52', sourceId: 's2' },
        { id: 'c3', fieldPath: 'property.rent', value: '$1200', sourceId: 's1' },
        { id: 'c4', fieldPath: 'property.rent', value: '$1250', sourceId: 's2' }
      ];

      const conflicts = detectConflicts(claims);

      expect(conflicts.length).toBe(2);
    });

    it('should handle case-insensitive value comparison', () => {
      const claims = [
        { id: 'c1', fieldPath: 'property.name', value: 'SUNSET APARTMENTS', sourceId: 's1' },
        { id: 'c2', fieldPath: 'property.name', value: 'Sunset Apartments', sourceId: 's2' }
      ];

      const conflicts = detectConflicts(claims);

      expect(conflicts.length).toBe(0);
    });

    it('should handle whitespace normalization', () => {
      const claims = [
        { id: 'c1', fieldPath: 'property.address', value: '123 Main St', sourceId: 's1' },
        { id: 'c2', fieldPath: 'property.address', value: '123  Main  St', sourceId: 's2' }
      ];

      const conflicts = detectConflicts(claims);

      expect(conflicts.length).toBe(0);
    });
  });
});

describe('Provenance Data Structure', () => {
  describe('buildProvenanceChain', () => {
    it('should build provenance chain from claim to source', () => {
      const claim = {
        id: 'claim-1',
        sourceId: 'source-1',
        pageNumber: 5,
        textSnippet: 'Total Units: 48',
        cellReference: null
      };

      const source = {
        id: 'source-1',
        fileName: 'rent-roll.pdf',
        mimeType: 'application/pdf',
        uploadedAt: new Date('2026-01-15')
      };

      const provenance = buildProvenanceChain(claim, source);

      expect(provenance).toEqual({
        claimId: 'claim-1',
        documentName: 'rent-roll.pdf',
        documentType: 'pdf',
        pageNumber: 5,
        cellReference: null,
        textSnippet: 'Total Units: 48',
        uploadedAt: expect.any(Date)
      });
    });

    it('should build provenance for spreadsheet with cell reference', () => {
      const claim = {
        id: 'claim-2',
        sourceId: 'source-2',
        pageNumber: null,
        textSnippet: '48',
        cellReference: 'B12'
      };

      const source = {
        id: 'source-2',
        fileName: 'rent-roll.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        uploadedAt: new Date('2026-01-15')
      };

      const provenance = buildProvenanceChain(claim, source);

      expect(provenance.documentType).toBe('spreadsheet');
      expect(provenance.cellReference).toBe('B12');
      expect(provenance.pageNumber).toBeNull();
    });
  });
});

describe('Bulk Verification Logic', () => {
  describe('validateBulkOperation', () => {
    it('should validate bulk operation with valid claims', () => {
      const claims = [
        { id: 'c1', status: 'UNVERIFIED' },
        { id: 'c2', status: 'UNVERIFIED' }
      ];

      const result = validateBulkOperation(claims, 'VERIFY');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject bulk verify on already verified claims', () => {
      const claims = [
        { id: 'c1', status: 'VERIFIED' },
        { id: 'c2', status: 'UNVERIFIED' }
      ];

      const result = validateBulkOperation(claims, 'VERIFY');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Claim c1 is already VERIFIED');
    });

    it('should reject bulk operation on conflicted claims', () => {
      const claims = [
        { id: 'c1', status: 'CONFLICTED' }
      ];

      const result = validateBulkOperation(claims, 'VERIFY');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Claim c1 has unresolved conflicts');
    });

    it('should limit batch size', () => {
      const claims = Array.from({ length: 101 }, (_, i) => ({
        id: `c${i}`,
        status: 'UNVERIFIED'
      }));

      const result = validateBulkOperation(claims, 'VERIFY');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Batch size exceeds maximum of 100');
    });
  });
});

// Helper functions that would be in actual service files

function detectConflicts(claims) {
  const conflicts = [];
  const claimsByField = {};

  // Group claims by field path
  for (const claim of claims) {
    if (!claimsByField[claim.fieldPath]) {
      claimsByField[claim.fieldPath] = [];
    }
    claimsByField[claim.fieldPath].push(claim);
  }

  // Find conflicts where values differ
  for (const [fieldPath, fieldClaims] of Object.entries(claimsByField)) {
    if (fieldClaims.length < 2) continue;

    const normalizedValues = new Map();
    for (const claim of fieldClaims) {
      const normalizedValue = normalizeValue(claim.value);
      if (!normalizedValues.has(normalizedValue)) {
        normalizedValues.set(normalizedValue, []);
      }
      normalizedValues.get(normalizedValue).push(claim);
    }

    // If more than one distinct normalized value, we have a conflict
    if (normalizedValues.size > 1) {
      const claimGroups = Array.from(normalizedValues.values());
      conflicts.push({
        fieldPath,
        claimAId: claimGroups[0][0].id,
        claimBId: claimGroups[1][0].id
      });
    }
  }

  return conflicts;
}

function normalizeValue(value) {
  if (typeof value !== 'string') return value;
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function buildProvenanceChain(claim, source) {
  const docType = getDocumentType(source.mimeType, source.fileName);

  return {
    claimId: claim.id,
    documentName: source.fileName,
    documentType: docType,
    pageNumber: claim.pageNumber,
    cellReference: claim.cellReference,
    textSnippet: claim.textSnippet,
    uploadedAt: source.uploadedAt
  };
}

function getDocumentType(mimeType, fileName) {
  if (mimeType.includes('pdf') || fileName.endsWith('.pdf')) return 'pdf';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') ||
      fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
    return 'spreadsheet';
  }
  if (mimeType.includes('image')) return 'image';
  return 'text';
}

function validateBulkOperation(claims, action) {
  const errors = [];

  // Check batch size
  if (claims.length > 100) {
    errors.push('Batch size exceeds maximum of 100');
  }

  // Check each claim
  for (const claim of claims) {
    if (action === 'VERIFY' && claim.status === 'VERIFIED') {
      errors.push(`Claim ${claim.id} is already VERIFIED`);
    }
    if (claim.status === 'CONFLICTED') {
      errors.push(`Claim ${claim.id} has unresolved conflicts`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
