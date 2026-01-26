# Deal Intake & Distribution Platform - Frontend Implementation Plan

## Current State Summary

### Backend Complete (104 tests passing)
| Phase | API Prefix | Capabilities |
|-------|------------|--------------|
| **Phase 1** | `/api/intake/*` | Create drafts, upload docs, extract claims, verify, resolve conflicts |
| **Phase 2** | `/api/om/*` | Generate OM, edit sections, broker/seller approval workflow |
| **Phase 3** | `/api/distribution/*` + `/api/buyer/*` | Distributions, engagement tracking, AI criteria, scoring, responses |
| **Phase 4** | `/api/gate/*` | Review queue, authorization, NDA workflow, data room access |

### Existing Frontend Stack
- React + Vite + React Router v6
- React Query (@tanstack/react-query) for state
- Shadcn/ui + Tailwind CSS + Lucide icons
- Centralized bffClient for API calls
- AuthContext/RoleContext for auth

---

## Implementation Plan

### Phase A: Foundation Components
**Files to create in `src/components/intake/`:**

1. **StatusBadge.jsx** - Deal status indicator with colors
2. **DealDraftCard.jsx** - Card for draft list display
3. **DocumentUploader.jsx** - Multi-file upload with classification
4. **ClaimVerificationCard.jsx** - Verify/reject claims (adapt ClaimCard pattern)
5. **ConflictResolutionCard.jsx** - Resolve data conflicts

**Files to create in `src/components/om/`:**
6. **OMSectionEditor.jsx** - Rich text section editing

**Files to create in `src/components/distribution/`:**
7. **BuyerResponseCard.jsx** - Buyer response display with actions
8. **AIScoreBadge.jsx** - AI triage score indicator

### Phase B: Broker Intake Pages
**Files to create in `src/pages/intake/`:**

1. **DealDrafts.jsx** (`/DealDrafts`) - List all deal drafts with filters
2. **CreateDealDraft.jsx** (`/CreateDealDraft`) - Multi-source deal creation
3. **DealDraftDetail.jsx** (`/DealDraftDetail?id=:id`) - Tabbed workspace:
   - Overview tab: Status, property summary, actions
   - Documents tab: Upload and manage documents
   - Claims tab: Verify extracted claims
   - Conflicts tab: Resolve data conflicts
   - OM Preview tab: View/edit generated OM

### Phase C: OM Management
**Files to create in `src/pages/om/`:**

1. **OMEditor.jsx** (`/OMEditor?dealDraftId=:id`) - Full OM editing with:
   - Section navigation sidebar
   - Rich text editing per section
   - Broker/seller approval workflow
   - Version history

### Phase D: Distribution & Authorization
**Files to create in `src/pages/distribution/`:**

1. **DistributionManagement.jsx** (`/Distribution?dealDraftId=:id`) - Create/manage distributions
2. **BuyerReviewQueue.jsx** (`/BuyerReview?dealDraftId=:id`) - Review interested buyers
3. **BuyerAuthorizationDetail.jsx** (`/BuyerAuthorization?...`) - Full authorization workflow
4. **DealProgress.jsx** (`/DealProgress?dealDraftId=:id`) - Pipeline visualization

### Phase E: Buyer Features (Unified Platform)
**Architecture: Single login, role-based sections (NOT separate app)**

Users have ONE account that can:
- **Sell deals** (as GP/Broker) - access Deal Intake, OM, Distribution sections
- **Buy deals** (as Buyer) - access Buyer Inbox, Criteria, Responses sections
- **Switch context** via navigation, NOT separate logins

**Files to create in `src/pages/buyer/`:**

1. **BuyerInbox.jsx** (`/BuyerInbox`) - Received deals with AI scores
2. **BuyerDealView.jsx** (`/BuyerDeal?id=:id`) - View deal + submit response
3. **BuyerCriteria.jsx** (`/BuyerCriteria`) - Configure AI matching criteria
4. **BuyerResponses.jsx** (`/BuyerResponses`) - History of submitted responses

**Navigation approach:**
- Add "Buying" section to main sidebar alongside "Selling/Deals" section
- Same Layout, same auth, different menu sections
- Data is connected - a GP can see deals they're selling AND deals they're considering buying

---

## API Client Extensions

**File to modify: `src/api/bffClient.js`**

Add namespaces:
- `bff.dealIntake.*` - 12 methods for intake API
- `bff.om.*` - 9 methods for OM API
- `bff.distribution.*` - 7 methods for distribution API
- `bff.buyer.*` - 12 methods for buyer API
- `bff.gate.*` - 12 methods for permission gate API

---

## Navigation Updates (Unified Platform)

**Files to modify:**
- `src/Layout.jsx` - Add sectioned sidebar:
  ```
  SELLING
  ├── Deal Intake
  ├── My Deals (selling)
  └── Distribution

  BUYING
  ├── Deal Inbox
  ├── My Criteria
  └── My Responses

  PORTFOLIO (existing)
  ├── Investments
  └── etc.
  ```
- `src/pages.config.js` - Register all new pages
- `src/App.jsx` - No separate app branch needed (unified routing)

---

## Implementation Order

| Week | Focus | Deliverables |
|------|-------|--------------|
| 1 | Foundation | API client, 8 shared components |
| 2 | Intake Core | DealDrafts list, CreateDealDraft, basic DealDraftDetail |
| 3 | Verification | Claims tab, Conflicts tab, stats integration |
| 4 | OM | OMEditor, approval workflow, OM Preview tab |
| 5 | Distribution | DistributionManagement, BuyerReviewQueue |
| 6 | Authorization | BuyerAuthorizationDetail, DealProgress, NDA flow |
| 7 | Buyer Portal | All buyer pages (Inbox, Detail, Criteria, Settings) |
| 8 | Polish | Navigation, empty states, loading skeletons, testing |

