# CRE Deal Management Platform - Comprehensive Excel & Provenance Analysis

## Executive Summary

This document answers all questions about Excel features, provenance tracking, data models, authorization, integrations, and export capabilities in the CRE Deal Management Platform (canonical-deal-os + cre-kernel-phase1).

---

## 1. Current State of Excel Features

### 1.1 File Paths & Endpoints

**Backend Services (canonical-deal-os):**
| File | Purpose |
|------|---------|
| `server/routes/excel-import.js` | 9 API endpoints for Excel operations |
| `server/services/excel-parser.js` | Parse .xlsx/.xls with cell extraction |
| `server/services/excel-mapper.js` | Auto-map cells to 24 underwriting fields |
| `server/services/excel-model-detector.js` | Detect A.CRE and generic model types |
| `server/services/excel-exporter.js` | Generate 5-sheet formatted workbooks |

**API Endpoints:**
```
POST   /api/deals/:dealId/excel-import          Upload & parse Excel file
GET    /api/deals/:dealId/excel-imports         List imports for deal
GET    /api/excel-imports/:id                   Get import with all cells
PATCH  /api/excel-imports/:id/mappings          Update field mappings
POST   /api/excel-imports/:id/apply             Apply mappings to model
GET    /api/excel-imports/:id/sheet/:sheetName  Get specific sheet data
GET    /api/excel/mappable-fields               List all mappable fields
GET    /api/excel/templates                     Available export templates
GET    /api/deals/:dealId/excel-export          Export underwriting model
```

**Frontend Components:**
| File | Purpose |
|------|---------|
| `src/components/underwriting/ExcelImportModal.jsx` | Drag-drop upload, mapping preview |
| `src/components/underwriting/UnderwritingTab.jsx` | "Import Excel" button, model tabs |
| `src/pages/AuditExport.jsx` | Export options including Excel |

**Library:** `exceljs` v4.4.0 (in package.json line 83)

### 1.2 Formulas vs Values

**The system parses BOTH formulas AND computed values:**

```javascript
// From excel-parser.js
{
  cellRef: "B15",
  rawValue: "=SUM(B3:B14)",      // Original formula text
  computedValue: 1200000,         // Calculated result
  formula: "=SUM(B3:B14)",        // Formula stored separately
  dataType: "FORMULA"             // Type classification
}
```

**Data Types Recognized:** NUMBER, FORMULA, CURRENCY, PERCENTAGE, STRING, DATE, BOOLEAN

**Formula Storage:** Formula text is preserved in `ExcelCell.formula` field, but **we do NOT parse formulas into an AST** - only the text and computed value are stored.

### 1.3 Scope: Deal-Level Only

**Current Implementation:** Deal-level only
- `ExcelImport.dealId` is required (foreign key)
- No `portfolioId` field exists
- All endpoints are scoped to `/api/deals/:dealId/...`

**Portfolio-level is NOT implemented** - this would be a future enhancement.

### 1.4 What "Ingest Into System" Means Today

When you click "Apply" after Excel import, the system:

1. **Creates `UnderwritingInput` records** for each mapped field:
   ```prisma
   UnderwritingInput {
     fieldPath: "grossPotentialRent"
     value: "1200000"
     sourceType: "EXCEL_IMPORT"       // Marks origin
     sourceId: "excel-import-uuid"    // Links to ExcelImport
     documentCell: "T12!B15"          // Cell reference for provenance
     aiConfidence: 0.92               // Mapping confidence
   }
   ```

2. **Updates `UnderwritingModel`** with the mapped values

3. **Records import metadata** in `ExcelImport.appliedAt`, `appliedBy`

**It does NOT:**
- Create Kernel events/claims automatically (BFF-only operation)
- Attach the file as a document (separate upload needed)
- Populate all canonical fields (only mapped fields)

---

## 2. Canonical Data Model & "System Truth"

### 2.1 Schema for Deal Underwriting

**Location:** `canonical-deal-os/server/prisma/schema.prisma`

