# Phase 1: AI Security Hardening

## Overview

Phase 1 implements zero-cost security improvements building on Phase 0 (completed):
- **1.1 Prompt Injection Protection** - Input sanitization, jailbreak detection, output validation
- **1.2 User Consent Management** - GDPR-compliant consent with versioning
- **1.3 Data Retention Policy** - Automated cleanup with legal hold support

---

## Implementation Order & Dependencies

```
Phase 1.1 (Prompt Injection) ──┐
                               ├──► Phase 1.3 (Data Retention)
Phase 1.2 (User Consent) ──────┘
```

**Order**: 1.1 → 1.2 → 1.3 (Retention needs consent status for cleanup decisions)

---

## Phase 1.1: Prompt Injection Protection

### Critical Injection Vectors Found

| Location | File | Risk |
|----------|------|------|
| `buildDealParsePrompt(text)` | llm.js:88-117 | User text interpolated directly |
| Smart doc parse | llm.js:265-288 | Filename + content unescaped |
| Summary prompt | ai-assistant.js:1043-1063 | dealName/property interpolated |
| Chat messages | ai-assistant.js:698 | User message to LLM |

### Schema Changes

Add to `AIInteractionLog` in `server/prisma/schema.prisma`:
```prisma
  sanitizationApplied    Boolean   @default(false)
  jailbreakScore         Float?
  jailbreakPatterns      String?   // JSON
  outputValidationPassed Boolean   @default(true)
  outputValidationIssues String?   // JSON
```

### New File: `server/services/ai-security.js`

```javascript
// Core exports
export function sanitizeUserInput(input, options = {})
export function escapePromptDelimiters(text)
export function detectJailbreakAttempt(input)
export function validateLLMOutput(output, expectedType)
export function detectCodeInjection(output)
export const SECURITY_CONFIG

// Jailbreak patterns (configurable via env)
const JAILBREAK_PATTERNS = [
  /ignore (previous|all|above) (instructions|rules)/i,
  /disregard (your|the) (system|initial) (prompt|instructions)/i,
  /you are now (a|in) (DAN|jailbreak|unrestricted)/i,
  /pretend (you|to be) (are|a) (human|uncensored)/i,
  /bypass (your|the|all) (restrictions|filters|rules)/i,
  /\[system\]|\[admin\]|\[override\]/i,
  /new (system|core) (prompt|instructions):/i,
];

// Sanitization: escape delimiters, length limit, unicode normalization
// Output validation: detect SQL/code injection, validate JSON structure
```

### Modifications

**llm.js** - Wrap prompt builders:
```javascript
import { sanitizeUserInput, detectJailbreakAttempt } from './services/ai-security.js';

function buildDealParsePrompt(text, variant) {
  const sanitizedText = sanitizeUserInput(text, { maxLength: 10000, escapeDelimiters: true });
  const jailbreakResult = detectJailbreakAttempt(text);
  if (jailbreakResult.score > 0.8) {
    throw new SecurityError('Input rejected by security filter');
  }
  // ... rest with sanitizedText
}
```

**ai-assistant.js** - Add to handleDealChat (after rate limit check):
```javascript
const jailbreakResult = detectJailbreakAttempt(message);
if (jailbreakResult.score > SECURITY_CONFIG.jailbreakBlockThreshold) {
  await logAIInteraction({ ...params, jailbreakScore: jailbreakResult.score, validationPassed: false });
  return sendError(res, 400, "Message rejected by security filter");
}
```

### Environment Variables

```env
AI_SECURITY_ENABLED=true
AI_JAILBREAK_BLOCK_THRESHOLD=0.8
AI_JAILBREAK_WARN_THRESHOLD=0.5
AI_MAX_INPUT_LENGTH=10000
AI_ENABLE_OUTPUT_VALIDATION=true
DEBUG_AI_SECURITY=false
```

### Test File: `server/__tests__/ai-security.test.js`

```javascript
describe('AI Security', () => {
  describe('sanitizeUserInput', () => {
    test('escapes prompt delimiters')
    test('enforces max length')
    test('normalizes unicode')
    test('preserves legitimate business text')
  });

  describe('detectJailbreakAttempt', () => {
    test('detects "ignore previous instructions"')
    test('detects role-play attempts')
    test('returns low score for normal text')
    test('handles edge cases (empty, unicode)')
  });

  describe('validateLLMOutput', () => {
    test('detects SQL keywords')
    test('detects code blocks in chat')
    test('validates JSON structure')
  });
});
```

### Verification

```bash
npm run test -- --grep "ai-security"
# Manual: POST /api/deals/{id}/chat with jailbreak prompt → expect 400
```

---

## Phase 1.2: User Consent Management (GDPR)

**Status**: Ready for implementation (Phase 1.1 completed)

### Design Decisions

1. **Consent Check Location**: Middleware function `requireAIConsent()` + inline checks in handlers
2. **Grace Period**: 14 days for existing users before consent required
3. **Feature-level Consent**: Master toggle + per-feature toggles (deal parsing, chat, docs, insights)
4. **Policy Storage**: Database (AIConsentPolicy) for versioning and audit trail
5. **Re-consent Trigger**: Policy version change OR 12-month expiration

### Schema Changes

Add to `server/prisma/schema.prisma`:

```prisma
// ========== AI CONSENT MANAGEMENT (GDPR Compliance) ==========

model AIConsent {
  id              String    @id @default(uuid())
  userId          String    @unique               // One record per user
  organizationId  String

  // Consent state
  consentGiven    Boolean   @default(false)
  consentVersion  String                          // Policy version consented to

  // Granular feature permissions
  allowDealParsing       Boolean @default(false)
  allowChatAssistant     Boolean @default(false)
  allowDocumentAnalysis  Boolean @default(false)
  allowInsights          Boolean @default(false)

  // Consent lifecycle
  consentedAt     DateTime?
  withdrawnAt     DateTime?                       // GDPR: right to withdraw
  expiresAt       DateTime?                       // Auto-expiry (12 months)

  // Audit trail
  ipAddress       String?
  userAgent       String?
  consentMethod   String    @default("UI")        // UI, API, GRANDFATHERED

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([organizationId])
  @@index([consentGiven])
  @@index([expiresAt])
}

model AIConsentPolicy {
  id              String    @id @default(uuid())
  version         String    @unique               // Semantic: "1.0.0"
  title           String
  content         String                          // Full policy (Markdown)
  summary         String                          // Brief for UI
  effectiveDate   DateTime
  supersededBy    String?                         // Next version ID
  createdAt       DateTime  @default(now())

  @@index([effectiveDate])
}

model AIConsentAudit {
  id              String    @id @default(uuid())
  userId          String
  consentId       String
  action          String                          // CONSENT_GIVEN, WITHDRAWN, FEATURE_TOGGLED, EXPIRED
  policyVersion   String
  beforeState     String?                         // JSON
  afterState      String                          // JSON
  ipAddress       String?
  userAgent       String?
  reason          String?                         // User-provided for withdrawal
  createdAt       DateTime  @default(now())

  @@index([userId])
  @@index([consentId])
  @@index([createdAt])
}
```

### Implementation Steps (Incremental with Testing)

#### Step 1: Schema + Validation (10 min)
```bash
# Add models to schema.prisma
npm run validate:prisma   # Test: passes
npm run db:push           # Apply to database
```

**Test checkpoint**: `npx prisma validate` passes

#### Step 2: Core Service - Config & Types (20 min)

Create `server/services/ai-consent.js`:

```javascript
/**
 * AI Consent Service
 *
 * SECURITY: Critical for GDPR compliance
 * Phase 1.2 Implementation
 */

import { getPrisma } from '../db.js';

// Configuration
export const CONSENT_CONFIG = {
  enabled: process.env.AI_CONSENT_ENABLED !== 'false',
  gracePeriodDays: parseInt(process.env.AI_CONSENT_GRACE_PERIOD_DAYS) || 14,
  expirationMonths: parseInt(process.env.AI_CONSENT_EXPIRATION_MONTHS) || 12,
  currentPolicyVersion: process.env.AI_CONSENT_POLICY_VERSION || '1.0.0',
  debug: process.env.DEBUG_AI_CONSENT === 'true',
};

// Feature types
export const AI_FEATURES = {
  DEAL_PARSING: 'allowDealParsing',
  CHAT_ASSISTANT: 'allowChatAssistant',
  DOCUMENT_ANALYSIS: 'allowDocumentAnalysis',
  INSIGHTS: 'allowInsights',
};

// Feature to field mapping
const FEATURE_FIELDS = {
  [AI_FEATURES.DEAL_PARSING]: 'allowDealParsing',
  [AI_FEATURES.CHAT_ASSISTANT]: 'allowChatAssistant',
  [AI_FEATURES.DOCUMENT_ANALYSIS]: 'allowDocumentAnalysis',
  [AI_FEATURES.INSIGHTS]: 'allowInsights',
};
```

**Test**: Create stub test file, verify imports work

#### Step 3: Core Service - checkConsent() (30 min)

```javascript
/**
 * Check if user has valid consent for AI feature
 *
 * @param {string} userId - User ID
 * @param {string} feature - Feature from AI_FEATURES (optional)
 * @returns {Object} { valid, reason, requiresConsent, consentRecord }
 */
export async function checkConsent(userId, feature = null) {
  if (!CONSENT_CONFIG.enabled) {
    if (CONSENT_CONFIG.debug) {
      console.log(`[AI-CONSENT] Consent disabled, allowing access`);
    }
    return { valid: true, reason: 'consent_disabled', requiresConsent: false, consentRecord: null };
  }

  const prisma = getPrisma();

  // Get user's consent record
  const consent = await prisma.aIConsent.findUnique({
    where: { userId }
  });

  if (CONSENT_CONFIG.debug) {
    console.log(`[AI-CONSENT] Checking consent for user=${userId}, feature=${feature}, hasRecord=${!!consent}`);
  }

  // No consent record
  if (!consent) {
    console.log(`[AI-CONSENT] BLOCKED - No consent record: user=${userId}`);
    return {
      valid: false,
      reason: 'no_consent_record',
      requiresConsent: true,
      consentRecord: null
    };
  }

  // Consent withdrawn
  if (consent.withdrawnAt) {
    console.log(`[AI-CONSENT] BLOCKED - Consent withdrawn: user=${userId}`);
    return {
      valid: false,
      reason: 'consent_withdrawn',
      requiresConsent: true,
      consentRecord: consent
    };
  }

  // Consent not given (grace period check)
  if (!consent.consentGiven) {
    // Check if in grace period
    if (consent.expiresAt && new Date() < consent.expiresAt) {
      if (CONSENT_CONFIG.debug) {
        console.log(`[AI-CONSENT] Grace period active: user=${userId}, expires=${consent.expiresAt}`);
      }
      return { valid: true, reason: 'grace_period', requiresConsent: false, consentRecord: consent };
    }
    console.log(`[AI-CONSENT] BLOCKED - Consent not given, grace expired: user=${userId}`);
    return {
      valid: false,
      reason: 'consent_not_given',
      requiresConsent: true,
      consentRecord: consent
    };
  }

  // Consent expired
  if (consent.expiresAt && new Date() > consent.expiresAt) {
    console.log(`[AI-CONSENT] WARNING - Consent expired: user=${userId}`);
    return {
      valid: false,
      reason: 'consent_expired',
      requiresConsent: true,
      consentRecord: consent
    };
  }

  // Policy version mismatch (needs re-consent)
  if (consent.consentVersion !== CONSENT_CONFIG.currentPolicyVersion) {
    console.log(`[AI-CONSENT] WARNING - Re-consent needed: user=${userId}, old=${consent.consentVersion}, new=${CONSENT_CONFIG.currentPolicyVersion}`);
    return {
      valid: false,
      reason: 'policy_updated',
      requiresConsent: true,
      consentRecord: consent
    };
  }

  // Check feature-specific permission
  if (feature && FEATURE_FIELDS[feature]) {
    const fieldName = FEATURE_FIELDS[feature];
    if (!consent[fieldName]) {
      console.log(`[AI-CONSENT] BLOCKED - Feature not allowed: user=${userId}, feature=${feature}`);
      return {
        valid: false,
        reason: 'feature_not_allowed',
        requiresConsent: false,
        consentRecord: consent
      };
    }
  }

  // All checks passed
  if (CONSENT_CONFIG.debug) {
    console.log(`[AI-CONSENT] Consent valid: user=${userId}, feature=${feature}`);
  }
  return { valid: true, reason: 'consent_valid', requiresConsent: false, consentRecord: consent };
}
```

**Test**: Unit tests for all consent states

#### Step 4: Core Service - Grant/Withdraw (30 min)

```javascript
/**
 * Grant consent with full audit trail
 */
export async function grantConsent(userId, organizationId, options = {}) {
  const prisma = getPrisma();
  const {
    allowDealParsing = true,
    allowChatAssistant = true,
    allowDocumentAnalysis = true,
    allowInsights = true,
    ipAddress = null,
    userAgent = null,
    method = 'UI'
  } = options;

  // Calculate expiry (12 months)
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + CONSENT_CONFIG.expirationMonths);

  const data = {
    organizationId,
    consentGiven: true,
    consentVersion: CONSENT_CONFIG.currentPolicyVersion,
    allowDealParsing,
    allowChatAssistant,
    allowDocumentAnalysis,
    allowInsights,
    consentedAt: new Date(),
    withdrawnAt: null,
    expiresAt,
    ipAddress,
    userAgent,
    consentMethod: method,
  };

  const consent = await prisma.aIConsent.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });

  // Audit log
  await logConsentAction({
    userId,
    consentId: consent.id,
    action: 'CONSENT_GIVEN',
    policyVersion: CONSENT_CONFIG.currentPolicyVersion,
    afterState: JSON.stringify(consent),
    ipAddress,
    userAgent,
  });

  console.log(`[AI-CONSENT] Consent granted: user=${userId}, version=${CONSENT_CONFIG.currentPolicyVersion}`);

  return consent;
}

/**
 * Withdraw consent (GDPR right)
 */
export async function withdrawConsent(userId, reason = null, metadata = {}) {
  const prisma = getPrisma();
  const { ipAddress = null, userAgent = null } = metadata;

  const existing = await prisma.aIConsent.findUnique({ where: { userId } });

  if (!existing) {
    throw new Error('No consent record found');
  }

  const updated = await prisma.aIConsent.update({
    where: { userId },
    data: {
      consentGiven: false,
      withdrawnAt: new Date(),
      allowDealParsing: false,
      allowChatAssistant: false,
      allowDocumentAnalysis: false,
      allowInsights: false,
    },
  });

  // Audit log
  await logConsentAction({
    userId,
    consentId: existing.id,
    action: 'CONSENT_WITHDRAWN',
    policyVersion: existing.consentVersion,
    beforeState: JSON.stringify(existing),
    afterState: JSON.stringify(updated),
    ipAddress,
    userAgent,
    reason,
  });

  console.log(`[AI-CONSENT] Consent withdrawn: user=${userId}, reason=${reason || 'not provided'}`);

  return updated;
}

/**
 * Log consent action to audit trail
 */
async function logConsentAction(params) {
  const prisma = getPrisma();
  try {
    await prisma.aIConsentAudit.create({ data: params });
  } catch (error) {
    console.error('[AI-CONSENT] Failed to log audit:', error);
  }
}
```

**Test**: Unit tests for grant/withdraw flows

#### Step 5: Routes (45 min)

Create `server/routes/ai-consent.js`:

```javascript
/**
 * AI Consent API Routes
 *
 * GET    /api/ai-consent/status   - Get consent status
 * POST   /api/ai-consent/grant    - Grant consent
 * POST   /api/ai-consent/withdraw - Withdraw consent
 * PATCH  /api/ai-consent/features - Update feature toggles
 * GET    /api/ai-consent/policy   - Get current policy
 */

import {
  checkConsent,
  grantConsent,
  withdrawConsent,
  getConsentStatus,
  getCurrentPolicy,
  CONSENT_CONFIG
} from '../services/ai-consent.js';

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message) {
  sendJson(res, status, { message });
}

export async function handleGetConsentStatus(req, res, authUser) {
  if (!authUser) {
    return sendError(res, 401, "Authentication required");
  }

  try {
    const status = await getConsentStatus(authUser.id);
    sendJson(res, 200, status);
  } catch (error) {
    console.error('[AI-CONSENT] Error getting status:', error);
    sendError(res, 500, "Failed to get consent status");
  }
}

export async function handleGrantConsent(req, res, authUser, readJsonBody) {
  if (!authUser) {
    return sendError(res, 401, "Authentication required");
  }

  try {
    const body = await readJsonBody(req);
    const consent = await grantConsent(authUser.id, authUser.organizationId, {
      ...body,
      ipAddress: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    sendJson(res, 200, {
      message: "Consent granted successfully",
      consent: {
        consentGiven: consent.consentGiven,
        consentVersion: consent.consentVersion,
        expiresAt: consent.expiresAt,
      }
    });
  } catch (error) {
    console.error('[AI-CONSENT] Error granting consent:', error);
    sendError(res, 500, "Failed to grant consent");
  }
}

export async function handleWithdrawConsent(req, res, authUser, readJsonBody) {
  if (!authUser) {
    return sendError(res, 401, "Authentication required");
  }

  try {
    const body = await readJsonBody(req);
    await withdrawConsent(authUser.id, body.reason, {
      ipAddress: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    sendJson(res, 200, { message: "Consent withdrawn successfully" });
  } catch (error) {
    console.error('[AI-CONSENT] Error withdrawing consent:', error);
    sendError(res, 500, "Failed to withdraw consent");
  }
}

export async function handleGetPolicy(req, res) {
  try {
    const policy = await getCurrentPolicy();
    if (!policy) {
      return sendJson(res, 200, {
        version: CONSENT_CONFIG.currentPolicyVersion,
        title: "AI Features Data Processing Agreement",
        summary: "This policy explains how we use AI to process your data.",
        content: null
      });
    }
    sendJson(res, 200, policy);
  } catch (error) {
    console.error('[AI-CONSENT] Error getting policy:', error);
    sendError(res, 500, "Failed to get policy");
  }
}
```

**Test**: Integration tests for all endpoints

#### Step 6: AI Assistant Integration (30 min)

Modify `server/routes/ai-assistant.js`:

```javascript
// Add import at top
import { checkConsent, AI_FEATURES } from '../services/ai-consent.js';

// In handleDealChat, after security check:
  // SECURITY: Check AI consent
  const consentResult = await checkConsent(authUser.id, AI_FEATURES.CHAT_ASSISTANT);
  if (!consentResult.valid) {
    console.log(`[AI-CONSENT] BLOCKED chat: user=${authUser.id}, reason=${consentResult.reason}`);
    return sendJson(res, 451, {
      message: "AI consent required",
      consentRequired: consentResult.requiresConsent,
      reason: consentResult.reason,
      policyVersion: process.env.AI_CONSENT_POLICY_VERSION || '1.0.0'
    });
  }

// Similarly for handleGetDealInsights, handleDealSummarize with AI_FEATURES.INSIGHTS
```

**Test**: Integration test verifying 451 response without consent

#### Step 7: Index.js Registration (10 min)

```javascript
// In server/index.js, add imports and routes
import {
  handleGetConsentStatus,
  handleGrantConsent,
  handleWithdrawConsent,
  handleGetPolicy
} from "./routes/ai-consent.js";

// Add to dispatch:
if (method === "GET" && pathname === "/api/ai-consent/status") {
  return handleGetConsentStatus(req, res, authUser);
}
if (method === "POST" && pathname === "/api/ai-consent/grant") {
  return handleGrantConsent(req, res, authUser, readJsonBody);
}
if (method === "POST" && pathname === "/api/ai-consent/withdraw") {
  return handleWithdrawConsent(req, res, authUser, readJsonBody);
}
if (method === "GET" && pathname === "/api/ai-consent/policy") {
  return handleGetPolicy(req, res);
}
```

**Test**: Smoke test all endpoints with curl

### Test File: `server/__tests__/ai-consent.test.js`

```javascript
import {
  checkConsent,
  grantConsent,
  withdrawConsent,
  getConsentStatus,
  CONSENT_CONFIG,
  AI_FEATURES,
} from '../services/ai-consent.js';

describe('AI Consent Service', () => {
  describe('checkConsent', () => {
    test('returns valid when consent disabled');
    test('returns invalid when no consent record');
    test('returns invalid when consent withdrawn');
    test('returns valid during grace period');
    test('returns invalid when grace period expired');
    test('returns invalid when consent expired');
    test('returns invalid when policy version mismatch');
    test('returns invalid when feature not allowed');
    test('returns valid with all checks passing');
  });

  describe('grantConsent', () => {
    test('creates new consent record');
    test('updates existing consent record');
    test('sets correct expiration date');
    test('logs audit trail');
  });

  describe('withdrawConsent', () => {
    test('marks consent as withdrawn');
    test('disables all features');
    test('logs audit with reason');
    test('throws when no consent record');
  });

  describe('getConsentStatus', () => {
    test('returns full status object');
    test('includes feature toggles');
    test('includes policy version comparison');
  });
});
```

### Environment Variables

```env
AI_CONSENT_ENABLED=true
AI_CONSENT_POLICY_VERSION=1.0.0
AI_CONSENT_GRACE_PERIOD_DAYS=14
AI_CONSENT_EXPIRATION_MONTHS=12
DEBUG_AI_CONSENT=false
```

### Migration Script for Existing Users

Create `server/scripts/migrate-ai-consent.js`:

```javascript
/**
 * Migration: Create grace period consent for existing AI users
 * Run once: node server/scripts/migrate-ai-consent.js
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const GRACE_PERIOD_DAYS = 14;

async function migrateExistingUsers() {
  // Find users who have used AI features
  const users = await prisma.aIInteractionLog.findMany({
    select: { userId: true, organizationId: true },
    distinct: ['userId'],
  });

  console.log(`Found ${users.length} existing AI users to migrate`);

  const gracePeriodEnd = new Date();
  gracePeriodEnd.setDate(gracePeriodEnd.getDate() + GRACE_PERIOD_DAYS);

  let created = 0, skipped = 0;

  for (const user of users) {
    const existing = await prisma.aIConsent.findUnique({
      where: { userId: user.userId }
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.aIConsent.create({
      data: {
        userId: user.userId,
        organizationId: user.organizationId,
        consentGiven: false,
        consentVersion: 'PRE_CONSENT',
        allowDealParsing: true,
        allowChatAssistant: true,
        allowDocumentAnalysis: true,
        allowInsights: true,
        expiresAt: gracePeriodEnd,
        consentMethod: 'GRANDFATHERED',
      }
    });
    created++;
  }

  console.log(`Migration complete: ${created} created, ${skipped} skipped`);
}

migrateExistingUsers()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

### Verification Checklist

- [ ] Schema validates: `npm run validate:prisma`
- [ ] Unit tests pass: `npm run test -- --testPathPatterns=ai-consent`
- [ ] GET /api/ai-consent/status returns correct status
- [ ] POST /api/ai-consent/grant creates consent record
- [ ] POST /api/ai-consent/withdraw marks consent withdrawn
- [ ] AI chat returns 451 without consent
- [ ] AI chat works with valid consent
- [ ] Grace period allows access
- [ ] Policy version mismatch triggers re-consent
- [ ] Audit trail records all actions

---

## Phase 1.3: Data Retention Policy

### Schema Changes

Add to `server/prisma/schema.prisma`:

```prisma
// Add to AIInteractionLog
  retentionCategory     String    @default("STANDARD")
  scheduledDeletionAt   DateTime?
  anonymizedAt          DateTime?
  legalHoldId           String?
  legalHold             LegalHold? @relation(...)

  @@index([scheduledDeletionAt])
  @@index([retentionCategory])

model LegalHold {
  id              String    @id @default(uuid())
  name            String
  description     String?

  organizationId  String?   // null = all orgs
  dealId          String?   // null = all deals
  userId          String?   // null = all users

  startDate       DateTime
  endDate         DateTime?
  status          String    @default("ACTIVE")

  releasedAt      DateTime?
  releasedBy      String?
  releaseReason   String?

  createdBy       String
  createdByName   String
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  aiLogs          AIInteractionLog[]

  @@index([status])
  @@index([organizationId])
}

model RetentionPolicy {
  id                      String  @id @default(uuid())
  organizationId          String? @unique
  standardRetentionDays   Int     @default(90)
  extendedRetentionDays   Int     @default(365)
  anonymizeAfterDays      Int     @default(30)
  retainPrompts           Boolean @default(true)
  retainResponses         Boolean @default(true)
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
}
```

### New File: `server/services/ai-data-retention.js`

```javascript
export async function getRetentionPolicy(organizationId)
export async function scheduleForDeletion(logId, deletionDate)
export async function anonymizeLog(logId)
export async function isUnderLegalHold(logId)
export async function getLogsForCleanup(batchSize)
export async function processCleanupBatch()
export async function createLegalHold(holdData)
export async function releaseLegalHold(holdId, reason, releasedBy)
```

### New File: `server/jobs/ai-data-cleanup.js`

```javascript
import cron from 'node-cron';
import { processCleanupBatch } from '../services/ai-data-retention.js';

export function startCleanupJob() {
  // Run daily at 2 AM
  cron.schedule(process.env.AI_CLEANUP_CRON || '0 2 * * *', async () => {
    console.log('[AI-CLEANUP] Starting daily cleanup...');
    await runCleanup();
  });
}

async function runCleanup() {
  const stats = { processed: 0, anonymized: 0, deleted: 0, skippedLegalHold: 0 };
  // Process in batches, respect legal holds
  // NEVER delete data under legal hold
}
```

### New File: `server/routes/ai-retention.js` (Admin only)

```javascript
// GET    /api/admin/ai/retention-policy
// PUT    /api/admin/ai/retention-policy
// GET    /api/admin/ai/legal-holds
// POST   /api/admin/ai/legal-holds
// DELETE /api/admin/ai/legal-holds/:id
```

### Anonymization Strategy

**Keep**: timestamp, endpoint, userRole, responseLength, validationStatus, securityFlags
**Remove/Hash**: userId, organizationId, dealId, fullPrompt, fullResponse, ipAddress

### Modifications

**ai-audit-logger.js** - Add retention fields on create:
```javascript
const scheduledDeletionAt = new Date();
scheduledDeletionAt.setDate(scheduledDeletionAt.getDate() + policy.standardRetentionDays);
await prisma.aIInteractionLog.create({
  data: { ...existing, retentionCategory: 'STANDARD', scheduledDeletionAt }
});
```

**server/index.js** - Start cleanup job:
```javascript
if (process.env.AI_CLEANUP_ENABLED === 'true') {
  startCleanupJob();
}
```

### Environment Variables

```env
AI_CLEANUP_ENABLED=true
AI_RETENTION_STANDARD_DAYS=90
AI_RETENTION_EXTENDED_DAYS=365
AI_ANONYMIZE_AFTER_DAYS=30
AI_CLEANUP_BATCH_SIZE=1000
AI_CLEANUP_CRON="0 2 * * *"
DEBUG_AI_CLEANUP=false
```

### Test File: `server/__tests__/ai-data-retention.test.js`

```javascript
describe('AI Data Retention', () => {
  test('calculates correct deletion date from policy')
  test('legal hold blocks deletion')
  test('anonymization removes PII but keeps metadata')
  test('batch processing handles large datasets')
  test('cleanup job respects legal holds')
});
```

---

## Potential Issues & Mitigations

| Issue | Mitigation |
|-------|------------|
| False positive jailbreak detection | Configurable thresholds, warn-but-allow mode for 0.5-0.8 scores |
| Over-sanitization breaking deal data | Test with real samples, allowlist business terms |
| Existing users blocked by consent | Migration script creates implicit consent with flag |
| Consent withdrawn mid-session | Check on each request, not just login |
| Legal hold forgotten | Alert on holds >1 year, dashboard visibility |
| Accidental deletion | Soft delete first, 7-day grace period |
| Performance impact of cleanup | Batch processing, off-peak hours, indexed queries |

---

## Files Summary

### New Files
- `server/services/ai-security.js` - Sanitization, jailbreak detection, output validation
- `server/services/ai-consent.js` - Consent management logic
- `server/services/ai-data-retention.js` - Retention and cleanup logic
- `server/routes/ai-consent.js` - Consent API endpoints
- `server/routes/ai-retention.js` - Admin retention endpoints
- `server/jobs/ai-data-cleanup.js` - Scheduled cleanup job
- `server/__tests__/ai-security.test.js`
- `server/__tests__/ai-consent.test.js`
- `server/__tests__/ai-data-retention.test.js`

### Modified Files
- `server/prisma/schema.prisma` - Add AIConsent, LegalHold, RetentionPolicy models
- `server/llm.js` - Add sanitization to prompt builders
- `server/routes/ai-assistant.js` - Add security checks, consent checks
- `server/services/ai-audit-logger.js` - Add security & retention fields
- `server/index.js` - Register consent routes, start cleanup job
- `src/pages/Settings.jsx` - Add AI consent UI section

---

## Verification Checklist

### Phase 1.1
- [ ] Jailbreak prompts return 400 error
- [ ] Legitimate deal text passes sanitization
- [ ] Security events logged to AIInteractionLog
- [ ] Unit tests >90% coverage

### Phase 1.2
- [ ] AI returns 403 without consent
- [ ] Consent UI in Settings page works
- [ ] Policy versioning triggers re-consent
- [ ] Migration script handles existing users

### Phase 1.3 ⏸️ DEFERRED
**Status**: Deferred until after Phase 2 and 3
**Reason**: No blocking dependencies, low immediate risk, can be implemented later

- [ ] Cleanup job runs on schedule
- [ ] Legal holds block deletion
- [ ] Anonymization removes PII, keeps audit metadata
- [ ] Retention policies configurable per-org

---

# Phase 2: AI Enhancement Layer (Calculator-Agnostic)

## Overview

Phase 2 implements high-value AI features that enhance the existing calculator infrastructure without replacing it. The architecture is designed to be **calculator-agnostic** - AI adapts to calculator changes rather than breaking.

### Reprioritized Features (based on pain point analysis)

| Priority | Feature | Pain Point Solved | Est. Cost |
|----------|---------|-------------------|-----------|
| **2.1** | Document Intelligence + Multi-Doc Synthesis | 4-8 hrs/deal extraction, data conflicts | +$50-100/mo |
| **2.2** | Verification Workflow Agent | "Who verified what", DD delays | +$30-50/mo |
| **2.3** | Assumption Drift Tracker | Projected vs actual feedback loop | +$20-30/mo |

### Deferred to Phase 3
- Sensitivity Analysis AI (existing calculator works well)
- LP Updates AI (post-close, not deal-critical)

---

## Pain Points Addressed

### Tier 1: High-Impact, High-Frequency

1. **Document Intelligence Gap**
   - 50-200 pages per deal, different formats
   - 5-15% transcription error rate
   - T12/rent roll mismatches discovered late

2. **Verification Bottleneck**
   - 100+ DD checklist items
   - No data lineage ("who checked what")
   - DD delays = #1 timeline slippage cause

3. **Assumption Drift** (Non-obvious)
   - Underwriting assumptions never validated post-close
   - Same bad assumptions repeated on next deal
   - No feedback loop from operations to acquisitions

---

## Architecture: Calculator-Agnostic Design

### Why Calculator-Agnostic?

The existing calculators may change:
- `underwriting-calculator.js` (23 functions)
- `waterfall-calculator.js` (23 functions)
- `sensitivity-calculator.js` (6 functions)

AI layer must **adapt** to changes, not break.

### Design Pattern: Adapter + Schema Discovery

```
                     +---------------------------+
                     |    AI Feature Layer       |
                     |  (Doc Intelligence,       |
                     |   Verification Agent)     |
                     +---------------------------+
                              |
                              v
                     +---------------------------+
                     |  Calculator Adapter       |
                     |  (Schema Discovery +      |
                     |   Version Tolerance)      |
                     +---------------------------+
                              |
              +---------------+---------------+
              v               v               v
    +-----------------+ +-----------------+ +-----------------+
    | Underwriting    | | Waterfall       | | Sensitivity     |
    | Calculator      | | Calculator      | | Calculator      |
    +-----------------+ +-----------------+ +-----------------+
```

### Key Files to Create

```
server/services/ai/
├── calculator-registry.js    # Schema discovery, runtime introspection
├── calculator-adapter.js     # Version-tolerant execution
├── document-intelligence.js  # Phase 2.1 - extraction + synthesis
├── verification-agent.js     # Phase 2.2 - data lineage + workflow
├── assumption-tracker.js     # Phase 2.3 - projected vs actual
└── __tests__/
    ├── mock-calculators.js   # Mock layer for unit testing
    └── *.test.js
