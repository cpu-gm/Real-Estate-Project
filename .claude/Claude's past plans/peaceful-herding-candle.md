# Core Data Models Audit: Investor, Fund/Vehicle, Cash Tracking

**Date**: January 18, 2026
**Auditor**: Claude Code (Opus 4.5)
**Scope**: Data model completeness for capital calls, distributions, and investor reporting automation

---

## VERDICT TABLE

| Area | Status | Evidence |
|------|--------|----------|
| A) Investor + Cap Table | **PARTIAL PASS** | Core investor registry and capital tracking exists; missing transfers/assignments and class/series |
| B) Fund / Vehicle Structure | **FAIL** | No Fund/Vehicle/SPV models exist; flat deal-centric architecture |
| C) Cash Tracking | **FAIL** | No cash ledger or COA models; only domain events (capital calls/distributions) |

---

## EXECUTIVE SUMMARY

The system has **strong investor registry and capital call/distribution workflow**, but is **missing fund/vehicle hierarchy** and **cash ledger capabilities**. The architecture is deal-centric rather than fund-centric, which limits multi-fund LP portfolio views.

---

## AREA A: INVESTOR + CAP TABLE

### A.1 Schema Inventory

| Model | File | Key Fields | Purpose |
|-------|------|------------|---------|
| `LPActor` | schema.prisma:199-217 | id, dealId, email, entityName, commitment, ownershipPct, status, authUserId | Active LP investor per deal |
| `LPInvitation` | schema.prisma:179-197 | id, dealId, lpEmail, lpEntityName, commitment, ownershipPct, status, expiresAt | Pending LP invitations |
| `CapitalCall` | schema.prisma:1288-1315 | id, dealId, totalAmount, dueDate, status, snapshotId, periodId | Capital call notices |
| `CapitalCallAllocation` | schema.prisma:1317-1337 | capitalCallId, lpActorId, amount, status, fundedAmount, fundedAt | Per-LP allocation |
| `Distribution` | schema.prisma:1341-1369 | id, dealId, totalAmount, status, approvedBy, snapshotId | Cash distributions |
| `DistributionAllocation` | schema.prisma:1371-1389 | distributionId, lpActorId, grossAmount, withholdingAmount, netAmount, status | Per-LP distribution |
| `Subscription` | schema.prisma:1446-1479 | dealId, lpEmail, commitmentAmount, shareClass, sideLetter, status | LP subscription docs |
| `Snapshot` | schema.prisma:1696-1719 | dealId, snapshotType, lpOwnership (JSON), capTableHash | Point-in-time cap table freeze |
| `LPPaymentProfile` | schema.prisma:1578-1603 | lpActorId, bankName, accountNumber, taxIdType, k1DeliveryMethod | LP payment/tax info |

### A.2 API Coverage

| Endpoint | File:Line | Models | CRUD |
|----------|-----------|--------|------|
| POST /api/lp/invitations | lp-onboarding.js:44 | LPInvitation | Create |
| POST /api/lp/invitations/:id/accept | lp-onboarding.js:148 | LPInvitation, LPActor | Update, Create |
| GET /api/lp/actors/:dealId | lp-onboarding.js | LPActor | Read |
| POST /api/lp/bulk-import | lp-onboarding.js | LPActor | Bulk Create |
| GET /api/deals/:id/capital-calls | capital-calls.js:79 | CapitalCall, CapitalCallAllocation | Read |
| POST /api/deals/:id/capital-calls | capital-calls.js:202 | CapitalCall, CapitalCallAllocation, Snapshot | Create |
| POST /api/deals/:id/capital-calls/:id/issue | capital-calls.js:317 | CapitalCall, ApprovalRecord | Update |
| POST /api/deals/:id/capital-calls/:id/allocations/:id/mark-funded | capital-calls.js:769 | CapitalCallAllocation | Update |
| GET /api/deals/:id/distributions | distributions.js:79 | Distribution, DistributionAllocation | Read |
| POST /api/deals/:id/distributions | distributions.js:199 | Distribution, DistributionAllocation, Snapshot | Create |
| POST /api/deals/:id/distributions/:id/approve | distributions.js:318 | Distribution, ApprovalRecord | Update |
| POST /api/deals/:id/distributions/:id/allocations/:id/mark-paid | distributions.js:458 | DistributionAllocation, PermissionAuditLog | Update |

### A.3 Correctness Checks

#### ✅ "List all investors in Fund X and their unfunded commitment"
```javascript
// Can be computed from:
LPActor.findMany({ where: { dealId, status: 'ACTIVE' } })
// Returns: commitment (total), unfunded = commitment - sum(fundedAmount from CapitalCallAllocation)
```
**ISSUE**: Unfunded commitment is NOT stored. Must compute from: `commitment - SUM(CapitalCallAllocation.fundedAmount WHERE status='FUNDED')`

#### ✅ "Show capital contributed by Investor Y into Fund X and funding status"
```javascript
CapitalCallAllocation.findMany({
  where: { lpActorId: investorY },
  include: { capitalCall: { where: { dealId } } }
})
// Returns: amount, status, fundedAmount, fundedAt
```
**PASS**: Full funding history with timestamps.

#### ❌ "Show transfers/assignments between LPs"
**FAIL**: No `LPTransfer` or `LPAssignment` model exists. LPActor is immutable once created.

#### ❌ "Show class/series and close dates"
**PARTIAL**: `Subscription.shareClass` exists but:
- No `ShareClass` or `Series` model
- No `ClosingTranche` model for close dates
- No true-up calculation support

### A.4 Data Integrity

| Check | Status | Evidence |
|-------|--------|----------|
| Unique investor per deal | ✅ | `@@unique([email, dealId])` on LPActor |
| Non-nullable required fields | ✅ | id, email, dealId, commitment are required |
| Negative amount prevention | ❌ | No CHECK constraint on commitment/amount |
| Org isolation | ❌ | LPActor has no organizationId; relies on deal-level isolation |
| Allocation uniqueness | ✅ | `@@unique([capitalCallId, lpActorId])` |

### A.5 Verdict: PARTIAL PASS

**Working:**
- Investor registry with stable IDs
- Commitments per investor per deal
- Contributions/capital calls with funding status history
- Snapshot for reproducibility

**Missing:**
1. **Unfunded commitment field** - Must be computed, not stored
2. **Transfer/assignment model** - Cannot track LP interest transfers
3. **Share class/series model** - Only flat string field
4. **Close/tranche dates** - No model
5. **Org isolation on LPActor** - Inherits from deal only

---

## AREA B: FUND / VEHICLE STRUCTURE

### B.1 Schema Inventory

| Model | Status |
|-------|--------|
| `Fund` | ❌ **DOES NOT EXIST** |
| `Vehicle` | ❌ **DOES NOT EXIST** |
| `SPV` | ❌ **DOES NOT EXIST** |
| `FundVehicle` (join) | ❌ **DOES NOT EXIST** |
| `VehicleDeal` (join) | ❌ **DOES NOT EXIST** |

### B.2 Current Architecture

The system is **deal-centric**, not fund-centric:
- `Deal` is the top-level entity (from Kernel)
- `LPActor` is per-deal, not per-fund
- `Organization` exists but only for user isolation, not fund/vehicle structure
- `Subscription.lpEntityType` has values like `FUND`, `PENSION`, `INSTITUTION` but this describes the LP, not a fund entity

### B.3 Correctness Checks

#### ❌ "For this deal, which fund(s) own it and on what terms?"
**FAIL**: Cannot answer. No Fund→Vehicle→Deal chain exists.

#### ❌ "What is Fund X's aggregate commitment across deals?"
**FAIL**: Would require querying all deals and summing LP commitments. No fund-level aggregation.

#### ❌ "Show ownership % and dates for Fund→Vehicle relationship"
**FAIL**: No relationship models.

### B.4 Verdict: FAIL

The architecture fundamentally lacks fund/vehicle structure. This is a **schema redesign requirement**, not a patch.

---

## AREA C: CASH TRACKING

### C.1 Schema Inventory

| Model | Status | Notes |
|-------|--------|-------|
| `CashLedger` | ❌ **DOES NOT EXIST** | No general ledger |
| `Transaction` | ❌ **DOES NOT EXIST** | No cash transaction model |
| `ChartOfAccounts` | ❌ **DOES NOT EXIST** | No COA |
| `AccountCategory` | ❌ **DOES NOT EXIST** | No category mapping |
| `ReconciliationRecord` | ❌ **DOES NOT EXIST** | No reconciliation status |

### C.2 What Exists Instead

The system uses **domain events** rather than a cash ledger:

| Model | Purpose | Limitation |
|-------|---------|------------|
| `CapitalCall` + `CapitalCallAllocation` | Tracks capital inflows | Only capital calls, no other inflows |
| `Distribution` + `DistributionAllocation` | Tracks outflows to LPs | Only distributions, no expenses |
| `DealEvent` | Append-only audit log | Event data, not double-entry ledger |
| `AccountingPeriod` | GL close workflow | Period status only, no transaction data |
| `Snapshot` | Point-in-time cap table | Ownership snapshots, not cash balances |

### C.3 Correctness Checks

#### ❌ "Show cash ledger for Deal Z and categorize by COA category"
**FAIL**: No cash ledger exists. Only capital calls and distributions.

#### ❌ "Compute available cash for distribution at a point in time"
**FAIL**: Cannot compute. Would need:
- Property income (not tracked)
- Operating expenses (not tracked)
- Debt service (not tracked)
- Reserves (not tracked)

Capital calls and distributions do NOT equal cash position.

#### ❌ "Show reconciliation status of transactions"
**FAIL**: No reconciliation model. `CapitalCallAllocation.status` and `DistributionAllocation.status` track payment status, not bank reconciliation.

#### ❌ "Map transactions to reporting categories"
**FAIL**: No COA or category mapping. Only `CapitalCall.purpose` and `Distribution.type` provide limited categorization.

### C.4 Verdict: FAIL

The system has **no cash tracking capability**. It tracks capital flows (calls/distributions) but not:
- Property operations cash flow
- Bank account balances
- Expense categorization
- Double-entry accounting
- Reconciliation

---

## MINIMUM PATCH PLAN

### Priority 1: Investor/Cap Table Patches (~40 lines)

#### P1.1: Add unfunded commitment computed field
```prisma
// schema.prisma - Already can compute, but add helper endpoint
// Add to LPActor model comment: "unfunded = commitment - SUM(funded capital calls)"
```

#### P1.2: Add LP Transfer model
```prisma
model LPTransfer {
  id              String   @id @default(uuid())
  dealId          String
  fromLpActorId   String
  toLpActorId     String
  effectiveDate   DateTime
  transferAmount  Float    // Commitment amount transferred
  transferPct     Float    // Ownership percentage transferred
  status          String   @default("PENDING") // PENDING, COMPLETED, CANCELLED
  reason          String?
  documentId      String?  // Transfer agreement artifact
  createdBy       String
  createdAt       DateTime @default(now())

  @@index([dealId])
  @@index([fromLpActorId])
  @@index([toLpActorId])
}
```

#### P1.3: Add ShareClass model
```prisma
model ShareClass {
  id              String   @id @default(uuid())
  dealId          String
  name            String   // "Class A", "Class B"
  code            String   // "A", "B"
  preferredReturn Float?
  managementFee   Float?
  carryPercent    Float?
  votingRights    Boolean  @default(true)
  createdAt       DateTime @default(now())

  @@unique([dealId, code])
  @@index([dealId])
}

// Update LPActor:
// shareClassId String?
// shareClass   ShareClass? @relation(...)
```

#### P1.4: Add organizationId to LPActor (for org isolation)
```prisma
// LPActor - add:
organizationId String?

@@index([organizationId])
```

### Priority 2: Fund/Vehicle Structure (~100 lines)

**NOT RECOMMENDED as patch** - Requires architectural redesign:

1. Fund entity with legal structure
2. Vehicle/SPV entity
3. Fund→Vehicle→Deal ownership chain
4. LP commitments at fund level (not deal level)
5. Migration of existing LPActor data

This is a **major refactor** that should be planned separately.

### Priority 3: Cash Ledger (~150 lines)

#### P3.1: Minimal cash ledger model
```prisma
model CashLedgerEntry {
  id              String   @id @default(uuid())
  dealId          String
  entryDate       DateTime
  direction       String   // INFLOW, OUTFLOW
  amount          Float
  category        String   // CAPITAL_CALL, DISTRIBUTION, INCOME, EXPENSE, DEBT_SERVICE, RESERVE
  counterparty    String?  // LP name, vendor, bank
  memo            String?
  source          String   @default("MANUAL") // MANUAL, IMPORT, SYSTEM
  sourceRef       String?  // Reference to CapitalCall, Distribution, etc.

  // Reconciliation
  reconciliationStatus String @default("PENDING") // PENDING, POSTED, RECONCILED
  reconciledAt    DateTime?
  reconciledBy    String?

  // Audit
  createdBy       String
  createdAt       DateTime @default(now())

  @@index([dealId, entryDate])
  @@index([dealId, category])
  @@index([reconciliationStatus])
}
```

#### P3.2: Simple COA/category enum
```prisma
// Use category string enum instead of full COA model:
// CAPITAL_CALL_RECEIVED, DISTRIBUTION_PAID, RENTAL_INCOME, OPERATING_EXPENSE,
// CAPEX, DEBT_SERVICE, MANAGEMENT_FEE, LEGAL_FEE, RESERVE_DEPOSIT, RESERVE_WITHDRAWAL

// Full COA model for later:
model AccountCategory {
  id          String   @id @default(uuid())
  code        String   @unique // "4100", "5200"
  name        String   // "Rental Income", "Repairs & Maintenance"
  type        String   // INCOME, EXPENSE, ASSET, LIABILITY
  parentId    String?  // For hierarchy
  isActive    Boolean  @default(true)

  parent      AccountCategory? @relation("CategoryHierarchy", fields: [parentId], references: [id])
  children    AccountCategory[] @relation("CategoryHierarchy")
}
```

---

## MINIMUM ENDPOINTS NEEDED

### For LP Transfers:
- `POST /api/deals/:id/lp-transfers` - Create transfer
- `GET /api/deals/:id/lp-transfers` - List transfers
- `POST /api/deals/:id/lp-transfers/:id/complete` - Execute transfer

### For Share Classes:
- `POST /api/deals/:id/share-classes` - Create class
- `GET /api/deals/:id/share-classes` - List classes
- `PATCH /api/deals/:id/share-classes/:id` - Update class

### For Cash Ledger:
- `POST /api/deals/:id/cash-ledger` - Create entry
- `GET /api/deals/:id/cash-ledger` - List entries with filters
- `POST /api/deals/:id/cash-ledger/:id/reconcile` - Mark reconciled
- `GET /api/deals/:id/cash-ledger/summary` - Cash position summary

---

## CRITICAL INVARIANTS TO ADD

### Schema Constraints
```prisma
// LPActor - Add CHECK constraint for positive commitment
// (SQLite doesn't support CHECK, use validation in code)

// CapitalCallAllocation - Ensure fundedAmount <= amount
// DistributionAllocation - Ensure withholdingAmount >= 0
```

### Validation in Code (capital-calls.js, distributions.js)
```javascript
// capital-calls.js:handleCreateCapitalCall - Line ~230
if (body.totalAmount <= 0) {
  return sendError(res, 400, "totalAmount must be positive");
}

// distributions.js:handleCreateDistribution - Line ~205
if (body.totalAmount <= 0) {
  return sendError(res, 400, "totalAmount must be positive");
}
```