#### UnderwritingModel (lines 764-824)
```prisma
model UnderwritingModel {
  id                    String
  dealId                String   @unique

  // Revenue
  grossPotentialRent    Float?
  vacancyRate           Float?   // 0.05 = 5%
  effectiveGrossIncome  Float?
  otherIncome           Float?

  // Expenses
  operatingExpenses     Float?
  taxes                 Float?
  insurance             Float?
  management            Float?
  reserves              Float?

  // NOI
  netOperatingIncome    Float?

  // Debt Terms
  loanAmount            Float?
  interestRate          Float?
  amortization          Int?     // years
  loanTerm              Int?     // years
  annualDebtService     Float?

  // Returns
  goingInCapRate        Float?
  exitCapRate           Float?
  cashOnCash            Float?
  dscr                  Float?
  irr                   Float?
  equityMultiple        Float?

  // Assumptions
  holdPeriod            Int?
  rentGrowth            Float?
  expenseGrowth         Float?

  status                String   // DRAFT, READY, SUBMITTED
}
```

#### RentRollUnit (lines 931-948)
```prisma
model RentRollUnit {
  id            String
  dealId        String
  unitNumber    String
  unitType      String?    // 1BR, 2BR, Studio
  sqft          Int?
  currentRent   Float?
  marketRent    Float?
  leaseStart    DateTime?
  leaseEnd      DateTime?
  status        String?    // OCCUPIED, VACANT
  tenant        String?
  extractionId  String?    // Link to DocumentExtraction
}
```

#### T12LineItem (lines 951-963)
```prisma
model T12LineItem {
  id             String
  dealId         String
  category       String    // REVENUE, EXPENSE
  lineItem       String    // "Rental Income", "Utilities"
  annualAmount   Float
  monthlyAmounts Json      // Array of 12 monthly values
  extractionId   String?
}
```

#### CapEx/Debt/Exit (within UnderwritingModel + WaterfallStructure)
```prisma
model WaterfallStructure {
  id               String
  dealId           String   @unique
  lpEquity         Float
  gpEquity         Float
  preferredReturn  Float    // 8% = 0.08
  promoteTiers     Json     // [{hurdle: 0.12, gpShare: 0.20}, ...]
  gpCatchUp        Boolean
  catchUpPercent   Float?
}
```

### 2.2 Schema for Reporting (Actuals, Budgets, Variance)

#### AssumptionSnapshot (lines 2090-2116)
```prisma
model AssumptionSnapshot {
  id               String
  dealId           String
  snapshotType     String    // UNDERWRITING, YEAR_1_ACTUAL, YEAR_2_ACTUAL...
  assumptions      Json      // All rates/assumptions at this point
  projectedMetrics Json      // IRR, NOI, etc. at snapshot time
  createdAt        DateTime
  createdBy        String
}
```

#### AssumptionVariance (lines 2119-2148)
```prisma
model AssumptionVariance {
  id                String
  dealId            String
  snapshotId        String
  period            String    // YEAR_1, YEAR_2, etc.
  field             String    // "noi", "occupancy"
  projectedValue    Float
  actualValue       Float
  variancePercent   Float
  aiExplanation     String?   // AI-generated explanation
  aiConfidence      Float?
  impactOnIRR       Float?
  impactOnNOI       Float?
}
```

#### AccountingPeriod (lines 1968-2005) - GL Close
```prisma
model AccountingPeriod {
  id              String
  dealId          String
  year            Int
  quarter         Int       // 1-4, or 0 for annual
  status          String    // OPEN, SOFT_CLOSE, HARD_CLOSE
  softClosedAt    DateTime?
  hardClosedAt    DateTime?
  closeSnapshotId String?   // Frozen state at hard close
  @@unique([dealId, year, quarter])
}
```

### 2.3 Field Registry / Definitions System

**Current State:** Partial implementation via `excel-mapper.js`

**24 Mappable Fields with Patterns:**
```javascript
// From excel-mapper.js
const FIELD_MAPPINGS = {
  grossPotentialRent: {
    patterns: [/gross\s*potential\s*rent/i, /gpr/i, /scheduled\s*rent/i],
    category: 'revenue',
    dataType: 'currency'
  },
  vacancyRate: {
    patterns: [/vacancy/i, /vac\s*%/i, /economic\s*vacancy/i],
    category: 'revenue',
    dataType: 'percentage'
  },
  // ... 22 more fields
}
```