```

---

## Phase 2.1: Document Intelligence + Multi-Doc Synthesis

### Problem Solved
- Manual extraction takes 4-8 hours per deal
- Data conflicts between documents discovered late
- No cross-reference validation

### Implementation

**New File: `server/services/ai/document-intelligence.js`**

```javascript
/**
 * Document Intelligence Service
 *
 * Extracts data from any document format and synthesizes
 * across multiple sources to identify conflicts.
 */

export async function extractDocument(documentId, documentType) {
  // Uses existing extractors (rent-roll, t12, loan-terms)
  // Wraps with confidence scoring and conflict detection
}

export async function synthesizeDocuments(dealId) {
  // Cross-references all extracted data
  // Builds conflict matrix
  // AI recommends trusted values
}

export async function generateExtractionReport(dealId) {
  // Summary of all extractions
  // Conflicts highlighted
  // Recommendations for resolution
}
```

### Cross-Reference Matrix

For each data point, track across all document sources:

| Field | Rent Roll | T12 | OM | Loan Docs | Variance | Trusted |
|-------|-----------|-----|----|-----------|---------:|---------|
| GPR | $1.2M | $1.18M | $1.25M | - | 5.9% | Rent Roll |
| Vacancy | 8% | 10% | 5% | - | 100% | T12 |
| NOI | - | $850K | $900K | $840K | 7.1% | T12 |

### AI Recommendation Engine

```javascript
async function recommendTrustedValue(field, sources) {
  // Document reliability hierarchy:
  // T12 actuals > Rent Roll > OM > Broker claims

  // AI reasons about:
  // - Data recency
  // - Source objectivity
  // - Internal consistency
  // - Industry benchmarks
}
```

### Schema Changes

Add to `server/prisma/schema.prisma`:

```prisma
model DocumentExtraction {
  // ... existing fields ...

  // Add cross-reference tracking
  crossReferencedWith    String[]  // IDs of related extractions
  conflictsWith          String[]  // IDs of conflicting extractions
  trustedValue           Boolean   @default(false)
  trustReason            String?   // AI explanation
  verifiedBy             String?   // User who verified
  verifiedAt             DateTime?
}

model ExtractionConflict {
  id                String    @id @default(uuid())
  dealId            String
  field             String    // e.g., "grossPotentialRent"

  // Source values
  sources           Json      // { rentRoll: 1200000, t12: 1180000, om: 1250000 }
  variancePercent   Float

  // Resolution
  recommendedSource String?   // AI recommendation
  recommendedReason String?   // AI explanation
  resolvedValue     Float?
  resolvedBy        String?
  resolvedAt        DateTime?

  status            String    @default("OPEN") // OPEN, RESOLVED, DISMISSED

  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  @@index([dealId])
  @@index([status])
}
```

### Routes

Add to `server/routes/ai-assistant.js` or new `server/routes/ai-documents.js`:

```javascript
// POST /api/deals/:dealId/ai/extract
// - Extract single document with AI
// - Returns extracted data + confidence scores

// POST /api/deals/:dealId/ai/synthesize
// - Cross-reference all documents
// - Returns conflict matrix + recommendations

// GET /api/deals/:dealId/ai/conflicts
// - List all extraction conflicts
// - Filter by status, severity

// POST /api/deals/:dealId/ai/conflicts/:id/resolve
// - Resolve a conflict with chosen value
// - Logs who resolved and why
```

### Tests

```javascript
describe('Document Intelligence', () => {
  describe('extractDocument', () => {
    test('extracts rent roll with confidence scores')
    test('handles different rent roll formats')
    test('flags low-confidence extractions')
  });

  describe('synthesizeDocuments', () => {
    test('builds cross-reference matrix')
    test('detects conflicts above threshold')
    test('recommends trusted values')
  });

  describe('conflict resolution', () => {
    test('logs resolution with reason')
    test('updates extraction trust status')
  });
});
```

### Verification Checklist

- [ ] Extract rent roll → confidence scores appear
- [ ] Extract T12 → cross-references rent roll automatically
- [ ] Conflict detected when values differ >5%
- [ ] AI recommends trusted value with explanation
- [ ] Resolution logged with user + reason
- [ ] Underwriting model updates from resolved values

---

## Phase 2.2: Verification Workflow Agent

### Problem Solved
- No data lineage ("who verified what, when")
- DD items tracked in spreadsheets
- Verification status unclear

### Implementation

**New File: `server/services/ai/verification-agent.js`**

```javascript
/**
 * Verification Workflow Agent
 *
 * Tracks data lineage from extraction through verification.
 * Provides audit trail for every number in the model.
 */

export async function trackDataLineage(dealId, field, sourceInfo) {
  // Record: field X came from document Y, extracted at Z
}

export async function markAsVerified(dealId, field, verifierId, notes) {
  // User confirms value is correct
  // Creates audit entry
}

export async function getVerificationStatus(dealId) {
  // Returns status of all fields
  // Unverified, AI-extracted, Human-verified
}

export async function suggestNextVerification(dealId) {
  // AI recommends which fields to verify next
  // Based on: confidence scores, materiality, time since extraction
}
```

### Data Lineage Model

```prisma
model DataLineage {
  id              String    @id @default(uuid())
  dealId          String
  modelId         String    // UnderwritingModel ID

  field           String    // e.g., "purchasePrice"
  currentValue    Float

  // Source tracking
  sourceType      String    // DOCUMENT, MANUAL, FORMULA, AI_EXTRACTED
  sourceDocId     String?   // Document ID if from extraction
  sourceField     String?   // Field in source document
  extractedAt     DateTime?
  extractionConfidence Float?

  // Verification
  verificationStatus String  @default("UNVERIFIED") // UNVERIFIED, AI_EXTRACTED, HUMAN_VERIFIED
  verifiedBy      String?
  verifiedAt      DateTime?
  verificationNotes String?

  // History
  previousValues  Json?     // Array of { value, changedAt, changedBy, reason }

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@unique([modelId, field])
  @@index([dealId])
  @@index([verificationStatus])
}
```

### UI Integration

On underwriting page, each field shows:
- Source indicator (document icon, manual icon, formula icon)
- Verification badge (unverified=yellow, AI=blue, human=green)
- Click to see full lineage history

### Routes

```javascript
// GET /api/deals/:dealId/lineage
// - Full lineage for all fields

// GET /api/deals/:dealId/lineage/:field
// - Lineage for specific field

// POST /api/deals/:dealId/lineage/:field/verify
// - Mark field as verified

// GET /api/deals/:dealId/verification-status
// - Summary: X of Y fields verified
```

### Verification Checklist

- [ ] Extracted values show source document
- [ ] Manual entries marked as MANUAL source
- [ ] Verification badge displays correctly
- [ ] Click field → shows full history
- [ ] Verify action logs user + timestamp
- [ ] Dashboard shows % verified

---

## Phase 2.3: Assumption Drift Tracker

### Problem Solved
- Underwriting assumptions never validated
- No feedback loop to acquisitions
- Same mistakes repeated

### Implementation

**New File: `server/services/ai/assumption-tracker.js`**

```javascript
/**
 * Assumption Drift Tracker
 *
 * Compares underwritten assumptions to actual performance.
 * Builds feedback loop for future deals.
 */

export async function trackAssumptions(dealId, assumptions) {
  // Store original underwriting assumptions
}

export async function compareToActuals(dealId, period) {
  // Compare Year 1 actual vs projected
  // Calculate variance for each assumption
}

export async function getPortfolioTrends(organizationId) {
  // Aggregate assumption accuracy across all deals
  // "Your rent growth assumptions are 1.2% high on average"
}

export async function suggestAssumptionAdjustments(dealId, newDealContext) {
  // Based on portfolio trends, suggest better assumptions
}
```

### Schema

```prisma
model AssumptionSnapshot {
  id              String    @id @default(uuid())
  dealId          String
  snapshotType    String    // UNDERWRITING, YEAR_1, YEAR_2, etc.

  // Key assumptions
  rentGrowth      Float?
  expenseGrowth   Float?
  vacancyRate     Float?
  capexPerUnit    Float?
  exitCapRate     Float?

  // Calculated outcomes
  projectedNOI    Float?
  projectedIRR    Float?

  // Metadata
  createdAt       DateTime  @default(now())
  notes           String?

  @@index([dealId])
  @@index([snapshotType])
}

model AssumptionVariance {
  id              String    @id @default(uuid())
  dealId          String
  period          String    // YEAR_1, YEAR_2, etc.

  field           String    // e.g., "rentGrowth"
  projectedValue  Float
  actualValue     Float
  variancePercent Float

  // AI analysis
  aiExplanation   String?   // "Higher than expected due to market conditions"

  createdAt       DateTime  @default(now())

  @@index([dealId])
}
```

### Routes

```javascript
// POST /api/deals/:dealId/assumptions/snapshot
// - Save assumptions at underwriting time

// POST /api/deals/:dealId/assumptions/compare
// - Compare to actuals for a period

// GET /api/portfolio/assumption-trends
// - Aggregate trends across portfolio

// GET /api/deals/:dealId/assumptions/suggestions
// - AI suggests adjustments based on portfolio history
```

### Verification Checklist

- [ ] Assumptions captured at deal close
- [ ] Year 1 actuals compared to projections
- [ ] Variance report generated
- [ ] Portfolio trends calculated
- [ ] AI suggestions based on history
- [ ] Dashboard shows assumption accuracy

---

## Environment Variables

```env
# Phase 2 Feature Flags
AI_DOC_INTELLIGENCE_ENABLED=true
AI_VERIFICATION_AGENT_ENABLED=true
AI_ASSUMPTION_TRACKER_ENABLED=true

# Thresholds
AI_CONFLICT_VARIANCE_THRESHOLD=0.05    # 5% variance triggers conflict
AI_LOW_CONFIDENCE_THRESHOLD=0.7        # Below 70% = low confidence

# Model Configuration
AI_DOC_INTELLIGENCE_MODEL=gpt-4o-mini
AI_SYNTHESIS_MODEL=gpt-4o             # Higher quality for synthesis

# Rate Limiting
AI_PHASE2_MONTHLY_CREDITS=3000
```

---

## Implementation Order

### Step 1: Calculator Adapter Foundation (Day 1-2)
1. Create `calculator-registry.js`
2. Create `calculator-adapter.js`
3. Register existing calculators
4. Write mock layer for testing

### Step 2: Document Intelligence (Day 3-7)
1. Schema changes for ExtractionConflict
2. Implement `document-intelligence.js`
3. Cross-reference matrix builder
4. AI recommendation engine
5. Routes and tests

### Step 3: Verification Agent (Day 8-12)
1. Schema changes for DataLineage
2. Implement `verification-agent.js`
3. UI integration (badges, history view)
4. Routes and tests

### Step 4: Assumption Tracker (Day 13-16)
1. Schema changes for AssumptionSnapshot, AssumptionVariance
2. Implement `assumption-tracker.js`
3. Portfolio trend aggregation
4. AI suggestion engine
5. Routes and tests

### Step 5: Integration Testing (Day 17-18)
1. End-to-end flow testing
2. Performance optimization
3. Documentation

---

## Files Summary

### New Files (Phase 2)
- `server/services/ai/calculator-registry.js`
- `server/services/ai/calculator-adapter.js`
- `server/services/ai/document-intelligence.js`
- `server/services/ai/verification-agent.js`
- `server/services/ai/assumption-tracker.js`
- `server/services/ai/__tests__/mock-calculators.js`
- `server/services/ai/__tests__/document-intelligence.test.js`
- `server/services/ai/__tests__/verification-agent.test.js`
- `server/services/ai/__tests__/assumption-tracker.test.js`

### Modified Files
- `server/prisma/schema.prisma` - Add ExtractionConflict, DataLineage, AssumptionSnapshot
- `server/routes/ai-assistant.js` - Add new endpoints
- `server/index.js` - Register new routes

---

## Verification Checklist (Phase 2)

### Phase 2.1: Document Intelligence
- [ ] Upload rent roll → AI extracts with confidence
- [ ] Upload T12 → cross-references rent roll
- [ ] Conflicts flagged when variance >5%
- [ ] AI recommends trusted value
- [ ] Resolution logs user + reason
- [ ] Tests pass

### Phase 2.2: Verification Agent
- [ ] Fields show source indicator
- [ ] Verification badges display
- [ ] Click field → full history
- [ ] Verify action creates audit log
- [ ] Dashboard shows % verified
- [ ] Tests pass

### Phase 2.3: Assumption Tracker
- [ ] Assumptions saved at close
- [ ] Compare to Year 1 actuals works
- [ ] Variance report generated
- [ ] Portfolio trends calculated
- [ ] AI suggestions based on history
- [ ] Tests pass

---

# Phase 2 Routes Implementation (CURRENT TASK)

## Status: Ready for Implementation

Phase 2 services are **complete** with 141 tests passing:
- calculator-registry.js (21 tests)
- calculator-adapter.js (25 tests)
- document-intelligence.js (28 tests)
- verification-agent.js (37 tests)
- assumption-tracker.js (30 tests)

**Next Step**: Add routes to expose these services via API endpoints.

---

## Route Implementation Plan

### File to Modify: `server/routes/ai-assistant.js`

Add new handler exports for Phase 2 services.

### New Imports to Add

```javascript
// Phase 2: Document Intelligence
import {
  extractDocument,
  synthesizeDocuments,
  resolveConflict,
  dismissConflict,
  getConflicts,
  generateExtractionReport,
  DOC_INTELLIGENCE_CONFIG
} from '../services/ai/document-intelligence.js';

// Phase 2: Verification Agent
import {
  trackDataLineage,
  markAsVerified,
  markNeedsReview,
  getVerificationStatus,
  getFieldLineage,
  suggestNextVerification,
  bulkVerify,
  getVerificationHistory,
  VERIFICATION_CONFIG
} from '../services/ai/verification-agent.js';

// Phase 2: Assumption Tracker
import {
  trackAssumptions,
  compareToActuals,
  getPortfolioTrends,
  suggestAssumptionAdjustments,
  getDealSnapshots,
  getDealVariances,
  ASSUMPTION_TRACKER_CONFIG
} from '../services/ai/assumption-tracker.js';
```

---

## Phase 2.1: Document Intelligence Routes

### Handlers to Add to `ai-assistant.js`

```javascript
// ========== DOCUMENT INTELLIGENCE (Phase 2.1) ==========

/**
 * POST /api/deals/:dealId/ai/extract
 * Extract data from a document with AI
 */
export async function handleExtractDocument(req, res, dealId, authUser, readJsonBody) {
  try {
    const { documentId, documentType, options } = await readJsonBody(req);

    if (!documentId || !documentType) {
      return sendError(res, 400, "documentId and documentType are required");
    }

    const result = await extractDocument(documentId, documentType, {
      ...options,
      userId: authUser.id,
      organizationId: authUser.organizationId
    });

    sendJson(res, 200, result);
  } catch (error) {
    console.error('[AI-DOC] Extract error:', error);
    sendError(res, 500, "Failed to extract document", error.message);
  }
}

/**
 * POST /api/deals/:dealId/ai/synthesize
 * Cross-reference all documents for a deal
 */
export async function handleSynthesizeDocuments(req, res, dealId, authUser, readJsonBody) {
  try {
    const body = await readJsonBody(req);

    const result = await synthesizeDocuments(dealId, {
      ...body,
      organizationId: authUser.organizationId
    });

    sendJson(res, 200, result);
  } catch (error) {
    console.error('[AI-DOC] Synthesize error:', error);
    sendError(res, 500, "Failed to synthesize documents", error.message);
  }
}

/**
 * GET /api/deals/:dealId/ai/conflicts
 * Get all extraction conflicts for a deal
 */
export async function handleGetConflicts(req, res, dealId, authUser, url) {
  try {
    const status = url.searchParams.get('status') || null;
    const field = url.searchParams.get('field') || null;

    const conflicts = await getConflicts(dealId, { status, field });

    sendJson(res, 200, { conflicts });
  } catch (error) {
    console.error('[AI-DOC] Get conflicts error:', error);
    sendError(res, 500, "Failed to get conflicts", error.message);
  }
}

/**
 * POST /api/deals/:dealId/ai/conflicts/:conflictId/resolve
 * Resolve an extraction conflict
 */