### Org Isolation
```javascript
// Add to LPActor creation (lp-onboarding.js):
organizationId: authUser.organizationId
```

---

## NEXT STEPS TO REACH AUTOMATION-READY (≤8 bullets)

1. **Add LPTransfer model** for LP interest assignments (enables secondary trading)
2. **Add ShareClass model** for multi-class deals (enables preferred equity)
3. **Add organizationId to LPActor** for proper org isolation
4. **Add CashLedgerEntry model** with category field (enables cash tracking)
5. **Create cash ledger endpoints** (POST create, GET list, POST reconcile)
6. **Auto-create ledger entries** when capital calls funded / distributions paid
7. **Add computed unfunded endpoint** or cache unfunded on LPActor
8. **Defer Fund/Vehicle hierarchy** to Phase 2 (major refactor, not patch-sized)

---

## CONCLUSION

| Area | Automation-Ready? | Blocking Issues |
|------|-------------------|-----------------|
| Capital Calls | ✅ YES | None - fully functional |
| Distributions | ✅ YES | None - fully functional with waterfall |
| LP Reporting | ⚠️ PARTIAL | No transfer history, no class breakdown |
| Cash Position | ❌ NO | No cash ledger, no COA |
| Multi-Fund Rollup | ❌ NO | No fund/vehicle hierarchy |

**For automation go-live with current architecture:**
- Capital calls: READY
- Distributions: READY
- LP statements: READY (for single-deal view)
- Cash reconciliation: NOT READY (need cash ledger)
- Fund-level reporting: NOT READY (need fund hierarchy)

---

# SHARECLASS IMPLEMENTATION PLAN

**Date**: January 18, 2026
**Status**: Planning - Ready for User Approval

## ARCHITECTURAL DECISION

### Design Choice: One LPActor per LP per ShareClass

After analyzing the codebase, the recommended approach is to allow **multiple LPActor records** for the same LP in the same deal (one per share class):

**Current unique constraint**: `@@unique([email, dealId])`
**New unique constraint**: `@@unique([email, dealId, shareClassId])`

**Rationale**:
1. Minimizes changes to existing allocation logic (capital calls/distributions iterate LPActors)
2. Allows an LP to hold multiple share classes in the same deal
3. Snapshots and waterfalls continue working with aggregate LPActor data
4. LP transfers already modify individual LPActor positions

### Impact Analysis

| Component | Impact Level | Description |
|-----------|--------------|-------------|
| LPActor | HIGH | Add shareClassId FK, change unique constraint |
| LPInvitation | MEDIUM | Add shareClassId FK |
| Capital Calls | LOW | Add shareClass to logging/responses (logic unchanged) |
| Distributions | LOW | Add shareClass to logging/responses (logic unchanged) |
| LPTransfer | MEDIUM | Enforce same-class transfers |
| Snapshots | LOW | Include shareClass in frozen data |
| LP Portal | LOW | Display shareClass info |
| Waterfall | DEFERRED | Per-class tiers are complex, defer to later |

---

## IMPLEMENTATION INCREMENTS

### Increment 1: ShareClass Model + Database Migration
**Goal**: Create foundation without breaking existing functionality

**Schema Changes** (`server/prisma/schema.prisma`):
```prisma
// New model
model ShareClass {
  id              String    @id @default(uuid())
  dealId          String
  organizationId  String?                            // Org isolation
  name            String                              // "Class A", "Class B"
  code            String                              // "A", "B" - short code
  description     String?
  preferredReturn Float?                              // e.g., 0.08 for 8%
  managementFee   Float?                              // e.g., 0.02 for 2%
  carryPercent    Float?                              // e.g., 0.20 for 20%
  votingRights    Boolean   @default(true)
  priority        Int       @default(1)               // 1 = highest priority
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  createdBy       String?
  createdByName   String?

  lpActors        LPActor[]

  @@unique([dealId, code])
  @@index([dealId])
  @@index([organizationId])
}

// LPActor changes
model LPActor {
  // ... existing fields ...
  shareClassId    String?                             // FK to ShareClass
  shareClass      ShareClass? @relation(...)

  @@unique([email, dealId, shareClassId])             // CHANGED from @@unique([email, dealId])
}
```

**Migration Strategy**:
1. Create ShareClass table
2. For each existing deal, create default "Class A" ShareClass
3. Add shareClassId column to LPActor (nullable)
4. Update existing LPActors to point to their deal's default Class A
5. Change unique constraint

**Files**: `schema.prisma`

**Test**:
- Run migration in test environment
- Verify all LPActors have shareClassId
- Verify existing queries work

---

### Increment 2: ShareClass CRUD API
**Goal**: Create endpoints to manage share classes

**New Routes** (`server/routes/share-classes.js`):
```
GET    /api/deals/:dealId/share-classes
POST   /api/deals/:dealId/share-classes         (GP only)
GET    /api/deals/:dealId/share-classes/:id
PATCH  /api/deals/:dealId/share-classes/:id     (GP only)
DELETE /api/deals/:dealId/share-classes/:id     (GP only, no LPs)
```

**Logging Pattern**:
```javascript
const LOG_PREFIX = "[ShareClass]";
function log(message, data = {}) {
  console.log(`${LOG_PREFIX} ${message}`, JSON.stringify(data));
}
function logError(message, error, data = {}) {
  console.error(`${LOG_PREFIX} ERROR: ${message}`, data, error?.message || '');
}
```

**Files**: `server/routes/share-classes.js` (NEW), `server/index.js` (dispatch)

**Test**:
- Create/list/update/delete share classes
- Verify GP-only auth
- Verify org isolation
- Verify cannot delete class with existing LPs

---

### Increment 3: LPInvitation ShareClass Support
**Goal**: Allow inviting LPs to specific share class

**Schema Changes**: Add `shareClassId` to LPInvitation

**API Changes** (`POST /api/lp/invitations`):
```json
{
  "lpEntityName": "Acme Fund",
  "lpEmail": "investor@acme.com",
  "dealId": "uuid",
  "commitment": 5000000,
  "ownershipPct": 10,
  "shareClassId": "uuid-of-class-b"  // NEW: optional
}
```

**Code Changes** (`lp-onboarding.js`):
- Validate shareClassId belongs to deal
- Store shareClassId on invitation
- Log shareClass validation

**Files**: `schema.prisma`, `lp-onboarding.js`, `contracts.js`

**Test**:
- Invitation without shareClassId (backward compatible)
- Invitation with valid shareClassId
- Invitation with invalid shareClassId (fails)

---

### Increment 4: LPActor ShareClass Assignment
**Goal**: Propagate shareClass when invitation accepted

**Code Changes** (`lp-onboarding.js:handleAcceptInvitation`):
- Get shareClassId from invitation
- If null, get or create default Class A for deal
- Create/upsert LPActor with shareClassId
- Use new unique constraint (email + dealId + shareClassId)

**Helper Function**:
```javascript
async function getOrCreateDefaultShareClass(dealId, organizationId) {
  log(`Getting/creating default share class`, { dealId });
  let defaultClass = await prisma.shareClass.findFirst({
    where: { dealId, code: 'A' }
  });
  if (!defaultClass) {
    defaultClass = await prisma.shareClass.create({
      data: { dealId, organizationId, name: 'Class A', code: 'A', priority: 1 }
    });
    log(`Default Class A created`, { shareClassId: defaultClass.id });
  }
  return defaultClass;
}
```

**Files**: `lp-onboarding.js`

**Test**:
- Accept invitation with shareClassId → LPActor has correct class
- Accept invitation without shareClassId → uses default Class A
- Same LP can join same deal in different classes
- Same LP cannot join same deal in same class twice

---

### Increment 5: Capital Calls with ShareClass Info
**Goal**: Include shareClass in capital call responses (logic unchanged)

**Code Changes** (`capital-calls.js`):
- Include shareClass when querying LPActors
- Add shareClass to allocation responses
- Add shareClass to logging

**Example Log**:
```
[CapitalCalls] Creating allocations { dealId: "abc", byClass: { "A": 5, "B": 3 } }
[CapitalCalls] Allocation created { lpActorId: "xyz", shareClassCode: "B", amount: 50000 }
```

**Files**: `capital-calls.js`

**Test**:
- Capital call with single class → allocations correct
- Capital call with multiple classes → pro-rata is deal-wide
- API response includes shareClass info

---

### Increment 6: Distributions with ShareClass Info
**Goal**: Same pattern as capital calls

**Files**: `distributions.js`

**Test**: Same as Increment 5

---

### Increment 7: LPTransfer ShareClass Validation
**Goal**: Ensure transfers are within same share class

**Code Changes** (`lp-transfers.js`):
```javascript
if (fromLp.shareClassId !== toLp.shareClassId) {
  log(`Transfer rejected - different classes`, {
    fromClass: fromLp.shareClass?.code,
    toClass: toLp.shareClass?.code
  });
  return sendError(res, 400, "Cannot transfer between different share classes");
}
```

**Files**: `lp-transfers.js`

**Test**:
- Transfer within same class → succeeds
- Transfer between different classes → fails with clear error

---

### Increment 8: Snapshots with ShareClass
**Goal**: Capture per-class breakdown in snapshots

**Code Changes** (`audit-service.js:createCapTableSnapshot`):
- Include shareClass in lpOwnership JSON
- Log class breakdown

**Snapshot Data Format**:
```json
{
  "lpOwnership": [
    { "lpActorId": "...", "entityName": "...", "shareClass": { "code": "A", "name": "Class A" }, ... }
  ]
}
```

**Files**: `audit-service.js` or wherever snapshots are created

**Test**: Snapshots include shareClass info, existing snapshots still parse

---

### Increment 9: LP Portal ShareClass Display
**Goal**: Show shareClass in LP portal

**Code Changes** (`lp-onboarding.js` LP portal handlers):
- Include shareClass in investment detail response
- Include shareClass in holdings list

**Files**: `lp-onboarding.js`, `contracts.js`, `LPPortal.jsx`

**Test**: LP sees their share class info in portal

---

### Increment 10: Per-Class Waterfall (DEFERRED)
**Status**: Not implementing in this phase

**Reason**: Complex architectural change. Current implementation provides shareClass tracking for reporting. True per-class waterfall calculations (different hurdles per class) require:
- New `WaterfallClassConfig` model
- Rewrite of waterfall calculation engine
- Distribution allocation logic changes

**Recommendation**: Defer to Phase 2 when business requirements are clearer.

---

## COMPREHENSIVE LOGGING STRATEGY

### Log Prefix Convention
Each module uses a consistent prefix:
- `[ShareClass]` - Share class CRUD
- `[LPOnboarding]` - Invitation/acceptance
- `[CapitalCalls]` - Capital call operations
- `[Distributions]` - Distribution operations
- `[LPTransfers]` - Transfer operations
- `[Migration]` - Data migration operations
- `[Snapshot]` - Snapshot creation/loading

### Core Logging Functions (per module)
```javascript
const LOG_PREFIX = "[ShareClass]";

function log(message, data = {}) {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} ${LOG_PREFIX} ${message}`, JSON.stringify(data, null, 0));
}

function logError(message, error, data = {}) {
  const timestamp = new Date().toISOString();
  console.error(`${timestamp} ${LOG_PREFIX} ERROR: ${message}`, {
    ...data,
    error: error?.message || String(error),
    stack: error?.stack?.split('\n').slice(0, 3).join(' | ')
  });
}