**NOT Implemented:**
- Central field registry table
- Version history for field definitions
- Field sensitivity metadata (for redaction)
- Calculated field dependency tracking

### 2.4 How Numbers Are Stored

**Storage Pattern:** Mixed approach

| Storage Type | Used For | Location |
|--------------|----------|----------|
| **Table rows** | UnderwritingModel fields | BFF Prisma |
| **JSON blobs** | monthlyAmounts, promoteTiers, assumptions | BFF Prisma |
| **Events** | Deal lifecycle state changes | Kernel Event table |
| **Materials** | Versioned business data with truthClass | Kernel MaterialObject |

### 2.5 Provenance Metadata Per Field

**YES - Tracked via `UnderwritingInput`:**

```prisma
model UnderwritingInput {
  fieldPath       String    // "grossPotentialRent"
  value           String    // JSON value

  // SOURCE
  sourceType      String    // DOCUMENT, AI_EXTRACTION, EXCEL_IMPORT, HUMAN_ENTRY, CALCULATION
  source          String    // RENT_ROLL, T12, LOAN_TERMS, etc.
  sourceId        String?   // ID of source record

  // DOCUMENT DETAILS
  documentId      String?   // Artifact ID
  documentName    String?
  documentPage    Int?
  documentCell    String?   // "T12!B15"

  // AI DETAILS
  aiModel         String?   // "gpt-4o"
  aiConfidence    Float?    // 0.0-1.0

  // HUMAN ENTRY
  setBy           String    // userId
  setByName       String?
  setAt           DateTime
  rationale       String?   // Why this value was set

  // VERIFICATION
  verifiedBy      String?
  verifiedAt      DateTime?

  // VERSIONING
  supersededAt    DateTime?
  supersededBy    String?   // Newer input ID
}
```

---

## 3. Provenance + Evidence Chain

### 3.1 Where Provenance Is Implemented

**BFF Layer:**
| File | Purpose |
|------|---------|
| `server/routes/provenance.js` | `PUT /api/deals/:dealId/provenance/update` |
| `server/services/audit-service.js` | Event creation with hash chains |
| `server/services/evidence-pack-generator.js` | Bundle provenance into exports |

**Kernel Layer:**
| File | Purpose |
|------|---------|
| `apps/kernel-api/src/audit.ts` | `createAuditEvent()`, `verifyEventChain()` |
| `apps/kernel-api/prisma/schema.prisma` | MaterialObject, MaterialRevision, Artifact |

**Relevant Models:**
- `LLMFieldProvenance` (BFF) - AI extraction tracking
- `ExtractionClaim` (BFF) - Document extraction with verification status
- `MaterialObject` + `MaterialRevision` (Kernel) - Versioned materials with truthClass
- `Artifact` + `ArtifactLink` (Kernel) - Content-addressed file storage

### 3.2 DOC-backed Flag Implementation

**When a value is marked DOC-backed in UI:**

1. `UnderwritingInput.sourceType` = `"DOCUMENT"`
2. `ExtractionClaim` record created with:
   - `documentId` (artifact reference)
   - `pageNumber`, `boundingBox` (location in PDF)
   - `textSnippet` + `snippetHash` (content verification)
   - `status`: PENDING → VERIFIED

**Gap:** The BFF does NOT automatically create Kernel materials when DOC-backed. This requires explicit provenance sync:

```javascript
// From provenance.js - handleProvenanceUpdate()
// Sync to Kernel only if provenance is confirmed
if (confirmedProvenance) {
  await syncToKernelMaterial(dealId, fieldPath, value, artifactId);
}
```

### 3.3 Evidence Reference Structure

**Artifact (Kernel):**
```prisma
model Artifact {
  id         String
  dealId     String
  filename   String
  mimeType   String
  sizeBytes  Int
  sha256Hex  String   @unique  // Content hash
  storageKey String            // File location
  uploaderId String?
}
```

**ArtifactLink (connecting evidence to events/materials):**
```prisma
model ArtifactLink {
  id         String
  artifactId String
  eventId    String?     // Links to DealEvent
  materialId String?     // Links to MaterialObject
  tag        String?     // Context (e.g., "supporting_doc")
}
```