export async function handleResolveConflict(req, res, dealId, conflictId, authUser, readJsonBody) {
  try {
    const { resolvedValue, reason } = await readJsonBody(req);

    if (resolvedValue === undefined) {
      return sendError(res, 400, "resolvedValue is required");
    }

    const result = await resolveConflict(conflictId, resolvedValue, authUser.id, reason);

    sendJson(res, 200, result);
  } catch (error) {
    console.error('[AI-DOC] Resolve conflict error:', error);
    sendError(res, 500, "Failed to resolve conflict", error.message);
  }
}

/**
 * POST /api/deals/:dealId/ai/conflicts/:conflictId/dismiss
 * Dismiss an extraction conflict
 */
export async function handleDismissConflict(req, res, dealId, conflictId, authUser, readJsonBody) {
  try {
    const { reason } = await readJsonBody(req);

    if (!reason) {
      return sendError(res, 400, "reason is required to dismiss a conflict");
    }

    const result = await dismissConflict(conflictId, authUser.id, reason);

    sendJson(res, 200, result);
  } catch (error) {
    console.error('[AI-DOC] Dismiss conflict error:', error);
    sendError(res, 500, "Failed to dismiss conflict", error.message);
  }
}

/**
 * GET /api/deals/:dealId/ai/extraction-report
 * Generate extraction report for a deal
 */
export async function handleGetExtractionReport(req, res, dealId, authUser) {
  try {
    const report = await generateExtractionReport(dealId);

    sendJson(res, 200, report);
  } catch (error) {
    console.error('[AI-DOC] Report error:', error);
    sendError(res, 500, "Failed to generate extraction report", error.message);
  }
}
```

---

## Phase 2.2: Verification Agent Routes

### Handlers to Add to `ai-assistant.js`

```javascript
// ========== VERIFICATION AGENT (Phase 2.2) ==========

/**
 * GET /api/deals/:dealId/ai/verification-status
 * Get verification status summary
 */
export async function handleGetVerificationStatus(req, res, dealId, authUser, url) {
  try {
    const modelId = url.searchParams.get('modelId') || null;

    const status = await getVerificationStatus(dealId, modelId);

    sendJson(res, 200, status);
  } catch (error) {
    console.error('[AI-VERIFY] Status error:', error);
    sendError(res, 500, "Failed to get verification status", error.message);
  }
}

/**
 * GET /api/deals/:dealId/ai/lineage
 * Get all data lineage for a deal
 */
export async function handleGetLineage(req, res, dealId, authUser, url) {
  try {
    const modelId = url.searchParams.get('modelId') || null;

    // Uses getVerificationStatus which includes all lineage
    const status = await getVerificationStatus(dealId, modelId);

    sendJson(res, 200, {
      lineage: status.fields,
      summary: status.summary
    });
  } catch (error) {
    console.error('[AI-VERIFY] Lineage error:', error);
    sendError(res, 500, "Failed to get lineage", error.message);
  }
}

/**
 * GET /api/deals/:dealId/ai/lineage/:field
 * Get lineage for a specific field
 */
export async function handleGetFieldLineage(req, res, dealId, field, authUser, url) {
  try {
    const modelId = url.searchParams.get('modelId') || null;

    const lineage = await getFieldLineage(dealId, modelId, field);

    if (!lineage) {
      return sendError(res, 404, "Field lineage not found");
    }

    sendJson(res, 200, lineage);
  } catch (error) {
    console.error('[AI-VERIFY] Field lineage error:', error);
    sendError(res, 500, "Failed to get field lineage", error.message);
  }
}

/**
 * POST /api/deals/:dealId/ai/lineage/:field/verify
 * Mark a field as verified
 */
export async function handleVerifyField(req, res, dealId, field, authUser, readJsonBody, url) {
  try {
    const modelId = url.searchParams.get('modelId') || null;
    const { notes } = await readJsonBody(req);

    const result = await markAsVerified(dealId, modelId, field, authUser.id, notes);

    sendJson(res, 200, result);
  } catch (error) {
    console.error('[AI-VERIFY] Verify error:', error);
    sendError(res, 500, "Failed to verify field", error.message);
  }
}

/**
 * POST /api/deals/:dealId/ai/lineage/:field/needs-review
 * Mark a field as needing review
 */
export async function handleMarkNeedsReview(req, res, dealId, field, authUser, readJsonBody, url) {
  try {
    const modelId = url.searchParams.get('modelId') || null;
    const { reason } = await readJsonBody(req);

    const result = await markNeedsReview(dealId, modelId, field, reason);

    sendJson(res, 200, result);
  } catch (error) {
    console.error('[AI-VERIFY] Needs review error:', error);
    sendError(res, 500, "Failed to mark field for review", error.message);
  }
}

/**
 * POST /api/deals/:dealId/ai/lineage/track
 * Track data lineage for a field
 */
export async function handleTrackLineage(req, res, dealId, authUser, readJsonBody, url) {
  try {
    const modelId = url.searchParams.get('modelId') || null;
    const { field, sourceInfo } = await readJsonBody(req);

    if (!field || !sourceInfo) {
      return sendError(res, 400, "field and sourceInfo are required");
    }

    const result = await trackDataLineage(dealId, modelId, field, sourceInfo);

    sendJson(res, 200, result);
  } catch (error) {
    console.error('[AI-VERIFY] Track lineage error:', error);
    sendError(res, 500, "Failed to track lineage", error.message);
  }
}

/**
 * POST /api/deals/:dealId/ai/lineage/bulk-verify
 * Bulk verify multiple fields
 */
export async function handleBulkVerify(req, res, dealId, authUser, readJsonBody, url) {
  try {
    const modelId = url.searchParams.get('modelId') || null;
    const { fields, notes } = await readJsonBody(req);

    if (!Array.isArray(fields) || fields.length === 0) {
      return sendError(res, 400, "fields array is required");
    }

    const results = await bulkVerify(dealId, modelId, fields, authUser.id, notes);

    sendJson(res, 200, { results });
  } catch (error) {
    console.error('[AI-VERIFY] Bulk verify error:', error);
    sendError(res, 500, "Failed to bulk verify", error.message);
  }
}

/**
 * GET /api/deals/:dealId/ai/verification-suggestions
 * Get AI suggestions for next verification
 */
export async function handleGetVerificationSuggestions(req, res, dealId, authUser, url) {
  try {
    const modelId = url.searchParams.get('modelId') || null;
    const limit = parseInt(url.searchParams.get('limit') || '5');

    const suggestions = await suggestNextVerification(dealId, modelId, { limit });

    sendJson(res, 200, suggestions);
  } catch (error) {
    console.error('[AI-VERIFY] Suggestions error:', error);
    sendError(res, 500, "Failed to get verification suggestions", error.message);
  }
}

/**
 * GET /api/deals/:dealId/ai/verification-history
 * Get verification history for a deal
 */
export async function handleGetVerificationHistory(req, res, dealId, authUser, url) {
  try {
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const field = url.searchParams.get('field') || null;

    const history = await getVerificationHistory(dealId, { limit, field });

    sendJson(res, 200, history);
  } catch (error) {
    console.error('[AI-VERIFY] History error:', error);
    sendError(res, 500, "Failed to get verification history", error.message);
  }
}
```

---

## Phase 2.3: Assumption Tracker Routes

### Handlers to Add to `ai-assistant.js`

```javascript
// ========== ASSUMPTION TRACKER (Phase 2.3) ==========

/**
 * POST /api/deals/:dealId/ai/assumptions/snapshot
 * Create assumption snapshot
 */
export async function handleCreateAssumptionSnapshot(req, res, dealId, authUser, readJsonBody) {
  try {
    const { snapshotType, assumptions, metrics, notes } = await readJsonBody(req);

    if (!snapshotType || !assumptions) {
      return sendError(res, 400, "snapshotType and assumptions are required");
    }

    const result = await trackAssumptions(dealId, snapshotType, assumptions, metrics, notes);

    sendJson(res, 200, result);
  } catch (error) {
    console.error('[AI-ASSUME] Snapshot error:', error);
    sendError(res, 500, "Failed to create assumption snapshot", error.message);
  }
}

/**
 * GET /api/deals/:dealId/ai/assumptions/snapshots
 * Get all assumption snapshots for a deal
 */
export async function handleGetAssumptionSnapshots(req, res, dealId, authUser) {
  try {
    const snapshots = await getDealSnapshots(dealId);

    sendJson(res, 200, { snapshots });
  } catch (error) {
    console.error('[AI-ASSUME] Get snapshots error:', error);
    sendError(res, 500, "Failed to get assumption snapshots", error.message);
  }
}

/**
 * POST /api/deals/:dealId/ai/assumptions/compare
 * Compare assumptions to actuals
 */
export async function handleCompareAssumptions(req, res, dealId, authUser, readJsonBody) {
  try {
    const { period } = await readJsonBody(req);

    if (!period) {
      return sendError(res, 400, "period is required (e.g., 'YEAR_1')");
    }

    const result = await compareToActuals(dealId, period);

    sendJson(res, 200, result);
  } catch (error) {
    console.error('[AI-ASSUME] Compare error:', error);
    sendError(res, 500, "Failed to compare assumptions", error.message);
  }
}

/**
 * GET /api/deals/:dealId/ai/assumptions/variances
 * Get variance records for a deal
 */
export async function handleGetAssumptionVariances(req, res, dealId, authUser) {
  try {
    const variances = await getDealVariances(dealId);

    sendJson(res, 200, { variances });
  } catch (error) {
    console.error('[AI-ASSUME] Get variances error:', error);
    sendError(res, 500, "Failed to get assumption variances", error.message);
  }
}

/**
 * GET /api/portfolio/ai/assumption-trends
 * Get portfolio-wide assumption trends
 */
export async function handleGetPortfolioTrends(req, res, authUser, url) {
  try {
    const minDeals = parseInt(url.searchParams.get('minDeals') || '3');

    const trends = await getPortfolioTrends(authUser.organizationId, { minDeals });

    sendJson(res, 200, trends);
  } catch (error) {
    console.error('[AI-ASSUME] Trends error:', error);
    sendError(res, 500, "Failed to get portfolio trends", error.message);
  }
}

/**
 * POST /api/portfolio/ai/assumption-suggestions
 * Get AI-suggested assumption adjustments
 */
export async function handleGetAssumptionSuggestions(req, res, authUser, readJsonBody) {
  try {
    const { proposedAssumptions, dealContext } = await readJsonBody(req);

    if (!proposedAssumptions) {
      return sendError(res, 400, "proposedAssumptions is required");
    }

    const suggestions = await suggestAssumptionAdjustments(
      authUser.organizationId,
      proposedAssumptions,
      dealContext || {}
    );

    sendJson(res, 200, suggestions);
  } catch (error) {
    console.error('[AI-ASSUME] Suggestions error:', error);
    sendError(res, 500, "Failed to get assumption suggestions", error.message);
  }
}
```

---

## Route Registration in `server/index.js`

Add after existing AI routes (around line 2315):

```javascript
// ========== PHASE 2 AI ROUTES ==========

// Phase 2.1: Document Intelligence
const aiExtractMatch = path.match(/^\/api\/deals\/([^/]+)\/ai\/extract$/);
if (req.method === "POST" && aiExtractMatch) {
  const authUser = await requireDealAccess(req, res, aiExtractMatch[1]);
  if (!authUser) return;
  return handleExtractDocument(req, res, aiExtractMatch[1], authUser, readJsonBody);
}

const aiSynthesizeMatch = path.match(/^\/api\/deals\/([^/]+)\/ai\/synthesize$/);
if (req.method === "POST" && aiSynthesizeMatch) {
  const authUser = await requireDealAccess(req, res, aiSynthesizeMatch[1]);
  if (!authUser) return;
  return handleSynthesizeDocuments(req, res, aiSynthesizeMatch[1], authUser, readJsonBody);
}

const aiConflictsMatch = path.match(/^\/api\/deals\/([^/]+)\/ai\/conflicts$/);
if (req.method === "GET" && aiConflictsMatch) {
  const authUser = await requireDealAccess(req, res, aiConflictsMatch[1]);
  if (!authUser) return;
  return handleGetConflicts(req, res, aiConflictsMatch[1], authUser, url);
}

const aiResolveConflictMatch = path.match(/^\/api\/deals\/([^/]+)\/ai\/conflicts\/([^/]+)\/resolve$/);
if (req.method === "POST" && aiResolveConflictMatch) {
  const authUser = await requireDealAccess(req, res, aiResolveConflictMatch[1]);
  if (!authUser) return;
  return handleResolveConflict(req, res, aiResolveConflictMatch[1], aiResolveConflictMatch[2], authUser, readJsonBody);
}

const aiDismissConflictMatch = path.match(/^\/api\/deals\/([^/]+)\/ai\/conflicts\/([^/]+)\/dismiss$/);
if (req.method === "POST" && aiDismissConflictMatch) {
  const authUser = await requireDealAccess(req, res, aiDismissConflictMatch[1]);
  if (!authUser) return;
  return handleDismissConflict(req, res, aiDismissConflictMatch[1], aiDismissConflictMatch[2], authUser, readJsonBody);
}

const aiExtractionReportMatch = path.match(/^\/api\/deals\/([^/]+)\/ai\/extraction-report$/);
if (req.method === "GET" && aiExtractionReportMatch) {
  const authUser = await requireDealAccess(req, res, aiExtractionReportMatch[1]);
  if (!authUser) return;
  return handleGetExtractionReport(req, res, aiExtractionReportMatch[1], authUser);
}

// Phase 2.2: Verification Agent
const aiVerificationStatusMatch = path.match(/^\/api\/deals\/([^/]+)\/ai\/verification-status$/);
if (req.method === "GET" && aiVerificationStatusMatch) {
  const authUser = await requireDealAccess(req, res, aiVerificationStatusMatch[1]);
  if (!authUser) return;
  return handleGetVerificationStatus(req, res, aiVerificationStatusMatch[1], authUser, url);
}

const aiLineageMatch = path.match(/^\/api\/deals\/([^/]+)\/ai\/lineage$/);
if (req.method === "GET" && aiLineageMatch) {
  const authUser = await requireDealAccess(req, res, aiLineageMatch[1]);
  if (!authUser) return;
  return handleGetLineage(req, res, aiLineageMatch[1], authUser, url);
}

const aiTrackLineageMatch = path.match(/^\/api\/deals\/([^/]+)\/ai\/lineage\/track$/);
if (req.method === "POST" && aiTrackLineageMatch) {
  const authUser = await requireDealAccess(req, res, aiTrackLineageMatch[1]);
  if (!authUser) return;
  return handleTrackLineage(req, res, aiTrackLineageMatch[1], authUser, readJsonBody, url);
}

const aiBulkVerifyMatch = path.match(/^\/api\/deals\/([^/]+)\/ai\/lineage\/bulk-verify$/);
if (req.method === "POST" && aiBulkVerifyMatch) {
  const authUser = await requireDealAccess(req, res, aiBulkVerifyMatch[1]);
  if (!authUser) return;
  return handleBulkVerify(req, res, aiBulkVerifyMatch[1], authUser, readJsonBody, url);
}

const aiFieldLineageMatch = path.match(/^\/api\/deals\/([^/]+)\/ai\/lineage\/([^/]+)$/);
if (req.method === "GET" && aiFieldLineageMatch && aiFieldLineageMatch[2] !== 'track' && aiFieldLineageMatch[2] !== 'bulk-verify') {
  const authUser = await requireDealAccess(req, res, aiFieldLineageMatch[1]);
  if (!authUser) return;
  return handleGetFieldLineage(req, res, aiFieldLineageMatch[1], decodeURIComponent(aiFieldLineageMatch[2]), authUser, url);
}

const aiVerifyFieldMatch = path.match(/^\/api\/deals\/([^/]+)\/ai\/lineage\/([^/]+)\/verify$/);
if (req.method === "POST" && aiVerifyFieldMatch) {
  const authUser = await requireDealAccess(req, res, aiVerifyFieldMatch[1]);
  if (!authUser) return;
  return handleVerifyField(req, res, aiVerifyFieldMatch[1], decodeURIComponent(aiVerifyFieldMatch[2]), authUser, readJsonBody, url);
}

const aiNeedsReviewMatch = path.match(/^\/api\/deals\/([^/]+)\/ai\/lineage\/([^/]+)\/needs-review$/);
if (req.method === "POST" && aiNeedsReviewMatch) {
  const authUser = await requireDealAccess(req, res, aiNeedsReviewMatch[1]);
  if (!authUser) return;
  return handleMarkNeedsReview(req, res, aiNeedsReviewMatch[1], decodeURIComponent(aiNeedsReviewMatch[2]), authUser, readJsonBody, url);
}