function logDebug(message, data = {}) {
  if (process.env.DEBUG_SHARECLASS === 'true') {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} ${LOG_PREFIX} DEBUG: ${message}`, JSON.stringify(data, null, 0));
  }
}

function logWarn(message, data = {}) {
  const timestamp = new Date().toISOString();
  console.warn(`${timestamp} ${LOG_PREFIX} WARN: ${message}`, JSON.stringify(data, null, 0));
}
```

### Logging Categories & When to Use

| Category | Function | When to Use |
|----------|----------|-------------|
| INFO | `log()` | Normal operations, entry/exit points, successful mutations |
| ERROR | `logError()` | Exceptions, validation failures that stop execution |
| WARN | `logWarn()` | Recoverable issues, deprecation, edge cases |
| DEBUG | `logDebug()` | Detailed state, query results, intermediate values |

### Per-Increment Logging Requirements

#### Increment 1: ShareClass Model + Migration
```javascript
// Migration script logging
log(`Migration starting`, { step: 'create_shareclass_table' });
log(`ShareClass table created`, {});

log(`Migration: Finding deals without default share class`, {});
log(`Migration: Creating default Class A`, { dealId, dealName });
log(`Migration: Default class created`, { dealId, shareClassId });

log(`Migration: Updating LPActors`, { count: totalLpActors });
log(`Migration: LPActor updated`, { lpActorId, shareClassId });
log(`Migration complete`, {
  dealsProcessed,
  shareClassesCreated,
  lpActorsUpdated
});

logError(`Migration failed`, error, { step, dealId });
```

#### Increment 2: ShareClass CRUD API
```javascript
// List share classes
log(`GET /share-classes`, { dealId, userId: authUser.id });
log(`Share classes fetched`, { dealId, count: shareClasses.length });

// Create share class
log(`POST /share-classes`, { dealId, code, name, userId: authUser.id });
log(`Validating share class code uniqueness`, { dealId, code });
logWarn(`Duplicate code attempted`, { dealId, code, existingId });
log(`Share class created`, { shareClassId, dealId, code, name });
logError(`Share class creation failed`, error, { dealId, code, name });

// Update share class
log(`PATCH /share-classes/:id`, { shareClassId, dealId, changes: Object.keys(body) });
log(`Share class updated`, { shareClassId, fieldsUpdated: Object.keys(body) });

// Delete share class
log(`DELETE /share-classes/:id`, { shareClassId, dealId, userId: authUser.id });
log(`Checking for existing LPs in class`, { shareClassId });
logWarn(`Cannot delete class with LPs`, { shareClassId, lpCount });
log(`Share class deleted`, { shareClassId, dealId });

// Auth/validation
log(`Auth check`, { userId: authUser.id, role: authUser.role, dealId });
logError(`Auth denied - not GP/Admin`, null, { userId: authUser.id, role: authUser.role });
logError(`Org isolation blocked`, null, { userOrgId, dealOrgId });
```

#### Increment 3: LPInvitation ShareClass Support
```javascript
// Invitation creation with shareClass
log(`Creating LP invitation`, { dealId, lpEmail, shareClassId: shareClassId || 'default' });
log(`Validating shareClassId`, { dealId, shareClassId });
logError(`Invalid shareClassId - not found`, null, { dealId, shareClassId });
logError(`Invalid shareClassId - wrong deal`, null, { shareClassDealId, requestDealId });
log(`Invitation created`, { invitationId, dealId, lpEmail, shareClassId });
```

#### Increment 4: LPActor ShareClass Assignment
```javascript
// Invitation acceptance
log(`Accepting invitation`, { invitationId, lpEmail });
log(`Invitation found`, { invitationId, dealId, shareClassId: inv.shareClassId || 'none' });

log(`Looking up/creating default share class`, { dealId });
log(`Default share class found`, { dealId, shareClassId });
log(`Creating default Class A`, { dealId });
log(`Default Class A created`, { dealId, shareClassId: newClass.id });

log(`Creating/updating LPActor`, {
  dealId,
  email,
  shareClassId,
  commitment: inv.commitment
});
log(`LPActor created`, { lpActorId, dealId, shareClassId });
logDebug(`LPActor state`, { lpActor: JSON.stringify(lpActor) });

// Duplicate handling
log(`Checking for existing LPActor`, { email, dealId, shareClassId });
logWarn(`LP already in this class`, { existingLpActorId, email, dealId, shareClassId });
```

#### Increment 5: Capital Calls with ShareClass
```javascript
// Creating capital call
log(`Creating capital call`, { dealId, totalAmount, lpCount });
log(`Fetching LPActors with share classes`, { dealId });
logDebug(`LPActors by class`, {
  classBreakdown: Object.fromEntries(
    groupByClass.map(([code, lps]) => [code, lps.length])
  )
});

log(`Creating allocation`, {
  lpActorId,
  shareClassCode: lp.shareClass?.code || 'N/A',
  amount
});

log(`Capital call created`, {
  capitalCallId,
  allocations: allocations.length,
  byClass: { A: 5, B: 3 } // counts per class
});
```

#### Increment 6: Distributions with ShareClass
```javascript
// Same pattern as capital calls
log(`Creating distribution`, { dealId, totalAmount, lpCount });
log(`Distribution allocation by class`, {
  classBreakdown: { A: 50000, B: 30000 }
});
log(`Allocation created`, {
  allocationId,
  lpActorId,
  shareClassCode,
  grossAmount,
  netAmount
});
```

#### Increment 7: LPTransfer ShareClass Validation
```javascript
log(`Creating LP transfer`, { dealId, fromLpActorId, toLpActorId, amount });
log(`Validating share class match`, {
  fromClass: fromLp.shareClass?.code,
  toClass: toLp.shareClass?.code
});
logError(`Transfer rejected - class mismatch`, null, {
  fromLpActorId,
  fromClass: fromLp.shareClass?.code,
  toLpActorId,
  toClass: toLp.shareClass?.code
});
log(`Transfer created`, { transferId, shareClassCode: fromLp.shareClass?.code });
```

#### Increment 8: Snapshots with ShareClass
```javascript
log(`Creating cap table snapshot`, { dealId, snapshotType });
log(`Fetching LP data with share classes`, { dealId });
logDebug(`Snapshot LP data`, {
  lpCount: lps.length,
  classCounts: { A: 5, B: 3 }
});
log(`Snapshot created`, {
  snapshotId,
  dealId,
  lpCount: lps.length,
  hasShareClassData: true
});
```

#### Increment 9: LP Portal ShareClass Display
```javascript
log(`LP portal data request`, { lpActorId, dealId });
log(`Fetching LP with share class`, { lpActorId });
log(`LP portal response`, {
  lpActorId,
  shareClassCode: lp.shareClass?.code,
  commitment: lp.commitment
});
```

### Log Output Examples

**Successful flow:**
```
2026-01-18T15:30:00.123Z [ShareClass] POST /share-classes {"dealId":"abc123","code":"B","name":"Class B","userId":"user1"}
2026-01-18T15:30:00.125Z [ShareClass] Validating share class code uniqueness {"dealId":"abc123","code":"B"}
2026-01-18T15:30:00.156Z [ShareClass] Share class created {"shareClassId":"xyz789","dealId":"abc123","code":"B","name":"Class B"}
```

**Error flow:**
```
2026-01-18T15:31:00.100Z [ShareClass] POST /share-classes {"dealId":"abc123","code":"B","name":"Class B Duplicate","userId":"user1"}
2026-01-18T15:31:00.102Z [ShareClass] Validating share class code uniqueness {"dealId":"abc123","code":"B"}
2026-01-18T15:31:00.105Z [ShareClass] WARN: Duplicate code attempted {"dealId":"abc123","code":"B","existingId":"xyz789"}
2026-01-18T15:31:00.106Z [ShareClass] ERROR: Share class creation failed {"dealId":"abc123","code":"B","error":"Unique constraint violation"}
```

**Migration flow:**
```
2026-01-18T15:00:00.000Z [Migration] Migration starting {"step":"create_shareclass_table"}
2026-01-18T15:00:00.050Z [Migration] ShareClass table created {}
2026-01-18T15:00:00.051Z [Migration] Migration: Finding deals without default share class {}
2026-01-18T15:00:00.100Z [Migration] Migration: Creating default Class A {"dealId":"deal1","dealName":"Main Street Apt"}
2026-01-18T15:00:00.150Z [Migration] Migration: Default class created {"dealId":"deal1","shareClassId":"class1"}
2026-01-18T15:00:00.151Z [Migration] Migration: Updating LPActors {"count":25}
2026-01-18T15:00:01.000Z [Migration] Migration complete {"dealsProcessed":10,"shareClassesCreated":10,"lpActorsUpdated":25}
```

### Key Logging Points (Summary)
1. **Every API request entry** - method, path, key params, userId
2. **Every validation step** - what's being validated, values checked
3. **Every validation failure** - specific reason, values that failed
4. **Every database query** - what's being fetched, filter criteria
5. **Every database mutation** - what's being created/updated, IDs
6. **Every successful completion** - counts, IDs created
7. **Every error with full context** - error message, stack trace (first 3 lines), input data
8. **State transitions** - status changes, before/after values
9. **Security events** - auth denied, org isolation blocked

### Debug Mode
Enable verbose logging per module:
```bash
DEBUG_SHARECLASS=true npm run bff
DEBUG_LPONBOARDING=true npm run bff
DEBUG_CAPITALCALLS=true npm run bff
```

---

## TEST STRATEGY

### Per-Increment Tests

| Increment | Test File | Focus |
|-----------|-----------|-------|
| 1 | Manual + migration test | Schema migration |
| 2 | `share-classes.test.js` | CRUD, auth, org isolation |
| 3-4 | `lp-share-class.test.js` | Invitation→LPActor flow |
| 5 | `capital-calls.test.js` | Allocation with classes |
| 6 | `distributions.test.js` | Allocation with classes |
| 7 | `lp-transfers.test.js` | Same-class validation |
| 8 | `snapshots.test.js` | Snapshot structure |
| 9 | E2E test | LP portal display |

### E2E Scenario
1. Create deal
2. Create Class A and Class B
3. Invite LP1 to Class A, LP2 to Class B
4. Accept invitations
5. Create capital call → verify both classes get allocations
6. Attempt transfer LP1→LP2 → verify fails (different classes)
7. View LP portal → verify class info displayed

---

## ROLLBACK CONSIDERATIONS

### Safe Migrations
- All new columns are NULLABLE first
- Default values populated before constraints changed
- No data deletion in forward migrations

### Per-Increment Rollback
| Increment | Rollback Steps |
|-----------|----------------|
| 1 | Drop ShareClass table, remove shareClassId from LPActor, restore old unique constraint |
| 2 | Remove route handlers |
| 3-4 | Remove shareClassId from LPInvitation, code changes |
| 5-9 | Code-only rollbacks (no schema changes) |

---

## CRITICAL FILES

| File | Changes |
|------|---------|
| `server/prisma/schema.prisma` | ShareClass model, LPActor/LPInvitation changes |
| `server/routes/share-classes.js` | NEW - CRUD endpoints |
| `server/routes/lp-onboarding.js` | ShareClass propagation |
| `server/routes/capital-calls.js` | ShareClass in logging/responses |
| `server/routes/distributions.js` | ShareClass in logging/responses |
| `server/routes/lp-transfers.js` | Same-class validation |
| `server/services/audit-service.js` | Snapshots with shareClass |
| `server/index.js` | Route dispatch |
| `src/lib/contracts.js` | Schema updates |

---

## VERIFICATION CHECKLIST

After each increment:
- [ ] npm run db:push succeeds
- [ ] npm run lint passes (or acceptable warnings)
- [ ] npm test passes for affected tests
- [ ] Manual smoke test of affected endpoints
- [ ] Existing functionality still works (regression)

After all increments:
- [ ] Create deal with multiple share classes
- [ ] Invite LPs to different classes
- [ ] Create capital call → allocations by class
- [ ] LP portal shows class info
- [ ] Transfers validate same-class requirement

---

# INCREMENT 10: PER-CLASS WATERFALL CALCULATIONS

**Date**: January 18, 2026
**Status**: PLANNING
**Risk Level**: HIGH - Core financial calculation logic
**User Constraint**: "don't implement this plan unless you're absolutely sure it won't break the system"

---

## EXECUTIVE SUMMARY

This increment adds per-class waterfall calculations where different share classes (Class A, Class B, Preferred, etc.) can have different economic terms:
- Different preferred returns (e.g., Class A: 8%, Preferred: 10%)
- Different management fees
- Different carry percentages
- Payment priority (senior classes paid before junior)

**Key Design Decision**: The calculator will process classes **in priority order**, paying each class its pref before moving to the next. Within a class, distributions are **pari passu** (pro-rata by ownership).

---

## INDUSTRY BEST PRACTICES (Research Summary)

From web research on waterfall calculations:

1. **Standard Waterfall Tiers**:
   - Tier 1: Return of Capital (100% to LPs until capital returned)
   - Tier 2: Preferred Return (100% to LPs until pref hurdle met)
   - Tier 3: GP Catch-up (100% to GP until GP reaches target promote)
   - Tier 4: Carried Interest splits (e.g., 80/20, 70/30 based on IRR hurdles)

2. **Multi-Class Priority Rules**:
   - Senior classes paid before junior classes
   - Within same priority, pay pari passu (pro-rata)
   - Each class has its own preferred return and promote structure

3. **Common Structures**:
   - **Preferred Equity**: Higher pref (10-12%), lower/no promote participation
   - **Common Equity (Class A)**: Standard 8% pref, full promote participation
   - **Class B / Founders**: Lower pref (6%), higher promote participation

4. **Calculation Considerations**:
   - Cumulative vs. non-cumulative preferred returns
   - Compounding frequency (annual, quarterly)
   - IRR vs. equity multiple hurdles
   - Lookback/clawback provisions

---

## CURRENT STATE ANALYSIS

### Existing Waterfall Calculator (`waterfall-calculator.js`)

**Strengths**:
- Well-structured year-by-year calculation
- Supports multiple promote tiers with IRR hurdles
- Has GP catch-up logic
- Has lookback provision support
- Good template system (CORE, VALUE_ADD, OPPORTUNISTIC, etc.)

**Limitations**:
- Treats ALL LPs uniformly - single preferredReturn for everyone
- No per-class terms support
- No priority-based payment ordering
- Does not use ShareClass model data

**Key Function**: `calculateWaterfall(cashFlows, structure)`
- Input: Array of cash flows, structure object
- Structure: `{ lpEquity, gpEquity, preferredReturn, promoteTiers, gpCatchUp, catchUpPercent, lookback }`
- Output: Yearly distributions, summary metrics

### Existing WaterfallStructure Model (schema.prisma:950-976)

```prisma
model WaterfallStructure {
  id              String    @id
  dealId          String    @unique
  lpEquity        Float
  gpEquity        Float
  preferredReturn Float     @default(0.08)
  promoteTiers    String    // JSON array
  gpCatchUp       Boolean   @default(true)
  catchUpPercent  Float?    @default(1.0)
  lookback        Boolean   @default(false)
}
```

**Issue**: Only ONE waterfall structure per deal - does not support per-class terms.

### ShareClass Model (schema.prisma:341-373)

```prisma
model ShareClass {
  id              String
  dealId          String
  name            String      // "Class A", "Preferred"
  code            String      // "A", "P"
  preferredReturn Float?      // e.g., 0.08
  managementFee   Float?      // e.g., 0.02
  carryPercent    Float?      // e.g., 0.20
  priority        Int         // 1 = highest priority
}
```

**Good news**: ShareClass already has the economic terms fields! We just need to USE them in calculations.

---

## ARCHITECTURAL APPROACH

### Option A: Modify Existing Calculator (CHOSEN)
- Add optional `perClassConfig` parameter
- If perClassConfig provided, process classes in priority order
- Fall back to existing logic when no perClassConfig

**Pros**: Backward compatible, minimal schema changes
**Cons**: Calculator becomes more complex

### Option B: New Per-Class Calculator
- Create separate `calculateClassBasedWaterfall()` function
- Keep existing calculator for simple deals

**Pros**: Clean separation
**Cons**: Code duplication, harder to maintain

### Decision: **Option A** - Modify existing calculator with backward compatibility

---

## INCREMENTAL IMPLEMENTATION PLAN

### Sub-Increment 10.1: Add Logging to Existing Calculator
**Goal**: Understand current calculation flow before modifying
**Risk**: NONE - logging only
**Regression Risk**: NONE

**Changes**:
- Add logging utilities to `waterfall-calculator.js`
- Log each calculation step
- Log input parameters, intermediate values, output

**Files**: `server/services/waterfall-calculator.js`

**Test**: Run existing waterfall tests, verify logs appear

---

### Sub-Increment 10.2: Create Per-Class Helper Functions
**Goal**: Build utilities without modifying main calculator
**Risk**: LOW - new code only
**Regression Risk**: NONE

**New Functions**:
```javascript
/**
 * Group LPs by share class priority
 * @returns Map<priority, { class: ShareClass, lps: LPActor[], totalCapital: number }>
 */
function groupLPsByClassPriority(lpOwnership)

/**
 * Calculate preferred return owed for a single class
 * @returns { accrued: number, paid: number, owed: number }
 */
function calculateClassPreferred(classConfig, capitalContributed, yearCount)

/**
 * Allocate amount to LPs within a class (pari passu)
 * @returns Map<lpActorId, amount>
 */
function allocateWithinClass(lps, totalAmount)
```

**Files**: `server/services/waterfall-calculator.js`

**Test**: Unit tests for helper functions

---

### Sub-Increment 10.3: Add Per-Class Config to Snapshot
**Goal**: Ensure snapshots capture per-class terms for reproducibility
**Risk**: LOW - additive change
**Regression Risk**: LOW

**Changes**:
- `createDistributionSnapshot()` already captures shareClass info per LP
- Verify all class economic terms (preferredReturn, managementFee, carryPercent, priority) are included
- Add validation logging

**Files**: `server/services/audit-service.js`

**Test**: Create snapshot, verify class terms in JSON

---

### Sub-Increment 10.4: Add Optional perClassMode to calculateWaterfall
**Goal**: Accept per-class config without changing default behavior
**Risk**: MEDIUM - core calculator change
**Regression Risk**: MEDIUM

**Signature Change**:
```javascript
// Before
calculateWaterfall(cashFlows, structure)

// After
calculateWaterfall(cashFlows, structure, options = {})
// options.perClassConfig: Array<{ class: ShareClass, lps: LP[], totalCapital: number }>
// options.useClassTerms: boolean (default: false for backward compatibility)
```

**Logic**:
```javascript
if (!options.useClassTerms || !options.perClassConfig) {
  // Existing logic - unchanged
  return existingCalculation(cashFlows, structure);
}

// New per-class logic
return calculatePerClassWaterfall(cashFlows, structure, options.perClassConfig);
```

**Files**: `server/services/waterfall-calculator.js`

**Test**:
1. Run ALL existing tests - must pass unchanged
2. New test with perClassConfig

---

### Sub-Increment 10.5: Implement Per-Class Waterfall Core Logic
**Goal**: Calculate distributions respecting class priority and terms
**Risk**: HIGH - financial calculation logic
**Regression Risk**: HIGH if not isolated

**Algorithm**:
```
For each year's cash flow:
  1. Sort classes by priority (1 = first)

  2. RETURN OF CAPITAL PHASE (by priority):
     For each class in priority order:
       - Calculate capital owed to class
       - Pay class's capital (pro-rata among class LPs)
       - Deduct from remaining cash
       - If cash exhausted, stop

  3. PREFERRED RETURN PHASE (by priority):
     For each class in priority order:
       - Use CLASS's preferredReturn (from ShareClass.preferredReturn)
       - Calculate pref owed (capital × rate × time)
       - Pay class's pref (pro-rata among class LPs)
       - If cash exhausted, stop

  4. GP CATCH-UP PHASE:
     (Only after ALL classes' pref paid)
     - Same as current logic

  5. PROMOTE PHASE:
     - Use deal-level promote tiers (same for all classes)
     - OR use per-class carryPercent if defined
     - Distribute based on current IRR tier
```

**Files**: `server/services/waterfall-calculator.js`

**Test**:
1. Single class → same result as before
2. Two classes, same terms → same result as pro-rata
3. Two classes, different pref → Preferred class gets higher pref %
4. Two classes, different priority → Senior paid first

---

### Sub-Increment 10.6: Integration with Distributions
**Goal**: Use per-class waterfall when creating distributions
**Risk**: MEDIUM - affects production workflows
**Regression Risk**: MEDIUM

**Changes to `distributions.js`**:
```javascript
// In handleCreateDistribution:

// 1. Fetch LPs with share class data
const lpActors = await prisma.lPActor.findMany({
  where: { dealId, status: 'ACTIVE' },
  include: { shareClass: true }
});

// 2. Group by class
const perClassConfig = groupLPsByClassPriority(lpActors);

// 3. Check if deal uses per-class waterfall
const hasMultipleClasses = perClassConfig.size > 1;
const useClassTerms = hasMultipleClasses && perClassConfig.values().some(c => c.class.preferredReturn != null);

// 4. Calculate allocations
if (useClassTerms) {
  // Use per-class calculator
  const result = calculateWaterfall(cashFlows, structure, { useClassTerms: true, perClassConfig });
  // ... create allocations from result
} else {
  // Existing pro-rata allocation (unchanged)
}
```

**Files**: `server/routes/distributions.js`

**Test**:
1. Distribution with single class → unchanged behavior
2. Distribution with multiple classes, same terms → unchanged behavior
3. Distribution with multiple classes, different terms → class-aware allocation

---

### Sub-Increment 10.7: UI Display of Per-Class Results
**Goal**: Show waterfall breakdown by class in GP view
**Risk**: LOW - UI only
**Regression Risk**: LOW

**Changes**:
- Add `byClass` breakdown to waterfall response
- Display class-level totals in distribution detail

**Files**:
- `server/routes/distributions.js` (response format)
- UI components (future)

**Test**: API returns byClass breakdown

---

### Sub-Increment 10.8: Add Feature Flag / Gradual Rollout
**Goal**: Safely enable per-class mode per deal
**Risk**: LOW - additive
**Regression Risk**: NONE

**Approach**:
- Add `usePerClassWaterfall` boolean to WaterfallStructure or Deal
- Default to `false` for all existing deals
- GP must explicitly enable for deals that need it

**Files**:
- `server/prisma/schema.prisma` (optional field)
- `server/routes/distributions.js` (check flag)

---

## LOGGING STRATEGY

### New Log Prefix
```javascript
const LOG_PREFIX = "[Waterfall]";
```

### Key Log Points

```javascript
// Entry point
log(`calculateWaterfall called`, {
  cashFlowCount: cashFlows.length,
  lpEquity: structure.lpEquity,
  useClassTerms: options?.useClassTerms || false,
  classCount: options?.perClassConfig?.size || 1
});

// Per-class grouping
log(`Classes grouped by priority`, {
  priorities: [...perClassConfig.keys()],
  breakdown: Object.fromEntries([...perClassConfig.entries()].map(([p, c]) => [p, {
    classCode: c.class.code,
    lpCount: c.lps.length,
    totalCapital: c.totalCapital,
    prefReturn: c.class.preferredReturn
  }]))
});

// Return of capital phase
log(`ROC phase`, { year, remaining, phase: 'ROC' });
for (const [priority, classData] of sortedClasses) {
  log(`ROC: Class ${classData.class.code}`, {
    priority,
    capitalOwed,
    capitalPaid,
    remaining
  });
}

// Preferred return phase
log(`Pref phase`, { year, remaining, phase: 'PREF' });
for (const [priority, classData] of sortedClasses) {
  log(`Pref: Class ${classData.class.code}`, {
    priority,
    classPreferredReturn: classData.class.preferredReturn,
    prefOwed,
    prefPaid,
    remaining
  });
}

// Promote phase
log(`Promote phase`, { year, remaining, currentIRR, applicableTier });

// Allocation within class
logDebug(`Allocating within class`, {
  classCode,
  totalAmount,
  lpCount,
  allocations: [...allocations.entries()]
});

// Final result
log(`Waterfall complete`, {
  lpTotalReturn,
  gpTotalReturn,
  byClass: Object.fromEntries([...classTotals.entries()])
});

// Error cases
logError(`Waterfall calculation failed`, error, { cashFlows, structure });
```

---

## TEST PLAN

### Test File: `server/tests/waterfall-per-class.test.js`

### Test Cases

#### 10.T1: Backward Compatibility
```javascript
describe('Backward compatibility', () => {
  test('existing calculateWaterfall without options unchanged', () => {
    // Use existing test case data
    // Verify exact same output as before
  });

  test('with options.useClassTerms=false unchanged', () => {
    // Same as above with explicit false
  });
});
```

#### 10.T2: Single Class with Per-Class Mode
```javascript
describe('Single class with per-class mode', () => {
  test('single class should equal pro-rata result', () => {
    // One class, 3 LPs
    // Result should match non-per-class calculation
  });
});
```

#### 10.T3: Multiple Classes Same Terms
```javascript
describe('Multiple classes, same terms', () => {
  test('Class A and B with same 8% pref', () => {
    // Both classes have 8% pref
    // Result should match pro-rata
  });
});
```

#### 10.T4: Multiple Classes Different Pref
```javascript
describe('Multiple classes, different preferred returns', () => {
  test('Preferred (10%) and Common (8%)', () => {
    // Preferred class should accrue at 10%
    // Common class should accrue at 8%
  });
});
```

#### 10.T5: Priority Payment Order
```javascript
describe('Priority payment order', () => {
  test('Senior class paid before junior', () => {
    // Class P (priority 1, 10% pref)
    // Class A (priority 2, 8% pref)
    // Limited cash flow
    // Verify Class P gets paid first
  });
});
```

#### 10.T6: Insufficient Cash for All Classes
```javascript
describe('Insufficient cash', () => {
  test('senior class gets full pref, junior gets partial', () => {
    // Cash only covers Class P pref + partial Class A
    // Verify Class P fully satisfied
    // Verify Class A partially satisfied
  });
});
```

#### 10.T7: GP Catch-up After All Pref
```javascript
describe('GP catch-up', () => {
  test('GP catches up only after all classes pref paid', () => {
    // Multiple classes
    // Verify GP catch-up only starts when ALL classes have pref
  });
});
```

#### 10.T8: Full E2E Distribution with Classes
```javascript
describe('E2E distribution', () => {
  test('create distribution with per-class allocation', async () => {
    // Create deal with Class A and Preferred
    // Create LPs in each class
    // Create distribution
    // Verify allocations respect class terms
  });
});
```

### Regression Tests
Run ALL existing tests before and after each sub-increment:
- `npm run test -- --grep waterfall`
- `npm run test -- --grep distribution`
- `npm run test -- --grep capital-call`

---

## CRITICAL INVARIANTS

### Must Always Hold
1. **Sum of allocations = totalAmount** (no rounding loss > $0.01)
2. **Classes paid in priority order** (no junior paid before senior)
3. **Within class, pro-rata** (LP allocation ∝ ownership)
4. **useClassTerms=false → identical to current** (backward compatible)
5. **Snapshot captures all terms** (reproducible calculation)

### Validation Checks in Code
```javascript
// After allocation calculation:
const totalAllocated = allocations.reduce((sum, a) => sum + a.amount, 0);
if (Math.abs(totalAllocated - distributionAmount) > 0.01) {
  logError(`Allocation sum mismatch`, null, {
    expected: distributionAmount,
    actual: totalAllocated,
    diff: totalAllocated - distributionAmount
  });
  throw new Error('Allocation sum does not match distribution amount');
}
```

---

## ROLLBACK PLAN

### Per Sub-Increment Rollback

| Sub-Increment | Rollback |
|---------------|----------|
| 10.1 | Remove logging (git revert) |
| 10.2 | Remove helper functions (git revert) |
| 10.3 | No rollback needed - additive |
| 10.4 | Remove options parameter, restore original signature |
| 10.5 | Remove per-class logic, keep original |
| 10.6 | Remove useClassTerms check in distributions.js |
| 10.7 | Remove byClass from response |
| 10.8 | Remove feature flag |

### Emergency Rollback
If issues found in production:
1. Set `usePerClassWaterfall = false` on affected deals
2. All distributions revert to pro-rata
3. No data migration needed

---

## CRITICAL FILES

| File | Sub-Increment | Changes |
|------|---------------|---------|
| `server/services/waterfall-calculator.js` | 10.1-10.5 | Logging, helpers, per-class logic |
| `server/services/audit-service.js` | 10.3 | Snapshot verification |
| `server/routes/distributions.js` | 10.6-10.7 | Integration, response format |
| `server/prisma/schema.prisma` | 10.8 (optional) | Feature flag |
| `server/tests/waterfall-per-class.test.js` | All | New test file |

---

## VERIFICATION CHECKLIST

### Before Each Sub-Increment
- [ ] Git commit on clean state
- [ ] All existing tests passing
- [ ] Note current test count

### After Each Sub-Increment
- [ ] Run `npm run test -- --grep waterfall` - must pass
- [ ] Run `npm run test -- --grep distribution` - must pass
- [ ] Run lint - no new errors
- [ ] Test count same or higher (no removed tests)
- [ ] Manual smoke test if applicable

### Final Verification
- [ ] Create deal with Class A (8% pref) and Preferred (10% pref)
- [ ] Add 2 LPs to Class A, 1 LP to Preferred
- [ ] Create distribution with $100,000
- [ ] Verify Preferred LP gets paid first (priority)
- [ ] Verify Preferred LP's pref calculated at 10%
- [ ] Verify Class A LPs' pref calculated at 8%
- [ ] Verify allocations sum to $100,000

---

## IMPLEMENTATION CONFIDENCE

| Aspect | Confidence | Rationale |
|--------|------------|-----------|
| Backward compatibility | HIGH | Explicit default + existing test suite |
| Correct calculation | MEDIUM | Complex logic, needs thorough testing |
| Performance | HIGH | Same O(n) complexity |
| Data integrity | HIGH | Snapshot + validation checks |
| Rollback safety | HIGH | Feature flag + no schema changes to core |

**Overall Recommendation**: PROCEED with caution, following sub-increments strictly.

---

## ESTIMATED EFFORT

| Sub-Increment | Effort |
|---------------|--------|
| 10.1 Logging | 15 min |
| 10.2 Helper functions | 30 min |
| 10.3 Snapshot verification | 15 min |
| 10.4 Options parameter | 20 min |
| 10.5 Per-class core logic | 1.5 hours |
| 10.6 Distribution integration | 30 min |
| 10.7 UI response | 15 min |
| 10.8 Feature flag | 15 min |
| Testing | 1 hour |

**Total**: ~4-5 hours

---

## QUESTIONS TO RESOLVE BEFORE IMPLEMENTATION

1. ✅ **Already resolved**: ShareClass model has preferredReturn, managementFee, carryPercent, priority fields
2. ⚠️ **Need to confirm**: Should GP catch-up happen once (after ALL classes pref) or per-class?
   - **Assumption**: Once, after all classes pref - industry standard
3. ⚠️ **Need to confirm**: Should promote tiers be deal-wide or per-class?
   - **Assumption**: Deal-wide (simpler) - can add per-class in future
4. ⚠️ **Need to confirm**: What if a class has no preferredReturn set?
   - **Assumption**: Fall back to deal-level WaterfallStructure.preferredReturn

---

# END-TO-END CONSISTENCY TEST PLAN

**Date**: January 18, 2026
**Goal**: Ensure numbers flow consistently from underwriting to execution across the entire platform

---

## EXECUTIVE SUMMARY

This section defines a comprehensive test strategy to ensure end-to-end data consistency as new features are added. The tests verify that:
1. Waterfall structure terms flow correctly from underwriting to distribution
2. Per-class calculations produce consistent results across all endpoints
3. LP allocations match waterfall calculations exactly
4. Snapshots preserve calculation reproducibility

---

## CURRENT STATE (COMPLETED)

### Unit/Integration Tests (Jest)
- `server/__tests__/waterfall-per-class.test.js` - 29 tests for per-class waterfall
- `server/__tests__/share-classes.test.js` - ShareClass model tests
- `server/__tests__/lp-onboarding.test.js` - LP onboarding flow
- `server/__tests__/lp-transfers.test.js` - LP transfer validation

### E2E Tests (Playwright)
- `e2e/tests/deal-create.spec.ts` - Deal creation flow
- `e2e/tests/deals-list.spec.ts` - Deal listing
- `e2e/tests/deal-overview.spec.ts` - Deal overview display

---

## NEW E2E TESTS TO ADD

### Test File: `server/__tests__/e2e-number-flow.test.js`

**Purpose**: API-level integration tests that verify numbers flow correctly from underwriting through distribution creation to LP allocations.

### Test Suite 1: Waterfall Structure → Distribution Integration

```javascript
describe('E2E: Underwriting to Distribution Flow', () => {
  // Setup: Create deal, waterfall structure, share classes, LPs

  test('1.1: Waterfall structure terms propagate to distribution calculation', async () => {
    // 1. Create waterfall structure with specific terms
    // 2. Create distribution using useWaterfall=true
    // 3. Verify distribution calculation used waterfall terms
    // 4. Verify allocations match expected waterfall output
  });

  test('1.2: Per-class preferred returns applied correctly', async () => {
    // 1. Create Class A (8% pref) and Class P (10% pref)
    // 2. Add LPs to each class
    // 3. Create distribution
    // 4. Verify Class P LPs received 10% pref rate
    // 5. Verify Class A LPs received 8% pref rate
  });

  test('1.3: Priority ordering respected in limited cash scenario', async () => {
    // 1. Create senior (priority 1) and junior (priority 2) classes
    // 2. Create distribution with limited cash (not enough for all)
    // 3. Verify senior class paid before junior
    // 4. Verify senior receives full allocation before junior gets any
  });

  test('1.4: Pro-rata allocation within same class', async () => {
    // 1. Create single class with 3 LPs at different ownership %
    // 2. Create distribution
    // 3. Verify each LP's allocation is proportional to ownership
    // 4. Verify sum of allocations equals total distribution
  });
});
```

### Test Suite 2: Snapshot Reproducibility

```javascript
describe('E2E: Snapshot Reproducibility', () => {
  test('2.1: Distribution snapshot captures per-class terms', async () => {
    // 1. Create distribution, capturing snapshot
    // 2. Read snapshot lpOwnership JSON
    // 3. Verify each LP entry includes shareClass with terms
    // 4. Verify capTableHash matches recalculated hash
  });

  test('2.2: Calculation reproducible from snapshot data', async () => {
    // 1. Create distribution with waterfall
    // 2. Get snapshot
    // 3. Re-run waterfall calculation using snapshot data
    // 4. Verify identical results to original
  });

  test('2.3: Snapshot captures waterfall rules', async () => {
    // 1. Create distribution with waterfall structure
    // 2. Read snapshot waterfallRules JSON
    // 3. Verify all structure fields captured
    // 4. Verify rulebookHash matches recalculated hash
  });
});
```

### Test Suite 3: Data Integrity Invariants

```javascript
describe('E2E: Data Integrity Invariants', () => {
  test('3.1: Allocation sum equals distribution total', async () => {
    // Create distribution, verify sum of allocations === totalAmount
    // Allow max $0.01 rounding tolerance
  });

  test('3.2: No negative allocations', async () => {
    // Verify all allocations >= 0
  });

  test('3.3: All active LPs receive allocation', async () => {
    // Create distribution with multiple LPs
    // Verify every ACTIVE LPActor has an allocation record
  });

  test('3.4: Inactive LPs excluded from allocation', async () => {
    // Set one LP to INACTIVE status
    // Create distribution
    // Verify inactive LP has no allocation
  });

  test('3.5: Org isolation enforced', async () => {
    // Attempt to access distribution from different org
    // Verify 403/404 response
  });
});
```

### Test Suite 4: Backward Compatibility

```javascript
describe('E2E: Backward Compatibility', () => {
  test('4.1: Distribution without waterfall uses pro-rata', async () => {
    // Create distribution with useWaterfall=false
    // Verify simple pro-rata allocation
    // Verify no waterfall metadata in response
  });

  test('4.2: Deal without classes uses default allocation', async () => {
    // Create deal without any share classes
    // Create distribution
    // Verify standard pro-rata based on ownershipPct
  });

  test('4.3: Existing distribution APIs unchanged', async () => {
    // Call GET /distributions, POST /distributions with legacy params
    // Verify existing behavior preserved
  });
});
```

### Test Suite 5: Full E2E Scenario

```javascript
describe('E2E: Complete Deal Lifecycle', () => {
  test('5.1: Full flow from deal creation to LP distribution', async () => {
    // STEP 1: Create deal via API
    const deal = await createDeal({ name: 'E2E Test Deal', purchasePrice: 10000000 });

    // STEP 2: Create waterfall structure
    const waterfall = await createWaterfallStructure(deal.id, {
      lpEquity: 9000000,
      gpEquity: 1000000,
      preferredReturn: 0.08,
      promoteTiers: [{ hurdle: 0.12, lpSplit: 0.80, gpSplit: 0.20 }],
      gpCatchUp: true
    });

    // STEP 3: Create share classes
    const classA = await createShareClass(deal.id, { code: 'A', preferredReturn: 0.08, priority: 1 });
    const classB = await createShareClass(deal.id, { code: 'B', preferredReturn: 0.06, priority: 2 });

    // STEP 4: Invite and accept LPs
    const lp1 = await inviteAndAcceptLP(deal.id, { email: 'lp1@test.com', commitment: 5000000, classId: classA.id });
    const lp2 = await inviteAndAcceptLP(deal.id, { email: 'lp2@test.com', commitment: 3000000, classId: classA.id });
    const lp3 = await inviteAndAcceptLP(deal.id, { email: 'lp3@test.com', commitment: 1000000, classId: classB.id });

    // STEP 5: Calculate waterfall via underwriting endpoint
    const waterfallCalc = await calculateWaterfall(deal.id, {
      cashFlows: [500000, 600000, 700000, 12000000],
      usePerClassWaterfall: true
    });
    expect(waterfallCalc.byClass.A).toBeDefined();
    expect(waterfallCalc.byClass.B).toBeDefined();

    // STEP 6: Create distribution using waterfall
    const distribution = await createDistribution(deal.id, {
      totalAmount: 1000000,
      type: 'OPERATING',
      useWaterfall: true
    });

    // STEP 7: Verify allocations
    expect(distribution.allocations.length).toBe(3);
    const totalAllocated = distribution.allocations.reduce((s, a) => s + a.grossAmount, 0);
    expect(Math.abs(totalAllocated - 1000000)).toBeLessThan(0.01);

    // STEP 8: Verify LP can view their allocation
    const lp1View = await getLPPortalData(lp1.id);
    expect(lp1View.distributions).toContainEqual(
      expect.objectContaining({ distributionId: distribution.id })
    );

    // STEP 9: Verify snapshot was created
    expect(distribution.snapshotId).toBeDefined();
    const snapshot = await getSnapshot(distribution.snapshotId);
    expect(JSON.parse(snapshot.lpOwnership).length).toBe(3);
  });
});
```

---

## IMPLEMENTATION PLAN

### Phase 1: Create Test Infrastructure

**File**: `server/__tests__/helpers/e2e-test-utils.js`

```javascript
// Helper functions for E2E tests
export async function createTestDeal(name) { ... }
export async function createTestWaterfallStructure(dealId, structure) { ... }
export async function createTestShareClass(dealId, config) { ... }
export async function createTestLP(dealId, lpData) { ... }
export async function createTestDistribution(dealId, config) { ... }
export async function cleanupTestData(dealId) { ... }
```

### Phase 2: Implement Test Suites

| Suite | File | Tests |
|-------|------|-------|
| Underwriting → Distribution | `e2e-number-flow.test.js` | 4 tests |
| Snapshot Reproducibility | `e2e-number-flow.test.js` | 3 tests |
| Data Integrity | `e2e-number-flow.test.js` | 5 tests |
| Backward Compatibility | `e2e-number-flow.test.js` | 3 tests |
| Full E2E | `e2e-number-flow.test.js` | 1 comprehensive test |

### Phase 3: CI Integration

Add to `package.json`:
```json
{
  "scripts": {
    "test:e2e-flow": "jest --testPathPattern=e2e-number-flow --runInBand",
    "test:all": "npm test && npm run test:e2e-flow"
  }
}
```

---

## KEY VERIFICATION POINTS

### Numbers That Must Match

| Source | Target | Verification |
|--------|--------|--------------|
| WaterfallStructure.preferredReturn | calculateWaterfall input | structure.preferredReturn matches |
| ShareClass.preferredReturn | Per-class pref calculation | byClass[X].effectivePref matches |
| calculateWaterfall output | Distribution allocations | Sum matches totalAmount |
| Snapshot lpOwnership | Current LPActors | LP IDs and terms match |
| Distribution.totalAmount | Sum(allocations.grossAmount) | Difference < $0.01 |

### Critical Invariants (Tested)

1. **SUM(allocations) = totalAmount** ± $0.01
2. **Priority ordering**: Senior class paid before junior
3. **Pro-rata within class**: LP allocation ∝ ownershipPct
4. **Backward compatible**: useWaterfall=false → legacy behavior
5. **Reproducible**: Same inputs → same outputs

---

## FILES TO CREATE

| File | Purpose |
|------|---------|
| `server/__tests__/e2e-number-flow.test.js` | Main E2E test suite (~400 lines) |
| `server/__tests__/helpers/e2e-test-utils.js` | Test helper functions (~150 lines) |

---

## RUN COMMANDS

```bash
# Run all E2E number flow tests
npm test -- e2e-number-flow

# Run specific suite
npm test -- e2e-number-flow -t "Underwriting to Distribution"

# Run with verbose output
npm test -- e2e-number-flow --verbose

# Run as part of CI
npm run test:all
```

---

## VERIFICATION CHECKLIST

After implementing tests:
- [ ] All 16 new tests pass
- [ ] No existing tests broken
- [ ] Test coverage for all critical paths
- [ ] CI integration configured
- [ ] Documentation updated

---

## NEXT STEPS AFTER E2E TESTS

1. ✅ **E2E number flow tests** - This plan
2. ⏳ Sub-Increment 10.7: UI display of per-class results
3. ⏳ Sub-Increment 10.8: Add feature flag for gradual rollout

---

# E2E REAL ESTATE INVESTMENT PROCESS GAP ANALYSIS

**Date**: January 19, 2026
**Purpose**: Compare industry-standard CRE investment lifecycle against current implementation

---

## INDUSTRY STANDARD CRE PRIVATE EQUITY LIFECYCLE

Based on research into leading platforms (Juniper Square, Agora, Cash Flow Portal) and industry practices:

### Phase 1: Fundraising & Subscription
| Stage | Industry Standard | Our Implementation | Status |
|-------|-------------------|-------------------|--------|
| Investor marketing/data room | ✅ Gated data room with NDAs | `DealMarketingRoom`, `MarketingRoomAccess`, `MarketingRoomInterest` | ✅ COMPLETE |
| Subscription docs | ✅ E-signature integration | `Subscription` model with status workflow | ✅ COMPLETE |
| AML/KYC compliance | ❌ Third-party identity verification | No models for compliance verification | ❌ MISSING |
| Accreditation verification | ❌ Verify accredited investor status | No `AccreditationRecord` model | ❌ MISSING |
| Side letter management | ✅ Individual LP terms | `Subscription.sideLetter`, `sideLetterDocId` | ✅ COMPLETE |

### Phase 2: Deal Acquisition & Closing
| Stage | Industry Standard | Our Implementation | Status |
|-------|-------------------|-------------------|--------|
| LOI/PSA tracking | ✅ Document lifecycle | `DocumentVersion` with DRAFT→BINDING→EXECUTED states | ✅ COMPLETE |
| Due diligence workflow | ✅ Checklist, evidence pack | `DealState`, `ApprovalRecord`, `EvidencePack` | ✅ COMPLETE |
| Closing checklist | ✅ Multi-party approvals | `ApprovalRecord` with role-based approvals | ✅ COMPLETE |
| Escrow tracking | ❌ Track escrow deposits | No escrow models | ⚠️ PARTIAL (manual via notes) |
| Title/insurance tracking | ❌ Track third-party docs | No dedicated models | ⚠️ PARTIAL |

### Phase 3: Capital Calls & Funding
| Stage | Industry Standard | Our Implementation | Status |
|-------|-------------------|-------------------|--------|
| Capital call creation | ✅ Pro-rata allocation | `CapitalCall`, `CapitalCallAllocation` | ✅ COMPLETE |
| Multi-class support | ✅ Different terms per class | `ShareClass` with per-class pref/fees, per-class waterfall | ✅ COMPLETE |
| Default/penalty tracking | ❌ Track LP defaults | No default workflow models | ❌ MISSING |
| Wire verification | ✅ Track incoming wires | `CapitalCallAllocation.fundedAmount`, `fundedAt`, `wireReference` | ✅ COMPLETE |
| Capital call notice generation | ✅ Auto-generate notices | `CapitalCall.documentId` (manual upload) | ⚠️ PARTIAL |

### Phase 4: Asset Management
| Stage | Industry Standard | Our Implementation | Status |
|-------|-------------------|-------------------|--------|
| Property operations reporting | ❌ Monthly/quarterly financials | No property-level financial models | ❌ MISSING |
| Budget vs. actual tracking | ✅ Variance analysis | `InvestorUpdate.planVsActual` (JSON) | ⚠️ PARTIAL |
| Capex tracking | ❌ Capital improvements | Only as capital call purpose | ⚠️ PARTIAL |
| Lease management | ⚠️ Rent roll import | `RentRollUnit` for point-in-time import | ⚠️ PARTIAL |
| Property valuation | ❌ Periodic NAV updates | No valuation models | ❌ MISSING |

### Phase 5: Distributions
| Stage | Industry Standard | Our Implementation | Status |
|-------|-------------------|-------------------|--------|
| Distribution creation | ✅ Auto-calculate from waterfall | `Distribution`, `DistributionAllocation`, waterfall calculator | ✅ COMPLETE |
| Per-class waterfall | ✅ Different tiers per class | `calculateWaterfall` with perClassConfig | ✅ COMPLETE |
| Tax withholding | ✅ Track withholding | `DistributionAllocation.withholdingAmount` | ✅ COMPLETE |
| Payment execution | ✅ Track payment status | `DistributionAllocation.status`, `paidAt` | ✅ COMPLETE |
| Distribution notices | ✅ Auto-generate | `Distribution.documentId` (manual) | ⚠️ PARTIAL |

### Phase 6: Reporting & Compliance
| Stage | Industry Standard | Our Implementation | Status |
|-------|-------------------|-------------------|--------|
| Quarterly investor updates | ✅ Structured content | `InvestorUpdate` with metrics, risks, plan vs actual | ✅ COMPLETE |
| K-1 tax documents | ✅ Annual K-1 delivery | `LPDocument.documentType = 'K1'`, `LPPaymentProfile.k1DeliveryMethod` | ✅ COMPLETE |
| LP statements | ⚠️ Per-LP financial summary | Can compute from allocations | ⚠️ PARTIAL (no dedicated report) |
| Audit trail | ✅ Immutable event log | `DealEvent`, `Snapshot`, `PermissionAuditLog` | ✅ COMPLETE |
| LP Q&A portal | ✅ Self-service questions | `LPQuestion` with answer workflow | ✅ COMPLETE |

### Phase 7: Exit & Disposition
| Stage | Industry Standard | Our Implementation | Status |
|-------|-------------------|-------------------|--------|
| Sale/refinance workflow | ✅ Track major events | `MajorEvent` with consent tracking | ✅ COMPLETE |
| LP consent collection | ✅ Threshold-based voting | `MajorEventConsent` with configurable threshold | ✅ COMPLETE |
| Final distribution | ✅ Return of capital + promote | Distribution workflow | ✅ COMPLETE |
| Waterfall true-up | ⚠️ Lookback/clawback | `WaterfallStructure.lookback` (flag only, logic partial) | ⚠️ PARTIAL |

---

## GAP SUMMARY BY SEVERITY

### 🔴 CRITICAL GAPS (Block Automation)

1. **AML/KYC Compliance Verification**
   - Industry: Third-party identity verification, OFAC screening
   - Current: No models
   - Impact: Cannot automate LP onboarding without compliance check
   - Effort: HIGH (requires third-party integration)

2. **LP Default/Penalty Workflow**
   - Industry: Track LP defaults, apply penalties, cure periods
   - Current: No models
   - Impact: Cannot handle LP non-payment scenarios
   - Effort: MEDIUM

3. **Property Operations Financials**
   - Industry: Monthly NOI, budget tracking, variance
   - Current: Only point-in-time imports (T12, rent roll)
   - Impact: Cannot automate quarterly reporting with actuals
   - Effort: HIGH (new models + property management integration)

### 🟡 MODERATE GAPS (Reduce Automation Quality)

4. **Property Valuation / NAV**
   - Industry: Quarterly NAV updates per property
   - Current: No valuation models
   - Impact: Cannot show LP portfolio value over time
   - Effort: MEDIUM

5. **Document Generation Automation**
   - Industry: Auto-generate notices, statements, K-1s
   - Current: Manual upload with documentId reference
   - Impact: Manual work for GPs
   - Effort: MEDIUM (template engine integration)

6. **LP Statement Reports**
   - Industry: Downloadable per-LP statement with full history
   - Current: Data exists but no report aggregation
   - Impact: LPs cannot self-serve comprehensive statements
   - Effort: LOW-MEDIUM

7. **Accreditation Verification**
   - Industry: Verify accredited investor status
   - Current: No models
   - Impact: Compliance risk for Reg D offerings
   - Effort: MEDIUM

### 🟢 MINOR GAPS (Nice to Have)

8. **Escrow/Title Tracking**
   - Can be handled with DealEvent notes
   - Low priority

9. **Lookback/Clawback Calculation**
   - Flag exists but logic not fully implemented
   - Edge case for most deals

---

## WHAT WE DO WELL (NO GAPS)

Based on schema analysis, these areas are **fully covered**:

1. **Investor Onboarding**
   - `LPInvitation` → `LPActor` workflow
   - Multi-class support with `ShareClass`
   - LP transfers between parties

2. **Capital Calls**
   - Pro-rata allocation
   - Per-class support
   - Wire tracking and funding status
   - Snapshot for reproducibility

3. **Distributions**
   - Waterfall calculator with per-class support
   - Priority ordering
   - GP catch-up, promote tiers
   - Tax withholding
   - Payment tracking

4. **Audit & Compliance**
   - `DealEvent` append-only ledger
   - `Snapshot` for point-in-time reproducibility
   - `PermissionAuditLog` for access changes
   - `ApprovalRecord` for multi-party workflows

5. **LP Portal**
   - Magic link access
   - Document access with permissions
   - Q&A workflow
   - Notification preferences
   - Payment profile

6. **Major Events**
   - Sale/refinance workflow
   - LP consent collection
   - Threshold-based approval

---

## RECOMMENDATIONS (PRIORITIZED)

### Phase 1: Complete Current Work
1. ✅ E2E tests passing (16 tests)
2. ⏳ **Sub-Increment 10.7**: UI display of per-class results
3. ⏳ **Sub-Increment 10.8**: Feature flag for gradual rollout

### Phase 2: Low-Hanging Fruit (1-2 weeks each)
4. **LP Statement Report Endpoint**
   - Aggregate all allocations, capital calls, distributions per LP
   - Return downloadable summary
   - No schema changes needed

5. **Document Generation Templates**
   - Capital call notice template
   - Distribution statement template
   - Use existing `GeneratedDocument` model

### Phase 3: Medium Effort (2-4 weeks each)
6. **LP Default Workflow**
   - Add `LPDefault` model (lpActorId, capitalCallId, defaultDate, curePeriod, penalty)
   - Add `CapitalCallAllocation.defaultStatus`
   - Add endpoint to mark LP in default

7. **NAV/Valuation Tracking**
   - Add `PropertyValuation` model (dealId, date, fairValue, method, appraiser)
   - Add endpoint to record valuations
   - Add LP portfolio value calculation

### Phase 4: High Effort (Multi-sprint)
8. **AML/KYC Integration**
   - Research providers (Onfido, Jumio, etc.)
   - Add `ComplianceCheck` model
   - Integrate into LP onboarding workflow

9. **Property Operations Module**
   - Requires new models: `PropertyFinancial`, `BudgetLine`, `ActualLine`
   - May require property management system integration
   - Consider as separate "Property Ops" module

---

## CURRENT SYSTEM STRENGTHS

The platform is **80-90% complete** for a typical GP/LP fund management workflow:

| Capability | Coverage |
|------------|----------|
| LP Onboarding | 95% (missing AML/KYC) |
| Capital Calls | 95% (missing default workflow) |
| Distributions | 100% (per-class waterfall complete) |
| Reporting | 70% (missing automated generation) |
| Audit Trail | 100% |
| LP Portal | 90% (missing statement reports) |
| Exit Events | 95% |

**Conclusion**: The current E2E flow from underwriting to distribution execution is solid. The 16 passing E2E tests verify number flow integrity. The main gaps are in compliance (AML/KYC), property operations, and document automation - not in the core financial calculations.

---

# SUB-INCREMENT 10.7 & 10.8: UI DISPLAY + FEATURE FLAG

**Date**: January 19, 2026
**Status**: READY FOR IMPLEMENTATION

---

## IMPLEMENTATION ORDER (Incremental with Testing)

Execute in this order, running tests after each step:

### PHASE 1: Feature Flag Backend (10.8.1-10.8.3)

#### Step 1: Schema Change
**File**: `server/prisma/schema.prisma`
```prisma
model WaterfallStructure {
  // ... existing fields ...
  usePerClassWaterfall  Boolean   @default(false)  // NEW
}
```
**Test**: `npm run db:push` succeeds

#### Step 2: Distribution Flag Check
**File**: `server/routes/distributions.js`
- Check `waterfallStructure.usePerClassWaterfall` before per-class calc
- Log flag decision
**Test**: `npm test -- e2e-number-flow`

#### Step 3: PATCH Endpoint Update
**File**: `server/routes/underwriting.js`
- Accept `usePerClassWaterfall` in update body
- Add audit event on change
**Test**: Manual API test with curl/Postman

---

### PHASE 2: Feature Flag Frontend (10.8.4-10.8.5)

#### Step 4: Toggle in Setup Form
**File**: `src/components/underwriting/WaterfallPanel.jsx`
- Add Switch for `usePerClassWaterfall`
- Show warning when enabled
**Test**: Visual test in browser

#### Step 5: Status Display
**File**: `src/components/underwriting/WaterfallPanel.jsx`
- Show badge in Waterfall Terms card
**Test**: Visual test

---

### PHASE 3: Per-Class UI (10.7.1-10.7.6)

#### Step 6: Create PerClassBreakdown Component
**File**: `src/components/distributions/PerClassBreakdown.jsx` (NEW)
- ClassCard sub-component with color coding
- Grid layout for multiple classes
**Test**: Storybook or isolated test

#### Step 7: Integrate into WaterfallPanel
**File**: `src/components/underwriting/WaterfallPanel.jsx`
- Add PerClassBreakdown after Distribution Summary
- Conditional render when >1 class
**Test**: Create multi-class deal, verify display

#### Step 8: Integrate into Distributions Page
**File**: `src/pages/Distributions.jsx`
- Add Class column to allocations table
- Add PerClassBreakdown in expanded row
- Add allocation method badge
**Test**: Full E2E verification

---

## KEY DESIGN DECISIONS

### 1. Feature Flag Location
**Decision**: `WaterfallStructure.usePerClassWaterfall` (Boolean)
**Rationale**: Deal-level control, follows existing pattern (gpCatchUp, lookback)

### 2. UI Color Scheme
```javascript
const CLASS_COLORS = {
  'A': { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' },
  'B': { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
  'P': { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700' },
  'default': { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700' }
};
```

### 3. Conditional Rendering
- Only show per-class breakdown when `byClass` exists AND has >1 class
- Single-class deals don't need breakdown (redundant)

### 4. Logging Strategy
All new logging uses pattern:
```javascript
console.log(`[Module] Action`, { dealId, field: value });
```

---

## FILES TO CREATE/MODIFY

| Step | File | Action |
|------|------|--------|
| 1 | `server/prisma/schema.prisma` | Add field |
| 2 | `server/routes/distributions.js` | Check flag |
| 3 | `server/routes/underwriting.js` | Accept in PATCH |
| 4-5 | `src/components/underwriting/WaterfallPanel.jsx` | Toggle + display |
| 6 | `src/components/distributions/PerClassBreakdown.jsx` | CREATE |
| 7 | `src/components/underwriting/WaterfallPanel.jsx` | Integrate |
| 8 | `src/pages/Distributions.jsx` | Add class column, breakdown |

---

## VERIFICATION CHECKLIST

After all steps:
- [ ] Create deal with flag=false, 2 classes → pro-rata allocation
- [ ] Enable flag via UI
- [ ] Create distribution → per-class waterfall
- [ ] WaterfallPanel shows per-class breakdown
- [ ] Distributions page shows class column and cards
- [ ] Allocation method badge displays correctly
- [ ] All 16 E2E tests still pass
- [ ] No console errors

---

## ROLLBACK

If issues:
1. Set `usePerClassWaterfall = false` on affected deals
2. Distributions revert to pro-rata
3. No data migration needed

---

## DETAILED IMPLEMENTATION WITH LOGGING & TESTS

### STEP 1: Schema Change

**File**: `server/prisma/schema.prisma`

**Change** (in WaterfallStructure model, after `lookback` field):
```prisma
  lookback              Boolean   @default(false)
  usePerClassWaterfall  Boolean   @default(false)  // Enable per-class waterfall calculation
```

**Commands**:
```bash
cd canonical-deal-os/server
npm run db:generate
npm run db:push
```

**Verify**: No errors, field added to database

---

### STEP 2: Distribution Flag Check with Logging

**File**: `server/routes/distributions.js`

**Location**: After fetching waterfallStructure (~line 262-269)

**Add Logging** (after `waterfallMode = true`):
```javascript
if (waterfallStructure) {
  waterfallMode = true;
  console.log(`[Distributions] Waterfall mode config`, {
    dealId,
    usePerClassWaterfall: waterfallStructure.usePerClassWaterfall,
    gpCatchUp: waterfallStructure.gpCatchUp,
    preferredReturn: waterfallStructure.preferredReturn
  });
}
```

**Location**: Before per-class calculation decision (~line 316-331)

**Replace** existing logic with flag check:
```javascript
// Check feature flag for per-class waterfall
const perClassFlagEnabled = waterfallStructure.usePerClassWaterfall === true;
const hasMultipleClasses = perClassConfig.size > 1;
const hasDifferentTerms = Array.from(perClassConfig.values())
  .some(c => c.class.preferredReturn !== null && c.class.preferredReturn !== undefined);

console.log(`[Distributions] Per-class decision`, {
  dealId,
  perClassFlagEnabled,
  hasMultipleClasses,
  hasDifferentTerms,
  classCount: perClassConfig.size
});

let waterfallOptions = {};
if (perClassFlagEnabled && (hasMultipleClasses || hasDifferentTerms)) {
  waterfallOptions = {
    useClassTerms: true,
    perClassConfig
  };
  console.log(`[Distributions] USING per-class waterfall`, {
    dealId,
    classCodes: Array.from(perClassConfig.values()).map(c => c.class.code)
  });
} else if (hasMultipleClasses && !perClassFlagEnabled) {
  console.log(`[Distributions] SKIPPING per-class (flag disabled), using standard waterfall`, { dealId });
} else {
  console.log(`[Distributions] Using standard waterfall (single class or no class terms)`, { dealId });
}
```

**Test Commands**:
```bash
cd canonical-deal-os/server
npm test -- e2e-number-flow --verbose
npm test -- share-classes --verbose
```

**Expected**: All 16 E2E tests pass, logs show flag decisions

---

### STEP 3: PATCH Endpoint with Logging

**File**: `server/routes/underwriting.js`

**Find**: `handleUpdateWaterfall` function

**Add to allowed fields**:
```javascript
const allowedFields = [
  'lpEquity', 'gpEquity', 'preferredReturn', 'promoteTiers',
  'gpCatchUp', 'catchUpPercent', 'lookback',
  'usePerClassWaterfall'  // NEW
];
```

**Add validation and logging before update**:
```javascript
// Validate usePerClassWaterfall if provided
if (body.usePerClassWaterfall !== undefined) {
  if (typeof body.usePerClassWaterfall !== 'boolean') {
    console.log(`[Waterfall] Invalid usePerClassWaterfall value`, {
      dealId,
      providedValue: body.usePerClassWaterfall,
      type: typeof body.usePerClassWaterfall
    });
    return sendError(res, 400, 'usePerClassWaterfall must be a boolean');
  }

  console.log(`[Waterfall] Per-class flag changing`, {
    dealId,
    oldValue: existing.usePerClassWaterfall,
    newValue: body.usePerClassWaterfall,
    userId: authUser.id
  });
}
```

**Add audit event after successful update**:
```javascript
// If flag changed, create audit event
if (body.usePerClassWaterfall !== undefined &&
    body.usePerClassWaterfall !== existing.usePerClassWaterfall) {
  await createDealEvent(dealId, 'WATERFALL_FEATURE_FLAG_CHANGED', {
    field: 'usePerClassWaterfall',
    oldValue: existing.usePerClassWaterfall,
    newValue: body.usePerClassWaterfall,
    changedBy: authUser.id
  }, { id: authUser.id, name: userName, role: authUser.role });

  console.log(`[Waterfall] Per-class flag CHANGED and audit logged`, {
    dealId,
    newValue: body.usePerClassWaterfall
  });
}
```

**Test Commands**:
```bash
# Manual test with curl
curl -X PATCH http://localhost:8787/api/deals/{dealId}/waterfall \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{"usePerClassWaterfall": true}'

# Run tests
npm test -- e2e-number-flow --verbose
```

**Expected**: API accepts flag, audit event created, tests pass

---

### STEP 4: Frontend Toggle in Setup Form

**File**: `src/components/underwriting/WaterfallPanel.jsx`

**Add to formData state** (in WaterfallSetupForm, ~line 342-355):
```javascript
const [formData, setFormData] = useState({
  lpEquity: defaults?.lpEquity || 0,
  gpEquity: defaults?.gpEquity || 0,
  preferredReturn: (defaults?.preferredReturn || 0.08) * 100,
  gpCatchUp: defaults?.gpCatchUp !== false,
  catchUpPercent: (defaults?.catchUpPercent || 1.0) * 100,
  lookback: defaults?.lookback || false,
  usePerClassWaterfall: defaults?.usePerClassWaterfall || false,  // NEW
  promoteTiers: defaults?.promoteTiers || [...]
});
```

**Add console log on toggle** (for debugging):
```javascript
const handlePerClassToggle = (checked) => {
  console.log('[WaterfallPanel] Per-class toggle changed', { checked });
  setFormData({ ...formData, usePerClassWaterfall: checked });
};
```

**Add UI after lookback switch** (~after line 460):
```jsx
{/* Per-Class Waterfall */}
<div className="pt-4 border-t mt-4">
  <div className="flex items-center justify-between">
    <div>
      <Label className="text-sm font-medium">Per-Class Waterfall</Label>
      <p className="text-xs text-[#737373] mt-1">
        Use class-specific preferred returns and payment priority
      </p>
    </div>
    <Switch
      checked={formData.usePerClassWaterfall}
      onCheckedChange={handlePerClassToggle}
    />
  </div>

  {formData.usePerClassWaterfall && (
    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
      <div className="flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-amber-800">
          When enabled, each share class uses its own preferred return rate.
          Senior classes (lower priority number) are paid before junior classes.
        </p>
      </div>
    </div>
  )}
</div>
```

**Add to handleSubmit**:
```javascript
const handleSubmit = (e) => {
  e.preventDefault();
  console.log('[WaterfallPanel] Submitting waterfall', {
    usePerClassWaterfall: formData.usePerClassWaterfall
  });
  onSubmit({
    lpEquity: parseFloat(formData.lpEquity),
    gpEquity: parseFloat(formData.gpEquity),
    preferredReturn: formData.preferredReturn / 100,
    gpCatchUp: formData.gpCatchUp,
    catchUpPercent: formData.catchUpPercent / 100,
    lookback: formData.lookback,
    usePerClassWaterfall: formData.usePerClassWaterfall,  // NEW
    promoteTiers: formData.promoteTiers.map(...)
  });
};
```

**Add AlertCircle import at top**:
```javascript
import { Users, TrendingUp, Calculator, Settings2, RefreshCw, Plus, Trash2, DollarSign, Percent, AlertCircle } from 'lucide-react';
```

**Test Commands**:
```bash
cd canonical-deal-os
npm run dev  # Start dev server
# Open browser, navigate to deal underwriting tab
# Toggle switch, verify console.log appears
# Save, verify no errors
```

**Expected**: Toggle renders, warning shows when enabled, form submits

---

### STEP 5: Status Display in Waterfall Terms

**File**: `src/components/underwriting/WaterfallPanel.jsx`

**Add to Waterfall Terms card** (after lookback row, ~line 240):
```jsx
{/* Per-Class Status */}
<div className="flex items-center justify-between pt-2 border-t">
  <span className="text-sm text-[#737373]">Per-Class Waterfall</span>
  <div className="flex items-center gap-2">
    <Badge variant={structure.usePerClassWaterfall ? 'default' : 'secondary'}>
      {structure.usePerClassWaterfall ? 'Enabled' : 'Disabled'}
    </Badge>
    {structure.usePerClassWaterfall && (
      <span className="text-xs text-green-600">✓ Class terms active</span>
    )}
  </div>
</div>
```

**Test**: Visual verification - badge shows correct state

---

### STEP 6: Create PerClassBreakdown Component

**File**: `src/components/distributions/PerClassBreakdown.jsx` (NEW FILE)

```jsx
import React, { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Color mapping for share classes
const CLASS_COLORS = {
  'A': { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', accent: 'bg-green-100' },
  'B': { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', accent: 'bg-blue-100' },
  'P': { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', accent: 'bg-violet-100' },
  'C': { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', accent: 'bg-orange-100' },
  'default': { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', accent: 'bg-gray-100' }
};

function formatCurrency(value) {
  if (!value && value !== 0) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

function ClassCard({ code, data, colors }) {
  return (
    <Card className={cn("border-2", colors.border, colors.bg)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className={cn("text-base font-semibold", colors.text)}>
            {data.className || `Class ${code}`}
          </CardTitle>
          <Badge className={colors.accent}>
            {data.lpCount} LP{data.lpCount !== 1 ? 's' : ''}
          </Badge>
        </div>
        {data.preferredReturn !== null && data.preferredReturn !== undefined && (
          <CardDescription>
            {(data.preferredReturn * 100).toFixed(1)}% Preferred Return
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Total Distributed */}
          <div className="flex justify-between items-baseline">
            <span className="text-sm text-gray-600">Distributed</span>
            <span className={cn("text-lg font-bold", colors.text)}>
              {formatCurrency(data.totalDistributed)}
            </span>
          </div>

          {/* Breakdown */}
          <div className="text-xs space-y-1 pt-2 border-t">
            <div className="flex justify-between">
              <span className="text-gray-500">Pref Paid</span>
              <span>{formatCurrency(data.prefPaid || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Capital Returned</span>
              <span>{formatCurrency(data.capitalReturned || 0)}</span>
            </div>
          </div>

          {/* Equity Multiple */}
          {data.equityMultiple && (
            <div className="pt-2 border-t">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-gray-500">Equity Multiple</span>
                <span className={cn("font-semibold", colors.text)}>
                  {data.equityMultiple.toFixed(2)}x
                </span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function PerClassBreakdown({ byClass, totalAmount }) {
  // Debug logging
  useEffect(() => {
    if (byClass && Object.keys(byClass).length > 0) {
      console.log('[PerClassBreakdown] Rendering', {
        classCount: Object.keys(byClass).length,
        classCodes: Object.keys(byClass),
        totalAmount,
        totalDistributed: Object.values(byClass).reduce((s, c) => s + (c.totalDistributed || 0), 0)
      });
    }
  }, [byClass, totalAmount]);

  if (!byClass || Object.keys(byClass).length === 0) {
    console.log('[PerClassBreakdown] No byClass data, not rendering');
    return null;
  }

  const classes = Object.entries(byClass);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900">Distribution by Share Class</h4>
        <Badge variant="outline">{classes.length} Class{classes.length !== 1 ? 'es' : ''}</Badge>
      </div>

      <div className={cn(
        "grid gap-4",
        classes.length === 2 ? "grid-cols-2" :
        classes.length >= 3 ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" :
        "grid-cols-1"
      )}>
        {classes.map(([code, data]) => (
          <ClassCard
            key={code}
            code={code}
            data={data}
            colors={CLASS_COLORS[code] || CLASS_COLORS.default}
          />
        ))}
      </div>
    </div>
  );
}

export default PerClassBreakdown;
```

**Create directory if needed**:
```bash
mkdir -p src/components/distributions
```

**Test**: Import in browser console or Storybook, verify no errors

---

### STEP 7: Integrate into WaterfallPanel

**File**: `src/components/underwriting/WaterfallPanel.jsx`

**Add import at top**:
```javascript
import { PerClassBreakdown } from '@/components/distributions/PerClassBreakdown';
```

**Add after Distribution Summary grid** (inside `{latestDistribution && (...)}`), before Year-by-Year table (~line 290):
```jsx
{/* Per-Class Breakdown - only show if multiple classes */}
{latestDistribution.byClass && Object.keys(latestDistribution.byClass).length > 1 && (
  <div className="mt-6 pt-4 border-t border-green-200">
    <PerClassBreakdown
      byClass={latestDistribution.byClass}
      totalAmount={latestDistribution.lpTotalReturn}
    />
  </div>
)}
```

**Add logging in component**:
```javascript
// Add useEffect in WaterfallPanel component body
useEffect(() => {
  if (latestDistribution?.byClass) {
    console.log('[WaterfallPanel] Distribution has byClass data', {
      dealId,
      classCount: Object.keys(latestDistribution.byClass).length
    });
  }
}, [latestDistribution, dealId]);
```

**Test Commands**:
```bash
# Create deal with 2 share classes, enable per-class flag
# Create distribution
# Verify breakdown appears in WaterfallPanel
```

---

### STEP 8: Integrate into Distributions Page

**File**: `src/pages/Distributions.jsx`

**Add import**:
```javascript
import { PerClassBreakdown } from '@/components/distributions/PerClassBreakdown';
```

**Enhance allocation table header** (add Class column after Investor, ~line 151):
```jsx
<thead>
  <tr className="text-sm text-gray-500">
    <th className="text-left py-2">Investor</th>
    <th className="text-left py-2">Class</th>  {/* NEW */}
    <th className="text-right py-2">Gross</th>
    <th className="text-right py-2">Withholding</th>
    <th className="text-right py-2">Net</th>
    <th className="text-left py-2">Method</th>
    <th className="text-left py-2">Status</th>
  </tr>
</thead>
```

**Add Class cell in allocation row** (after investor name, ~line 162):
```jsx
<td className="py-2 text-gray-900">{alloc.lpEntityName || alloc.lpActorId}</td>
<td className="py-2">
  {alloc.shareClassCode ? (
    <Badge variant="outline" className="text-xs">{alloc.shareClassCode}</Badge>
  ) : (
    <span className="text-gray-400">-</span>
  )}
</td>
```

**Update colSpan in footer** (if exists) to account for new column.

**Add PerClassBreakdown in expanded row** (before LP Allocations header, ~line 145):
```jsx
{isExpanded && (
  <tr className="bg-gray-50">
    <td colSpan={8} className="px-4 py-4">
      <div className="pl-8 space-y-6">
        {/* Per-Class Breakdown */}
        {distribution.byClass && Object.keys(distribution.byClass).length > 1 && (
          <PerClassBreakdown
            byClass={distribution.byClass}
            totalAmount={distribution.totalAmount}
          />
        )}

        {/* Existing LP Allocations */}
        <div>
          <h4 className="font-medium text-gray-900 mb-3">LP Allocations</h4>
          {/* ... existing table ... */}
        </div>
      </div>
    </td>
  </tr>
)}
```

**Add allocation method badge to distribution title** (in DistributionRow, ~line 86-90):
```jsx
<td className="py-4 px-4">
  <div className="font-medium text-gray-900">{distribution.title}</div>
  <div className="text-sm text-gray-500 flex items-center gap-2 flex-wrap">
    <span>{TYPE_OPTIONS.find(t => t.value === distribution.type)?.label || distribution.type}</span>
    {distribution.period && <span>• {distribution.period}</span>}
    {distribution.allocationMethod && (
      <Badge
        variant="outline"
        className={cn(
          "text-xs",
          distribution.allocationMethod === 'WATERFALL'
            ? "border-violet-200 bg-violet-50 text-violet-700"
            : "border-gray-200"
        )}
      >
        {distribution.allocationMethod === 'WATERFALL' ? '📊 Waterfall' : '⚖️ Pro-rata'}
      </Badge>
    )}
  </div>
</td>
```

**Test Commands**:
```bash
npm run dev
# Navigate to Distributions page
# Expand a distribution row
# Verify Class column appears
# Verify PerClassBreakdown shows for multi-class distributions
# Verify allocation method badge shows
```

---

## FULL TEST SEQUENCE

Run after ALL steps complete:

```bash
# 1. Run all Jest tests
cd canonical-deal-os/server
npm test -- --verbose

# 2. Specifically run E2E number flow tests
npm test -- e2e-number-flow --verbose

# 3. Run share class tests
npm test -- share-classes --verbose

# 4. Start dev server and manual test
cd canonical-deal-os
npm run dev

# Manual verification:
# - Create deal with Class A (8% pref, priority 1) and Class P (10% pref, priority 1)
# - Enable usePerClassWaterfall flag
# - Add LPs to each class
# - Create distribution with useWaterfall: true
# - Verify all UI components render correctly
# - Check browser console for log messages
```

---

## LOG MESSAGE REFERENCE

All log messages added by this implementation:

| Module | Message Pattern | When |
|--------|----------------|------|
| `[Distributions]` | `Waterfall mode config` | After fetching waterfall structure |
| `[Distributions]` | `Per-class decision` | Before calculation mode decision |
| `[Distributions]` | `USING per-class waterfall` | When per-class mode activated |
| `[Distributions]` | `SKIPPING per-class` | When flag disabled |
| `[Waterfall]` | `Invalid usePerClassWaterfall value` | Validation failure |
| `[Waterfall]` | `Per-class flag changing` | Before update |
| `[Waterfall]` | `Per-class flag CHANGED and audit logged` | After update |
| `[WaterfallPanel]` | `Per-class toggle changed` | UI toggle |
| `[WaterfallPanel]` | `Submitting waterfall` | Form submit |
| `[WaterfallPanel]` | `Distribution has byClass data` | Render check |
| `[PerClassBreakdown]` | `Rendering` | Component mount |
| `[PerClassBreakdown]` | `No byClass data, not rendering` | Skip render |

---

# OPTION A: LP STATEMENT REPORT & DOCUMENT GENERATION

**Date**: January 19, 2026
**Status**: PLANNING
**Goal**: Implement LP Statement Report endpoint and auto-generate capital call/distribution documents

---

## FEATURE 1: LP STATEMENT REPORT ENDPOINT

### Overview

Create a comprehensive LP statement endpoint that aggregates all financial activity for an LP in a specific deal:
- Capital call allocations (called, funded, pending)
- Distribution allocations (gross, withholding, net, paid)
- Current holdings (commitment, ownership, share class)
- Performance summary (deployed, received, net cash flow)

### Endpoint Design

```
GET /api/lp/portal/my-investments/:dealId/statement
```

**Response Structure:**
```javascript
{
  reportDate: "2026-01-19T15:00:00.000Z",
  reportPeriod: { from: null, to: "2026-01-19" },  // null = inception

  lpActor: {
    id, entityName, email, commitment, ownershipPct,
    shareClass: { code, name, preferredReturn, managementFee, carryPercent }
  },

  capitalCalls: {
    items: [
      { id, title, callDate, dueDate, amount, fundedAmount, status, fundedAt, wireReference }
    ],
    summary: {
      totalCalled,
      totalFunded,
      totalPending,
      callCount
    }
  },

  distributions: {
    items: [
      { id, title, date, type, grossAmount, withholdingAmount, netAmount, status, paidAt }
    ],
    summary: {
      totalGross,
      totalWithholding,
      totalNet,
      totalPaid,
      distributionCount,
      pendingCount
    }
  },

  performance: {
    capitalCommitted: lpActor.commitment,
    capitalDeployed: sum(fundedAmounts),
    capitalRemaining: commitment - deployed,
    distributionsReceived: sum(netAmounts where paid),
    distributionsPending: sum(netAmounts where pending),
    netCashFlow: received - deployed,
    unrealizedValue: null  // Future: NAV integration
  }
}
```

### Implementation Increments

#### Increment 1.1: Create LP Statement Service
**File**: `server/services/lp-statement-service.js` (NEW)

```javascript
// Logging prefix
const LOG_PREFIX = "[LPStatement]";

function log(message, data = {}) {
  console.log(`${new Date().toISOString()} ${LOG_PREFIX} ${message}`, JSON.stringify(data));
}

/**
 * Build LP statement for a specific deal
 */
export async function buildLPStatement(dealId, lpActorId, options = {}) {
  log(`Building statement`, { dealId, lpActorId, options });

  // Step 1: Fetch LP Actor with share class
  // Step 2: Fetch capital calls with allocations
  // Step 3: Fetch distributions with allocations
  // Step 4: Calculate summaries
  // Step 5: Return aggregated statement
}

/**
 * Calculate capital call summary
 */
function calculateCapitalCallSummary(allocations) { ... }

/**
 * Calculate distribution summary
 */
function calculateDistributionSummary(allocations) { ... }

/**
 * Calculate performance metrics
 */
function calculatePerformance(lpActor, capitalSummary, distributionSummary) { ... }
```

**Test after increment:**
```bash
npm test -- lp-statement --verbose
```

#### Increment 1.2: Create LP Statement Route
**File**: `server/routes/lp-portal-access.js` (ADD)

```javascript
// GET /api/lp/portal/my-investments/:dealId/statement
export async function handleGetLPStatement(req, res, dealId) {
  log(`GET /statement request`, { dealId });

  // Auth: Verify LP has access to this deal
  const lpActor = await requireLPDealAccess(req, res, dealId);
  if (!lpActor) return;

  // Build statement
  const statement = await buildLPStatement(dealId, lpActor.id);

  log(`Statement built`, { dealId, lpActorId: lpActor.id });
  return sendJson(res, 200, statement);
}
```

**Test after increment:**
```bash
# API test
curl http://localhost:8787/api/lp/portal/my-investments/{dealId}/statement \
  -H "Authorization: Bearer {token}"
```

#### Increment 1.3: Add Statement Tests
**File**: `server/__tests__/lp-statement.test.js` (NEW)

```javascript
describe('LP Statement Service', () => {
  test('1.1: buildLPStatement returns complete structure', async () => { });
  test('1.2: Capital call summary calculates correctly', async () => { });
  test('1.3: Distribution summary calculates correctly', async () => { });
  test('1.4: Performance metrics are accurate', async () => { });
  test('1.5: Handles LP with no capital calls', async () => { });
  test('1.6: Handles LP with no distributions', async () => { });
  test('1.7: Filters to correct LP allocations only', async () => { });
});

describe('LP Statement Route', () => {
  test('2.1: Returns 401 for unauthenticated request', async () => { });
  test('2.2: Returns 403 for LP accessing other deal', async () => { });
  test('2.3: Returns valid statement for authorized LP', async () => { });
});
```

**Test after increment:**
```bash
npm test -- lp-statement --verbose
```

#### Increment 1.4: Add PDF Export (Optional)
**File**: `server/routes/lp-portal-access.js` (ADD)

```javascript
// GET /api/lp/portal/my-investments/:dealId/statement/pdf
export async function handleGetLPStatementPDF(req, res, dealId) {
  // Build statement data
  const statement = await buildLPStatement(dealId, lpActor.id);

  // Render to PDF using existing pdf-renderer
  const pdfBuffer = await renderStatementToPDF(statement);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="statement-${dealId}.pdf"`);
  res.end(pdfBuffer);
}
```

---

## FEATURE 2: DOCUMENT GENERATION TEMPLATES

### Overview

Auto-generate capital call notices and distribution statements using the existing document generation infrastructure:
- Handlebars templates for consistent formatting
- Puppeteer PDF rendering
- Provenance tracking for audit trail
- Integration with existing `documentId` fields on CapitalCall/Distribution models

### New Document Types

| Type | Purpose | Trigger |
|------|---------|---------|
| `CAPITAL_CALL_NOTICE` | Notice to LP for capital call | On issue capital call |
| `DISTRIBUTION_STATEMENT` | Statement to LP for distribution | On approve distribution |

### Implementation Increments

#### Increment 2.1: Create Capital Call Notice Template
**File**: `server/services/document-templates/capital-call-notice.hbs` (NEW)

```handlebars
{{> header title="Capital Call Notice" }}