### 3.4 Explain Bundle / "Why" Structures

**YES - Implemented in multiple places:**

**1. Explain Page (`src/pages/Explain.jsx`):**
- Natural language queries: "Why is the deal blocked?"
- Returns structured explanation:
  ```javascript
  {
    answer: "Deal is blocked because...",
    supportingEvidence: [{eventId, artifactId, description}],
    authorityChain: [{role, action, timestamp}],
    blockingConditions: ["Missing LP consent"],
    confidenceLevel: "high"
  }
  ```

**2. Document Templates (`server/services/document-templates/explain-appendix.hbs`):**
- Renders field-level provenance in generated documents

**3. GeneratedDocument.fieldProvenance:**
```json
[
  {
    "fieldPath": "purchasePrice",
    "value": 5000000,
    "claimId": "uuid",
    "documentSource": "LOI.pdf",
    "pageNumber": 2
  }
]
```

---

## 4. Snapshots, Versioning, and Diffs

### 4.1 As-Of Snapshots Today

**YES - Multiple snapshot types:**

#### Snapshot Model (lines 1939-1962)
```prisma
model Snapshot {
  id              String
  dealId          String
  snapshotType    String    // CAP_TABLE, DISTRIBUTION_CALC, CAPITAL_CALL_CALC
  lpOwnership     Json      // Frozen LP positions
  capTableHash    String    // SHA-256 integrity
  waterfallRules  Json?     // Frozen deal economics
  rulebookHash    String?
  reason          String?   // "Q4 2025 Distribution"
  createdAt       DateTime
  createdBy       String
}
```

**Usage:**
- `CapitalCall.snapshotId` - Frozen cap table at call creation
- `Distribution.snapshotId` - Frozen LP structure at payout
- `AccountingPeriod.closeSnapshotId` - State at hard close

#### AssumptionSnapshot (for projected vs actual)
```prisma
snapshotType: "UNDERWRITING" | "YEAR_1_ACTUAL" | "YEAR_2_ACTUAL" | ...
assumptions: { rentGrowth: 0.03, expenseGrowth: 0.02, ... }
projectedMetrics: { irr: 0.18, noi: 1200000, ... }
```

### 4.2 Versioning Systems

**Documents:**
```prisma
model DocumentVersion {
  dealId           String
  documentType     String    // IC_MEMO, LOI, PSA
  version          Int       // 1, 2, 3...
  status           String    // DRAFT, BINDING, EXECUTED
  contentHash      String    // SHA-256
  parentVersionId  String?   // Amendment chain
  provenanceMap    Json      // fieldPath → claimId
  @@unique([dealId, documentType, version])
}
```

**Materials (Kernel):**
```prisma
model MaterialRevision {
  id         String
  materialId String
  type       String
  data       Json
  truthClass TruthClass  // DOC, HUMAN, AI
  createdAt  DateTime
}
```

**Underwriting Inputs:**
```prisma
UnderwritingInput {
  supersededAt  DateTime?
  supersededBy  String?    // Points to newer version
}
```

**Data Rooms:** NOT versioned (files are versioned individually)

### 4.3 Diff Mechanism

**Event Chain Verification (detects modifications):**
```javascript
// From audit-service.js
async function verifyEventChain(dealId) {
  const events = await getEvents(dealId);
  for (let i = 1; i < events.length; i++) {
    const computed = computeHash(events[i]);
    if (computed !== events[i].eventHash) {
      return { valid: false, issue: 'MODIFIED', eventId: events[i].id };
    }
    if (events[i].previousEventHash !== events[i-1].eventHash) {
      return { valid: false, issue: 'CHAIN_BREAK', eventId: events[i].id };
    }
  }
  return { valid: true };
}
```

**Variance Detection (for actuals vs projected):**
```javascript
// From integrations.js
const thresholds = {
  noi: { variance: 0.10, severity: 'HIGH' },
  occupancy: { variance: 0.15, severity: 'MEDIUM' },
  ltv: { variance: 0.05, severity: 'HIGH' },
  dscr: { absolute: 0.15, severity: 'CRITICAL' }
};
```

**Visual Diff:** NOT implemented for documents/models

---

## 5. Permissions + View Modes

### 5.1 Authorization Model