const aiVerificationSuggestionsMatch = path.match(/^\/api\/deals\/([^/]+)\/ai\/verification-suggestions$/);
if (req.method === "GET" && aiVerificationSuggestionsMatch) {
  const authUser = await requireDealAccess(req, res, aiVerificationSuggestionsMatch[1]);
  if (!authUser) return;
  return handleGetVerificationSuggestions(req, res, aiVerificationSuggestionsMatch[1], authUser, url);
}

const aiVerificationHistoryMatch = path.match(/^\/api\/deals\/([^/]+)\/ai\/verification-history$/);
if (req.method === "GET" && aiVerificationHistoryMatch) {
  const authUser = await requireDealAccess(req, res, aiVerificationHistoryMatch[1]);
  if (!authUser) return;
  return handleGetVerificationHistory(req, res, aiVerificationHistoryMatch[1], authUser, url);
}

// Phase 2.3: Assumption Tracker
const aiAssumptionSnapshotMatch = path.match(/^\/api\/deals\/([^/]+)\/ai\/assumptions\/snapshot$/);
if (req.method === "POST" && aiAssumptionSnapshotMatch) {
  const authUser = await requireDealAccess(req, res, aiAssumptionSnapshotMatch[1]);
  if (!authUser) return;
  return handleCreateAssumptionSnapshot(req, res, aiAssumptionSnapshotMatch[1], authUser, readJsonBody);
}

const aiAssumptionSnapshotsMatch = path.match(/^\/api\/deals\/([^/]+)\/ai\/assumptions\/snapshots$/);
if (req.method === "GET" && aiAssumptionSnapshotsMatch) {
  const authUser = await requireDealAccess(req, res, aiAssumptionSnapshotsMatch[1]);
  if (!authUser) return;
  return handleGetAssumptionSnapshots(req, res, aiAssumptionSnapshotsMatch[1], authUser);
}

const aiAssumptionCompareMatch = path.match(/^\/api\/deals\/([^/]+)\/ai\/assumptions\/compare$/);
if (req.method === "POST" && aiAssumptionCompareMatch) {
  const authUser = await requireDealAccess(req, res, aiAssumptionCompareMatch[1]);
  if (!authUser) return;
  return handleCompareAssumptions(req, res, aiAssumptionCompareMatch[1], authUser, readJsonBody);
}

const aiAssumptionVariancesMatch = path.match(/^\/api\/deals\/([^/]+)\/ai\/assumptions\/variances$/);
if (req.method === "GET" && aiAssumptionVariancesMatch) {
  const authUser = await requireDealAccess(req, res, aiAssumptionVariancesMatch[1]);
  if (!authUser) return;
  return handleGetAssumptionVariances(req, res, aiAssumptionVariancesMatch[1], authUser);
}

// Portfolio-level assumption routes
if (req.method === "GET" && path === "/api/portfolio/ai/assumption-trends") {
  const authUser = await requireAuth(req, res);
  if (!authUser) return;
  return handleGetPortfolioTrends(req, res, authUser, url);
}

if (req.method === "POST" && path === "/api/portfolio/ai/assumption-suggestions") {
  const authUser = await requireAuth(req, res);
  if (!authUser) return;
  return handleGetAssumptionSuggestions(req, res, authUser, readJsonBody);
}
```

---

## New Imports to Add to `server/index.js`

```javascript
import {
  // Existing handlers...
  handleExtractDocument,
  handleSynthesizeDocuments,
  handleGetConflicts,
  handleResolveConflict,
  handleDismissConflict,
  handleGetExtractionReport,
  handleGetVerificationStatus,
  handleGetLineage,
  handleGetFieldLineage,
  handleVerifyField,
  handleMarkNeedsReview,
  handleTrackLineage,
  handleBulkVerify,
  handleGetVerificationSuggestions,
  handleGetVerificationHistory,
  handleCreateAssumptionSnapshot,
  handleGetAssumptionSnapshots,
  handleCompareAssumptions,
  handleGetAssumptionVariances,
  handleGetPortfolioTrends,
  handleGetAssumptionSuggestions
} from "./routes/ai-assistant.js";
```

---

## API Endpoint Summary

### Document Intelligence (2.1)
| Method | Endpoint | Handler |
|--------|----------|---------|
| POST | `/api/deals/:dealId/ai/extract` | Extract document |
| POST | `/api/deals/:dealId/ai/synthesize` | Cross-reference documents |
| GET | `/api/deals/:dealId/ai/conflicts` | List conflicts |
| POST | `/api/deals/:dealId/ai/conflicts/:id/resolve` | Resolve conflict |
| POST | `/api/deals/:dealId/ai/conflicts/:id/dismiss` | Dismiss conflict |
| GET | `/api/deals/:dealId/ai/extraction-report` | Get report |

### Verification Agent (2.2)
| Method | Endpoint | Handler |
|--------|----------|---------|
| GET | `/api/deals/:dealId/ai/verification-status` | Status summary |
| GET | `/api/deals/:dealId/ai/lineage` | All lineage |
| GET | `/api/deals/:dealId/ai/lineage/:field` | Field lineage |
| POST | `/api/deals/:dealId/ai/lineage/track` | Track lineage |
| POST | `/api/deals/:dealId/ai/lineage/:field/verify` | Verify field |
| POST | `/api/deals/:dealId/ai/lineage/:field/needs-review` | Mark for review |
| POST | `/api/deals/:dealId/ai/lineage/bulk-verify` | Bulk verify |
| GET | `/api/deals/:dealId/ai/verification-suggestions` | AI suggestions |
| GET | `/api/deals/:dealId/ai/verification-history` | History |

### Assumption Tracker (2.3)
| Method | Endpoint | Handler |
|--------|----------|---------|
| POST | `/api/deals/:dealId/ai/assumptions/snapshot` | Create snapshot |
| GET | `/api/deals/:dealId/ai/assumptions/snapshots` | List snapshots |
| POST | `/api/deals/:dealId/ai/assumptions/compare` | Compare to actuals |
| GET | `/api/deals/:dealId/ai/assumptions/variances` | Get variances |
| GET | `/api/portfolio/ai/assumption-trends` | Portfolio trends |
| POST | `/api/portfolio/ai/assumption-suggestions` | AI suggestions |

---

## Verification Steps

1. **Add handlers to ai-assistant.js**
2. **Add imports to index.js**
3. **Add route dispatch to index.js**
4. **Run existing tests to verify no regressions**:
   ```bash
   cd canonical-deal-os
   npm run test -- server/services/ai/__tests__
   ```
5. **Test endpoints manually**:
   ```bash
   # Verification Status
   curl -X GET "http://localhost:8787/api/deals/test-deal-id/ai/verification-status" \
     -H "Authorization: Bearer <token>"

   # Assumption Snapshots
   curl -X POST "http://localhost:8787/api/deals/test-deal-id/ai/assumptions/snapshot" \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"snapshotType":"UNDERWRITING","assumptions":{"rentGrowth":0.03}}'
   ```

---

## Files to Modify

| File | Changes |
|------|---------|
| `server/routes/ai-assistant.js` | Add 20 new handler functions |
| `server/index.js` | Add imports + route dispatch patterns |

---

## Implementation Order (Incremental with Tests)

### Increment 1: Document Intelligence Routes
1. Add Phase 2.1 imports to `ai-assistant.js`
2. Add Document Intelligence handlers (6 handlers)
3. Add Document Intelligence routes to `index.js`
4. **TEST**: Run existing tests to verify no regressions
   ```bash
   npm run test -- server/services/ai/__tests__/document-intelligence.test.js
   ```

### Increment 2: Verification Agent Routes
5. Add Phase 2.2 imports to `ai-assistant.js`
6. Add Verification Agent handlers (9 handlers)
7. Add Verification Agent routes to `index.js`
8. **TEST**: Run existing tests to verify no regressions
   ```bash
   npm run test -- server/services/ai/__tests__/verification-agent.test.js
   ```

### Increment 3: Assumption Tracker Routes
9. Add Phase 2.3 imports to `ai-assistant.js`
10. Add Assumption Tracker handlers (6 handlers)
11. Add Assumption Tracker routes to `index.js`
12. **TEST**: Run all Phase 2 tests to verify no regressions
    ```bash
    npm run test -- server/services/ai/__tests__
    ```

### Final Verification
13. Run full test suite
14. Manual smoke test of key endpoints

---

## Debug Logging Pattern

All handlers include structured logging with `[AI-*]` prefixes:

```javascript
// Document Intelligence: [AI-DOC]
console.log(`[AI-DOC] Extracting document: docId=${documentId}, type=${documentType}`);
console.error('[AI-DOC] Extract error:', error);

// Verification Agent: [AI-VERIFY]
console.log(`[AI-VERIFY] Verifying field: dealId=${dealId}, field=${field}, user=${authUser.id}`);
console.error('[AI-VERIFY] Verify error:', error);

// Assumption Tracker: [AI-ASSUME]
console.log(`[AI-ASSUME] Creating snapshot: dealId=${dealId}, type=${snapshotType}`);
console.error('[AI-ASSUME] Snapshot error:', error);
```

### Environment Variable for Debug Mode
```env
DEBUG_AI_PHASE2=true  # Enables verbose logging for all Phase 2 routes
```

Add to each handler:
```javascript
const DEBUG = process.env.DEBUG_AI_PHASE2 === 'true';

export async function handleExtractDocument(req, res, dealId, authUser, readJsonBody) {
  if (DEBUG) {
    console.log(`[AI-DOC] Extract request: dealId=${dealId}, user=${authUser.id}`);
  }
  // ... rest of handler
}
```

---

# Phase 2.4: Due Diligence Checklist AI Assistant

## Overview

**Status**: CURRENT TASK - Ready for Implementation

The DD Checklist AI Assistant addresses a critical workflow gap:
- The `ddItemsComplete` blocker in `deal-state-machine.js` is **STUBBED** (always returns `{ blocked: false }`)
- No structured DD tracking beyond the static `closing-checklist.hbs` template
- DD delays are the **#1 cause of timeline slippage** in deal lifecycle

### Problem Statement

From web research and pain point analysis:
1. **100+ DD checklist items** per multifamily acquisition
2. **No data lineage** - "who checked what, when"
3. **Manual tracking** in spreadsheets external to platform
4. **Missed items** discovered at closing = deal delays
5. **No AI assistance** for prioritization, deadline calculation, or document matching

### Solution: Intelligent DD Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                    DD CHECKLIST AI ASSISTANT                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │  DD Template │───▶│ AI Scheduler │───▶│ Smart Tasks  │       │
│  │  (100+ items)│    │ (deadlines)  │    │ (prioritized)│       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│         │                   │                   │                │
│         ▼                   ▼                   ▼                │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │  Document    │───▶│ Auto-Match   │───▶│ Verification │       │
│  │  Upload      │    │ to DD Items  │    │ Status       │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│                                                                  │
│                    ┌──────────────┐                              │
│                    │ ddItemsComplete │◀── Blocker Check         │
│                    │  (Real Logic)   │                           │
│                    └──────────────┘                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Comprehensive DD Checklist Taxonomy

Based on extensive web research from PropertyMetrics, Thompson Coburn, Dealpath, SmartAsset, Mashvisor, and PrivateCapitalInvestors:

### Category 1: Title & Legal (12 items)
| # | Item | Responsible | Priority | Doc Required |
|---|------|-------------|----------|--------------|
| 1.1 | Order Title Commitment | Buyer | CRITICAL | Yes |
| 1.2 | Review Title Exceptions | Counsel | HIGH | Yes |
| 1.3 | Identify Title Objections | Counsel | HIGH | No |
| 1.4 | Deliver Title Objections | Buyer | CRITICAL | Yes |
| 1.5 | Seller Title Cure Response | Seller | HIGH | Yes |
| 1.6 | Order ALTA Survey | Buyer | CRITICAL | Yes |
| 1.7 | Review Survey | Counsel | HIGH | Yes |
| 1.8 | Survey Exception Resolution | Both | MEDIUM | No |
| 1.9 | UCC Search | Counsel | HIGH | Yes |
| 1.10 | Judgment/Lien Search | Counsel | HIGH | Yes |
| 1.11 | Tax Lien Search | Counsel | MEDIUM | Yes |
| 1.12 | Title Clear to Close | Title Co | CRITICAL | Yes |

### Category 2: Environmental (8 items)
| # | Item | Responsible | Priority | Doc Required |
|---|------|-------------|----------|--------------|
| 2.1 | Order Phase I ESA | Buyer | CRITICAL | Yes |
| 2.2 | Review Phase I Report | Buyer | CRITICAL | Yes |
| 2.3 | Evaluate RECs/HRECs | Buyer | HIGH | No |
| 2.4 | Order Phase II (if needed) | Buyer | CRITICAL | Yes |
| 2.5 | Review Phase II Results | Buyer | CRITICAL | Yes |
| 2.6 | Remediation Plan (if needed) | Seller | HIGH | Yes |
| 2.7 | Environmental Escrow/Reserve | Both | HIGH | No |
| 2.8 | Environmental Insurance Quote | Buyer | MEDIUM | Yes |

### Category 3: Property Condition (10 items)
| # | Item | Responsible | Priority | Doc Required |
|---|------|-------------|----------|--------------|
| 3.1 | Order PCA (Property Condition Assessment) | Buyer | CRITICAL | Yes |
| 3.2 | Review PCA Report | Buyer | CRITICAL | Yes |
| 3.3 | Capital Expenditure Analysis | Buyer | HIGH | No |
| 3.4 | Deferred Maintenance Inventory | Buyer | HIGH | Yes |
| 3.5 | Order Structural Engineer Report (if needed) | Buyer | HIGH | Yes |
| 3.6 | HVAC/Mechanical Inspection | Buyer | MEDIUM | Yes |
| 3.7 | Roof Inspection/Warranty Review | Buyer | HIGH | Yes |
| 3.8 | Elevator Inspection (if applicable) | Buyer | MEDIUM | Yes |
| 3.9 | Pool/Amenity Inspection | Buyer | LOW | Yes |
| 3.10 | ADA Compliance Review | Buyer | HIGH | Yes |

### Category 4: Financial Review (14 items)
| # | Item | Responsible | Priority | Doc Required |
|---|------|-------------|----------|--------------|
| 4.1 | Obtain T12 Operating Statements | Seller | CRITICAL | Yes |
| 4.2 | Verify T12 Against Bank Statements | Buyer | HIGH | Yes |
| 4.3 | Obtain 3-Year Operating History | Seller | HIGH | Yes |
| 4.4 | Current Year Budget Analysis | Buyer | MEDIUM | Yes |
| 4.5 | Review Rent Roll | Buyer | CRITICAL | Yes |
| 4.6 | Rent Roll vs Lease Audit | Buyer | HIGH | No |
| 4.7 | Bad Debt/Collections Analysis | Buyer | HIGH | No |
| 4.8 | Utility Expense Analysis | Buyer | MEDIUM | Yes |
| 4.9 | Real Estate Tax Review | Buyer | HIGH | Yes |
| 4.10 | Insurance Cost Verification | Buyer | MEDIUM | Yes |
| 4.11 | Payroll/Management Fee Analysis | Buyer | MEDIUM | No |
| 4.12 | Capital Improvement History | Seller | MEDIUM | Yes |
| 4.13 | Accounts Payable Review | Buyer | MEDIUM | Yes |
| 4.14 | Security Deposit Reconciliation | Buyer | HIGH | Yes |

### Category 5: Tenant & Lease Matters (12 items)
| # | Item | Responsible | Priority | Doc Required |
|---|------|-------------|----------|--------------|
| 5.1 | Obtain All Lease Copies | Seller | CRITICAL | Yes |
| 5.2 | Lease Abstract Preparation | Buyer | HIGH | Yes |
| 5.3 | Lease Audit vs Rent Roll | Counsel | HIGH | No |
| 5.4 | Review Lease Terms (renewals, options) | Counsel | HIGH | No |
| 5.5 | Identify Problem Tenants | Buyer | HIGH | No |
| 5.6 | Pending Litigation Review | Counsel | HIGH | Yes |
| 5.7 | Eviction History Analysis | Buyer | MEDIUM | Yes |
| 5.8 | Send Estoppel Certificates | Seller | CRITICAL | Yes |
| 5.9 | Receive Estoppel Certificates | Seller | CRITICAL | Yes |
| 5.10 | Review Estoppel Responses | Counsel | HIGH | No |
| 5.11 | Prepare SNDAs (if lender requires) | Lender | HIGH | Yes |
| 5.12 | Obtain SNDA Signatures | Seller | HIGH | Yes |

### Category 6: Zoning & Entitlements (8 items)
| # | Item | Responsible | Priority | Doc Required |
|---|------|-------------|----------|--------------|
| 6.1 | Obtain Zoning Letter/Certificate | Buyer | HIGH | Yes |
| 6.2 | Verify Permitted Use | Counsel | HIGH | No |
| 6.3 | Review Parking Requirements | Buyer | MEDIUM | No |
| 6.4 | Certificate of Occupancy Review | Buyer | HIGH | Yes |
| 6.5 | Building Permits History | Buyer | MEDIUM | Yes |
| 6.6 | Code Violation Search | Buyer | HIGH | Yes |
| 6.7 | Pending Development Review | Buyer | MEDIUM | No |
| 6.8 | HOA/Condo Docs (if applicable) | Buyer | MEDIUM | Yes |

### Category 7: Service Contracts (8 items)
| # | Item | Responsible | Priority | Doc Required |
|---|------|-------------|----------|--------------|
| 7.1 | Inventory All Service Contracts | Seller | HIGH | Yes |
| 7.2 | Review Contract Terms | Counsel | HIGH | No |
| 7.3 | Identify Assumable vs Terminable | Counsel | HIGH | No |
| 7.4 | Management Agreement Review | Counsel | HIGH | Yes |
| 7.5 | Utility Contract Review | Buyer | MEDIUM | Yes |
| 7.6 | Equipment Lease Review | Counsel | MEDIUM | Yes |
| 7.7 | Vendor Notification List | Buyer | LOW | No |
| 7.8 | Contract Assignment Letters | Counsel | MEDIUM | Yes |

### Category 8: Insurance (6 items)
| # | Item | Responsible | Priority | Doc Required |
|---|------|-------------|----------|--------------|
| 8.1 | Obtain Current Insurance Policies | Seller | HIGH | Yes |
| 8.2 | Review Coverage Amounts | Buyer | HIGH | No |
| 8.3 | Claims History (5 years) | Buyer | HIGH | Yes |
| 8.4 | Obtain New Insurance Quotes | Buyer | HIGH | Yes |
| 8.5 | Flood Zone Determination | Buyer | HIGH | Yes |
| 8.6 | Lender Insurance Requirements | Lender | HIGH | No |

### Category 9: Financing Due Diligence (10 items)
| # | Item | Responsible | Priority | Doc Required |
|---|------|-------------|----------|--------------|
| 9.1 | Submit Loan Application | Buyer | CRITICAL | Yes |
| 9.2 | Provide Lender DD Package | Buyer | HIGH | Yes |
| 9.3 | Order Appraisal | Lender | CRITICAL | Yes |
| 9.4 | Review Appraisal | Buyer | HIGH | No |
| 9.5 | Receive Loan Commitment | Lender | CRITICAL | Yes |
| 9.6 | Review Loan Terms | Counsel | CRITICAL | No |
| 9.7 | Satisfy Loan Conditions | Buyer | HIGH | Yes |
| 9.8 | Receive Loan Documents | Lender | CRITICAL | Yes |
| 9.9 | Review Loan Documents | Counsel | CRITICAL | No |
| 9.10 | Lender Clear to Fund | Lender | CRITICAL | Yes |

### Category 10: Closing Preparation (14 items)
| # | Item | Responsible | Priority | Doc Required |
|---|------|-------------|----------|--------------|
| 10.1 | Draft Deed | Seller Counsel | CRITICAL | Yes |
| 10.2 | Draft Bill of Sale | Seller Counsel | HIGH | Yes |
| 10.3 | Draft Assignment of Leases | Seller Counsel | HIGH | Yes |
| 10.4 | Draft Assignment of Contracts | Seller Counsel | MEDIUM | Yes |
| 10.5 | FIRPTA Affidavit | Seller | CRITICAL | Yes |
| 10.6 | Entity Authorization/Resolution | Both | HIGH | Yes |
| 10.7 | Seller's Closing Certificate | Seller | HIGH | Yes |
| 10.8 | Buyer's Closing Certificate | Buyer | HIGH | Yes |
| 10.9 | Tenant Notification Letters | Buyer | MEDIUM | Yes |
| 10.10 | Vendor Notification Letters | Buyer | LOW | Yes |
| 10.11 | Proration Calculations | Title Co | HIGH | Yes |
| 10.12 | Settlement Statement Approval | Both | CRITICAL | Yes |
| 10.13 | Wire Instructions Verification | Both | CRITICAL | Yes |
| 10.14 | Closing Checklist Final Review | Both | CRITICAL | No |

### Category 11: Site Visits & Inspections (6 items)
| # | Item | Responsible | Priority | Doc Required |
|---|------|-------------|----------|--------------|
| 11.1 | Initial Site Visit | Buyer | CRITICAL | No |
| 11.2 | Unit Inspections (sample) | Buyer | HIGH | Yes |
| 11.3 | Common Area Inspection | Buyer | HIGH | Yes |
| 11.4 | Market Comp Tour | Buyer | MEDIUM | No |
| 11.5 | Final Walk-Through | Buyer | CRITICAL | No |
| 11.6 | Pre-Closing Property Condition | Buyer | HIGH | Yes |

### Category 12: Post-Closing (8 items)
| # | Item | Responsible | Priority | Doc Required |
|---|------|-------------|----------|--------------|
| 12.1 | Record Deed | Title Co | CRITICAL | Yes |
| 12.2 | Send Tenant Notifications | Buyer | HIGH | Yes |
| 12.3 | Transfer Utilities | Buyer | HIGH | No |
| 12.4 | Update Insurance | Buyer | HIGH | Yes |
| 12.5 | Management Transition | Buyer | HIGH | No |
| 12.6 | Security Deposit Transfer | Seller | HIGH | Yes |
| 12.7 | Final Title Policy | Title Co | MEDIUM | Yes |
| 12.8 | Post-Closing Adjustments | Both | MEDIUM | No |

**TOTAL: 116 DD Items across 12 Categories**

---

## Items Missing from Current Platform

Comparing the comprehensive checklist above to `closing-checklist.hbs`, these items are **NOT** in the current platform:

### HIGH PRIORITY GAPS (Add to Platform)

**Environmental (Missing)**
- Phase II Environmental (if needed)
- Environmental Insurance Quote
- Remediation Plan tracking

**Property Condition (Missing)**
- Capital Expenditure Analysis integration
- Structural Engineer Report
- ADA Compliance Review

**Financial (Missing)**
- Bank Statement Verification
- Bad Debt/Collections Analysis
- Accounts Payable Review

**Tenant/Lease (Missing)**
- Lease Abstract Preparation
- Problem Tenant Identification
- Eviction History Analysis
- Pending Litigation Review

**Zoning (Entirely Missing)**
- All 8 zoning items need to be added

**Service Contracts (Missing)**
- Contract terminability analysis
- Equipment lease review
- Vendor notification tracking

**Insurance (Missing)**
- Claims History review
- Flood Zone determination

---

## Schema Changes

Add to `server/prisma/schema.prisma`:

```prisma
// ========== DUE DILIGENCE CHECKLIST (Phase 2.4) ==========