---

## Verification Plan

```bash
# After each phase, verify:
npm run dev              # Start dev server
npm run lint             # Check for errors

# Manual testing:
# - Navigate to new pages
# - Test API integration
# - Verify state management
# - Check responsive design
```

---

## Critical Files Reference

| Purpose | File |
|---------|------|
| API client | `src/api/bffClient.js` |
| Page registry | `src/pages.config.js` |
| Main routing | `src/App.jsx` |
| Layout/nav | `src/Layout.jsx` |
| Claim pattern | `src/components/verification/ClaimCard.jsx` |
| Query client | `src/lib/query-client.js` |

---

# Original System Design Specification

*The following is the original backend system design for reference.*

---

## 1. Actors & Roles

### CRITICAL: Single Account Model
**GPs have ONE account that acts as BOTH buyer AND seller.**
- When selling: GP is "Seller" role on that deal
- When buying: GP is "Buyer" role on other deals
- Same portfolio hub, same login, role determined per-deal

---

### 1.1 GP (as Seller on a Deal)
**Authority**: Final approval on OM, decides public/private listing, approves buyer advancement
**Access**: Full control over their selling deal
**Visibility**: All deal data, buyer list (anonymous buyers shown without identity)

| Action | Seller Can Do |
|--------|--------------|
| Approve OM before distribution | ✓ (required) |
| Choose public vs private listing | ✓ |
| Review buyer interest | ✓ |
| Authorize buyers for DD | ✓ |
| See anonymous buyer identity | ✗ (unless buyer reveals) |