**Location:** `server/middleware/auth.js`

**Core Gates:**
```javascript
requireAuth(req, res)      // Any authenticated user
requireGP(req, res)        // GP or Admin role
requireAdmin(req, res)     // Admin only
requireDealAccess(authUser, dealId, res)  // Org isolation check
requireLPEntitlement(req, res, dealId, token)  // LP portal access
requireOrgIsolation(resource, authUser, res, "document")  // Resource check
```

**Org Isolation Pattern:**
```javascript
// ALWAYS checks authUser.organizationId matches deal.organizationId
const deal = await prisma.deal.findUnique({ where: { id: dealId } });
if (deal.organizationId !== authUser.organizationId) {
  return res.status(403).json({ error: 'Access denied' });
}
```

**Role Hierarchy:**
- Admin > GP > GP Analyst > LP > Lender > Counsel > Regulator > Auditor

### 5.2 View Modes / Redaction Policies

**Current State:** Role-based visibility, NOT field-level redaction

**LP Portal:**
- LPs only see their own distributions/capital calls
- Documents filtered by `LPDocumentPermission`
- Cannot see other LP's data

**Lender Portal:**
- Separate route handlers in `server/routes/lender-portal.js`
- Limited to lender-relevant documents

**Redaction:** NOT implemented at field level
- No "broker scrubbed" view mode
- No field sensitivity metadata
- No dynamic redaction rules

### 5.3 Export Protection for Sensitive Fields

**Current Implementation:** Limited

**Excel Export:**
- Uses same data as UI (no additional filtering)
- Role check at endpoint level only
- No field-level omission

**Evidence Packs:**
- Pack type determines contents (IC_PACK vs AUDIT_PACK)
- No per-field redaction

**Gap:** Need field-level sensitivity metadata to implement proper redaction.

---

## 6. Integrations & Live Feeds

### 6.1 Current Data Sources

| Source | Status | Implementation |
|--------|--------|----------------|
| Manual uploads | Implemented | File upload routes |
| Excel import | Implemented | `excel-import.js` |
| AI extraction | Implemented | `llm.js` routes |
| Webhook ingest | Partial | `integrations.js` |
| Accounting integration | NOT implemented | - |
| PM software (Yardi/MRI) | NOT implemented | - |
| Bank feeds | NOT implemented | - |
| CoStar/RCA | NOT implemented | - |

### 6.2 How New Numbers Enter the System

**Pipeline:**
```
1. File Upload → Artifact created with sha256Hex
                        ↓
2. AI Parsing → LLMParseSession + LLMFieldProvenance
                        ↓
3. Extraction Claims → ExtractionClaim (PENDING status)
                        ↓
4. Human Verification → Status → VERIFIED/REJECTED
                        ↓
5. Apply to Model → UnderwritingInput + UnderwritingModel update
                        ↓
6. Audit Event → DealEvent with hash chain
```

### 6.3 Scheduled Jobs / Background Processing

**Reminder Scheduler (`server/services/reminder-scheduler.js`):**
- Capital call reminders (3 days before due)
- Compliance deadline reminders
- Uses node-cron for scheduling

**Background Queue:** NOT implemented
- Large file processing is synchronous
- No job queue (Bull, Agenda, etc.)

---

## 7. Export Packages

### 7.1 Current Export Capabilities

**Evidence Pack Generator (`server/services/evidence-pack-generator.js`):**

| Pack Type | Contents |
|-----------|----------|
| IC_PACK | IC memo, LOI, provenance data |
| CLOSING_PACK | PSA, closing statement, all executed docs |
| AUDIT_PACK | Full event ledger, verification log, claim history |
| DD_PACK | Due diligence documents, extraction results |

**Endpoints:**
```
POST /api/deals/:dealId/evidence-pack/generate
GET  /api/deals/:dealId/evidence-packs
GET  /api/deals/:dealId/evidence-packs/:packId/download
```

### 7.2 What's Included in Exports

**AUDIT_PACK includes:**
- `manifest.json` - Pack metadata
- `events/ledger.jsonl` - Full event history with hashes
- `provenance/` - Field-level source tracking
- `documents/` - Generated documents
- `verification/` - Claim verification log
- `snapshot.json` - Deal state at export time