model DDCategory {
  id              String    @id @default(uuid())
  code            String    @unique  // "TITLE", "ENVIRONMENTAL", etc.
  name            String
  description     String?
  displayOrder    Int       @default(0)
  items           DDTemplateItem[]
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

model DDTemplateItem {
  id              String    @id @default(uuid())
  categoryId      String
  category        DDCategory @relation(fields: [categoryId], references: [id])

  code            String    @unique  // "TITLE_001", "ENV_001", etc.
  title           String
  description     String?

  // Configuration
  defaultResponsible  String    // "BUYER", "SELLER", "COUNSEL", "LENDER", "TITLE_CO", "BOTH"
  priority            String    @default("MEDIUM")  // "CRITICAL", "HIGH", "MEDIUM", "LOW"
  requiresDocument    Boolean   @default(false)
  documentTypes       String[]  // Expected document types

  // Deadline calculation
  deadlineType        String    @default("DD_RELATIVE")  // "PSA_RELATIVE", "DD_RELATIVE", "CLOSING_RELATIVE", "FIXED"
  deadlineDaysOffset  Int       @default(0)  // Days from reference date

  // Dependencies
  dependsOn           String[]  // Item codes that must complete first

  // AI configuration
  aiAutoMatch         Boolean   @default(false)  // AI can auto-match documents
  aiKeywords          String[]  // Keywords for document matching

  displayOrder    Int       @default(0)
  isActive        Boolean   @default(true)

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([categoryId])
  @@index([priority])
}

model DDChecklist {
  id              String    @id @default(uuid())
  dealId          String    @unique

  // Lifecycle
  status          String    @default("NOT_STARTED")  // "NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETE"
  startedAt       DateTime?
  completedAt     DateTime?

  // Key dates from deal
  ddExpirationDate    DateTime?
  targetClosingDate   DateTime?

  // Summary metrics (denormalized for performance)
  totalItems      Int       @default(0)
  completedItems  Int       @default(0)
  blockedItems    Int       @default(0)

  items           DDItem[]

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([dealId])
  @@index([status])
}

model DDItem {
  id              String    @id @default(uuid())
  checklistId     String
  checklist       DDChecklist @relation(fields: [checklistId], references: [id], onDelete: Cascade)

  templateItemId  String?   // Null if custom item

  // Item details (copied from template or custom)
  categoryCode    String
  code            String
  title           String
  description     String?
  responsible     String
  priority        String

  // Status tracking
  status          String    @default("NOT_STARTED")  // "NOT_STARTED", "IN_PROGRESS", "WAITING", "BLOCKED", "COMPLETE", "N/A"

  // Dates
  dueDate         DateTime?
  startedAt       DateTime?
  completedAt     DateTime?

  // Assignment
  assignedToUserId    String?
  assignedAt          DateTime?

  // Document linkage
  linkedDocumentIds   String[]
  requiresDocument    Boolean   @default(false)

  // Notes and issues
  notes           String?
  blockerReason   String?

  // Verification
  verifiedBy      String?
  verifiedAt      DateTime?
  verificationNotes String?

  // AI assistance tracking
  aiSuggested     Boolean   @default(false)
  aiConfidence    Float?
  aiMatchedDocId  String?

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@unique([checklistId, code])
  @@index([checklistId])
  @@index([status])
  @@index([priority])
  @@index([dueDate])
  @@index([assignedToUserId])
}

model DDItemHistory {
  id              String    @id @default(uuid())
  ddItemId        String

  action          String    // "CREATED", "STATUS_CHANGED", "ASSIGNED", "DOCUMENT_LINKED", "VERIFIED", "NOTE_ADDED"
  previousStatus  String?
  newStatus       String?

  changedBy       String
  changedByName   String
  notes           String?

  createdAt       DateTime  @default(now())

  @@index([ddItemId])
  @@index([createdAt])
}
```

---

## New Service: `server/services/ai/dd-checklist-assistant.js`

```javascript
/**
 * Due Diligence Checklist AI Assistant
 *
 * Provides intelligent DD workflow management:
 * - Auto-generates checklists from templates
 * - Calculates deadlines from deal dates
 * - Matches uploaded documents to DD items
 * - Prioritizes items based on risk and timeline
 * - Integrates with deal-state-machine blocker
 */

import { getPrisma } from '../../db.js';

// Configuration
export const DD_ASSISTANT_CONFIG = {
  enabled: process.env.DD_ASSISTANT_ENABLED !== 'false',
  autoMatchDocuments: process.env.DD_AUTO_MATCH_DOCS === 'true',
  aiModel: process.env.DD_ASSISTANT_MODEL || 'gpt-4o-mini',
  debug: process.env.DEBUG_DD_ASSISTANT === 'true',
};

// ==================== CORE FUNCTIONS ====================

/**
 * Initialize DD checklist for a deal
 * Creates checklist from template with calculated deadlines
 */
export async function initializeChecklist(dealId, options = {}) {
  // 1. Get deal dates (DD expiration, closing date)
  // 2. Fetch all active template items
  // 3. Create DDChecklist record
  // 4. Create DDItem for each template item with calculated due dates
  // 5. Return checklist with items
}

/**
 * Calculate due dates for DD items based on deal timeline
 */
export function calculateDeadlines(templateItems, dealDates) {
  // deadlineType: "PSA_RELATIVE" | "DD_RELATIVE" | "CLOSING_RELATIVE" | "FIXED"
  // Apply deadlineDaysOffset from appropriate reference date
}

/**
 * Get DD completion status for deal-state-machine blocker
 * This replaces the stubbed ddItemsComplete() function
 */
export async function getDDCompletionStatus(dealId) {
  const prisma = getPrisma();

  const checklist = await prisma.dDChecklist.findUnique({
    where: { dealId },
    include: {
      items: {
        where: { priority: { in: ['CRITICAL', 'HIGH'] } }
      }
    }
  });

  if (!checklist) {
    return { blocked: true, reason: 'DD checklist not initialized' };
  }

  // Check critical items
  const criticalItems = checklist.items.filter(i => i.priority === 'CRITICAL');
  const incompleteCritical = criticalItems.filter(i =>
    i.status !== 'COMPLETE' && i.status !== 'N/A'
  );

  if (incompleteCritical.length > 0) {
    return {
      blocked: true,
      reason: `${incompleteCritical.length} critical DD items incomplete`,
      blockedItems: incompleteCritical.map(i => ({
        code: i.code,
        title: i.title,
        status: i.status
      }))
    };
  }

  // Check high priority items
  const highItems = checklist.items.filter(i => i.priority === 'HIGH');
  const incompleteHigh = highItems.filter(i =>
    i.status !== 'COMPLETE' && i.status !== 'N/A'
  );

  const highThreshold = 0.9; // 90% of high priority must be complete
  const highCompletionRate = 1 - (incompleteHigh.length / highItems.length);

  if (highCompletionRate < highThreshold) {
    return {
      blocked: true,
      reason: `Only ${Math.round(highCompletionRate * 100)}% of high-priority DD items complete (need ${highThreshold * 100}%)`,
      blockedItems: incompleteHigh.slice(0, 5).map(i => ({
        code: i.code,
        title: i.title,
        status: i.status
      }))
    };
  }

  return { blocked: false };
}

/**
 * Update DD item status with history tracking
 */
export async function updateItemStatus(itemId, newStatus, userId, notes = null) {
  // 1. Get current item
  // 2. Update status
  // 3. Create history record
  // 4. Update checklist summary metrics
  // 5. Return updated item
}

/**
 * Assign DD item to user
 */
export async function assignItem(itemId, assigneeUserId, assignerUserId) {
  // 1. Update item assignment
  // 2. Create history record
  // 3. Optionally trigger notification
}

/**
 * Link document to DD item
 */
export async function linkDocument(itemId, documentId, userId) {
  // 1. Validate document exists
  // 2. Add to linkedDocumentIds
  // 3. Create history record
  // 4. If requiresDocument, consider auto-marking as ready
}

// ==================== AI FUNCTIONS ====================

/**
 * AI: Match uploaded document to DD items
 * Called when document is uploaded to deal
 */
export async function matchDocumentToItems(dealId, documentId, documentMetadata) {
  // 1. Get deal's DD checklist items
  // 2. Analyze document type, name, content summary
  // 3. Find matching items by:
  //    - documentTypes array match
  //    - aiKeywords match
  //    - LLM semantic matching (if enabled)
  // 4. Return ranked matches with confidence scores
}

/**
 * AI: Suggest next priority items to work on
 */
export async function suggestNextItems(dealId, limit = 5) {
  // Score items by:
  // - Priority (CRITICAL > HIGH > MEDIUM > LOW)
  // - Due date proximity
  // - Dependency satisfaction
  // - Responsible party availability
  // Return top N items with reasoning
}

/**
 * AI: Detect DD risks and blockers
 */
export async function detectRisks(dealId) {
  // Analyze:
  // - Overdue items
  // - Items approaching due date with no progress
  // - Blocked item chains
  // - Missing critical documents
  // Return risk assessment with recommendations
}

/**
 * AI: Generate DD status summary for stakeholders
 */
export async function generateStatusSummary(dealId, audience = 'internal') {
  // Generate natural language summary of DD progress
  // Tailor for audience: internal, IC memo, lender
}

// ==================== TEMPLATE MANAGEMENT ====================

/**
 * Get all DD categories and template items
 */
export async function getTemplateLibrary() {
  // Return full template structure
}

/**
 * Add custom DD item to deal checklist
 */
export async function addCustomItem(checklistId, itemData, userId) {
  // Create custom item not from template
}

/**
 * Mark item as N/A with reason
 */
export async function markItemNA(itemId, reason, userId) {
  // Mark as not applicable with required reason
}
```

---

## Integration with Deal State Machine

Modify `server/services/deal-state-machine.js`:

```javascript
// Replace stubbed ddItemsComplete with real implementation
import { getDDCompletionStatus } from './ai/dd-checklist-assistant.js';

const BLOCKER_CHECKS = {
  // ... existing checks ...

  /**
   * Check if all DD items are complete (REAL IMPLEMENTATION)
   */
  async ddItemsComplete(dealId) {
    return await getDDCompletionStatus(dealId);
  },

  // ... rest of checks ...
};
```

---

## API Routes

Add to `server/routes/ai-assistant.js` or new `server/routes/dd-checklist.js`:

### Checklist Management
| Method | Endpoint | Handler |
|--------|----------|---------|
| POST | `/api/deals/:dealId/dd-checklist/initialize` | Initialize checklist from template |
| GET | `/api/deals/:dealId/dd-checklist` | Get checklist with all items |
| GET | `/api/deals/:dealId/dd-checklist/status` | Get completion status summary |

### Item Management
| Method | Endpoint | Handler |
|--------|----------|---------|
| GET | `/api/deals/:dealId/dd-checklist/items` | List items with filters |
| PATCH | `/api/deals/:dealId/dd-checklist/items/:itemId` | Update item status |
| POST | `/api/deals/:dealId/dd-checklist/items/:itemId/assign` | Assign item |
| POST | `/api/deals/:dealId/dd-checklist/items/:itemId/link-document` | Link document |
| POST | `/api/deals/:dealId/dd-checklist/items/:itemId/verify` | Verify item |
| POST | `/api/deals/:dealId/dd-checklist/items/:itemId/mark-na` | Mark N/A |
| POST | `/api/deals/:dealId/dd-checklist/items/custom` | Add custom item |

### AI Features
| Method | Endpoint | Handler |
|--------|----------|---------|
| POST | `/api/deals/:dealId/dd-checklist/ai/match-document` | Match document to items |
| GET | `/api/deals/:dealId/dd-checklist/ai/suggestions` | Get priority suggestions |
| GET | `/api/deals/:dealId/dd-checklist/ai/risks` | Get risk analysis |
| GET | `/api/deals/:dealId/dd-checklist/ai/summary` | Generate status summary |

### Template Management (Admin)
| Method | Endpoint | Handler |
|--------|----------|---------|
| GET | `/api/admin/dd-templates` | Get template library |
| POST | `/api/admin/dd-templates/categories` | Add category |
| POST | `/api/admin/dd-templates/items` | Add template item |
| PATCH | `/api/admin/dd-templates/items/:itemId` | Update template item |

---

## Seed Data: DD Template

Create `server/prisma/seed-dd-templates.js`:

```javascript
/**
 * Seed DD Categories and Template Items
 * Run: npx prisma db seed --preview-feature
 */

const categories = [
  { code: 'TITLE', name: 'Title & Legal', displayOrder: 1 },
  { code: 'ENVIRONMENTAL', name: 'Environmental', displayOrder: 2 },
  { code: 'PROPERTY', name: 'Property Condition', displayOrder: 3 },
  { code: 'FINANCIAL', name: 'Financial Review', displayOrder: 4 },
  { code: 'TENANT', name: 'Tenant & Lease Matters', displayOrder: 5 },
  { code: 'ZONING', name: 'Zoning & Entitlements', displayOrder: 6 },
  { code: 'CONTRACTS', name: 'Service Contracts', displayOrder: 7 },
  { code: 'INSURANCE', name: 'Insurance', displayOrder: 8 },
  { code: 'FINANCING', name: 'Financing', displayOrder: 9 },
  { code: 'CLOSING', name: 'Closing Preparation', displayOrder: 10 },
  { code: 'SITE', name: 'Site Visits & Inspections', displayOrder: 11 },
  { code: 'POST_CLOSING', name: 'Post-Closing', displayOrder: 12 },
];

const templateItems = [
  // TITLE (12 items)
  { categoryCode: 'TITLE', code: 'TITLE_001', title: 'Order Title Commitment',
    defaultResponsible: 'BUYER', priority: 'CRITICAL', requiresDocument: true,
    deadlineType: 'PSA_RELATIVE', deadlineDaysOffset: 5, displayOrder: 1,
    aiAutoMatch: true, aiKeywords: ['title commitment', 'title insurance'] },
  // ... all 116 items ...
];
```

---

## Environment Variables

```env
# DD Checklist AI Assistant
DD_ASSISTANT_ENABLED=true
DD_AUTO_MATCH_DOCS=true
DD_ASSISTANT_MODEL=gpt-4o-mini
DEBUG_DD_ASSISTANT=false

# Completion thresholds
DD_CRITICAL_REQUIRED_PCT=100
DD_HIGH_REQUIRED_PCT=90
```

---

## Test File: `server/services/ai/__tests__/dd-checklist-assistant.test.js`

```javascript
describe('DD Checklist AI Assistant', () => {
  describe('initializeChecklist', () => {
    test('creates checklist from template');
    test('calculates deadlines from deal dates');
    test('handles missing deal dates gracefully');
  });

  describe('getDDCompletionStatus', () => {
    test('returns blocked when critical items incomplete');
    test('returns blocked when high items below threshold');
    test('returns not blocked when thresholds met');
    test('handles N/A items correctly');
  });

  describe('updateItemStatus', () => {
    test('updates status and creates history');
    test('updates checklist summary metrics');
    test('validates status transitions');
  });

  describe('AI: matchDocumentToItems', () => {
    test('matches Phase I ESA to environmental item');
    test('matches title commitment to title item');
    test('returns confidence scores');
  });

  describe('AI: suggestNextItems', () => {
    test('prioritizes by due date and priority');
    test('respects dependencies');
    test('limits results');
  });

  describe('AI: detectRisks', () => {
    test('identifies overdue items');
    test('identifies approaching deadlines');
    test('identifies blocked chains');
  });
});
```

---

## Implementation Order

### Step 1: Schema & Seed Data
1. Add schema changes to `schema.prisma`
2. Run `npx prisma db push`
3. Create seed file with all 116 DD items
4. Run seed

### Step 2: Core Service
1. Create `dd-checklist-assistant.js`
2. Implement `initializeChecklist()`
3. Implement `getDDCompletionStatus()`
4. Implement `updateItemStatus()`

### Step 3: State Machine Integration
1. Modify `deal-state-machine.js` to use real `ddItemsComplete()`
2. Test blocker behavior

### Step 4: API Routes
1. Add checklist management routes
2. Add item management routes
3. Test with Postman/curl

### Step 5: AI Features
1. Implement `matchDocumentToItems()`
2. Implement `suggestNextItems()`
3. Implement `detectRisks()`
4. Implement `generateStatusSummary()`

### Step 6: Tests
1. Unit tests for all functions
2. Integration tests for routes
3. E2E test of deal workflow with DD

---

## Stage-Gated DD Task Visibility

### Critical Design Requirement

DD tasks should only be visible to users when they're relevant to the current deal stage. This prevents overwhelming users with 116 items at once.

### Deal Stage to DD Category Mapping

```
Deal State Machine State        │ DD Categories Available
────────────────────────────────┼─────────────────────────────────────────
INTAKE_RECEIVED                 │ None (pre-contract)
DATA_ROOM_INGESTED              │ None (pre-contract)
EXTRACTION_COMPLETE             │ None (pre-contract)
UNDERWRITING_DRAFT              │ None (preliminary underwriting - no DD yet)
IC_READY                        │ None (IC decision pending)
LOI_DRAFT                       │ None (pre-contract)
LOI_SENT                        │ None (pre-contract)
LOI_ACCEPTED                    │ Initial: FINANCIAL (rent roll, T12 verification)
PSA_DRAFT                       │ + TITLE (title search starts with PSA)
PSA_EXECUTED                    │ + All pre-DD items activated
DD_ACTIVE                       │ ALL categories unlocked:
                                │   - TITLE (commitments, survey)
                                │   - ENVIRONMENTAL (Phase I/II)
                                │   - PROPERTY (PCA, inspections)
                                │   - FINANCIAL (full audit)
                                │   - TENANT (estoppels, SNDAs)
                                │   - ZONING (if needed)
                                │   - CONTRACTS (service review)
                                │   - INSURANCE (quotes)
                                │   - SITE (walk-throughs)
DD_COMPLETE                     │ FINANCING, CLOSING categories
FINANCING_IN_PROGRESS           │ + FINANCING items
FINANCING_COMMITTED             │ + CLOSING items (loan docs)
CLEAR_TO_CLOSE                  │ Final CLOSING items
CLOSED                          │ POST_CLOSING items only
```

### Schema Updates for Stage Gating

Add to `DDTemplateItem` model:

```prisma
model DDTemplateItem {
  // ... existing fields ...

  // Stage gating
  availableFromState    String    @default("DD_ACTIVE")  // DEAL_STATE when item becomes visible
  requiredByState       String?   // DEAL_STATE by which item must be complete (optional)

  // @@index additions
  @@index([availableFromState])
}
```

### Implementation: Filtered Item Queries

```javascript
/**
 * Get DD items filtered by current deal state
 * Only returns items appropriate for current workflow stage
 */
export async function getStageFilteredItems(dealId, dealState) {
  const prisma = getPrisma();

  // Map of states in workflow order
  const STATE_ORDER = {
    'INTAKE_RECEIVED': 0,
    'DATA_ROOM_INGESTED': 1,
    'EXTRACTION_COMPLETE': 2,
    'UNDERWRITING_DRAFT': 3,
    'IC_READY': 4,
    'LOI_DRAFT': 5,
    'LOI_SENT': 6,
    'LOI_ACCEPTED': 7,
    'PSA_DRAFT': 8,
    'PSA_EXECUTED': 9,
    'DD_ACTIVE': 10,
    'DD_COMPLETE': 11,
    'FINANCING_IN_PROGRESS': 12,
    'FINANCING_COMMITTED': 13,
    'CLEAR_TO_CLOSE': 14,
    'CLOSED': 15
  };

  const currentStateOrder = STATE_ORDER[dealState] || 0;

  // Get checklist with items filtered by state
  const checklist = await prisma.dDChecklist.findUnique({
    where: { dealId },
    include: {
      items: {
        include: { templateItem: true }
      }
    }
  });

  if (!checklist) return null;

  // Filter items to only those available at current state
  const visibleItems = checklist.items.filter(item => {
    const itemStateOrder = STATE_ORDER[item.templateItem?.availableFromState || 'DD_ACTIVE'] || 10;
    return itemStateOrder <= currentStateOrder;
  });

  // Group by category with counts
  const categories = {};
  for (const item of visibleItems) {
    if (!categories[item.categoryCode]) {
      categories[item.categoryCode] = {
        items: [],
        total: 0,
        completed: 0,
        inProgress: 0
      };
    }
    categories[item.categoryCode].items.push(item);
    categories[item.categoryCode].total++;
    if (item.status === 'COMPLETE') categories[item.categoryCode].completed++;
    if (item.status === 'IN_PROGRESS') categories[item.categoryCode].inProgress++;
  }

  return {
    dealState,
    totalVisible: visibleItems.length,
    totalAll: checklist.items.length,
    categories,
    items: visibleItems
  };
}
```

---

## Document Intake: Email & Data Room Integration

### Two Methods for Sending DD Documents to GP

#### Method 1: Email Intake (External Parties)

Sellers, brokers, and third parties can email documents directly.

**New File: `server/services/dd-email-intake.js`**

```javascript
/**
 * DD Email Intake Service
 *
 * Processes incoming emails to deal-specific inboxes:
 * - deal-{dealId}@docs.canonical.com → DD document processing
 *
 * Flow:
 * 1. SendGrid Inbound Parse webhook receives email
 * 2. Extract attachments
 * 3. AI classifies document type
 * 4. Auto-match to DD checklist items
 * 5. Create pending approval for user
 * 6. On approval: cross off item, upload to living data
 */

import { getPrisma } from '../db.js';
import { smartParseDocument } from '../llm.js';
import { matchDocumentToItems } from './ai/dd-checklist-assistant.js';

export const DD_EMAIL_CONFIG = {
  enabled: process.env.DD_EMAIL_INTAKE_ENABLED === 'true',
  domain: process.env.DD_EMAIL_DOMAIN || 'docs.canonical.com',
  webhookSecret: process.env.SENDGRID_INBOUND_SECRET,
};

/**
 * Process incoming DD email
 * Called by webhook handler
 */
export async function processIncomingDDEmail(emailData) {
  const log = createLogger('DD-EMAIL');

  log.info('Processing incoming DD email', {
    from: emailData.from,
    to: emailData.to,
    subject: emailData.subject,
    attachmentCount: emailData.attachments?.length || 0
  });

  // 1. Extract deal ID from recipient address
  const dealIdMatch = emailData.to.match(/deal-([a-z0-9-]+)@/i);
  if (!dealIdMatch) {
    log.warn('Could not extract deal ID from recipient', { to: emailData.to });
    return { success: false, reason: 'invalid_recipient' };
  }
  const dealId = dealIdMatch[1];

  // 2. Validate deal exists and has DD checklist
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: { ddChecklist: true }
  });

  if (!deal) {
    log.warn('Deal not found', { dealId });
    return { success: false, reason: 'deal_not_found' };
  }

  // 3. Process each attachment
  const results = [];
  for (const attachment of emailData.attachments || []) {
    try {
      const result = await processAttachment(dealId, attachment, {
        senderEmail: emailData.from,
        subject: emailData.subject
      });
      results.push(result);
    } catch (error) {
      log.error('Failed to process attachment', { filename: attachment.filename, error: error.message });
      results.push({ filename: attachment.filename, success: false, error: error.message });
    }
  }

  return { success: true, processed: results };
}