<div class="notice-content">
  <h1>Capital Call Notice</h1>

  <div class="call-details">
    <p><strong>Deal:</strong> {{deal.name}}</p>
    <p><strong>Call Date:</strong> {{date callDate "long"}}</p>
    <p><strong>Due Date:</strong> {{date dueDate "long"}}</p>
    <p><strong>Purpose:</strong> {{purpose}}</p>
  </div>

  <div class="allocation-section">
    <h2>Your Allocation</h2>
    <table>
      <tr><td>Entity Name</td><td>{{lpActor.entityName}}</td></tr>
      <tr><td>Commitment</td><td>{{currency lpActor.commitment}}</td></tr>
      <tr><td>Ownership %</td><td>{{percent lpActor.ownershipPct}}</td></tr>
      <tr><td>Call Amount</td><td class="highlight">{{currency allocation.amount}}</td></tr>
    </table>
  </div>

  <div class="wire-instructions">
    <h2>Wire Instructions</h2>
    {{#if wireInstructions}}
      <pre>{{wireInstructions}}</pre>
    {{else}}
      <p>Wire instructions will be provided separately.</p>
    {{/if}}
  </div>
</div>

{{> footer }}
```

**Test after increment:**
- Verify template compiles without errors
- Manual visual check of rendered output

#### Increment 2.2: Create Distribution Statement Template
**File**: `server/services/document-templates/distribution-statement.hbs` (NEW)

```handlebars
{{> header title="Distribution Statement" }}

<div class="statement-content">
  <h1>Distribution Statement</h1>

  <div class="distribution-details">
    <p><strong>Deal:</strong> {{deal.name}}</p>
    <p><strong>Distribution Date:</strong> {{date distributionDate "long"}}</p>
    <p><strong>Type:</strong> {{type}}</p>
    <p><strong>Period:</strong> {{period}}</p>
  </div>

  <div class="allocation-section">
    <h2>Your Distribution</h2>
    <table>
      <tr><td>Entity Name</td><td>{{lpActor.entityName}}</td></tr>
      <tr><td>Share Class</td><td>{{lpActor.shareClass.name}}</td></tr>
      <tr><td>Gross Amount</td><td>{{currency allocation.grossAmount}}</td></tr>
      <tr><td>Withholding</td><td class="negative">-{{currency allocation.withholdingAmount}}</td></tr>
      <tr><td>Net Amount</td><td class="highlight">{{currency allocation.netAmount}}</td></tr>
    </table>
  </div>

  {{#if waterfallBreakdown}}
  <div class="waterfall-section">
    <h2>Distribution Breakdown</h2>
    <table>
      <tr><td>Return of Capital</td><td>{{currency waterfallBreakdown.returnOfCapital}}</td></tr>
      <tr><td>Preferred Return</td><td>{{currency waterfallBreakdown.preferredReturn}}</td></tr>
      <tr><td>Promote Share</td><td>{{currency waterfallBreakdown.promoteShare}}</td></tr>
    </table>
  </div>
  {{/if}}

  <div class="payment-info">
    <h2>Payment Information</h2>
    <p>Payment will be made to your bank account on file.</p>
    <p><strong>Status:</strong> {{allocation.status}}</p>
  </div>
</div>

{{> footer }}
```

#### Increment 2.3: Add Document Types to Generator
**File**: `server/services/document-generator.js` (MODIFY)

```javascript
// Add to DOCUMENT_TYPES constant
const DOCUMENT_TYPES = {
  // ... existing types ...
  CAPITAL_CALL_NOTICE: 'CAPITAL_CALL_NOTICE',
  DISTRIBUTION_STATEMENT: 'DISTRIBUTION_STATEMENT'
};

// Add context builder for capital call
async function buildCapitalCallContext(dealId, capitalCallId, lpActorId) {
  log(`Building capital call context`, { dealId, capitalCallId, lpActorId });

  const capitalCall = await prisma.capitalCall.findUnique({
    where: { id: capitalCallId },
    include: {
      allocations: { where: { lpActorId } }
    }
  });

  const lpActor = await prisma.lPActor.findUnique({
    where: { id: lpActorId },
    include: { shareClass: true }
  });

  // Fetch deal from Kernel
  const deal = await fetchDealFromKernel(dealId);

  return {
    deal,
    capitalCall,
    lpActor,
    allocation: capitalCall.allocations[0],
    callDate: capitalCall.createdAt,
    dueDate: capitalCall.dueDate,
    purpose: capitalCall.purpose,
    wireInstructions: capitalCall.wireInstructions
  };
}

// Add context builder for distribution
async function buildDistributionContext(dealId, distributionId, lpActorId) {
  log(`Building distribution context`, { dealId, distributionId, lpActorId });

  const distribution = await prisma.distribution.findUnique({
    where: { id: distributionId },
    include: {
      allocations: { where: { lpActorId } }
    }
  });

  const lpActor = await prisma.lPActor.findUnique({
    where: { id: lpActorId },
    include: { shareClass: true }
  });

  const deal = await fetchDealFromKernel(dealId);

  return {
    deal,
    distribution,
    lpActor,
    allocation: distribution.allocations[0],
    distributionDate: distribution.distributionDate,
    type: distribution.type,
    period: distribution.period,
    waterfallBreakdown: distribution.byClass?.[lpActor.shareClass?.code]
  };
}
```

**Test after increment:**
```bash
npm test -- document-generator --verbose
```

#### Increment 2.4: Add Generation Endpoints
**File**: `server/routes/capital-calls.js` (ADD)

```javascript
// POST /api/deals/:dealId/capital-calls/:id/generate-notice
export async function handleGenerateCapitalCallNotice(req, res, dealId, capitalCallId) {
  log(`Generating capital call notice`, { dealId, capitalCallId });

  const authUser = await requireGPWithDealAccess(req, res, dealId);
  if (!authUser) return;

  // Get all LP allocations for this capital call
  const allocations = await prisma.capitalCallAllocation.findMany({
    where: { capitalCallId },
    include: { lpActor: { include: { shareClass: true } } }
  });

  const generatedDocs = [];

  for (const alloc of allocations) {
    log(`Generating notice for LP`, { lpActorId: alloc.lpActorId });

    const context = await buildCapitalCallContext(dealId, capitalCallId, alloc.lpActorId);
    const doc = await generateDocument('CAPITAL_CALL_NOTICE', context, {
      dealId,
      createdBy: authUser.id,
      createdByName: authUser.name
    });

    generatedDocs.push(doc);
  }

  log(`Generated ${generatedDocs.length} notices`, { dealId, capitalCallId });
  return sendJson(res, 200, { documents: generatedDocs });
}
```

**File**: `server/routes/distributions.js` (ADD)

```javascript
// POST /api/deals/:dealId/distributions/:id/generate-statements
export async function handleGenerateDistributionStatements(req, res, dealId, distributionId) {
  log(`Generating distribution statements`, { dealId, distributionId });

  const authUser = await requireGPWithDealAccess(req, res, dealId);
  if (!authUser) return;

  const allocations = await prisma.distributionAllocation.findMany({
    where: { distributionId },
    include: { lpActor: { include: { shareClass: true } } }
  });

  const generatedDocs = [];

  for (const alloc of allocations) {
    log(`Generating statement for LP`, { lpActorId: alloc.lpActorId });

    const context = await buildDistributionContext(dealId, distributionId, alloc.lpActorId);
    const doc = await generateDocument('DISTRIBUTION_STATEMENT', context, {
      dealId,
      createdBy: authUser.id,
      createdByName: authUser.name
    });

    generatedDocs.push(doc);
  }

  log(`Generated ${generatedDocs.length} statements`, { dealId, distributionId });
  return sendJson(res, 200, { documents: generatedDocs });
}
```

#### Increment 2.5: Add Document Generation Tests
**File**: `server/__tests__/document-generation-financial.test.js` (NEW)

```javascript
describe('Capital Call Notice Generation', () => {
  test('3.1: buildCapitalCallContext returns complete data', async () => { });
  test('3.2: Template renders without errors', async () => { });
  test('3.3: PDF generation succeeds', async () => { });
  test('3.4: GeneratedDocument record created', async () => { });
  test('3.5: Generates notice for each LP allocation', async () => { });
});

describe('Distribution Statement Generation', () => {
  test('4.1: buildDistributionContext returns complete data', async () => { });
  test('4.2: Template renders without errors', async () => { });
  test('4.3: PDF generation succeeds', async () => { });
  test('4.4: Includes waterfall breakdown when available', async () => { });
  test('4.5: Generates statement for each LP allocation', async () => { });
});
```

#### Increment 2.6: Add UI Buttons for Generation
**File**: `src/pages/CapitalCalls.jsx` or equivalent (ADD)

```jsx
// Add "Generate Notices" button in capital call actions
<Button
  variant="outline"
  size="sm"
  onClick={() => generateNotices(capitalCall.id)}
  disabled={capitalCall.status === 'DRAFT'}
>
  <FileText className="w-4 h-4 mr-1" />
  Generate Notices
</Button>
```

**File**: `src/pages/Distributions.jsx` (ADD)

```jsx
// Add "Generate Statements" button in distribution actions
<Button
  variant="outline"
  size="sm"
  onClick={() => generateStatements(distribution.id)}
  disabled={distribution.status === 'DRAFT'}
>
  <FileText className="w-4 h-4 mr-1" />
  Generate Statements
</Button>
```

---

## LOGGING STRATEGY

### Log Prefixes

| Module | Prefix |
|--------|--------|
| LP Statement Service | `[LPStatement]` |
| Document Generator | `[DocGen]` |
| Capital Call Routes | `[CapitalCalls]` |
| Distribution Routes | `[Distributions]` |

### Key Log Points

```javascript
// LP Statement
log(`Building statement`, { dealId, lpActorId });
log(`Fetched capital calls`, { count, totalCalled, totalFunded });
log(`Fetched distributions`, { count, totalNet });
log(`Statement built`, { dealId, lpActorId, performance });

// Document Generation
log(`Building capital call context`, { dealId, capitalCallId, lpActorId });
log(`Building distribution context`, { dealId, distributionId, lpActorId });
log(`Generating notice for LP`, { lpActorId, entityName });
log(`Generated ${count} notices`, { dealId, capitalCallId });
log(`Template rendered`, { documentType, contentLength });
log(`PDF generated`, { documentType, sizeBytes, pageCount });

// Errors
logError(`Failed to build statement`, error, { dealId, lpActorId });
logError(`Template render failed`, error, { documentType });
logError(`PDF generation failed`, error, { documentType });
```

---

## CRITICAL FILES

| File | Action | Purpose |
|------|--------|---------|
| `server/services/lp-statement-service.js` | CREATE | LP statement aggregation logic |
| `server/routes/lp-portal-access.js` | MODIFY | Add statement endpoint |
| `server/__tests__/lp-statement.test.js` | CREATE | LP statement tests |
| `server/services/document-templates/capital-call-notice.hbs` | CREATE | Capital call notice template |
| `server/services/document-templates/distribution-statement.hbs` | CREATE | Distribution statement template |
| `server/services/document-generator.js` | MODIFY | Add new document types and context builders |
| `server/routes/capital-calls.js` | MODIFY | Add generate-notice endpoint |
| `server/routes/distributions.js` | MODIFY | Add generate-statements endpoint |
| `server/__tests__/document-generation-financial.test.js` | CREATE | Document generation tests |
| `src/pages/Distributions.jsx` | MODIFY | Add "Generate Statements" button |

---

## IMPLEMENTATION ORDER

### Phase 1: LP Statement (Increments 1.1-1.3)
1. Create `lp-statement-service.js` with core logic
2. Add route in `lp-portal-access.js`
3. Create tests and verify

**Test command after Phase 1:**
```bash
npm test -- lp-statement --verbose
```

### Phase 2: Document Templates (Increments 2.1-2.2)
4. Create `capital-call-notice.hbs` template
5. Create `distribution-statement.hbs` template

**Test command after Phase 2:**
- Manual visual verification of template rendering

### Phase 3: Document Generator Integration (Increments 2.3-2.5)
6. Add CAPITAL_CALL_NOTICE and DISTRIBUTION_STATEMENT types
7. Add context builders
8. Add generation endpoints
9. Create tests

**Test command after Phase 3:**
```bash
npm test -- document-generation --verbose
```

### Phase 4: UI Integration (Increment 2.6)
10. Add "Generate" buttons to UI

**Test command after Phase 4:**
- Manual UI verification

---

## VERIFICATION CHECKLIST

### LP Statement
- [ ] `GET /api/lp/portal/my-investments/:dealId/statement` returns valid JSON
- [ ] Capital call summary totals match individual allocations
- [ ] Distribution summary totals match individual allocations
- [ ] Performance metrics calculated correctly
- [ ] Only returns data for authenticated LP
- [ ] Returns 403 for LP accessing other deal

### Document Generation
- [ ] Capital call notice renders with all fields populated
- [ ] Distribution statement renders with all fields populated
- [ ] PDF generation succeeds without errors
- [ ] GeneratedDocument records created in database
- [ ] Documents linked to capital call/distribution via documentId
- [ ] Waterfall breakdown included when per-class mode enabled

### End-to-End
- [ ] Create capital call → Issue → Generate notices → Download PDF
- [ ] Create distribution → Approve → Generate statements → Download PDF
- [ ] LP can view their statement in portal
- [ ] All tests passing

---

## ESTIMATED EFFORT

| Increment | Effort |
|-----------|--------|
| 1.1 LP Statement Service | 45 min |
| 1.2 LP Statement Route | 15 min |
| 1.3 LP Statement Tests | 30 min |
| 2.1 Capital Call Template | 20 min |
| 2.2 Distribution Template | 20 min |
| 2.3 Document Generator Integration | 30 min |
| 2.4 Generation Endpoints | 30 min |
| 2.5 Document Generation Tests | 30 min |
| 2.6 UI Buttons | 15 min |

**Total**: ~4 hours