**Event Ledger Format:**
```jsonl
{"id":"evt-1","type":"DEAL_CREATED","sequenceNumber":1,"eventHash":"sha256...","previousEventHash":null}
{"id":"evt-2","type":"STATE_TRANSITION","sequenceNumber":2,"eventHash":"sha256...","previousEventHash":"sha256..."}
```

### 7.3 What's NOT Included (Gaps)

- Definitions appendix (field registry) - NOT implemented
- PDF export of audit trail - Only JSON currently
- Cryptographic signatures on packs
- Regulatory format templates (SEC/FINRA)

---

## 8. Excel Template Strategy

### 8.1 Current Template Generation

**Export Templates (`excel-exporter.js`):**
```javascript
const TEMPLATES = {
  GENERIC_CRE: { sheets: ['Summary', 'Assumptions', 'Cash Flows'] },
  ACRE_ALL_IN_ONE: { sheets: ['Summary', 'Assumptions', 'Cash Flows', 'Waterfall', 'Sensitivity'] },
  LP_REPORT: { sheets: ['Summary', 'Distributions', 'Capital Calls'] }
};
```

**5-Sheet Standard Export:**
1. **Summary** - Property info, returns, financing, risk metrics
2. **Assumptions** - Revenue, expenses, debt, exit assumptions
3. **Cash Flows** - Year-by-year projections (5 years)
4. **Waterfall** - Equity distribution tiers
5. **Sensitivity** - Exit cap vs vacancy matrix

### 8.2 Metadata Embedding

**Current:** Limited metadata in Summary sheet header

**NOT Implemented:**
- Hidden metadata sheet with field→cell mappings
- Version/timestamp embedding
- Round-trip re-import markers

### 8.3 Round-Trip Strategy

**Current Direction:** Template-first (recommended)

**Import Recognition:**
- Model detector identifies known templates
- Cell positions mapped via `detectedModelType`
- Enhanced mappings for A.CRE models

**Gap:** Arbitrary Excel ingestion is harder and less reliable.

---

## 9. Non-Happy-Path Realities

### 9.1 Edge Case Handling

| Scenario | Current Behavior |
|----------|-----------------|
| **Macros/VBA** | Ignored (cached values used) |
| **External links** | Warning returned, no resolution |
| **Merged cells** | Partial support (top-left value) |
| **Hidden sheets** | Parsed but flagged |
| **Pivot tables** | Source data extracted, not pivot |
| **Encrypted files** | Rejected with error |
| **Password-protected** | Rejected with error |

### 9.2 File Limits

**From `excel-parser.js`:**
```javascript
const MAX_CELLS = 1000;        // Per import
const MAX_FILE_SIZE = 10MB;    // Via multer config
const MAX_SHEETS = 20;         // Reasonable limit
```

### 9.3 Background Processing

**NOT Implemented:**
- No job queue for large files
- Processing is synchronous
- Timeout at 30 seconds

---

## 10. Quality / Tests

### 10.1 Existing Tests

**E2E Framework:** Playwright v1.57.0
- Location: `canonical-deal-os/e2e/tests/`
- Tests: `deal-create.spec.ts`, `deals-list.spec.ts`, `deal-overview.spec.ts`

**Unit Framework:** Jest v30.2.0
- Run: `npm run test`

### 10.2 Excel-Specific Tests

**Current State:** NO dedicated Excel tests

**Missing:**
- No `excel-parser.test.js`
- No `excel-mapper.test.js`
- No `excel-model-detector.test.js`
- No `.xlsx` fixture files

### 10.3 Known Issues / TODOs

1. **SSO Login** - `src/pages/Login.jsx:70` - `// TODO: Implement SSO login`
2. **AI Parsing Test Skipped** - `e2e/tests/deal-create.spec.ts:101` - Requires LLM service
3. **No Excel Fixtures** - Manual testing required

---

## 11. Optimal Future Support - Gap Analysis

### 11.1 Scenario: Broker OM Model Import