/**
 * Process single attachment
 */
async function processAttachment(dealId, attachment, metadata) {
  const log = createLogger('DD-EMAIL');

  // 1. Upload to document storage
  const docRecord = await uploadDocument(dealId, attachment, {
    source: 'EMAIL_INTAKE',
    senderEmail: metadata.senderEmail
  });

  log.info('Document uploaded', { docId: docRecord.id, filename: attachment.filename });

  // 2. AI smart-read the document
  const parseResult = await smartParseDocument(docRecord.id, attachment.content);

  log.info('Document parsed', {
    docId: docRecord.id,
    type: parseResult.documentType,
    confidence: parseResult.confidence
  });

  // 3. Match to DD checklist items
  const matches = await matchDocumentToItems(dealId, docRecord.id, {
    documentType: parseResult.documentType,
    filename: attachment.filename,
    extractedData: parseResult.data
  });

  log.info('DD matches found', {
    docId: docRecord.id,
    matchCount: matches.length,
    topMatch: matches[0]?.itemCode
  });

  // 4. Create pending approval record
  if (matches.length > 0) {
    await createPendingDocApproval(dealId, docRecord.id, matches, metadata);
    log.info('Created pending approval', { docId: docRecord.id });
  }

  return {
    filename: attachment.filename,
    documentId: docRecord.id,
    documentType: parseResult.documentType,
    matches: matches.slice(0, 3),
    status: 'PENDING_APPROVAL'
  };
}
```

#### Method 2: Data Room Upload (Direct Upload)

Users can drag-and-drop documents directly to the deal data room.

**Integration with existing document upload:**

```javascript
// In server/routes/documents.js - modify handleUploadDocument

import { matchDocumentToItems, autoProcessDocument } from '../services/ai/dd-checklist-assistant.js';

export async function handleUploadDocument(req, res, dealId, authUser, readMultipartBody) {
  // ... existing upload logic ...

  // After document is saved:
  const docRecord = await saveDocument(...);

  // NEW: DD Auto-Processing (if deal has DD checklist)
  if (deal.ddChecklist) {
    const log = createLogger('DD-UPLOAD');
    log.info('Auto-processing uploaded document for DD', { docId: docRecord.id, dealId });

    // Queue async processing (don't block upload response)
    setImmediate(async () => {
      try {
        await autoProcessDocument(dealId, docRecord.id, {
          uploadedBy: authUser.id,
          source: 'DATA_ROOM_UPLOAD'
        });
      } catch (error) {
        log.error('DD auto-process failed', { docId: docRecord.id, error: error.message });
      }
    });
  }

  return sendJson(res, 200, { document: docRecord });
}
```

---

## Auto-Processing Pipeline: Smart Read → Match → Approve → Sync

### Complete Document Processing Flow

```
Document Arrives (Email or Upload)
         │
         ▼