### 1.2 Broker (Engaged by Seller)
**Authority**: Draft OM, manage distribution, coordinate buyer responses
**Access**: Edit deal, distribute to buyers (within seller's chosen listing type)
**Visibility**: All deal data, all buyer responses

**Co-Listing Support:**
- Primary broker: Created the deal
- Co-brokers: Invited, share distribution rights

| Action | Broker Can Do |
|--------|--------------|
| Create/edit deal draft | ✓ |
| Draft/edit OM | ✓ |
| Submit OM for seller approval | ✓ |
| Distribute (after seller approves) | ✓ |
| Add manual recipients (private) | ✓ |
| View all buyer responses | ✓ |
| Recommend buyer authorization | ✓ (seller decides) |

### 1.3 GP (as Buyer on Other Deals)
**Authority**: None over deal state. Can only express interest.
**Access**: View deals matching their criteria, respond to distributions
**Visibility**: Only materials distributed to them

**Buyer Features:**
- Configure investment criteria (auto-matching for public deals)
- Pay for anonymity (seller sees "Anonymous Buyer" instead of firm name)
- Receive deals in inbox (auto-pushed for matches) or search manually

| Action | Buyer Can Do |
|--------|--------------|
| Set investment criteria | ✓ |
| Pay for anonymity | ✓ (premium feature) |
| View deals in inbox | ✓ (public deals that match criteria) |
| Search deals | ✓ (public deals) |
| Submit interest response | ✓ |
| Access data room | ✓ (only after seller authorization) |
| Advance deal state | ✗ Never |

### 1.4 Buyer AI Agent (Per-Buyer)
**Authority**: Zero. Triage only.
**Access**: Read-only on buyer's received deals
**Visibility**: Only deals distributed to this buyer

| Action | Buyer AI Can Do |
|--------|----------------|
| Score deal vs criteria | ✓ |
| Flag fit/no-fit | ✓ |
| Summarize deal | ✓ |
| Draft response | ✓ (buyer must submit) |
| Submit response | ✗ Never |
| Contact broker/seller | ✗ Never |

### 1.5 Platform
**Authority**: Match buyers to public deals, enforce state machine, audit logging
**Access**: All data
**Actions:**

| Action | Platform Does |
|--------|--------------|
| Match public deals to buyer criteria | ✓ (auto) |
| Push matches to buyer inbox | ✓ (auto) |
| Draft OM sections | ✓ (human approves) |
| Extract claims from documents | ✓ (as claims, not truth) |
| Advance deal state | ✗ Never (only on human action) |
| Approve buyers | ✗ Never |

---

## 2. State Machine (Exact)

### 2.1 Deal States

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DEAL STATE MACHINE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [DRAFT_INGESTED] ──────────────────────────────────────────────────────┐   │
│         │                                                                │   │
│         │ AI processes inputs                                            │   │
│         ▼                                                                │   │
│  [OM_DRAFTED] ──────────────────────────────────────────────────────┐   │   │
│         │                                                            │   │   │
│         │ Broker edits + approves                                    │   │   │
│         ▼                                                            │   │   │
│  [OM_BROKER_APPROVED] ──────────────────────────────────────────┐   │   │   │
│         │                                                        │   │   │   │
│         │ Seller approves (or broker has delegation)             │   │   │   │
│         ▼                                                        │   │   │   │
│  [OM_APPROVED_FOR_MARKETING] ───────────────────────────────┐   │   │   │   │
│         │                                                    │   │   │   │   │
│         │ Broker initiates distribution                      │   │   │   │   │
│         ▼                                                    │   │   │   │   │
│  [DISTRIBUTED] ─────────────────────────────────────────┐   │   │   │   │   │
│         │                                                │   │   │   │   │   │
│         │ Buyers respond                                 │   │   │   │   │   │
│         ▼                                                │   │   │   │   │   │
│  [SOFT_INTEREST_COLLECTED] ─────────────────────────┐   │   │   │   │   │   │
│         │                                            │   │   │   │   │   │   │
│         │ Broker/seller reviews                      │   │   │   │   │   │   │
│         ▼                                            │   │   │   │   │   │   │
│  [BROKER_SELLER_REVIEW] ────────────────────────┐   │   │   │   │   │   │   │
│         │                                        │   │   │   │   │   │   │   │
│         │ Per-buyer approval                     │   │   │   │   │   │   │   │
│         ▼                                        │   │   │   │   │   │   │   │
│  [BUYER_AUTHORIZED] ────────────────────────┐   │   │   │   │   │   │   │   │
│         │                                    │   │   │   │   │   │   │   │   │
│         │ NDA executed + data room opened    │   │   │   │   │   │   │   │   │
│         ▼                                    │   │   │   │   │   │   │   │   │
│  [ACTIVE_DD]                                 │   │   │   │   │   │   │   │   │
│         │                                    │   │   │   │   │   │   │   │   │
│         │ LOI → PSA → Close                  │   │   │   │   │   │   │   │   │
│         ▼                                    │   │   │   │   │   │   │   │   │
│  [UNDER_CONTRACT] ──► [CLOSED] or [PASSED]   │   │   │   │   │   │   │   │   │
│                                              │   │   │   │   │   │   │   │   │
│  ◄───────────────────────────────────────────┘   │   │   │   │   │   │   │   │
│  Can return to earlier states (except CLOSED)    │   │   │   │   │   │   │   │
│                                                  │   │   │   │   │   │   │   │
└──────────────────────────────────────────────────┴───┴───┴───┴───┴───┴───┴───┘
```

### 2.2 State Transition Table

| From State | To State | Trigger | Required Permission | Artifacts Created | Irreversible? |
|------------|----------|---------|---------------------|-------------------|---------------|
| (none) | DRAFT_INGESTED | Broker submits materials | Broker | DealDraft, ClaimGraph, DocumentIndex | No |
| DRAFT_INGESTED | OM_DRAFTED | AI completes draft | Platform (auto) | OMDraft v1 | No |
| OM_DRAFTED | OM_BROKER_APPROVED | Broker approves draft | Broker | OMVersion (broker-approved) | No |
| OM_BROKER_APPROVED | OM_APPROVED_FOR_MARKETING | Seller approves | Seller (or delegated Broker) | OMVersion (seller-approved), AuditLog | No |
| OM_APPROVED_FOR_MARKETING | DISTRIBUTED | Broker initiates send | Broker | DistributionRecord, RecipientList | No (can add more recipients) |
| DISTRIBUTED | SOFT_INTEREST_COLLECTED | Any buyer responds | Buyer | BuyerResponse | No |
| SOFT_INTEREST_COLLECTED | BROKER_SELLER_REVIEW | Timer or broker action | Broker | ReviewQueue | No |
| BROKER_SELLER_REVIEW | BUYER_AUTHORIZED | Broker/seller approves buyer | Broker + Seller (configurable) | BuyerAuthorization, NDARequest | No (can revoke) |
| BUYER_AUTHORIZED | ACTIVE_DD | NDA executed | Platform (on NDA signature) | NDARecord, DataRoomAccess | No (can revoke access) |
| ACTIVE_DD | UNDER_CONTRACT | LOI/PSA executed | Broker | ContractRecord | No |
| UNDER_CONTRACT | CLOSED | Closing complete | Broker | ClosingRecord | **Yes** |
| Any (except CLOSED) | PASSED | Broker/seller passes | Broker or Seller | PassRecord with reason | No (can reactivate) |

### 2.3 Buyer-Level States (Within a Deal)

Each buyer has their own state progression within a deal:

```
INVITED → VIEWED → RESPONDED → UNDER_REVIEW → AUTHORIZED → IN_DD → UNDER_CONTRACT → CLOSED/PASSED
```

| Buyer State | Meaning | Buyer Can See |
|-------------|---------|---------------|
| INVITED | Distribution sent | Teaser only (until they open) |
| VIEWED | Opened distribution | OM + marketing materials |
| RESPONDED | Submitted interest | Same as VIEWED |
| UNDER_REVIEW | Broker/seller reviewing | Same as VIEWED |
| AUTHORIZED | Approved by broker/seller | OM + NDA request |
| IN_DD | NDA signed, data room open | Full data room |
| UNDER_CONTRACT | LOI/PSA in place | Full data room + contract docs |
| PASSED | Declined or withdrew | Nothing (access revoked) |

---

## 3. Step 0 — Broker Ingest

### 3.1 Accepted Inputs

**Zero-friction intake. No required fields.**

| Input Type | Handling |
|------------|----------|
| **Forwarded email** | Parse sender, subject, body, all attachments |
| **File upload** (drag-drop) | Accept any file type, classify automatically |
| **Pasted text** | Treat as deal summary, extract claims |
| **URL/link** | Fetch and parse (if accessible) |
| **Voice memo** | Transcribe, extract claims |
| **Photo of document** | OCR, extract claims |

### 3.2 Automatic Inference (Platform Does)

All inferences are **claims with provenance**, not truth.

| Inferred | Source | Confidence Model |
|----------|--------|------------------|
| Property address | Document text, email body | HIGH if matches pattern |
| Asset type | Keywords, document type | MEDIUM |
| Asking price | "$X" patterns in text | HIGH if explicit |
| Unit count | Rent roll row count, text extraction | HIGH from rent roll, MEDIUM from text |
| NOI | T12 bottom line, text extraction | HIGH from T12, LOW from marketing |
| Broker identity | Email sender, signature block | HIGH from email |
| Document type | Filename, content analysis | MEDIUM-HIGH |

### 3.3 Never Inferred Without Confirmation

| Field | Why |
|-------|-----|
| Seller identity | Legal/confidentiality risk |
| Ownership structure | Legal complexity |
| Deal terms (not price) | Too variable |
| Timeline/deadlines | Business-critical |
| Encumbrances/liens | Legal risk |
| Environmental issues | Liability |

### 3.4 Internal Objects Created

```
DealDraft
├── id: uuid
├── brokerId: string
├── status: "DRAFT_INGESTED"
├── createdAt: timestamp
├── ingestSource: { type: "EMAIL"|"UPLOAD"|"PASTE", raw: blob }
│
├── ClaimGraph (all extracted data as claims)
│   ├── claims[]
│   │   ├── field: "asking_price"
│   │   ├── value: 15000000
│   │   ├── source: { documentId, page, location }
│   │   ├── extractionMethod: "LLM"|"REGEX"|"OCR"
│   │   ├── confidence: 0.92
│   │   ├── status: "UNVERIFIED"|"BROKER_CONFIRMED"|"SELLER_CONFIRMED"
│   │   └── conflictsWith: [claimId] (if multiple sources disagree)
│   │
│   └── conflicts[] (auto-detected discrepancies)
│       ├── field: "unit_count"
│       ├── claims: [claimId1, claimId2]
│       ├── values: [48, 52]
│       └── resolution: null | { resolvedValue, resolvedBy, method }
│
└── DocumentIndex
    └── documents[]
        ├── id: uuid
        ├── filename: string
        ├── classifiedType: "OM"|"RENT_ROLL"|"T12"|"UNKNOWN"
        ├── classificationConfidence: 0.85
        ├── extractedClaims: [claimId]
        ├── pageCount: number
        └── receivedAt: timestamp
```

---

## 4. Step 1 — AI-Drafted OM

### 4.1 OM Section Schema (Exact)

```yaml
OfferingMemorandum:
  version: number
  status: "DRAFT"|"BROKER_APPROVED"|"SELLER_APPROVED"|"MARKETING"

  sections:
    - id: "cover"
      title: "Cover Page"
      required: true
      fields:
        - propertyName
        - propertyAddress
        - assetType
        - brokerLogo
        - confidentialityNotice

    - id: "executive_summary"
      title: "Executive Summary"
      required: true
      fields:
        - investmentHighlights: string[] (bullet points)
        - askingPrice: { value, basis: "per unit"|"per SF"|"total" }
        - keyMetrics: { capRate, pricePerUnit, pricePerSF }
        - dealSummary: string (2-3 paragraphs)

    - id: "property_overview"
      title: "Property Overview"
      required: true
      fields:
        - physicalDescription
        - yearBuilt
        - totalUnits
        - totalSF
        - unitMix: [{ type, count, avgSF, avgRent }]
        - amenities: string[]
        - recentCapex: string

    - id: "financial_summary"
      title: "Financial Summary"
      required: true
      fields:
        - currentNOI: { value, source, asOfDate }
        - proFormaNOI: { value, assumptions }
        - operatingExpenses: { total, perUnit, perSF }
        - capRateAnalysis: { inPlace, proForma, marketComp }

    - id: "rent_roll_summary"
      title: "Rent Roll Summary"
      required: true
      fields:
        - occupancyRate
        - averageRent: { inPlace, market }
        - leaseExpirationSchedule
        - tenantConcentration
        - mtmPercentage

    - id: "market_overview"
      title: "Market Overview"
      required: false
      fields:
        - submarketDescription
        - demographicHighlights
        - employmentDrivers
        - competitiveSet
        - rentComps

    - id: "investment_thesis"
      title: "Investment Thesis"
      required: false
      fields:
        - valueAddOpportunities
        - rentGrowthPotential
        - marketTailwinds

    - id: "transaction_terms"
      title: "Transaction Terms"
      required: true
      fields:
        - guidancePrice: { value, basis }
        - bidDeadline: date | null
        - processDescription
        - contactInfo

    - id: "disclaimers"
      title: "Disclaimers"
      required: true
      autogenerated: true
      content: "Standard legal disclaimers - all figures are estimates..."
```

### 4.2 AI Drafting Rules (Conservative)

**AI MUST:**
- Label every number with source and confidence
- Use hedged language ("approximately", "as reported by seller")
- Flag missing required fields
- Flag conflicts between sources
- Default to lower/more conservative figures when in doubt

**AI MUST NOT:**
- State unverified claims as facts
- Project future performance without explicit assumptions
- Include legal conclusions
- Make recommendations to buyers
- Omit material disclaimers

### 4.3 Claim Labeling

Every data point in the OM links to its claim:

```yaml
claim:
  id: "claim-001"
  field: "current_noi"
  value: 1250000
  displayValue: "$1,250,000"
  source:
    documentId: "doc-t12-001"
    documentName: "2024 T12.xlsx"
    location: "Sheet1, Cell G48"
  extractionMethod: "EXCEL_FORMULA"
  confidence: 0.95
  status: "UNVERIFIED"  # or "BROKER_CONFIRMED", "SELLER_CONFIRMED"
  conflictsWith: null
  lastUpdated: "2026-01-19T10:00:00Z"
```

### 4.4 Broker Edit + Seller Approval Workflow

```
1. AI generates OMDraft v1
   └── All sections populated from claims
   └── Unresolved conflicts flagged
   └── Missing sections marked

2. Broker reviews in editor
   ├── Edit any text/values
   ├── Resolve conflicts (pick authoritative source)
   ├── Add context/narrative
   ├── Mark claims as "BROKER_CONFIRMED"
   └── Click "Approve for Seller Review"
       └── Creates OMVersion with status: BROKER_APPROVED

3. Seller reviews
   ├── View all sections
   ├── See broker's edits (tracked changes)
   ├── Request changes → returns to broker
   └── Approve → OMVersion status: SELLER_APPROVED
       └── Unlocks distribution
```

### 4.5 Versioning Rules

| Change Type | Creates New Version? |
|-------------|---------------------|
| AI re-processes new documents | Yes (v1 → v2) |
| Broker edits text | No (edits tracked in-place) |
| Broker confirms claim | No |
| Broker resolves conflict | No |
| Broker clicks "Approve" | Yes (snapshot created) |
| Seller requests changes | No |
| Seller approves | Yes (snapshot created, locked) |
| Post-approval edit | Yes (requires re-approval) |

**Version Record:**
```yaml
OMVersion:
  id: uuid
  dealId: string
  versionNumber: number
  status: "DRAFT"|"BROKER_APPROVED"|"SELLER_APPROVED"
  content: json (full OM content)
  claims: [claimId] (snapshot of claim states)
  createdAt: timestamp
  createdBy: userId
  approvedBy: userId | null
  approvedAt: timestamp | null
  changeLog: string[]
```

---

## 5. Step 1B — Distribution

### 5.1 Two Distribution Modes (Seller Chooses)

**PRIVATE LISTING** (Seller chooses)
- Broker manually selects recipients
- No platform matching
- Deal not searchable by other buyers

**PUBLIC LISTING** (Seller chooses)
- Platform auto-matches buyers based on their saved criteria
- Matching deals pushed to buyer inbox
- Deal searchable by all platform users
- Broker can ALSO add manual recipients

### 5.2 Public Listing: Auto-Matching Flow

```
1. Seller approves OM + selects "Public Listing"
2. Platform scans all buyer criteria profiles
3. Matching buyers identified:
   - Hard filters pass (geography, asset type, price range)
   - Soft scoring calculated
4. Deal pushed to matching buyers' inboxes
5. Deal appears in public search results
6. Broker can also manually add specific buyers
```

### 5.3 Distribution Record

```yaml
Distribution:
  id: uuid
  dealId: string
  omVersionId: string  # Must be SELLER_APPROVED
  listingType: "PUBLIC" | "PRIVATE"

  # For PUBLIC listings
  autoMatchedBuyers:
    - buyerId: uuid
      matchScore: 85
      matchReason: "Multifamily, Texas, 100+ units"
      pushedToInboxAt: timestamp

  # Manual additions (both PUBLIC and PRIVATE)
  manualRecipients:
    - buyerId: uuid
      addedBy: brokerId
      addedAt: timestamp

  # Tracking
  sentAt: timestamp
  sentBy: brokerId  # Broker who initiated distribution
```

### 5.4 Anonymous Buyers (Premium Feature)

Buyers can pay to appear anonymous on deals:

```yaml
BuyerAnonymitySettings:
  buyerId: uuid
  isAnonymous: boolean  # Premium subscription
  anonymousLabel: "Anonymous Buyer"  # or custom: "Family Office - Southwest Focus"

# What seller sees for anonymous buyer:
{
  displayName: "Anonymous Buyer"
  criteria: "Multifamily, 50-200 units, TX/AZ/NV"  # Generic, no firm name
  firmName: null  # Hidden
  contactEmail: null  # Hidden, routed through platform
}
```

### 5.5 Buyer Visibility Rules

| Content | Buyer Can See | When |
|---------|---------------|------|
| OM (full) | Yes | After seller approval + distribution |
| Claim sources | No | Never (only sees values) |
| Other buyers | No | Never |
| Seller identity | Yes | Always (it's their deal) |
| Broker contact | Yes | Always |

### 5.6 Seller Visibility of Buyers

| Buyer Type | Seller Sees |
|------------|-------------|
| Normal buyer | Full firm name, contact info |
| Anonymous buyer | "Anonymous Buyer" + generic criteria only |
| Anonymous (revealed) | Full info after buyer chooses to reveal |

---

## 6. Step 1C — Buyer AI Triage

### 6.1 Buyer-Defined AI Criteria

Buyer configures their AI agent with investment criteria:

```yaml
BuyerAICriteria:
  buyerId: string

  # Hard filters (pass/fail)
  hardFilters:
    assetTypes: ["Multifamily", "Industrial"]  # or null for any
    geographies:
      include: ["TX", "FL", "AZ"]
      exclude: ["CA"]
    minUnits: 50
    maxUnits: 500
    maxPrice: 50000000

  # Soft scoring (weighted preferences)
  scoring:
    targetCapRate: { min: 5.0, target: 6.0, weight: 30 }
    targetIRR: { min: 15, target: 20, weight: 25 }
    preferredVintage: { after: 1990, weight: 10 }
    preferredOccupancy: { min: 90, weight: 15 }
    valueAddPotential: { preferred: true, weight: 20 }

  # Custom prompt additions
  customInstructions: |
    We prefer properties with assumable debt.
    Flag any deferred maintenance concerns.
    Note if seller financing is mentioned.
```

### 6.2 AI Scoring Output

```yaml
BuyerAITriage:
  dealId: string
  buyerId: string
  processedAt: timestamp

  # Hard filter results
  passesFilters: boolean
  filterResults:
    - filter: "assetTypes"
      passed: true
      reason: "Multifamily - matches criteria"
    - filter: "geographies"
      passed: true
      reason: "Texas - in include list"
    - filter: "maxPrice"
      passed: false
      reason: "$55M exceeds $50M max"

  # Soft scoring
  relevanceScore: 72  # 0-100
  scoreBreakdown:
    - criterion: "targetCapRate"
      score: 85
      reason: "5.8% cap rate within target range"
    - criterion: "valueAddPotential"
      score: 60
      reason: "Moderate value-add: below-market rents noted"

  # AI summary (for buyer's internal use only)
  summary: |
    This 120-unit multifamily in Austin, TX is priced at $55M (~$458K/unit).
    In-place cap rate of 5.8% with potential to reach 6.5% at market rents.
    Property was built in 2001 and appears well-maintained.

    KEY CONSIDERATION: Price exceeds your $50M threshold by 10%.

  # Flags
  flags:
    - type: "EXCEEDS_CRITERIA"
      field: "price"
      message: "Above max price threshold"
    - type: "OPPORTUNITY"
      field: "rents"
      message: "Current rents 12% below market"
```

### 6.3 AI Prohibitions (Explicit)

**Buyer AI is PROHIBITED from:**

| Action | Prohibition | Reason |
|--------|-------------|--------|
| Submitting responses | ✗ | Human must decide |
| Contacting broker | ✗ | No automated outreach |
| Contacting seller | ✗ | No automated outreach |
| Scheduling meetings | ✗ | Human must initiate |
| Making offers | ✗ | Legal/authority issue |
| Sharing deal externally | ✗ | Confidentiality |
| Comparing to specific other deals | ✗ | Information barrier |
| Recommending "buy" or "pass" | ✗ | Advisory liability |

**AI CAN say:** "This deal scores 72/100 based on your criteria."
**AI CANNOT say:** "You should pursue this deal."

### 6.4 Relevance Display (No Approval Implication)

UI language discipline:

| ✗ Don't Say | ✓ Do Say |
|-------------|----------|
| "AI recommends" | "AI relevance score" |
| "Good fit" | "Matches 4 of 5 criteria" |
| "You should review" | "Flagged for review based on your settings" |
| "Approved by AI" | Never use "approved" with AI |

---

## 7. Step 1D — Buyer Responses

### 7.1 Response Options

```yaml
BuyerResponse:
  dealId: string
  buyerId: string
  respondedAt: timestamp
  respondedBy: userId  # Must be human

  response: "INTERESTED" | "INTERESTED_WITH_CONDITIONS" | "PASS"

  # If INTERESTED
  interestedDetails:
    indicativePriceRange: { min, max } | null  # Optional
    intendedStructure: string | null  # "All cash", "Assumable debt", etc.
    timelineNotes: string | null
    questionsForBroker: string[]

  # If INTERESTED_WITH_CONDITIONS
  conditions:
    - "Need updated T12"
    - "Subject to Phase I environmental"
    - "Price guidance seems high"

  # If PASS
  passReason: "PRICE" | "ASSET_TYPE" | "GEOGRAPHY" | "TIMING" | "OTHER"
  passNotes: string | null  # Optional feedback

  # Metadata
  confidential: boolean  # Broker sees, seller may not (configurable)
```

### 7.2 Response Does NOT Advance State

**Critical: A buyer response is logged but does NOT:**
- Grant access to data room
- Create any commitment
- Notify seller (unless broker chooses)
- Change buyer's access level
- Imply broker/seller approval

**Response simply goes into Broker Review Queue.**

### 7.3 Logged Data

```yaml
ResponseAuditLog:
  - timestamp: "2026-01-19T14:30:00Z"
    action: "BUYER_VIEWED_OM"
    buyerId: "..."
    metadata: { duration: 240, pages: [1,2,3,5,7] }

  - timestamp: "2026-01-19T15:00:00Z"
    action: "BUYER_SUBMITTED_RESPONSE"
    buyerId: "..."
    response: "INTERESTED"
    submittedBy: "john@buyerfirm.com"
```

---

## 8. Permission Gate (Critical)

### 8.1 Broker/Seller Review Queue

```
┌─────────────────────────────────────────────────────────────────────────┐
│  BUYER REVIEW QUEUE - Oakwood Apartments                                 │
│  3 responses awaiting review                                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ Buyer: Greystone Capital                                           │ │
│  │ Contact: Sarah Chen (schen@greystone.com)                          │ │
│  │ Response: INTERESTED                                               │ │
│  │ Received: Jan 19, 2026 at 2:30 PM                                  │ │
│  │                                                                     │ │
│  │ Notes from buyer:                                                   │ │
│  │ "Strong fit for our value-add fund. Prepared to move quickly."     │ │
│  │ Indicative range: $53M - $56M                                      │ │
│  │                                                                     │ │
│  │ Buyer AI Score: 85/100 (for reference only)                        │ │
│  │                                                                     │ │
│  │ ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │ │
│  │ │  AUTHORIZE  │  │    HOLD     │  │   DECLINE   │                  │ │
│  │ └─────────────┘  └─────────────┘  └─────────────┘                  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ Buyer: Westfield Partners                                          │ │
│  │ Response: INTERESTED_WITH_CONDITIONS                               │ │
│  │ Conditions: Updated T12, Phase I review                            │ │
│  │ ...                                                                │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Available Actions

| Action | Effect | Who Can Do |
|--------|--------|------------|
| **AUTHORIZE** | Sends NDA request, queues for data room access | Broker (+ Seller if configured) |
| **HOLD** | No action, stays in queue | Broker |
| **DECLINE** | Buyer notified they're not moving forward | Broker |
| **REQUEST_MORE_INFO** | Message sent to buyer asking for clarification | Broker |

### 8.3 Approval Configuration

Broker sets per-deal:

```yaml
ApprovalSettings:
  dealId: string

  requireSellerApproval: boolean  # If true, seller must also approve
  sellerSeesIdentity: boolean     # If false, seller sees "Buyer A", "Buyer B"
  sellerSeesIndicativePrice: boolean
  autoHoldDays: number            # Auto-hold if no action in X days
```

### 8.4 Audit Trail

Every action logged:

```yaml
PermissionGateAudit:
  - timestamp: "2026-01-19T16:00:00Z"
    action: "BUYER_AUTHORIZED"
    dealId: "..."
    buyerId: "..."
    authorizedBy: "broker@firm.com"
    sellerApproval: "DELEGATED_TO_BROKER"  # or "APPROVED" with sellerId

  - timestamp: "2026-01-19T16:01:00Z"
    action: "NDA_REQUEST_SENT"
    dealId: "..."
    buyerId: "..."
    ndaDocumentId: "..."
```

### 8.5 Language Discipline

| ✗ Never Say | ✓ Use Instead |
|-------------|---------------|
| "Accept buyer" | "Authorize buyer" |
| "Match" | "Authorize" or "Approve for DD" |
| "Deal made" | "Buyer authorized for due diligence" |
| "Selected" | "Authorized" |
| "Winning bidder" | Never (until closing) |

---

## 9. Step 2 — Advancement to Active DD

### 9.1 What Unlocks on Authorization

| Asset | Access Granted |
|-------|----------------|
| NDA execution portal | Immediately on authorization |
| Data room (read-only) | After NDA execution |
| Document download | Per-document permissions |
| Q&A with broker | After NDA |
| Site visit scheduling | After NDA (broker-mediated) |
| Financial model templates | Optional (broker decision) |

### 9.2 NDA Handling

```yaml
NDAWorkflow:
  # On AUTHORIZE action:
  1. Platform generates NDA from broker's template
  2. NDA sent to buyer for e-signature
  3. Buyer signs
  4. Broker counter-signs (if required) or auto-executed
  5. NDA stored in deal record
  6. Data room access granted

NDARecord:
  id: uuid
  dealId: string
  buyerId: string
  templateId: string  # Broker's NDA template
  status: "SENT"|"BUYER_SIGNED"|"EXECUTED"|"EXPIRED"
  sentAt: timestamp
  buyerSignedAt: timestamp | null
  executedAt: timestamp | null
  documentUrl: string  # Signed PDF
```

### 9.3 Buyer-Specific Data Rooms

Each authorized buyer gets isolated access:

```yaml
DataRoomAccess:
  dealId: string
  buyerId: string
  accessLevel: "STANDARD"|"FULL"|"CUSTOM"

  # Standard access includes:
  standardDocs:
    - "Rent Roll (Current)"
    - "T12 Operating Statement"
    - "Property Condition Report"
    - "Environmental Phase I"
    - "Survey"
    - "Title Commitment"

  # Restricted docs (broker controls per-buyer):
  restrictedDocs:
    - docId: "financials-detailed"
      granted: false
      reason: "Available after LOI"

  # Access log
  accessLog:
    - timestamp: ...
      action: "DOCUMENT_VIEWED"
      documentId: "..."
      duration: 45  # seconds
```

### 9.4 Per-Buyer Audit Trail

Every buyer action logged:

```yaml
BuyerAuditTrail:
  buyerId: string
  dealId: string

  events:
    - timestamp: "2026-01-19T16:30:00Z"
      action: "DATA_ROOM_ACCESSED"
      ip: "..."
      userAgent: "..."

    - timestamp: "2026-01-19T16:31:00Z"
      action: "DOCUMENT_DOWNLOADED"
      documentId: "rent-roll-001"
      documentName: "January 2026 Rent Roll.xlsx"

    - timestamp: "2026-01-19T17:00:00Z"
      action: "QUESTION_SUBMITTED"
      questionId: "..."
      content: "Can you provide utility bills for past 12 months?"
```

---

## 10. Failure Modes & Safeguards

### 10.1 Liability Risk from AI-Drafted Materials

**Risk:** AI makes factual errors in OM that buyer relies upon.

**Mitigations:**
1. Every AI-drafted claim marked with source + confidence
2. Mandatory broker review before seller sees draft
3. Mandatory seller approval before distribution
4. Standard disclaimers auto-appended:
   > "All information provided is based on data supplied by the seller and third parties. Buyer must independently verify all material facts. Neither broker nor platform makes any representations or warranties..."
5. Audit log proves human approval chain
6. Version history shows exactly what was approved

### 10.2 Accidental Over-Disclosure

**Risk:** Sensitive data shared with unauthorized parties.

**Mitigations:**
1. Data room access requires NDA execution (system-enforced)
2. Watermarked documents with buyer identifier
3. Download logging with alerts for unusual activity
4. Broker can revoke access instantly
5. Document-level permissions (not all-or-nothing)
6. No forwarding of distribution links (unique per-buyer URLs)

### 10.3 Buyers Misunderstanding "Interest" as Access

**Risk:** Buyer thinks expressing interest grants rights.

**Mitigations:**
1. Clear UI: "Your response has been submitted. Access to additional materials requires broker/seller authorization."
2. No automatic advancement on response
3. Separate "Authorization" step with explicit notification
4. NDA is hard gate before any DD materials
5. Language discipline throughout (no "accept", no "match")

### 10.4 Brokers Losing Perceived Control

**Risk:** Broker feels platform is disintermediating them.

**Mitigations:**
1. All distributions go through broker
2. Buyer cannot contact seller directly
3. Platform branding is minimal (broker logo prominent)
4. No "marketplace" features (no buyer discovery, no deal matching)
5. Broker sees everything before seller
6. Broker can customize every template
7. Broker's NDA, not platform's

### 10.5 Sellers Fearing Leaks

**Risk:** Seller worries their deal is broadcast publicly.

**Mitigations:**
1. Permissioned distribution only (broker chooses every recipient)
2. NDA required before full OM access (configurable)
3. Watermarked documents trace source of any leak
4. Seller approval required before marketing
5. Seller can see (masked or not) who received distribution
6. No public listing, no SEO, no marketplace
7. Audit trail for legal recourse

---

## Design Decisions (Per User)

| Decision | Choice |
|----------|--------|
| Account model | **Single GP account** - same firm is buyer AND seller |
| Broker model | **Multiple brokers** (co-listing support) |
| Listing types | **Public** (platform matches) + **Private** (manual only) |
| Who decides listing type | **Seller** |
| Buyer matching | **Criteria-based auto-match** for public + manual for private |
| Buyer discovery | **Push to inbox** (auto) + **Search** (manual) |
| Anonymous buyers | **Premium feature** - hidden from seller |
| OM approval | **Seller MUST approve** before any distribution |
| Buyer AI | **Build now** (full system together) |

---

## Implementation Priority

### Phase 1: Foundation (~1 week)
- Prisma models for new entities
- Deal state machine (DealDraft → OM states)
- Broker ingest service (email, upload, paste)
- Claim extraction with provenance
- Multi-broker support

### Phase 2: OM Generation + Seller Flow (~1 week)
- AI OM drafter with claim labeling
- Broker edit + approval workflow
- Seller portal (configurable)
- Seller approval flow
- Version management

### Phase 3: Distribution + Buyer AI (~1 week)
- Broker-controlled distribution
- Buyer viewing and engagement tracking
- Buyer AI criteria configuration
- AI scoring and relevance display
- Buyer response collection (no state change)

### Phase 4: Permission Gate (~1 week)
- Broker/seller review queue
- Authorization workflow
- Response logging
- Handoff to existing DD system

---

## Files to Create/Modify

### New Prisma Models (schema.prisma +250 lines)
```
DealDraft          - Pre-marketing deal state
DealBroker         - Broker-deal relationship (supports co-listing)
DealSeller         - Seller-deal relationship + access config
Claim              - Individual data points with provenance
ClaimConflict      - Cross-document discrepancies
OMVersion          - Versioned offering memorandums
Distribution       - Distribution events
DistributionRecipient - Per-buyer distribution records
BuyerResponse      - Buyer interest responses
BuyerAICriteria    - Buyer's investment criteria
BuyerAITriage      - AI scoring results per deal
```

### New Services

| File | Purpose | Est. Lines |
|------|---------|------------|
| `server/services/deal-ingest.js` | Broker intake (email, upload, paste) | ~400 |
| `server/services/claim-extractor.js` | Extract claims with provenance | ~300 |
| `server/services/om-drafter.js` | AI OM generation with claim linking | ~500 |
| `server/services/distribution.js` | Distribution + tracking | ~300 |
| `server/services/buyer-ai-triage.js` | Buyer AI criteria + scoring | ~300 |
| `server/services/permission-gate.js` | Broker/seller authorization | ~250 |

### New Routes

| File | Purpose | Est. Lines |
|------|---------|------------|
| `server/routes/deal-intake.js` | Broker intake endpoints | ~300 |
| `server/routes/om-management.js` | OM CRUD + approval workflow | ~250 |
| `server/routes/distribution.js` | Distribution endpoints | ~200 |
| `server/routes/buyer-portal.js` | Buyer-facing endpoints | ~300 |
| `server/routes/seller-portal.js` | Seller review endpoints | ~200 |

### Integration Points (Modify Existing)

| File | Change |
|------|--------|
| `server/routes/email-intake.js` | Route broker emails to deal-ingest |
| `server/index.js` | Register new routes |
| `server/services/email-classifier.js` | Add OM classification patterns |

**Total: ~3,300 lines of new code**

---

## Verification Plan

### Phase 1 Tests
```bash
# Syntax check all new files
node --check server/services/deal-ingest.js
node --check server/services/claim-extractor.js

# Unit tests for claim extraction
npm run test -- --testPathPatterns="claim-extractor"
```

### Phase 2 Tests
```bash
# OM generation tests
npm run test -- --testPathPatterns="om-drafter"

# Integration: ingest → OM draft
curl -X POST localhost:8787/api/intake/upload \
  -F "file=@sample-om.pdf"
```

### Phase 3 Tests
```bash
# Distribution tests
npm run test -- --testPathPatterns="distribution"

# Buyer AI scoring tests
npm run test -- --testPathPatterns="buyer-ai"
```

### End-to-End Test
1. Broker forwards email with OM + rent roll → Deal created
2. AI drafts OM → Broker edits → Broker approves
3. Seller reviews → Seller approves
4. Broker distributes to buyer list
5. Buyer AI scores deal
6. Buyer responds "Interested"
7. Broker reviews → Authorizes buyer
8. Handoff to existing DD system (ACTIVE_DD state)