| Requirement | Status | Gap |
|-------------|--------|-----|
| Upload Excel | ✅ Supported | - |
| Auto-detect model | ✅ Supported | - |
| Map to fields | ✅ Supported | - |
| Preserve formulas | ✅ Supported | - |
| Track provenance | ✅ Supported | - |
| Handle macros | ⚠️ Partial | Cached values only |
| Scrubbed view export | ❌ Missing | Need field sensitivity |

### 11.2 Scenario: DD Scenarios / Sensitivity

| Requirement | Status | Gap |
|-------------|--------|-----|
| Multiple scenarios | ✅ Supported | `UnderwritingScenario` model |
| Sensitivity matrix | ✅ Supported | In Excel export |
| Compare scenarios | ⚠️ Partial | UI needs enhancement |
| Track assumptions | ✅ Supported | `AssumptionSnapshot` |

### 11.3 Scenario: Status Check (Deal/Portfolio)

| Requirement | Status | Gap |
|-------------|--------|-----|
| Deal status | ✅ Supported | Full lifecycle |
| Portfolio view | ❌ Missing | No aggregation |
| KPI dashboard | ⚠️ Partial | Basic metrics only |
| Cross-deal analytics | ❌ Missing | - |

### 11.4 Scenario: Quarterly Updates

| Requirement | Status | Gap |
|-------------|--------|-----|
| Period close | ✅ Supported | SOFT_CLOSE → HARD_CLOSE |
| Variance tracking | ✅ Supported | `AssumptionVariance` |
| AI explanations | ✅ Supported | `aiExplanation` field |
| Snapshot freeze | ✅ Supported | - |
| LP report export | ✅ Supported | LP_REPORT template |

### 11.5 Scenario: Lender Pack

| Requirement | Status | Gap |
|-------------|--------|-----|
| Document assembly | ✅ Supported | Evidence packs |
| Covenant tracking | ✅ Supported | `Compliance.jsx` |
| DSCR/LTV monitoring | ✅ Supported | - |
| Lender portal | ✅ Supported | Separate routes |
| Redacted export | ❌ Missing | Need field sensitivity |

### 11.6 Scenario: Regulator Export

| Requirement | Status | Gap |
|-------------|--------|-----|
| Full audit trail | ✅ Supported | Event ledger |
| Hash verification | ✅ Supported | Chain integrity |
| Evidence pack | ✅ Supported | AUDIT_PACK |
| Regulatory format | ❌ Missing | Need SEC/FINRA templates |
| Cryptographic signatures | ❌ Missing | - |

### 11.7 Scenario: Accountant Export

| Requirement | Status | Gap |
|-------------|--------|-----|
| GL data export | ⚠️ Partial | Period close only |
| Journal entries | ❌ Missing | No GL integration |
| QuickBooks format | ❌ Missing | - |
| Audit support | ✅ Supported | Event ledger |

---

## Critical Files Reference

### Excel System
- `server/routes/excel-import.js` - API endpoints
- `server/services/excel-parser.js` - File parsing
- `server/services/excel-mapper.js` - Field mapping (24 fields, 100+ patterns)
- `server/services/excel-model-detector.js` - Template detection
- `server/services/excel-exporter.js` - Workbook generation

### Provenance System
- `server/routes/provenance.js` - Provenance API
- `server/services/audit-service.js` - Event creation + hash chains
- `server/services/evidence-pack-generator.js` - Export bundles

### Data Models
- `server/prisma/schema.prisma` - BFF schema (2929 lines)
- `cre-kernel-phase1/apps/kernel-api/prisma/schema.prisma` - Kernel schema

### Authorization
- `server/middleware/auth.js` - Auth gates + org isolation
- `src/lib/permissions.js` - RBAC logic

### Kernel Core
- `cre-kernel-phase1/apps/kernel-api/src/projection.ts` - Deal lifecycle
- `cre-kernel-phase1/apps/kernel-api/src/audit.ts` - Event logging

---

## Summary of Biggest Risks

1. **No Excel Tests** - High risk of regressions without automated testing
2. **No Field Sensitivity** - Cannot implement broker scrubbed / LP views properly
3. **No Portfolio Aggregation** - Deal-level only limits reporting
4. **Synchronous Processing** - Large files may timeout
5. **No Cryptographic Signatures** - Evidence packs lack legal attestation
6. **No Regulatory Templates** - SEC/FINRA exports not standardized
