# Audit Report: Ledger for Facts & Audit-Ready Capital Calls/Distributions

## Executive Summary: VERDICT TABLE

| Capability | Verdict | Summary |
|------------|---------|---------|
| **Event Log** | **PARTIAL PASS** | DealEvent with hash chain exists but not all mutations log events |
| **Versioning** | **PASS** | Clear state machines (DRAFT->BINDING->EXECUTED->EFFECTIVE) for documents, capital calls, distributions |
| **Evidence Links** | **PASS** | Strong provenance: ExtractionClaim, UnderwritingInput, ApprovalRecord all link to source artifacts |
| **Snapshots** | **FAIL** | No first-class Snapshot model. Computed snapshots exist but not persisted/referenced by runs |

---

## KERNEL API AUDIT (cre-kernel-phase1)

The Kernel API is the core "source of truth" layer using PostgreSQL. Here's the detailed audit:

### Kernel Event Model
**File**: [kernel-api/prisma/schema.prisma:151-163](cre-kernel-phase1/apps/kernel-api/prisma/schema.prisma#L151-L163)

| Field | Type | Purpose |
|-------|------|---------|
| id | UUID | Primary key |
| dealId | UUID | Deal reference |
| type | String | AllowedEventTypes enum |
| payload | Json | Event-specific data |
| actorId | UUID? | Actor who performed action |
| authorityContext | Json | Authority rules that permitted action |
| evidenceRefs | String[] | Array of artifact IDs |
| createdAt | DateTime | Server-generated timestamp |

### Kernel Mutation Endpoints Audit

| Endpoint | Handler Line | Creates Event? | Audit Record? | Status |
|----------|--------------|----------------|---------------|--------|
| POST /deals | server.ts:1413 | No | No | **FAIL** - Deal creation unlogged |
| POST /deals/:id/actors | server.ts:1444 | No | No | **FAIL** - Actor assignment unlogged |
| POST /deals/:id/actors/:id/roles | server.ts:1603 | No | No | **FAIL** - Role assignment unlogged |
| POST /deals/:id/events | server.ts:1654 | **YES** | Event table | **PASS** |
| POST /deals/:id/materials | server.ts:2096 | No | MaterialRevision | **PARTIAL** - Revision tracked but no Event |
| PATCH /deals/:id/materials/:id | server.ts:2144 | No | MaterialRevision | **PARTIAL** - Revision tracked but no Event |
| POST /deals/:id/draft/start | server.ts:2211 | No | No | **FAIL** |
| POST /deals/:id/draft/simulate-event | server.ts:2248 | SimulatedEvent | DraftState | **PASS** (draft mode) |
| POST /deals/:id/draft/commit | server.ts:2556 | **YES** (copies simulated) | Event table | **PASS** |
| POST /deals/:id/artifacts | server.ts:2684 | No | No | **FAIL** - Artifact upload unlogged |

### Kernel Strengths

1. **Event-Sourced State**: Deal state is projected from events via `projectDealLifecycle` ([projection.ts](cre-kernel-phase1/apps/kernel-api/src/projection.ts))
2. **Authority Gating**: All gate events require approval threshold check ([server.ts:1741-1773](cre-kernel-phase1/apps/kernel-api/src/server.ts#L1741-L1773))
3. **MaterialRevision History**: Every material update creates a revision ([server.ts:2128-2136, 2192-2200](cre-kernel-phase1/apps/kernel-api/src/server.ts#L2128-L2136))
4. **Computed Snapshots**: `/deals/:id/snapshot` endpoint computes point-in-time state ([server.ts:1929-1955](cre-kernel-phase1/apps/kernel-api/src/server.ts#L1929-L1955))
5. **Draft Mode**: Separate SimulatedEvent/ProjectionGate tables for what-if analysis

### Kernel Weaknesses

1. **No Hash Chain**: Unlike BFF DealEvent, Kernel Event has no previousEventHash/eventHash
2. **No Sequence Number**: Events ordered by createdAt only, no monotonic sequence for gap detection
3. **Missing Audit on Admin Operations**: Deal create, actor create, role assign, artifact upload have no audit trail
4. **No Database Immutability Constraints**: PostgreSQL allows UPDATE/DELETE on Event table

---

## DETAILED FINDINGS

### 1. EVENT/AUDIT LOG INVENTORY

#### A. DealEvent (BFF - Primary Audit Ledger)
**File**: [schema.prisma:939-974](canonical-deal-os/server/prisma/schema.prisma#L939-L974)

```prisma
model DealEvent {
  id                String    @id @default(uuid())
  dealId            String
  eventType         String    // STATE_TRANSITION, CLAIM_VERIFIED, DOCUMENT_GENERATED
  eventData         String    // JSON payload
  actorId           String    // User ID or "SYSTEM"
  actorName         String
  actorRole         String    // GP, ANALYST, LENDER, COUNSEL, SYSTEM
  authorityContext  String    // JSON: { approvals: [...] }
  evidenceRefs      String?   // JSON array of artifact IDs
  sequenceNumber    Int       // Monotonic per deal
  occurredAt        DateTime  @default(now())
  fromState         String?
  toState           String?
  previousEventHash String?   // Hash chain
  eventHash         String    // SHA-256
}
```

**Hash Chain Implementation**: [deal-state-machine.js:595-606](canonical-deal-os/server/services/deal-state-machine.js#L595-L606)
```javascript
calculateEventHash(dealId, sequenceNumber, eventType, eventData, previousHash) {
  const payload = JSON.stringify({
    dealId, sequenceNumber, eventType, eventData,
    previousHash: previousHash || null,
    timestamp: new Date().toISOString()
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}
```

#### B. PermissionAuditLog (Permission Changes)
**File**: [schema.prisma:1667-1686](canonical-deal-os/server/prisma/schema.prisma#L1667-L1686)

Records: actorId, actorName, targetUserId, action, beforeValue, afterValue, reason, timestamp, ipAddress

#### C. ApprovalRecord (Approval Decisions)
**File**: [schema.prisma:1084-1129](canonical-deal-os/server/prisma/schema.prisma#L1084-L1129)

Records: approverId, approverName, approverRole, decision, evidenceDocId, captureMethod, ipAddress

#### D. Kernel Event Model
**File**: [kernel-api/prisma/schema.prisma:151-163](cre-kernel-phase1/apps/kernel-api/prisma/schema.prisma#L151-L163)

```prisma
model Event {
  id               String   @id @default(uuid())
  dealId           String
  type             String
  payload          Json
  actorId          String?
  authorityContext Json
  evidenceRefs     String[]
  createdAt        DateTime @default(now())
}
```

---

### 2. ROUTE/HANDLER COVERAGE AUDIT (Capital Calls & Distributions)

#### Capital Calls Routes ([capital-calls.js](canonical-deal-os/server/routes/capital-calls.js))

| METHOD | PATH | Handler (line) | Ledger Write | Fields Recorded | STATUS |
|--------|------|----------------|--------------|-----------------|--------|
| POST | /api/deals/:dealId/capital-calls | handleCreateCapitalCall:201 | **NONE** | - | **FAIL** |
| POST | /api/.../capital-calls/:callId/issue | handleIssueCapitalCall:286 | ApprovalRecord:320 | dealId, approvalType=CAPITAL_CALL_ISSUANCE, approverId, decision, notes, captureMethod | PASS |
| PATCH | /api/.../capital-calls/:callId | handleUpdateCapitalCall:349 | **NONE** | - | **FAIL** |
| POST | /api/.../capital-calls/:callId/cancel | handleCancelCapitalCall:395 | **NONE** | - | **FAIL** |
| POST | .../wire-initiated | handleMarkWireInitiated:578 | **NONE** | - | **FAIL** |
| POST | .../upload-proof | handleUploadWireProof:646 | **NONE** | - | **FAIL** |
| POST | .../mark-funded | handleMarkFunded:716 | **NONE** | - | **FAIL** |

#### Distributions Routes ([distributions.js](canonical-deal-os/server/routes/distributions.js))

| METHOD | PATH | Handler (line) | Ledger Write | Fields Recorded | STATUS |
|--------|------|----------------|--------------|-----------------|--------|
| POST | /api/deals/:dealId/distributions | handleCreateDistribution:198 | **NONE** | - | **FAIL** |
| POST | .../distributions/:id/approve | handleApproveDistribution:287 | ApprovalRecord:321 | dealId, approvalType=DISTRIBUTION_APPROVAL, approverId, decision, notes | PASS |
| POST | .../distributions/:id/process | handleProcessDistribution:350 | **NONE** | - | **FAIL** |
| POST | .../mark-paid | handleMarkDistributionPaid:413 | PermissionAuditLog:454 | actorId, action=DISTRIBUTION_MARKED_PAID, afterValue (dealId, amount, confirmationRef) | PASS |
| POST | .../distributions/:id/cancel | handleCancelDistribution:486 | **NONE** | - | **FAIL** |

---

### 3. IMMUTABILITY & TAMPER RESISTANCE AUDIT

#### Strengths
1. **Hash Chain**: DealEvent uses SHA-256 previousEventHash + eventHash ([deal-state-machine.js:559-582](canonical-deal-os/server/services/deal-state-machine.js#L559-L582))
2. **Monotonic Sequence**: sequenceNumber is incremented per deal, enables gap detection
3. **Server-Generated Timestamps**: `occurredAt: DateTime @default(now())` - not client-supplied

#### Weaknesses (CRITICAL)

1. **No Database Constraints Against Updates**
   - Schema has no `@immutable` or trigger-based protections
   - SQLite/Postgres allow UPDATE on DealEvent, PermissionAuditLog, ApprovalRecord

2. **Delete Routes in Test/Seed Scripts**
   - [seed-sample-deal.cjs:267](canonical-deal-os/server/scripts/seed-sample-deal.cjs#L267): `await prisma.dealEvent.deleteMany({...})`
   - [doc-factory.test.js:41-42](canonical-deal-os/server/__tests__/doc-factory.test.js#L41-L42): `approvalRecord.deleteMany`, `dealEvent.deleteMany`
   - **Risk**: If these patterns exist in tests, similar patterns could exist or be added to production code

3. **No Admin Delete Prevention**
   - No API routes expose delete for audit tables, but database-level access allows it
   - No row-level security or audit-of-audit

#### Proposed Hardening (Minimal)
```sql
-- PostgreSQL (if migrating from SQLite)
CREATE RULE no_update_deal_event AS ON UPDATE TO "DealEvent" DO INSTEAD NOTHING;
CREATE RULE no_delete_deal_event AS ON DELETE TO "DealEvent" DO INSTEAD NOTHING;

-- Or use triggers that RAISE EXCEPTION on UPDATE/DELETE
```

---

### 4. EVIDENCE LINK AUDIT

#### A. How Inputs Become Claims

**ExtractionClaim** ([schema.prisma:854-893](canonical-deal-os/server/prisma/schema.prisma#L854-L893)):
- `documentId` -> Artifact ID
- `pageNumber`, `boundingBox` (PDF coordinates)
- `cellReference` (Excel: "Sheet1!B15")
- `textSnippet` + `snippetHash` (SHA-256 of extracted text)
- `aiModel`, `aiConfidence`
- Verification: `status`, `verifiedBy`, `verifiedAt`, `correctedValue`

**UnderwritingInput** ([schema.prisma:585-632](canonical-deal-os/server/prisma/schema.prisma#L585-L632)):
- `sourceType`: DOCUMENT, AI_EXTRACTION, EXCEL_IMPORT, HUMAN_ENTRY, CALCULATION
- `documentId`, `documentName`, `documentPage`, `documentCell`
- `aiModel`, `aiConfidence`
- `setBy`, `rationale`
- `formula`, `inputFields` (for calculated values)
- Supersession: `supersededAt`, `supersededBy`

#### B. Example A: Underwriting Input -> Evidence

```
Field: grossPotentialRent = 1,200,000
  └── UnderwritingInput
        ├── sourceType: "AI_EXTRACTION"
        ├── source: "RENT_ROLL"
        ├── documentId: "artifact-uuid-123"
        ├── documentName: "Rent Roll Q4 2025.xlsx"
        ├── documentCell: "Summary!B15"
        ├── aiModel: "gpt-4o"
        ├── aiConfidence: 0.95
        ├── verifiedBy: "user-uuid-456"
        ├── verifiedAt: "2025-01-15T14:30:00Z"
        └── rationale: "Verified against T12 line 4"
```

#### C. Example B: Distribution Approval -> Evidence

```
Distribution: Q4 2025 Cash Distribution ($500,000)
  └── ApprovalRecord
        ├── approvalType: "DISTRIBUTION_APPROVAL"
        ├── approverId: "gp-user-uuid"
        ├── approverName: "Jane Smith"
        ├── approverRole: "GP"
        ├── decision: "APPROVED"
        ├── notes: "Q4 2025 distribution approved per waterfall calc v3"
        ├── captureMethod: "UI"
        ├── ipAddress: "192.168.1.100"
        ├── approvedAt: "2025-01-10T09:00:00Z"
        └── dealEventId: "event-uuid-789" (links to DealEvent for full audit)
```

**Gap**: No `evidencePackId` or `proofpackId` on ApprovalRecord/Distribution for comprehensive evidence bundle reference.

---

### 5. SNAPSHOT AUDIT (MOST CRITICAL - FAIL)

#### Current State: Computed Snapshots Only

**Kernel Snapshot Endpoint**: [server.ts:1929-1955](cre-kernel-phase1/apps/kernel-api/src/server.ts#L1929-L1955)
```typescript
app.get("/deals/:dealId/snapshot", async (request, reply) => {
  const snapshot = await computeSnapshotData(prisma, dealId, atResult.at);
  return reply.code(200).send(snapshot);
});
```

**computeSnapshotData** ([server.ts:739-819](cre-kernel-phase1/apps/kernel-api/src/server.ts#L739-L819)):
- Computes: projection state, approval summary, materials, timeline
- Returns `integrity: { replayFrom: "events+materials", deterministic: true }`
- **Problem**: This is computed on-demand, NOT persisted

#### What's Missing

1. **No Snapshot Model/Table** in either Prisma schema
2. **No snapshotId Reference** on:
   - CapitalCall
   - Distribution
   - WaterfallDistribution calculations
   - EvidencePack (has `asOfTimestamp` but no frozen snapshot ID)

3. **No Cap Table Snapshot**: LP ownership percentages can change; distributions use live `lpActor.ownershipPct`
4. **No GL Close Version**: No accounting period close concept
5. **No Rulebook Hash**: Waterfall rules/authority rules not versioned per calculation

#### Evidence of Gap: Distribution Calculation

[distributions.js:246-252](canonical-deal-os/server/routes/distributions.js#L246-L252):
```javascript
// Uses LIVE lpActor data at calculation time - NOT a snapshot
const lpActors = await prisma.lPActor.findMany({
  where: { dealId, status: 'ACTIVE' }
});
const totalOwnership = lpActors.reduce((sum, lp) => sum + (lp.ownershipPct || 0), 0);
```

If LP ownership changes between distribution creation and payment, there's no frozen snapshot to prove the calculation was correct at issue time.

---

## TOP 10 GAPS (Combined BFF + Kernel)

| # | Layer | Severity | Gap | Exploit/Bug Scenario | Code Evidence | Minimal Patch |
|---|-------|----------|-----|---------------------|---------------|---------------|
| 1 | Both | **CRITICAL** | No Snapshot model | Distribution calculated with outdated cap table; cannot prove correctness during audit | [distributions.js:217-226](canonical-deal-os/server/routes/distributions.js#L217-L226) | Create Snapshot table, freeze LP ownership at distribution creation |
| 2 | Kernel | **HIGH** | Kernel Event has no hash chain | Events can be modified/inserted without detection, unlike BFF DealEvent | [kernel schema:151-163](cre-kernel-phase1/apps/kernel-api/prisma/schema.prisma#L151-L163) | Add previousEventHash, eventHash, sequenceNumber fields to Kernel Event |
| 3 | BFF | **HIGH** | Capital call create has no audit log | GP creates capital call, no record of who/when/what amounts | [capital-calls.js:232-246](canonical-deal-os/server/routes/capital-calls.js#L232-L246) | Add DealEvent on create |
| 4 | BFF | **HIGH** | Capital call cancel has no audit log | Capital calls silently cancelled without audit trail | [capital-calls.js:413-416](canonical-deal-os/server/routes/capital-calls.js#L413-L416) | Add audit record on cancel |
| 5 | BFF | **HIGH** | Distribution create has no audit log | Distribution amounts set without audit record | [distributions.js:229-243](canonical-deal-os/server/routes/distributions.js#L229-L243) | Add DealEvent on create |
| 6 | BFF | **HIGH** | Distribution cancel has no audit log | Distributions silently cancelled | [distributions.js:504-507](canonical-deal-os/server/routes/distributions.js#L504-L507) | Add audit record on cancel |
| 7 | Kernel | **HIGH** | Deal/Actor/Artifact creation unlogged | Admin creates deals/actors with no audit trail | [server.ts:1413, 1444, 2684](cre-kernel-phase1/apps/kernel-api/src/server.ts#L1413) | Add Event record on create operations |
| 8 | BFF | **MEDIUM** | Mark funded has no audit log | Capital call funding confirmation without audit | [capital-calls.js:732-738](canonical-deal-os/server/routes/capital-calls.js#L732-L738) | Add PermissionAuditLog like distributions |
| 9 | Both | **MEDIUM** | No DB constraints on audit tables | Admin can UPDATE/DELETE audit records in both DBs | Schema has no immutability constraints | Add database rules/triggers (PostgreSQL + SQLite) |
| 10 | Kernel | **MEDIUM** | Material mutations don't create Events | Material create/update tracked via MaterialRevision but not Event ledger | [server.ts:2096, 2144](cre-kernel-phase1/apps/kernel-api/src/server.ts#L2096) | Add Event when material truth changes |

---

## PROPOSED SNAPSHOT DESIGN (Minimal Implementation)

### A. Snapshot Schema

```prisma
model Snapshot {
  id              String    @id @default(uuid())
  dealId          String

  // Type of snapshot
  snapshotType    String    // CAP_TABLE, DISTRIBUTION_CALC, CAPITAL_CALL_CALC, PERIOD_CLOSE

  // Frozen data
  lpOwnership     String    // JSON: [{ lpActorId, entityName, ownershipPct, commitment }]
  waterfallRules  String?   // JSON: waterfall structure at this point
  authorityRules  String?   // JSON: authority rules at this point

  // Reference hashes
  capTableHash    String    // SHA-256 of lpOwnership JSON
  rulebookHash    String?   // SHA-256 of rules if applicable

  // Metadata
  createdAt       DateTime  @default(now())
  createdBy       String
  createdByName   String?
  reason          String?   // "Distribution Q4 2025", "Capital Call #3"

  // Link to what uses this snapshot
  distributionId  String?
  capitalCallId   String?

  @@index([dealId])
  @@index([snapshotType])
  @@index([distributionId])
  @@index([capitalCallId])
}
```

### B. Create Snapshot on Distribution/Capital Call

```javascript
// In handleCreateDistribution, before calculating allocations:
const lpActors = await prisma.lPActor.findMany({
  where: { dealId, status: 'ACTIVE' }
});

const lpOwnership = lpActors.map(lp => ({
  lpActorId: lp.id,
  entityName: lp.entityName,
  ownershipPct: lp.ownershipPct,
  commitment: lp.commitment
}));

const capTableHash = crypto.createHash('sha256')
  .update(JSON.stringify(lpOwnership))
  .digest('hex');

const snapshot = await prisma.snapshot.create({
  data: {
    dealId,
    snapshotType: 'DISTRIBUTION_CALC',
    lpOwnership: JSON.stringify(lpOwnership),
    capTableHash,
    createdBy: userId,
    createdByName: userName,
    reason: `Distribution: ${body.title}`
  }
});

// Store snapshotId on Distribution
const distribution = await prisma.distribution.create({
  data: {
    ...existingData,
    snapshotId: snapshot.id  // Add this field to Distribution model
  }
});
```

### C. Reference snapshotId in Calculations

Add `snapshotId String?` to:
- Distribution model
- CapitalCall model
- WaterfallDistribution model

### D. Minimal Migration Plan

1. Add Snapshot model to schema.prisma
2. Add snapshotId to Distribution, CapitalCall
3. Run `prisma db push` / migration
4. Update handleCreateDistribution to create snapshot first
5. Update handleCreateCapitalCall to create snapshot first
6. Backfill existing records with NULL snapshotId (acceptable for pre-audit data)

---

## VERIFICATION SECTION

### How to Test Changes End-to-End

1. **Create a distribution with snapshot**:
   ```bash
   curl -X POST http://localhost:8787/api/deals/{dealId}/distributions \
     -H "Authorization: Bearer {token}" \
     -H "Content-Type: application/json" \
     -d '{"title":"Q1 2026","totalAmount":100000,"distributionDate":"2026-03-31"}'
   ```
   Verify: Response includes `snapshotId`

2. **Verify snapshot is frozen**:
   ```bash
   # Modify LP ownership
   # Re-query distribution
   # Confirm snapshot.lpOwnership still has original values
   ```

3. **Audit log verification**:
   ```bash
   curl http://localhost:8787/api/deals/{dealId}/events?type=DISTRIBUTION_CREATED
   ```
   Verify: Event exists with actorId, amount, snapshotId

4. **Reproducibility test**:
   ```bash
   # Get snapshot by ID
   curl http://localhost:8787/api/snapshots/{snapshotId}
   # Recalculate allocations from frozen lpOwnership
   # Compare to stored allocations - must match
   ```

---

## IMPLEMENTATION PLAN (Bottom-Up)

### Phase 1: Schema Foundation (Kernel + BFF)
**Goal**: Add missing schema elements that everything else depends on

#### 1.1 Kernel: Add hash chain fields to Event model
**File**: `cre-kernel-phase1/apps/kernel-api/prisma/schema.prisma`

```prisma
model Event {
  id               String   @id @default(uuid()) @db.Uuid
  dealId           String   @db.Uuid
  type             String
  payload          Json
  actorId          String?  @db.Uuid
  authorityContext Json
  evidenceRefs     String[]

  // NEW: Hash chain for tamper detection (matching BFF DealEvent)
  sequenceNumber     Int      @default(0)
  previousEventHash  String?
  eventHash          String?

  createdAt        DateTime @default(now())

  deal  Deal   @relation(fields: [dealId], references: [id])
  actor Actor? @relation(fields: [actorId], references: [id])

  @@index([dealId, sequenceNumber])
}
```

#### 1.2 BFF: Add Snapshot model
**File**: `canonical-deal-os/server/prisma/schema.prisma`

```prisma
// Frozen point-in-time state for reproducible calculations
model Snapshot {
  id              String    @id @default(uuid())
  dealId          String

  snapshotType    String    // CAP_TABLE, DISTRIBUTION_CALC, CAPITAL_CALL_CALC

  // Frozen LP ownership at snapshot time
  lpOwnership     String    // JSON: [{ lpActorId, entityName, ownershipPct, commitment }]
  capTableHash    String    // SHA-256 of lpOwnership JSON

  // Optional frozen rules
  waterfallRules  String?   // JSON: waterfall structure
  rulebookHash    String?   // SHA-256 of rules

  // Metadata
  createdAt       DateTime  @default(now())
  createdBy       String
  createdByName   String?
  reason          String?   // "Distribution Q4 2025"

  @@index([dealId])
  @@index([snapshotType])
}
```

#### 1.3 BFF: Add snapshotId to Distribution and CapitalCall
**File**: `canonical-deal-os/server/prisma/schema.prisma`

Add to Distribution model:
```prisma
  snapshotId      String?   // Reference to frozen cap table state
```

Add to CapitalCall model:
```prisma
  snapshotId      String?   // Reference to frozen cap table state
```

---

### Phase 2: Kernel Audit Service
**Goal**: Create reusable function for logging events with hash chain

#### 2.1 Create `createAuditEvent` helper
**File**: `cre-kernel-phase1/apps/kernel-api/src/audit.ts` (NEW)

```typescript
import { createHash } from 'node:crypto';

export async function createAuditEvent(
  prisma: PrismaClientType,
  dealId: string,
  type: string,
  payload: Record<string, unknown>,
  actorId: string | null,
  authorityContext: Record<string, unknown> = {},
  evidenceRefs: string[] = []
) {
  // Get previous event for hash chain
  const previousEvent = await prisma.event.findFirst({
    where: { dealId },
    orderBy: [{ sequenceNumber: 'desc' }, { createdAt: 'desc' }],
    select: { sequenceNumber: true, eventHash: true }
  });

  const sequenceNumber = (previousEvent?.sequenceNumber ?? 0) + 1;

  // Calculate hash
  const hashPayload = JSON.stringify({
    dealId,
    sequenceNumber,
    type,
    payload,
    previousHash: previousEvent?.eventHash || null,
    timestamp: new Date().toISOString()
  });
  const eventHash = createHash('sha256').update(hashPayload).digest('hex');

  return prisma.event.create({
    data: {
      dealId,
      type,
      payload,
      actorId,
      authorityContext,
      evidenceRefs,
      sequenceNumber,
      previousEventHash: previousEvent?.eventHash || null,
      eventHash
    }
  });
}
```

---

### Phase 3: BFF Audit Service
**Goal**: Create reusable function for logging DealEvents (already has hash chain)

#### 3.1 Extract and refactor existing hash chain logic
**File**: `canonical-deal-os/server/services/audit-service.js` (NEW)

```javascript
import crypto from 'node:crypto';
import { getPrisma } from '../db.js';

/**
 * Create an audited DealEvent with hash chain
 */
export async function createDealEvent(dealId, eventType, eventData, actor, options = {}) {
  const prisma = getPrisma();

  const previousEvent = await prisma.dealEvent.findFirst({
    where: { dealId },
    orderBy: { sequenceNumber: 'desc' }
  });

  const sequenceNumber = (previousEvent?.sequenceNumber || 0) + 1;

  const hashPayload = JSON.stringify({
    dealId,
    sequenceNumber,
    eventType,
    eventData,
    previousHash: previousEvent?.eventHash || null,
    timestamp: new Date().toISOString()
  });
  const eventHash = crypto.createHash('sha256').update(hashPayload).digest('hex');

  return prisma.dealEvent.create({
    data: {
      dealId,
      eventType,
      eventData: JSON.stringify(eventData),
      actorId: actor.id,
      actorName: actor.name || 'Unknown',
      actorRole: actor.role || 'SYSTEM',
      authorityContext: JSON.stringify(options.authorityContext || {}),
      evidenceRefs: options.evidenceRefs ? JSON.stringify(options.evidenceRefs) : null,
      sequenceNumber,
      previousEventHash: previousEvent?.eventHash || null,
      eventHash
    }
  });
}

/**
 * Create a snapshot of LP ownership for a deal
 */
export async function createCapTableSnapshot(dealId, snapshotType, reason, actor) {
  const prisma = getPrisma();

  const lpActors = await prisma.lPActor.findMany({
    where: { dealId, status: 'ACTIVE' },
    select: { id: true, entityName: true, ownershipPct: true, commitment: true }
  });

  const lpOwnership = lpActors.map(lp => ({
    lpActorId: lp.id,
    entityName: lp.entityName,
    ownershipPct: lp.ownershipPct,
    commitment: lp.commitment
  }));

  const capTableHash = crypto.createHash('sha256')
    .update(JSON.stringify(lpOwnership))
    .digest('hex');

  return prisma.snapshot.create({
    data: {
      dealId,
      snapshotType,
      lpOwnership: JSON.stringify(lpOwnership),
      capTableHash,
      createdBy: actor.id,
      createdByName: actor.name,
      reason
    }
  });
}
```

---

### Phase 4: Capital Calls - Wire Up Audit + Snapshots
**File**: `canonical-deal-os/server/routes/capital-calls.js`

#### 4.1 Import audit service
```javascript
import { createDealEvent, createCapTableSnapshot } from '../services/audit-service.js';
```

#### 4.2 Update handleCreateCapitalCall (line ~232)
Add after creating capital call:
```javascript
// Create snapshot of cap table
const snapshot = await createCapTableSnapshot(
  dealId,
  'CAPITAL_CALL_CALC',
  `Capital Call: ${body.title}`,
  authUser
);

// Update capital call with snapshotId
await prisma.capitalCall.update({
  where: { id: capitalCall.id },
  data: { snapshotId: snapshot.id }
});

// Record audit event
await createDealEvent(dealId, 'CAPITAL_CALL_CREATED', {
  capitalCallId: capitalCall.id,
  title: capitalCall.title,
  totalAmount: capitalCall.totalAmount,
  snapshotId: snapshot.id,
  allocations: allocations.map(a => ({ lpActorId: a.lpActorId, amount: a.amount }))
}, authUser);
```

#### 4.3 Update handleCancelCapitalCall (line ~395)
Add after updating status:
```javascript
await createDealEvent(dealId, 'CAPITAL_CALL_CANCELLED', {
  capitalCallId: callId,
  previousStatus: capitalCall.status,
  reason: body?.reason || 'No reason provided'
}, authUser);
```

#### 4.4 Update handleMarkWireInitiated (line ~578)
Add after updating allocation:
```javascript
await createDealEvent(dealId, 'WIRE_INITIATED', {
  capitalCallId: callId,
  allocationId: allocation.id,
  lpActorId: lpActor.id,
  lpEntityName: lpActor.entityName,
  wireReference: body?.wireReference || null
}, { id: authUser.id, name: authUser.name, role: 'LP' });
```

#### 4.5 Update handleMarkFunded (line ~716)
Add after updating allocation:
```javascript
await createDealEvent(dealId, 'CAPITAL_CALL_FUNDED', {
  capitalCallId: callId,
  allocationId: allocationId,
  fundedAmount: updated.fundedAmount,
  confirmationRef: body?.confirmationRef || null
}, authUser);
```

---

### Phase 5: Distributions - Wire Up Audit + Snapshots
**File**: `canonical-deal-os/server/routes/distributions.js`

#### 5.1 Import audit service
```javascript
import { createDealEvent, createCapTableSnapshot } from '../services/audit-service.js';
```

#### 5.2 Update handleCreateDistribution (line ~229)
Add after creating distribution:
```javascript
// Create snapshot of cap table
const snapshot = await createCapTableSnapshot(
  dealId,
  'DISTRIBUTION_CALC',
  `Distribution: ${body.title}`,
  authUser
);

// Update distribution with snapshotId
await prisma.distribution.update({
  where: { id: distribution.id },
  data: { snapshotId: snapshot.id }
});

// Record audit event
await createDealEvent(dealId, 'DISTRIBUTION_CREATED', {
  distributionId: distribution.id,
  title: distribution.title,
  totalAmount: distribution.totalAmount,
  snapshotId: snapshot.id,
  allocations: allocations.map(a => ({
    lpActorId: a.lpActorId,
    grossAmount: a.grossAmount,
    netAmount: a.netAmount
  }))
}, authUser);
```

#### 5.3 Update handleProcessDistribution (line ~350)
Add after updating status:
```javascript
await createDealEvent(dealId, 'DISTRIBUTION_PROCESSING_STARTED', {
  distributionId: distributionId,
  allocationCount: allAllocations.length,
  totalAmount: distribution.totalAmount
}, authUser);
```

#### 5.4 Update handleCancelDistribution (line ~486)
Add after updating status:
```javascript
await createDealEvent(dealId, 'DISTRIBUTION_CANCELLED', {
  distributionId: distributionId,
  previousStatus: distribution.status,
  reason: body?.reason || 'No reason provided'
}, authUser);
```

---

### Phase 6: Kernel Admin Operations - Add Event Logging
**File**: `cre-kernel-phase1/apps/kernel-api/src/server.ts`

#### 6.1 Import audit helper
```typescript
import { createAuditEvent } from './audit';
```

#### 6.2 Update POST /deals (line ~1413)
Add after creating deal:
```typescript
await createAuditEvent(prisma, created.id, 'DealCreated', {
  name: created.name,
  state: created.state
}, null, {}, []);
```

#### 6.3 Update POST /deals/:id/actors (line ~1444)
Add after creating actor:
```typescript
await createAuditEvent(prisma, dealId, 'ActorAdded', {
  actorId: created.id,
  name: created.name,
  type: created.type
}, null, {}, []);
```

#### 6.4 Update POST /deals/:id/actors/:id/roles (line ~1603)
Add after assigning role:
```typescript
await createAuditEvent(prisma, dealId, 'RoleAssigned', {
  actorId: actorId,
  roleId: role.id,
  roleName: role.name
}, actorId, {}, []);
```

#### 6.5 Update POST /deals/:id/artifacts (line ~2684)
Add after creating artifact:
```typescript
await createAuditEvent(prisma, dealId, 'ArtifactUploaded', {
  artifactId: artifact.id,
  filename: artifact.filename,
  mimeType: artifact.mimeType,
  sizeBytes: artifact.sizeBytes,
  sha256Hex: artifact.sha256Hex
}, uploaderId, {}, [artifact.id]);
```

#### 6.6 Update POST /deals/:id/materials (line ~2096)
Add after creating material:
```typescript
await createAuditEvent(prisma, dealId, 'MaterialCreated', {
  materialId: material.id,
  type: material.type,
  truthClass: material.truthClass
}, null, {}, bodyResult.data.evidenceRefs);
```

#### 6.7 Update PATCH /deals/:id/materials/:id (line ~2144)
Add after updating material:
```typescript
await createAuditEvent(prisma, dealId, 'MaterialUpdated', {
  materialId: updated.id,
  type: updated.type,
  previousTruthClass: material.truthClass,
  newTruthClass: updated.truthClass
}, null, {}, bodyResult.data.evidenceRefs || []);
```

---

### Phase 7: Run Migrations

```bash
# Kernel (PostgreSQL)
cd cre-kernel-phase1
npx prisma migrate dev --name add-event-hash-chain

# BFF (SQLite)
cd canonical-deal-os
npx prisma db push
# or: npx prisma migrate dev --name add-snapshot-model
```

---

### Phase 8: Verification

1. **Test Kernel hash chain**:
   ```bash
   # Create a deal
   curl -X POST http://localhost:3001/deals -d '{"name":"Test Deal"}'
   # Get events
   curl http://localhost:3001/deals/{id}/events
   # Verify: sequenceNumber increments, eventHash/previousEventHash present
   ```

2. **Test BFF snapshot on distribution**:
   ```bash
   curl -X POST http://localhost:8787/api/deals/{id}/distributions \
     -H "Authorization: Bearer {token}" \
     -d '{"title":"Test","totalAmount":10000,"distributionDate":"2026-06-01"}'
   # Verify: response includes snapshotId
   # Verify: DealEvent with type=DISTRIBUTION_CREATED exists
   ```

3. **Test reproducibility**:
   ```bash
   # Get snapshot
   curl http://localhost:8787/api/snapshots/{snapshotId}
   # Modify LP ownership
   # Recalculate from snapshot.lpOwnership
   # Verify: matches original allocations
   ```

---

## FILES TO MODIFY

| File | Changes |
|------|---------|
| `cre-kernel-phase1/apps/kernel-api/prisma/schema.prisma` | Add sequenceNumber, previousEventHash, eventHash to Event |
| `cre-kernel-phase1/apps/kernel-api/src/audit.ts` | NEW: createAuditEvent helper |
| `cre-kernel-phase1/apps/kernel-api/src/server.ts` | Add audit calls to 7 endpoints |
| `canonical-deal-os/server/prisma/schema.prisma` | Add Snapshot model, snapshotId to Distribution/CapitalCall |
| `canonical-deal-os/server/services/audit-service.js` | NEW: createDealEvent, createCapTableSnapshot |
| `canonical-deal-os/server/routes/capital-calls.js` | Add audit calls to 4 endpoints |
| `canonical-deal-os/server/routes/distributions.js` | Add audit calls to 4 endpoints |

---

## PHASE 2: REMAINING GAPS IMPLEMENTATION

The following gaps remain after Phase 1 implementation:
1. Database-level immutability (prevent UPDATE/DELETE on audit tables)
2. Waterfall rules snapshotting (for reproducible distribution calculations)
3. Accounting period close/lock (GL close concept)
4. Unified audit query (bridge BFF DealEvent and Kernel Event)

---

### Gap 1: Database Immutability Rules

**Goal**: Prevent UPDATE/DELETE on audit tables at the database level

#### 1.1 Kernel (PostgreSQL) - Create migration file
**File**: `cre-kernel-phase1/apps/kernel-api/prisma/migrations/YYYYMMDD_audit_immutability/migration.sql`

```sql
-- Prevent UPDATE on Event table
CREATE OR REPLACE FUNCTION prevent_event_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'UPDATE not allowed on Event table - audit records are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_update_event
  BEFORE UPDATE ON "Event"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_event_update();

-- Prevent DELETE on Event table
CREATE OR REPLACE FUNCTION prevent_event_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'DELETE not allowed on Event table - audit records are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_delete_event
  BEFORE DELETE ON "Event"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_event_delete();
```

#### 1.2 BFF (SQLite) - Create migration triggers
**File**: `canonical-deal-os/server/prisma/migrations/YYYYMMDD_audit_immutability/migration.sql`

```sql
-- SQLite trigger to prevent UPDATE on DealEvent
CREATE TRIGGER IF NOT EXISTS no_update_deal_event
BEFORE UPDATE ON DealEvent
BEGIN
  SELECT RAISE(ABORT, 'UPDATE not allowed on DealEvent table - audit records are immutable');
END;

-- SQLite trigger to prevent DELETE on DealEvent
CREATE TRIGGER IF NOT EXISTS no_delete_deal_event
BEFORE DELETE ON DealEvent
BEGIN
  SELECT RAISE(ABORT, 'DELETE not allowed on DealEvent table - audit records are immutable');
END;

-- SQLite trigger to prevent UPDATE on Snapshot
CREATE TRIGGER IF NOT EXISTS no_update_snapshot
BEFORE UPDATE ON Snapshot
BEGIN
  SELECT RAISE(ABORT, 'UPDATE not allowed on Snapshot table - audit records are immutable');
END;

-- SQLite trigger to prevent DELETE on Snapshot
CREATE TRIGGER IF NOT EXISTS no_delete_snapshot
BEFORE DELETE ON Snapshot
BEGIN
  SELECT RAISE(ABORT, 'DELETE not allowed on Snapshot table - audit records are immutable');
END;

-- SQLite trigger to prevent UPDATE on ApprovalRecord
CREATE TRIGGER IF NOT EXISTS no_update_approval_record
BEFORE UPDATE ON ApprovalRecord
BEGIN
  SELECT RAISE(ABORT, 'UPDATE not allowed on ApprovalRecord table - audit records are immutable');
END;

-- SQLite trigger to prevent DELETE on ApprovalRecord
CREATE TRIGGER IF NOT EXISTS no_delete_approval_record
BEFORE DELETE ON ApprovalRecord
BEGIN
  SELECT RAISE(ABORT, 'DELETE not allowed on ApprovalRecord table - audit records are immutable');
END;

-- SQLite trigger to prevent UPDATE on PermissionAuditLog
CREATE TRIGGER IF NOT EXISTS no_update_permission_audit_log
BEFORE UPDATE ON PermissionAuditLog
BEGIN
  SELECT RAISE(ABORT, 'UPDATE not allowed on PermissionAuditLog table - audit records are immutable');
END;

-- SQLite trigger to prevent DELETE on PermissionAuditLog
CREATE TRIGGER IF NOT EXISTS no_delete_permission_audit_log
BEFORE DELETE ON PermissionAuditLog
BEGIN
  SELECT RAISE(ABORT, 'DELETE not allowed on PermissionAuditLog table - audit records are immutable');
END;
```

---

### Gap 2: Waterfall Rules Snapshotting

**Goal**: Freeze waterfall structure at distribution creation for reproducibility

#### 2.1 Update audit-service.js to capture waterfall rules
**File**: `canonical-deal-os/server/services/audit-service.js`

Add new function `createDistributionSnapshot`:

```javascript
/**
 * Create a snapshot of cap table AND waterfall rules for distribution
 */
export async function createDistributionSnapshot(dealId, reason, actor) {
  const prisma = getPrisma();

  // Get LP ownership
  const lpActors = await prisma.lPActor.findMany({
    where: { dealId, status: 'ACTIVE' },
    select: {
      id: true,
      entityName: true,
      ownershipPct: true,
      commitment: true,
      capitalContributed: true,
      capitalRemaining: true
    }
  });

  const lpOwnership = lpActors.map(lp => ({
    lpActorId: lp.id,
    entityName: lp.entityName,
    ownershipPct: lp.ownershipPct,
    commitment: lp.commitment,
    capitalContributed: lp.capitalContributed,
    capitalRemaining: lp.capitalRemaining
  }));

  const capTableHash = crypto.createHash('sha256')
    .update(JSON.stringify(lpOwnership))
    .digest('hex');

  // Get waterfall structure if it exists
  const waterfallStructure = await prisma.waterfallStructure.findUnique({
    where: { dealId }
  });

  let waterfallRules = null;
  let rulebookHash = null;

  if (waterfallStructure) {
    waterfallRules = {
      lpEquity: waterfallStructure.lpEquity,
      gpEquity: waterfallStructure.gpEquity,
      preferredReturn: waterfallStructure.preferredReturn,
      promoteTiers: JSON.parse(waterfallStructure.promoteTiers),
      gpCatchUp: waterfallStructure.gpCatchUp,
      catchUpPercent: waterfallStructure.catchUpPercent,
      lookback: waterfallStructure.lookback
    };

    rulebookHash = crypto.createHash('sha256')
      .update(JSON.stringify(waterfallRules))
      .digest('hex');
  }

  return prisma.snapshot.create({
    data: {
      dealId,
      snapshotType: 'DISTRIBUTION_CALC',
      lpOwnership: JSON.stringify(lpOwnership),
      capTableHash,
      waterfallRules: waterfallRules ? JSON.stringify(waterfallRules) : null,
      rulebookHash,
      createdBy: actor.id || 'SYSTEM',
      createdByName: actor.name || 'Unknown',
      reason
    }
  });
}
```

#### 2.2 Update distributions.js to use new snapshot function
**File**: `canonical-deal-os/server/routes/distributions.js`

Change import:
```javascript
import { createDealEvent, createDistributionSnapshot } from "../services/audit-service.js";
```

Change snapshot creation (around line 269):
```javascript
// Create snapshot of cap table AND waterfall rules for reproducibility
const snapshot = await createDistributionSnapshot(
  dealId,
  `Distribution: ${body.title}`,
  { id: userId, name: userName }
);
```

---

### Gap 3: Accounting Period Model

**Goal**: Implement GL close/lock functionality with accounting periods

#### 3.1 Add AccountingPeriod model to BFF schema
**File**: `canonical-deal-os/server/prisma/schema.prisma`

```prisma
// Accounting period for GL close functionality
model AccountingPeriod {
  id              String    @id @default(uuid())
  dealId          String

  // Period identification
  year            Int
  quarter         Int       // 1, 2, 3, 4 (0 = annual)
  periodType      String    // QUARTERLY, ANNUAL

  // Period boundaries
  startDate       DateTime
  endDate         DateTime

  // Close status
  status          String    @default("OPEN")  // OPEN, SOFT_CLOSE, HARD_CLOSE

  // Close workflow
  softClosedAt    DateTime?
  softClosedBy    String?
  softClosedByName String?
  hardClosedAt    DateTime?
  hardClosedBy    String?
  hardClosedByName String?

  // Snapshot at close (references cap table + waterfall state)
  closeSnapshotId String?

  // Metadata
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  notes           String?

  @@unique([dealId, year, quarter])
  @@index([dealId, status])
  @@index([dealId, year])
}
```

#### 3.2 Add periodId to Distribution and CapitalCall
**File**: `canonical-deal-os/server/prisma/schema.prisma`

Add to Distribution model:
```prisma
  periodId        String?   // Reference to accounting period
```

Add to CapitalCall model:
```prisma
  periodId        String?   // Reference to accounting period
```

#### 3.3 Create accounting-periods.js routes
**File**: `canonical-deal-os/server/routes/accounting-periods.js` (NEW)

```javascript
import { getPrisma } from "../db.js";
import { extractAuthUser } from "./auth.js";
import { createDealEvent, createDistributionSnapshot } from "../services/audit-service.js";

/**
 * List accounting periods for a deal
 * GET /api/deals/:dealId/accounting-periods
 */
export async function handleListAccountingPeriods(req, res, dealId) {
  const authUser = await extractAuthUser(req);
  if (!authUser) {
    return sendError(res, 401, "Not authenticated");
  }

  const prisma = getPrisma();

  const periods = await prisma.accountingPeriod.findMany({
    where: { dealId },
    orderBy: [{ year: 'desc' }, { quarter: 'desc' }]
  });

  sendJson(res, 200, { periods });
}

/**
 * Create a new accounting period
 * POST /api/deals/:dealId/accounting-periods
 */
export async function handleCreateAccountingPeriod(req, res, dealId, readJsonBody) {
  const authUser = await requireGP(req, res);
  if (!authUser) return;

  const body = await readJsonBody(req);

  if (!body?.year || body?.quarter === undefined) {
    return sendError(res, 400, "year and quarter are required");
  }

  const prisma = getPrisma();

  // Calculate period boundaries
  const startDate = body.quarter === 0
    ? new Date(body.year, 0, 1)
    : new Date(body.year, (body.quarter - 1) * 3, 1);

  const endDate = body.quarter === 0
    ? new Date(body.year, 11, 31, 23, 59, 59)
    : new Date(body.year, body.quarter * 3, 0, 23, 59, 59);

  const period = await prisma.accountingPeriod.create({
    data: {
      dealId,
      year: body.year,
      quarter: body.quarter,
      periodType: body.quarter === 0 ? 'ANNUAL' : 'QUARTERLY',
      startDate,
      endDate,
      status: 'OPEN',
      notes: body.notes || null
    }
  });

  await createDealEvent(dealId, 'ACCOUNTING_PERIOD_CREATED', {
    periodId: period.id,
    year: period.year,
    quarter: period.quarter,
    periodType: period.periodType
  }, { id: authUser.id, name: authUser.name, role: authUser.role });

  sendJson(res, 201, { period });
}

/**
 * Soft close an accounting period (preliminary close, allows corrections)
 * POST /api/deals/:dealId/accounting-periods/:periodId/soft-close
 */
export async function handleSoftClosePeriod(req, res, dealId, periodId) {
  const authUser = await requireGP(req, res);
  if (!authUser) return;

  const prisma = getPrisma();

  const period = await prisma.accountingPeriod.findFirst({
    where: { id: periodId, dealId }
  });

  if (!period) {
    return sendError(res, 404, "Accounting period not found");
  }

  if (period.status !== 'OPEN') {
    return sendError(res, 400, `Cannot soft-close period with status ${period.status}`);
  }

  const updated = await prisma.accountingPeriod.update({
    where: { id: periodId },
    data: {
      status: 'SOFT_CLOSE',
      softClosedAt: new Date(),
      softClosedBy: authUser.id,
      softClosedByName: authUser.name
    }
  });

  await createDealEvent(dealId, 'ACCOUNTING_PERIOD_SOFT_CLOSED', {
    periodId: period.id,
    year: period.year,
    quarter: period.quarter,
    closedBy: authUser.id,
    closedByName: authUser.name
  }, { id: authUser.id, name: authUser.name, role: authUser.role });

  sendJson(res, 200, { period: updated });
}

/**
 * Hard close an accounting period (final close, creates snapshot, prevents changes)
 * POST /api/deals/:dealId/accounting-periods/:periodId/hard-close
 */
export async function handleHardClosePeriod(req, res, dealId, periodId) {
  const authUser = await requireGP(req, res);
  if (!authUser) return;

  const prisma = getPrisma();

  const period = await prisma.accountingPeriod.findFirst({
    where: { id: periodId, dealId }
  });

  if (!period) {
    return sendError(res, 404, "Accounting period not found");
  }

  if (period.status === 'HARD_CLOSE') {
    return sendError(res, 400, "Period is already hard-closed");
  }

  // Create final snapshot at close
  const snapshot = await createDistributionSnapshot(
    dealId,
    `Period Close: ${period.year} Q${period.quarter}`,
    { id: authUser.id, name: authUser.name }
  );

  const updated = await prisma.accountingPeriod.update({
    where: { id: periodId },
    data: {
      status: 'HARD_CLOSE',
      hardClosedAt: new Date(),
      hardClosedBy: authUser.id,
      hardClosedByName: authUser.name,
      closeSnapshotId: snapshot.id
    }
  });

  await createDealEvent(dealId, 'ACCOUNTING_PERIOD_HARD_CLOSED', {
    periodId: period.id,
    year: period.year,
    quarter: period.quarter,
    closedBy: authUser.id,
    closedByName: authUser.name,
    snapshotId: snapshot.id
  }, { id: authUser.id, name: authUser.name, role: authUser.role });

  sendJson(res, 200, { period: updated, snapshotId: snapshot.id });
}

/**
 * Reopen a soft-closed period (not hard-closed)
 * POST /api/deals/:dealId/accounting-periods/:periodId/reopen
 */
export async function handleReopenPeriod(req, res, dealId, periodId, readJsonBody) {
  const authUser = await requireGP(req, res);
  if (!authUser) return;

  const body = await readJsonBody(req);
  const prisma = getPrisma();

  const period = await prisma.accountingPeriod.findFirst({
    where: { id: periodId, dealId }
  });

  if (!period) {
    return sendError(res, 404, "Accounting period not found");
  }

  if (period.status === 'HARD_CLOSE') {
    return sendError(res, 400, "Cannot reopen hard-closed period - this requires admin override");
  }

  if (period.status === 'OPEN') {
    return sendError(res, 400, "Period is already open");
  }

  const updated = await prisma.accountingPeriod.update({
    where: { id: periodId },
    data: {
      status: 'OPEN',
      softClosedAt: null,
      softClosedBy: null,
      softClosedByName: null
    }
  });

  await createDealEvent(dealId, 'ACCOUNTING_PERIOD_REOPENED', {
    periodId: period.id,
    year: period.year,
    quarter: period.quarter,
    reopenedBy: authUser.id,
    reopenedByName: authUser.name,
    reason: body?.reason || 'No reason provided'
  }, { id: authUser.id, name: authUser.name, role: authUser.role });

  sendJson(res, 200, { period: updated });
}
```

#### 3.4 Add period validation middleware
**File**: `canonical-deal-os/server/services/period-guard.js` (NEW)

```javascript
import { getPrisma } from "../db.js";

/**
 * Check if a transaction date falls within a closed accounting period
 * Returns { allowed: boolean, reason?: string }
 */
export async function checkPeriodOpen(dealId, transactionDate) {
  const prisma = getPrisma();
  const txDate = new Date(transactionDate);

  // Find the accounting period this date falls into
  const period = await prisma.accountingPeriod.findFirst({
    where: {
      dealId,
      startDate: { lte: txDate },
      endDate: { gte: txDate }
    }
  });

  if (!period) {
    // No period defined for this date - allow by default
    return { allowed: true };
  }

  if (period.status === 'HARD_CLOSE') {
    return {
      allowed: false,
      reason: `Period ${period.year} Q${period.quarter} is hard-closed. No changes allowed.`,
      periodId: period.id
    };
  }

  if (period.status === 'SOFT_CLOSE') {
    return {
      allowed: true,
      warning: `Period ${period.year} Q${period.quarter} is soft-closed. Changes will be flagged for review.`,
      periodId: period.id
    };
  }

  return { allowed: true, periodId: period.id };
}

/**
 * Middleware wrapper for routes that modify financial records
 */
export function requireOpenPeriod(getTransactionDate) {
  return async (req, res, next, dealId) => {
    const txDate = getTransactionDate(req);
    const check = await checkPeriodOpen(dealId, txDate);

    if (!check.allowed) {
      return {
        blocked: true,
        status: 403,
        message: check.reason
      };
    }

    return { blocked: false, warning: check.warning, periodId: check.periodId };
  };
}
```

---

### Gap 4: Unified Audit Query Endpoint

**Goal**: Single endpoint to query both BFF DealEvent and Kernel Event

#### 4.1 Create unified-audit.js routes
**File**: `canonical-deal-os/server/routes/unified-audit.js` (NEW)

```javascript
import { getPrisma } from "../db.js";
import { extractAuthUser } from "./auth.js";

const KERNEL_API_URL = process.env.KERNEL_API_URL || 'http://localhost:3001';

/**
 * Get unified audit trail for a deal
 * Combines BFF DealEvent and Kernel Event into single timeline
 * GET /api/deals/:dealId/audit-trail
 */
export async function handleGetUnifiedAuditTrail(req, res, dealId) {
  const authUser = await extractAuthUser(req);
  if (!authUser) {
    return sendError(res, 401, "Not authenticated");
  }

  const prisma = getPrisma();

  // Parse query params
  const url = new URL(req.url, `http://${req.headers.host}`);
  const limit = parseInt(url.searchParams.get('limit') || '100', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const eventTypes = url.searchParams.get('types')?.split(',') || null;
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');

  // Build where clause for BFF events
  const bffWhere = { dealId };
  if (eventTypes) bffWhere.eventType = { in: eventTypes };
  if (startDate || endDate) {
    bffWhere.occurredAt = {};
    if (startDate) bffWhere.occurredAt.gte = new Date(startDate);
    if (endDate) bffWhere.occurredAt.lte = new Date(endDate);
  }

  // Get BFF DealEvents
  const bffEvents = await prisma.dealEvent.findMany({
    where: bffWhere,
    orderBy: { occurredAt: 'desc' },
    take: limit,
    skip: offset
  });

  // Get Kernel Events via API
  let kernelEvents = [];
  try {
    const kernelUrl = new URL(`${KERNEL_API_URL}/deals/${dealId}/events`);
    if (limit) kernelUrl.searchParams.set('limit', limit.toString());
    if (offset) kernelUrl.searchParams.set('offset', offset.toString());

    const kernelResponse = await fetch(kernelUrl.toString());
    if (kernelResponse.ok) {
      kernelEvents = await kernelResponse.json();
    }
  } catch (err) {
    console.warn(`[Unified Audit] Failed to fetch Kernel events: ${err.message}`);
  }

  // Normalize events to common format
  const normalizedBff = bffEvents.map(e => ({
    id: e.id,
    source: 'BFF',
    dealId: e.dealId,
    eventType: e.eventType,
    eventData: typeof e.eventData === 'string' ? JSON.parse(e.eventData) : e.eventData,
    actorId: e.actorId,
    actorName: e.actorName,
    actorRole: e.actorRole,
    sequenceNumber: e.sequenceNumber,
    eventHash: e.eventHash,
    previousEventHash: e.previousEventHash,
    occurredAt: e.occurredAt.toISOString(),
    fromState: e.fromState,
    toState: e.toState
  }));

  const normalizedKernel = kernelEvents.map(e => ({
    id: e.id,
    source: 'KERNEL',
    dealId: e.dealId,
    eventType: e.type,
    eventData: e.payload,
    actorId: e.actorId,
    actorName: null, // Kernel doesn't store actor name
    actorRole: null,
    sequenceNumber: e.sequenceNumber,
    eventHash: e.eventHash,
    previousEventHash: e.previousEventHash,
    occurredAt: e.createdAt,
    fromState: null,
    toState: null
  }));

  // Merge and sort by timestamp
  const allEvents = [...normalizedBff, ...normalizedKernel]
    .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));

  // Verify hash chains
  const bffChainValid = verifyLocalChain(normalizedBff.sort((a, b) => a.sequenceNumber - b.sequenceNumber));
  const kernelChainValid = verifyLocalChain(normalizedKernel.sort((a, b) => a.sequenceNumber - b.sequenceNumber));

  sendJson(res, 200, {
    events: allEvents.slice(0, limit),
    total: allEvents.length,
    integrity: {
      bffChainValid,
      kernelChainValid,
      bffEventCount: normalizedBff.length,
      kernelEventCount: normalizedKernel.length
    }
  });
}

function verifyLocalChain(events) {
  if (events.length === 0) return true;

  let expectedPreviousHash = null;
  for (const event of events) {
    if (event.previousEventHash !== expectedPreviousHash) {
      return false;
    }
    expectedPreviousHash = event.eventHash;
  }
  return true;
}

/**
 * Verify full audit trail integrity
 * GET /api/deals/:dealId/audit-trail/verify
 */
export async function handleVerifyAuditTrail(req, res, dealId) {
  const authUser = await extractAuthUser(req);
  if (!authUser) {
    return sendError(res, 401, "Not authenticated");
  }

  const prisma = getPrisma();

  // Verify BFF chain
  const bffEvents = await prisma.dealEvent.findMany({
    where: { dealId },
    orderBy: { sequenceNumber: 'asc' },
    select: {
      id: true,
      sequenceNumber: true,
      eventType: true,
      previousEventHash: true,
      eventHash: true
    }
  });

  const bffIssues = [];
  let expectedSeq = 1;
  let expectedHash = null;

  for (const event of bffEvents) {
    if (event.sequenceNumber !== expectedSeq) {
      bffIssues.push({
        eventId: event.id,
        issue: `Sequence gap: expected ${expectedSeq}, found ${event.sequenceNumber}`
      });
    }
    if (event.previousEventHash !== expectedHash) {
      bffIssues.push({
        eventId: event.id,
        issue: `Chain break at sequence ${event.sequenceNumber}`
      });
    }
    expectedSeq = event.sequenceNumber + 1;
    expectedHash = event.eventHash;
  }

  // Verify Kernel chain via API
  let kernelVerification = { valid: true, issues: [] };
  try {
    const kernelResponse = await fetch(`${KERNEL_API_URL}/deals/${dealId}/events/verify`);
    if (kernelResponse.ok) {
      kernelVerification = await kernelResponse.json();
    }
  } catch (err) {
    kernelVerification = { valid: false, error: `Failed to reach Kernel API: ${err.message}` };
  }

  sendJson(res, 200, {
    bff: {
      valid: bffIssues.length === 0,
      eventCount: bffEvents.length,
      issues: bffIssues
    },
    kernel: kernelVerification,
    overallValid: bffIssues.length === 0 && kernelVerification.valid
  });
}
```

#### 4.2 Add verify endpoint to Kernel API
**File**: `cre-kernel-phase1/apps/kernel-api/src/server.ts`

Add endpoint after existing events endpoint:

```typescript
app.get("/deals/:dealId/events/verify", async (request, reply) => {
  const paramsResult = dealParamsSchema.safeParse(request.params);
  if (!paramsResult.success) {
    return reply.code(400).send({ message: formatZodError(paramsResult.error) });
  }

  const { verifyEventChain } = await import('./audit');
  const result = await verifyEventChain(prisma, paramsResult.data.dealId);

  return reply.code(200).send(result);
});
```

---

## FILES TO MODIFY (Phase 2)

| File | Changes |
|------|---------|
| `cre-kernel-phase1/apps/kernel-api/prisma/migrations/.../migration.sql` | NEW: PostgreSQL immutability triggers |
| `canonical-deal-os/server/prisma/migrations/.../migration.sql` | NEW: SQLite immutability triggers |
| `canonical-deal-os/server/prisma/schema.prisma` | Add AccountingPeriod model, periodId to Distribution/CapitalCall |
| `canonical-deal-os/server/services/audit-service.js` | Add createDistributionSnapshot with waterfall rules |
| `canonical-deal-os/server/routes/distributions.js` | Use createDistributionSnapshot |
| `canonical-deal-os/server/routes/accounting-periods.js` | NEW: Period management endpoints |
| `canonical-deal-os/server/services/period-guard.js` | NEW: Period validation middleware |
| `canonical-deal-os/server/routes/unified-audit.js` | NEW: Unified audit trail endpoint |
| `cre-kernel-phase1/apps/kernel-api/src/server.ts` | Add /events/verify endpoint |

---

## VERIFICATION (Phase 2)

1. **Test immutability triggers**:
   ```sql
   -- Should FAIL with "UPDATE not allowed" error
   UPDATE "DealEvent" SET eventType = 'TAMPERED' WHERE id = 'xxx';
   DELETE FROM "DealEvent" WHERE id = 'xxx';
   ```

2. **Test waterfall snapshotting**:
   ```bash
   # Create distribution
   curl -X POST .../distributions -d '{"title":"Q1","totalAmount":100000,...}'
   # Get snapshot
   curl .../snapshots/{snapshotId}
   # Verify: waterfallRules and rulebookHash are populated
   ```

3. **Test accounting period close**:
   ```bash
   # Create period
   curl -X POST .../accounting-periods -d '{"year":2026,"quarter":1}'
   # Soft close
   curl -X POST .../accounting-periods/{id}/soft-close
   # Hard close
   curl -X POST .../accounting-periods/{id}/hard-close
   # Verify: closeSnapshotId is set, status is HARD_CLOSE
   ```

4. **Test unified audit trail**:
   ```bash
   curl .../deals/{id}/audit-trail
   # Verify: events from both BFF and Kernel appear
   curl .../deals/{id}/audit-trail/verify
   # Verify: integrity.overallValid = true
   ```

---

## BLOCKCHAIN ANCHOR MODEL (Future)

For future blockchain integration, add:

```prisma
model BlockchainAnchor {
  id              String   @id @default(uuid())
  dealId          String

  // What we're anchoring
  anchorType      String   // EVENT_BATCH, SNAPSHOT, PERIOD_CLOSE
  eventId         String?  // Last event in batch
  snapshotId      String?  // Snapshot being anchored
  periodId        String?  // Period close being anchored

  // On-chain reference
  chainId         Int      // 1 = Ethereum, 137 = Polygon, etc.
  txHash          String   @unique
  blockNumber     Int
  blockTimestamp  DateTime

  // Hash we committed
  anchoredHash    String

  // Metadata
  anchoredAt      DateTime @default(now())
  anchoredBy      String?

  @@index([dealId])
  @@index([chainId, txHash])
}
```

This model allows anchoring any of:
- Batch of events (e.g., daily anchor of all events)
- Individual snapshots (e.g., distribution cap table)
- Period closes (e.g., Q4 GL close)

---

## CONCLUSION

After Phase 2 implementation, the ledger will have:

| Capability | Status |
|------------|--------|
| Event/Audit Log | ✅ SHA-256 hash chain + sequence numbers |
| Versioning + Immutability | ✅ DB triggers prevent UPDATE/DELETE |
| Evidence Links | ✅ ExtractionClaim, ApprovalRecord link to sources |
| Snapshot Capability | ✅ Cap table + waterfall rules frozen |
| Accounting Periods | ✅ GL close with soft/hard close workflow |
| Unified Audit View | ✅ Single endpoint for BFF + Kernel events |
| Blockchain Ready | ✅ Hash chain + BlockchainAnchor model ready |