┌────────────────────┐
│  1. Smart Read     │  AI extracts document type, key data
│     (LLM Parse)    │  Uses existing smart-parse.js
└────────────────────┘
         │
         ▼
┌────────────────────┐
│  2. DD Match       │  Match to checklist items by:
│     (AI Matching)  │  - Document type
└────────────────────┘  - Keywords
         │              - Semantic similarity
         ▼
┌────────────────────┐
│  3. Pending        │  Create approval record
│     Approval       │  User reviews match suggestion
└────────────────────┘
         │
    User Action
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌────────┐
│ APPROVE│ │ REJECT │
└────────┘ └────────┘
    │
    ▼
┌────────────────────┐
│  4. Cross Off      │  Mark DD item as COMPLETE
│     DD Item        │  Record who approved, when
└────────────────────┘
         │
         ▼
┌────────────────────┐
│  5. Sync to        │  Extract data to underwriting model
│     Living Data    │  Update UnderwritingModel fields
└────────────────────┘
```

### Schema: Pending Document Approvals

```prisma
model DDDocumentApproval {
  id              String    @id @default(uuid())
  dealId          String
  documentId      String    @unique
  checklistId     String

  // Match info
  suggestedItemId String?   // AI-suggested DD item
  suggestedItemCode String?
  matchConfidence Float?
  alternativeMatches String?  // JSON array of other possible matches

  // Status
  status          String    @default("PENDING")  // PENDING, APPROVED, REJECTED, MANUAL_MATCH

  // Resolution
  resolvedItemId  String?   // Actual item matched (may differ from suggested)
  resolvedBy      String?
  resolvedAt      DateTime?
  rejectionReason String?

  // Data extraction
  extractedData   String?   // JSON of extracted values
  syncedToModel   Boolean   @default(false)
  syncedFields    String[]  // Fields updated in UnderwritingModel

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([dealId])
  @@index([checklistId])
  @@index([status])
}
```

### Implementation: Auto-Process Document

```javascript
/**
 * Auto-process uploaded document for DD workflow
 */
export async function autoProcessDocument(dealId, documentId, options = {}) {
  const log = createLogger('DD-AUTO');
  const prisma = getPrisma();

  log.info('Starting auto-process', { dealId, documentId, source: options.source });

  // 1. Get document and parse
  const document = await prisma.document.findUnique({ where: { id: documentId } });
  if (!document) {
    log.error('Document not found', { documentId });
    throw new Error('Document not found');
  }

  // 2. Smart-read the document
  log.debug('Smart-reading document', { documentId, filename: document.filename });
  const parseResult = await smartParseDocument(documentId);

  log.info('Document parsed', {
    documentId,
    type: parseResult.documentType,
    confidence: parseResult.confidence,
    fieldsExtracted: Object.keys(parseResult.data || {}).length
  });

  // 3. Get DD checklist for deal
  const checklist = await prisma.dDChecklist.findUnique({
    where: { dealId },
    include: { items: { include: { templateItem: true } } }
  });

  if (!checklist) {
    log.warn('No DD checklist for deal', { dealId });
    return null;
  }

  // 4. Match to DD items
  const matches = findMatchingDDItems(checklist.items, parseResult);

  log.info('Matches found', {
    documentId,
    matchCount: matches.length,
    topMatch: matches[0]?.item.code,
    topConfidence: matches[0]?.confidence
  });

  // 5. Create pending approval
  const approval = await prisma.dDDocumentApproval.create({
    data: {
      dealId,
      documentId,
      checklistId: checklist.id,
      suggestedItemId: matches[0]?.item.id,
      suggestedItemCode: matches[0]?.item.code,
      matchConfidence: matches[0]?.confidence,
      alternativeMatches: JSON.stringify(matches.slice(1, 5)),
      extractedData: JSON.stringify(parseResult.data),
      status: 'PENDING'
    }
  });

  log.info('Created pending approval', { approvalId: approval.id, documentId });

  // 6. Create notification for user
  await createNotification({
    dealId,
    type: 'DD_DOCUMENT_PENDING',
    title: `New document needs review: ${document.filename}`,
    message: matches.length > 0
      ? `AI suggests matching to: ${matches[0].item.title}`
      : 'Please manually match this document to a DD item',
    metadata: { approvalId: approval.id, documentId }
  });

  return approval;
}

/**
 * Approve document match and cross off DD item
 */
export async function approveDocumentMatch(approvalId, userId, options = {}) {
  const log = createLogger('DD-APPROVE');
  const prisma = getPrisma();

  const { itemId, syncToModel = true } = options;

  log.info('Approving document match', { approvalId, userId, itemId });

  // 1. Get approval record
  const approval = await prisma.dDDocumentApproval.findUnique({
    where: { id: approvalId },
    include: {
      checklist: true
    }
  });

  if (!approval) {
    throw new Error('Approval not found');
  }

  const resolvedItemId = itemId || approval.suggestedItemId;

  // 2. Update approval status
  await prisma.dDDocumentApproval.update({
    where: { id: approvalId },
    data: {
      status: 'APPROVED',
      resolvedItemId,
      resolvedBy: userId,
      resolvedAt: new Date()
    }
  });

  // 3. Mark DD item as complete
  const ddItem = await prisma.dDItem.findUnique({ where: { id: resolvedItemId } });
  if (ddItem) {
    await updateItemStatus(resolvedItemId, 'COMPLETE', userId, `Document verified: ${approval.documentId}`);

    // Link document to item
    await linkDocument(resolvedItemId, approval.documentId, userId);

    log.info('DD item marked complete', { itemId: resolvedItemId, itemCode: ddItem.code });
  }

  // 4. Sync extracted data to living model
  if (syncToModel && approval.extractedData) {
    const syncResult = await syncToUnderwritingModel(
      approval.dealId,
      JSON.parse(approval.extractedData),
      { source: 'DD_DOCUMENT', documentId: approval.documentId }
    );

    await prisma.dDDocumentApproval.update({
      where: { id: approvalId },
      data: {
        syncedToModel: true,
        syncedFields: syncResult.updatedFields
      }
    });

    log.info('Data synced to model', {
      approvalId,
      fieldsUpdated: syncResult.updatedFields.length
    });
  }

  return { success: true };
}

/**
 * Sync extracted data to UnderwritingModel (living data)
 */
async function syncToUnderwritingModel(dealId, extractedData, options = {}) {
  const log = createLogger('DD-SYNC');
  const prisma = getPrisma();

  // Get deal's underwriting model
  const model = await prisma.underwritingModel.findFirst({
    where: { dealId },
    orderBy: { createdAt: 'desc' }
  });

  if (!model) {
    log.warn('No underwriting model found', { dealId });
    return { updatedFields: [] };
  }

  // Map extracted data to model fields
  const fieldMapping = {
    // From T12
    'grossPotentialRent': 'grossPotentialRent',
    'effectiveGrossIncome': 'effectiveGrossIncome',
    'totalOperatingExpenses': 'operatingExpenses',
    'netOperatingIncome': 'noi',

    // From Rent Roll
    'totalUnits': 'units',
    'occupancyRate': 'occupancy',
    'averageRent': 'inPlaceRent',

    // From Loan Terms
    'loanAmount': 'loanAmount',
    'interestRate': 'interestRate',
    'loanTerm': 'loanTermMonths',

    // Add more mappings as needed
  };

  const updates = {};
  const updatedFields = [];

  for (const [extractedField, modelField] of Object.entries(fieldMapping)) {
    if (extractedData[extractedField] !== undefined) {
      updates[modelField] = extractedData[extractedField];
      updatedFields.push(modelField);
    }
  }

  if (updatedFields.length > 0) {
    await prisma.underwritingModel.update({
      where: { id: model.id },
      data: updates
    });

    log.info('Updated underwriting model', { modelId: model.id, fields: updatedFields });
  }

  return { updatedFields };
}
```

---

## Comprehensive Logging

### Logging Pattern

All DD-related code uses structured logging with consistent prefixes:

```javascript
/**
 * Create logger with category prefix
 */
function createLogger(category) {
  const DEBUG = process.env.DEBUG_DD_ASSISTANT === 'true';

  return {
    debug: (message, meta = {}) => {
      if (DEBUG) {
        console.log(`[${new Date().toISOString()}] [DEBUG] [${category}] ${message}`, JSON.stringify(meta));
      }
    },
    info: (message, meta = {}) => {
      console.log(`[${new Date().toISOString()}] [INFO] [${category}] ${message}`, JSON.stringify(meta));
    },
    warn: (message, meta = {}) => {
      console.log(`[${new Date().toISOString()}] [WARN] [${category}] ${message}`, JSON.stringify(meta));
    },
    error: (message, meta = {}) => {
      console.error(`[${new Date().toISOString()}] [ERROR] [${category}] ${message}`, JSON.stringify(meta));
    }
  };
}

// Usage in code:
const log = createLogger('DD-CHECKLIST');
log.info('Initializing checklist', { dealId, itemCount: 116 });
log.debug('Processing item', { itemId, code: 'TITLE_001' });
log.error('Failed to process', { error: err.message, stack: err.stack });
```

### Log Categories

| Category | Description |
|----------|-------------|
| `DD-CHECKLIST` | Core checklist operations |
| `DD-ITEM` | Individual item updates |
| `DD-EMAIL` | Email intake processing |
| `DD-UPLOAD` | Document upload processing |
| `DD-AUTO` | Auto-processing pipeline |
| `DD-APPROVE` | Document approval flow |
| `DD-SYNC` | Living data synchronization |
| `DD-STATE` | State machine blocker checks |
| `DD-AI` | AI matching and suggestions |

### Debug Environment Variables

```env
# Enable all DD debug logging
DEBUG_DD_ASSISTANT=true

# Enable specific components
DEBUG_DD_EMAIL=true
DEBUG_DD_SYNC=true
DEBUG_DD_AI=true
```

---

## Incremental Implementation with Testing

### Increment 1: Schema & Core Models (TEST AFTER)

**Files:**
- `server/prisma/schema.prisma` - Add DD models

**Actions:**
1. Add DDCategory, DDTemplateItem, DDChecklist, DDItem, DDItemHistory, DDDocumentApproval
2. Run `npx prisma validate`
3. Run `npx prisma db push`

**Test:**
```bash
npx prisma validate  # Schema is valid
npx prisma db push   # No errors
```

---

### Increment 2: Seed Data (TEST AFTER)

**Files:**
- `server/prisma/seed-dd-templates.js`

**Actions:**
1. Create seed file with all 116 DD items
2. Include stage-gating (availableFromState) for each item
3. Run seed

**Test:**
```bash
node server/prisma/seed-dd-templates.js
# Verify: SELECT COUNT(*) FROM DDTemplateItem; -- Should be 116
# Verify: SELECT COUNT(*) FROM DDCategory; -- Should be 12
```

---

### Increment 3: Core Service - Basic Functions (TEST AFTER)

**Files:**
- `server/services/ai/dd-checklist-assistant.js`

**Actions:**
1. Implement `initializeChecklist()`
2. Implement `getStageFilteredItems()`
3. Implement `updateItemStatus()`
4. Implement `getDDCompletionStatus()`

**Test File:** `server/services/ai/__tests__/dd-checklist-assistant.test.js`

```bash
npm run test -- server/services/ai/__tests__/dd-checklist-assistant.test.js
# Expect: All core function tests pass
```

---

### Increment 4: State Machine Integration (TEST AFTER)

**Files:**
- `server/services/deal-state-machine.js`

**Actions:**
1. Import `getDDCompletionStatus`
2. Replace stubbed `ddItemsComplete()` with real implementation

**Test:**
```javascript
// Manual test:
// 1. Create deal in DD_ACTIVE state
// 2. Initialize DD checklist
// 3. Try to transition to DD_COMPLETE - should be BLOCKED
// 4. Mark critical items complete
// 5. Try again - should SUCCEED
```

---

### Increment 5: Basic API Routes (TEST AFTER)

**Files:**
- `server/routes/dd-checklist.js`
- `server/index.js`

**Actions:**
1. Add checklist management routes
2. Add item management routes
3. Register in index.js

**Test:**
```bash
# Smoke test endpoints
curl -X POST localhost:8787/api/deals/{id}/dd-checklist/initialize
curl -X GET localhost:8787/api/deals/{id}/dd-checklist
curl -X PATCH localhost:8787/api/deals/{id}/dd-checklist/items/{itemId}
```

---

### Increment 6: Document Auto-Processing (TEST AFTER)

**Files:**
- `server/services/ai/dd-checklist-assistant.js` (add auto-process functions)
- `server/routes/documents.js` (integrate)

**Actions:**
1. Implement `autoProcessDocument()`
2. Implement `approveDocumentMatch()`
3. Implement `syncToUnderwritingModel()`
4. Hook into document upload

**Test:**
```javascript
// Upload a Phase I ESA document
// Verify: Pending approval created
// Verify: Match to ENV_001 item suggested
// Approve match
// Verify: Item marked complete
// Verify: Data synced to model (if applicable)
```

---

### Increment 7: Email Intake (TEST AFTER)

**Files:**
- `server/services/dd-email-intake.js`
- `server/routes/webhooks.js` (add SendGrid handler)

**Actions:**
1. Create email intake service
2. Add webhook endpoint
3. Configure SendGrid Inbound Parse

**Test:**
```bash
# Send test email to deal-{dealId}@docs.canonical.com
# Verify: Document uploaded
# Verify: Pending approval created
```

---

### Increment 8: AI Features (TEST AFTER)

**Files:**
- `server/services/ai/dd-checklist-assistant.js` (add AI functions)

**Actions:**
1. Implement `suggestNextItems()`
2. Implement `detectRisks()`
3. Implement `generateStatusSummary()`

**Test:**
```javascript
// Call suggestNextItems - verify sensible priorities
// Create overdue items - call detectRisks - verify flagged
// Call generateStatusSummary - verify readable output
```

---

### Increment 9: Full E2E Test (TEST AFTER)

**Test Scenario:**
1. Create deal → INTAKE_RECEIVED
2. Upload documents → DATA_ROOM_INGESTED
3. Extract → EXTRACTION_COMPLETE
4. Draft model → UNDERWRITING_DRAFT
5. IC approval → IC_READY → LOI flow → PSA_EXECUTED
6. Initialize DD checklist → DD_ACTIVE
7. Verify only stage-appropriate items visible
8. Upload Phase I ESA via email
9. Approve document match
10. Verify item crossed off
11. Verify data synced to model
12. Complete all critical items
13. Transition → DD_COMPLETE
14. Continue to CLOSED

---

## Verification Checklist

- [ ] Schema validates: `npx prisma validate`
- [ ] Seed data loads all 116 DD items with stage gating
- [ ] `initializeChecklist()` creates items with correct dates
- [ ] `getStageFilteredItems()` only returns stage-appropriate items
- [ ] `getDDCompletionStatus()` returns correct blocker status
- [ ] Deal cannot transition DD_ACTIVE → DD_COMPLETE with critical items incomplete
- [ ] Deal CAN transition when DD requirements met
- [ ] Document upload triggers auto-processing
- [ ] Email intake processes attachments
- [ ] Pending approvals created for matched documents
- [ ] Approval crosses off DD item
- [ ] Extracted data syncs to underwriting model
- [ ] `suggestNextItems()` returns sensible priorities
- [ ] Risk detection flags overdue items
- [ ] All routes respond correctly
- [ ] Logging visible at all stages
- [ ] Unit tests pass for each increment
- [ ] E2E test passes

---

## Files Summary

### New Files
- `server/services/ai/dd-checklist-assistant.js` - Core service + AI
- `server/services/dd-email-intake.js` - Email processing
- `server/routes/dd-checklist.js` - API routes
- `server/prisma/seed-dd-templates.js` - Seed data (116 items)
- `server/services/ai/__tests__/dd-checklist-assistant.test.js` - Tests

### Modified Files
- `server/prisma/schema.prisma` - Add DDCategory, DDTemplateItem, DDChecklist, DDItem, DDItemHistory, DDDocumentApproval
- `server/services/deal-state-machine.js` - Replace stubbed `ddItemsComplete`
- `server/routes/documents.js` - Hook auto-processing
- `server/routes/webhooks.js` - Add email intake webhook
- `server/index.js` - Register new routes
