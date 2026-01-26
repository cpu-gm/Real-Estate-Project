# CRE Deal Management Platform - System Compendium

**Last Updated**: 2026-01-25
**Version**: 1.0
**Purpose**: Comprehensive system documentation consolidating architecture, components, data models, APIs, and features

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Component Inventory](#component-inventory)
4. [Data Models & Entities](#data-models--entities)
5. [API Reference](#api-reference)
6. [Integration Points](#integration-points)
7. [Feature Specifications](#feature-specifications)
8. [Security Architecture](#security-architecture)
9. [Development Reference](#development-reference)
10. [Appendices](#appendices)

---

## Executive Summary

### System Purpose
Enterprise-grade Commercial Real Estate (CRE) deal lifecycle management platform with regulatory-compliant audit trails, authority gating, and AI-assisted underwriting.

### Architecture at a Glance
**3-Service Design:**
- **Kernel API** (Port 3001): Immutable event ledger with blockchain-like integrity
- **BFF Server** (Port 8787): Authentication, LP portal, LLM integration, financial operations
- **Vite UI** (Port 5173): React frontend with role-based views

### Trust Model
```
User → Vite UI → BFF → Kernel API → PostgreSQL
                  ↓
             SQLite (cache)
```

- **Kernel** = Source of truth (events, state machine, authority rules)
- **BFF** = Orchestration layer (auth, cache, external integrations)
- **UI** = Presentation only (kernel-faithful, never overrides)

### Key Capabilities
- **Deal Lifecycle Management**: Draft → UnderReview → Approved → Closed → Operating
- **Authority Gating**: Role-based approval thresholds with material requirements
- **LP Investor Portal**: Capital calls, distributions, documents, performance tracking
- **AI-Assisted Underwriting**: Document extraction, conflict detection, scenario modeling
- **Provenance Tracking**: Complete audit trail with SHA-256 hash chain
- **Multi-Tenant**: Organization isolation across all operations

### Quick Navigation

| Need to... | Go to |
|------------|-------|
| Find a specific API endpoint | [API Reference](#api-reference) |
| Understand data models | [Data Models](#data-models--entities) |
| Add a new backend route | [Development Reference](#development-reference) |
| Review security patterns | [Security Architecture](#security-architecture) |
| See all frontend pages | [Component Inventory - Frontend](#frontend-pages) |
| Check feature status | [Feature Specifications](#feature-specifications) |

---

## Architecture Overview

### High-Level System Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Vite React UI (5173)                   │  │
│  │  • Role-based views (GP, LP, Admin, Broker, Lender)      │  │
│  │  • TanStack Query for data fetching                      │  │
│  │  • Zod contract validation                               │  │
│  │  • Radix UI + Tailwind CSS                               │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                    ORCHESTRATION LAYER                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    BFF Server (8787)                      │  │
│  │  • JWT authentication & RBAC                             │  │
│  │  • Organization isolation                                │  │
│  │  • Kernel API proxy with caching                        │  │
│  │  • LP portal (magic links)                              │  │
│  │  • LLM integration (OpenAI)                             │  │
│  │  • Email (SendGrid), n8n webhooks                       │  │
│  │  • 57 route files, 200+ endpoints                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    SQLite (BFF)                           │  │
│  │  • LLM sessions & provenance                             │  │
│  │  • AI consent tracking                                   │  │
│  │  • User sessions & auth                                  │  │
│  │  • Financial operations (capital calls, distributions)   │  │
│  │  • 120+ tables                                           │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                      LEDGER LAYER                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Kernel API (3001)                      │  │
│  │  • Immutable event ledger (SHA-256 hash chain)           │  │
│  │  • Deal lifecycle state machine                          │  │
│  │  • Authority gating (role thresholds)                    │  │
│  │  • Material requirements (DOC/HUMAN/AI truth classes)    │  │
│  │  • Point-in-time snapshot replay                         │  │
│  │  • Compliance proofpack generation                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  PostgreSQL (Kernel)                      │  │
│  │  • Events (append-only with hash chain)                  │  │
│  │  • Materials (versioned with revisions)                  │  │
│  │  • Artifacts (SHA-256 file tracking)                     │  │
│  │  • Authority rules & actor roles                         │  │
│  │  • 15 core tables                                        │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### Service Responsibilities

#### Kernel API (cre-kernel-phase1)
- **Technology**: TypeScript, Fastify, Prisma, PostgreSQL
- **Core Functions**:
  - Event sourcing with tamper-evident hash chain
  - Deal state machine (11 states, 17 event types)
  - Authority rule enforcement (role-based thresholds)
  - Material requirement validation (DOC/HUMAN/AI truth classes)
  - Point-in-time snapshot generation
  - Draft state simulation (what-if scenarios)
- **Key Endpoints**:
  - `POST /deals`, `GET /deals/:id`
  - `POST /deals/:id/events`, `GET /deals/:id/events/verify`
  - `GET /deals/:id/snapshot?at={ISO}`, `POST /deals/:id/explain`
  - `GET /deals/:id/proofpack` (ZIP with complete audit trail)

#### BFF Server (canonical-deal-os/server)
- **Technology**: Node.js, Express-like dispatcher, Prisma, SQLite
- **Core Functions**:
  - JWT authentication & session management
  - Organization isolation enforcement
  - Kernel API proxy with caching
  - LP portal (magic link access)
  - LLM integration (OpenAI for document parsing)
  - Email notifications (SendGrid)
  - Financial operations (capital calls, distributions)
  - Document generation (PDF, DOCX)
  - n8n webhook integration
- **Route Organization**: 57 files, 10 domain categories, 200+ endpoints

#### Vite UI (canonical-deal-os/src)
- **Technology**: React, TanStack Query, Radix UI, Tailwind CSS
- **Core Functions**:
  - Role-based page rendering (GP, LP, Admin, Broker, Lender, Counsel)
  - Zod schema validation (contract enforcement)
  - Real-time updates via polling
  - Document upload/download
  - Multi-step wizards (deal intake, broker onboarding)
- **Page Organization**: 76 pages across 8 role categories

### Data Flow

**Deal Creation Flow:**
```
1. GP creates deal in UI → POST /api/deals
2. BFF validates JWT, checks org, creates deal in Kernel
3. Kernel creates Event (type: DealCreated), returns dealId
4. BFF caches deal, returns to UI
5. UI displays deal in "Draft" state
```

**Authority Gating Flow:**
```
1. GP attempts action → POST /api/deals/:id/events
2. BFF forwards to Kernel with actorId
3. Kernel checks AuthorityRules:
   - Does actor have required role?
   - Are material requirements satisfied?
   - Is threshold met?
4. If blocked → Kernel returns 403 with explanation
5. If allowed → Kernel creates Event, updates state, returns 201
```

**LP Portal Access Flow:**
```
1. GP invites LP → POST /api/lp/invitations
2. BFF creates LPInvitation, emails magic link
3. LP clicks link → GET /api/lp/portal/session/:token
4. BFF validates token, creates session, returns LP data
5. LP views deals, capital calls, distributions (read-only)
```

---

## Component Inventory

### Backend Routes (57 files, 200+ endpoints)

#### Domain 1: Authentication & Authorization (3 files)

**auth.js** - Authentication workflows
- `POST /api/auth/signup` - Create user account
- `POST /api/auth/login` - Login with JWT
- `POST /api/auth/logout` - Session revocation
- `GET /api/auth/me` - Current user
- `GET /api/organizations/public` - Public orgs for signup
- **Features**: JWT (512-bit minimum), bcrypt password hashing, rate limiting, SSO placeholders

**admin.js** - Admin user management
- `GET /api/admin/verification-queue` - Pending approvals
- `GET /api/admin/users` - User list
- `POST /api/admin/verification/:requestId/approve` - Approve user
- `POST /api/admin/verification/:requestId/reject` - Reject user
- `PATCH /api/admin/users/:userId/role` - Update role
- `PATCH /api/admin/users/:userId/status` - Suspend/activate
- `POST /api/admin/verification/bulk-approve` - Bulk operations
- **Auth**: Admin role only

**permission-gate.js** - Permission utilities
- Role-based checks, org isolation helpers

#### Domain 2: Deal Lifecycle (4 files)

**deals.js** - Core deal operations
- `GET /api/deals` - List deals (filtered by org/assignment)
- `POST /api/deals` - Create deal
- `GET /api/deals/:dealId/home` - Deal dashboard
- `GET /api/deals/:dealId/records` - Full records (events, materials)
- **Features**: Deal caching with TTL, Kernel API integration, org isolation
- **Dependencies**: Kernel API (`/deals`, `/deals/:id/snapshot`, `/deals/:id/events`)

**deal-state.js** - State transitions
- Deal state machine management
- Status tracking (INTAKE_RECEIVED → DD_ACTIVE → UNDERWRITING → CLOSED)

**deal-submissions.js** - Submission workflows
- External submission tracking (lender, counsel)

**deal-assignments.js** - User assignments
- `GET /api/deals/:dealId/assignments`
- `POST /api/deals/:dealId/assign` - Assign user to deal
- `DELETE /api/deals/:dealId/assignments/:assignmentId`
- **Features**: GP Analyst/Counsel filtering by assignments

#### Domain 3: LP Management & Onboarding (2 files, 30+ endpoints)

**lp-onboarding.js** - LP invitation & reporting
- `POST /api/lp/invitations` - Send invitation
- `POST /api/lp/invitations/:invitationId/accept` - Accept invitation
- `GET /api/lp/deals/:dealId/invitations` - List invitations
- `GET /api/lp/portal` - LP portal landing
- `GET /api/lp/portal/deals/:dealId` - Investment detail
- `GET /api/lp/portal/deals/:dealId/report` - Export statement
- `GET /api/lp/actors/:dealId` - List LP actors
- `POST /api/lp/bulk-import` - Bulk import (up to 1000 LPs)
- `POST /api/lp/reports/generate` - Custom reports (capital_statement, distribution_summary, irr_performance)
- **Features**: Share class assignment, 30-day expiry, compliance tracking

**lp-portal-access.js** - LP session management
- `POST /api/lp/portal/magic-link` - Generate magic link
- `GET /api/lp/portal/session/:token` - Validate session
- `POST /api/lp/portal/session/:token/refresh` - Refresh token
- `DELETE /api/lp/portal/session/:token` - Logout
- `GET /api/lp/preferences` - Notification preferences
- `PUT /api/lp/preferences` - Update preferences
- `GET /api/lp/portal/my-investments` - Authenticated LP investments
- `GET /api/lp/portal/my-investments/:dealId/statement` - Financial statement
- **Features**: 7-day session expiry, rate limiting, share class matching

#### Domain 4: Financial Operations (3 files, 35+ endpoints)

**capital-calls.js** - Capital call management
- `GET /api/capital-calls/summary` - Org summary
- `GET /api/deals/:dealId/capital-calls` - List calls
- `POST /api/deals/:dealId/capital-calls` - Create call (GP only)
- `POST /api/deals/:dealId/capital-calls/:callId/issue` - Issue to LPs
- `PATCH /api/deals/:dealId/capital-calls/:callId` - Update draft
- `POST /api/deals/:dealId/capital-calls/:callId/cancel` - Cancel
- `POST /api/deals/:dealId/capital-calls/:callId/generate-notices` - PDF generation
- **LP Endpoints**:
  - `GET /api/lp/portal/my-investments/:dealId/capital-calls`
  - `POST /api/lp/portal/.../capital-calls/:callId/wire-initiated`
  - `POST /api/lp/portal/.../capital-calls/:callId/upload-proof`
- **Features**: Pro-rata allocation, cents-based arithmetic, share class support, integrity logging, cap table snapshots, optimistic concurrency (version checking), n8n webhooks

**distributions.js** - Distribution management
- `GET /api/distributions/summary`
- Similar structure to capital-calls
- **Features**: Waterfall calculation, LP position tracking, share class priority, statement generation

**investor-updates.js** - Investor communications
- `GET /api/deals/:dealId/investor-updates`
- `POST /api/deals/:dealId/investor-updates` - Create update
- `POST /api/deals/:dealId/investor-updates/:updateId/publish`
- **Features**: Quarterly reports, milestone tracking, Q&A

#### Domain 5: Underwriting & Intelligence (3 files, 15+ endpoints)

**underwriting.js** - AI-assisted underwriting
- `POST /api/deals/:dealId/extract` - Extract from documents
- `POST /api/deals/:dealId/analyze` - Run analysis
- `POST /api/deals/:dealId/scenarios` - Compare scenarios
- `POST /api/deals/:dealId/sensitivity` - Sensitivity matrix
- `GET /api/deals/:dealId/sectors` - Sector configs
- **Features**: Rent roll extraction with confidence scoring, T12 extraction, loan terms extraction, debt service calculation, scenario comparison, sensitivity analysis, conflict detection, memo generation
- **Dependencies**: Multiple extractors, underwriting calculator, waterfall calculator, sector config service

**deal-intake.js** - Deal intake workflows
- Document parsing, field extraction

**dd-checklist.js** - Due diligence
- Checklist management, item tracking

**smart-parse.js** - AI document parsing
- Field extraction with provenance

#### Domain 6: Notifications & Communication (3 files)

**notifications.js** - User notifications
- `GET /api/notifications` - List notifications
- `PATCH /api/notifications/:id/read`
- `POST /api/notifications/:id/snooze`
- `DELETE /api/notifications/:id` - Dismiss
- `PUT /api/notifications/preferences`
- **Features**: Aggregation, unread count, task-linked, deal-linked, snooze

**magic-links.js** - Magic link generation
- Token management for external access

**news-insights.js** - Market news
- Sector-specific updates

#### Domain 7: Document Management (5+ files)

**lp-documents.js** - LP document delivery
- Document access control, versioning

**legal-documents.js**, **legal-dashboard.js**, **legal-matters.js** - Legal workflows
- Legal document management, matter tracking, covenant tracking

**provenance.js** - Document provenance
- Audit trail for documents

#### Domain 8: Marketplace & Broker (4 files)

**brokerages.js** - Brokerage management
- Firm registration

**broker-dashboard.js** - Broker portal
- Metrics, deal submission

**listing-agreements.js** - Listing management
- Commission tracking

**om-management.js** - Offering memoranda
- Version control

#### Domain 9: Auxiliary/Utility (8 files)

**home.js** - Dashboard
- Summary metrics, aggregations

**inbox.js** - User inbox
- Message aggregation, priority inbox

**chat.js** - Messaging
- Deal-specific conversations

**integrations.js** - Third-party APIs
- Webhook management

**debug.js** - Debug endpoints
- Error diagnostics

**events.js** - Event streaming
- Deal event history

**llm.js** - LLM integration
- AI assistant APIs, document parsing via OpenAI

**ai-assistant.js**, **ai-consent.js** - AI features
- AI consent management, preferences

#### Domain 10: Specialized Workflows (10+ files)

**verification-queue.js**, **review-requests.js**, **evidence-pack.js**, **excel-import.js**, **email-intake.js**, **onboarding.js**, **accounting-periods.js**, **contacts.js**, **share-classes.js**, **lp-transfers.js**, **lender-portal.js**, **buyer-portal.js**, **seller-portal.js**, **distribution.js**, **n8n-callbacks.js**, **unified-audit.js**

**Total**: 57 route files, 200+ endpoints across 10 domains

---

### Frontend Pages (76 files)

#### Auth & Account (4 pages)

| Page | Path | Role | Key Features |
|------|------|------|--------------|
| Login.jsx | /login | Public | Email/password, SSO placeholders |
| Signup.jsx | /signup | Public | Role selection, org creation, broker fields |
| AdminDashboard.jsx | /admin | Admin | User verification queue, bulk approve/reject |
| PendingVerification.jsx | /pending | Auth | Verification status |

#### GP/Deal Management (5 pages)

| Page | Path | Role | Key Features |
|------|------|------|--------------|
| Home.jsx | / | GP/Multi | Role-aware dashboard, decision cards, command center |
| Deals.jsx | /deals | GP/Admin | Deal portfolio, lifecycle filtering, bulk assignment |
| DealOverview.jsx | /deals/:id | GP | Comprehensive dashboard, state machine, tabs |
| CreateDeal.jsx | /deals/new | GP | Form-based deal creation |
| DealWorkspace.jsx | /property/:id | GP/Broker | Property-focused workspace, KPIs, financials |

#### Financial Operations (4 pages)

| Page | Path | Role | Key Features |
|------|------|------|--------------|
| CapitalCalls.jsx | /capital-calls | GP | CRUD, status tracking, urgency badges |
| Distributions.jsx | /distributions | GP | Per-class allocation, status flow |
| InvestorUpdates.jsx | /investor-updates | GP | Send updates, track delivery |
| Investors.jsx | /investors | GP | Investor directory |

#### Intake & Deal Creation (3 pages)

| Page | Path | Role | Key Features |
|------|------|------|--------------|
| intake/DealDrafts.jsx | /intake/drafts | GP | Draft list, progress indicators |
| intake/DealDraftDetail.jsx | /intake/drafts/:id | GP | Draft editor |
| intake/CreateDealDraft.jsx | /intake/drafts/new | GP | New draft form |

#### Due Diligence & Compliance (4 pages)

| Page | Path | Role | Key Features |
|------|------|------|--------------|
| DealDueDiligence.jsx | /deals/:id/dd | GP/Analyst | 12-category checklist, AI suggestions |
| Compliance.jsx | /compliance | GP/Auditor | Covenant tracking |
| Lifecycle.jsx | /lifecycle | GP | State visualization |
| Traceability.jsx | /traceability | Auditor/Admin | Provenance, change history |

#### LP Portal (14 pages)

| Page | Path | Role | Key Features |
|------|------|------|--------------|
| LPPortal.jsx | /lp/portal | LP | Authenticated portfolio |
| LPPortalAuth.jsx | /lp/portal/:token | LP | Magic link auth |
| LPInvestmentDetail.jsx | /lp/investments/:id | LP | Performance, documents |
| LPInvestmentDetailAuth.jsx | /lp/investments/:token | LP | Token-auth view |
| lp/LPHome.jsx | /lp | LP | Dashboard, summary cards |
| lp/LPInvestments.jsx | /lp/investments | LP | Investment list |
| lp/LPCapitalCalls.jsx | /lp/capital-calls | LP | Upcoming/past calls |
| lp/LPCapitalCallDetail.jsx | /lp/capital-calls/:id | LP | Allocation status |
| lp/LPDistributions.jsx | /lp/distributions | LP | Distribution history |
| lp/LPDistributionDetail.jsx | /lp/distributions/:id | LP | Per-class breakdown |
| lp/LPUpdates.jsx | /lp/updates | LP | Communications archive |
| lp/LPUpdateDetail.jsx | /lp/updates/:id | LP | Update view |

#### Broker Pages (8 pages)

| Page | Path | Role | Key Features |
|------|------|------|--------------|
| broker/BrokerDashboard.jsx | /broker | Broker | Metrics, listings, pipeline |
| broker/BrokerDealView.jsx | /broker/deals/:id | Broker | Broker deal perspective |
| broker/Commissions.jsx | /broker/commissions | Broker | Commission tracking |
| broker/BrokerAcceptWizard.jsx | /broker/accept/:id | Broker | Multi-step listing acceptance |
| broker/wizard/WizardStepAgreement.jsx | - | Broker | Agreement review |
| broker/wizard/WizardStepCommission.jsx | - | Broker | Commission negotiation |
| broker/wizard/WizardStepMarketing.jsx | - | Broker | Marketing plan |
| broker/wizard/WizardStepReview.jsx | - | Broker | Final confirmation |
| brokerage/BrokerageSettings.jsx | /brokerage/settings | Broker | Firm settings |

#### Buyer/Marketplace (10 pages)

| Page | Path | Role | Key Features |
|------|------|------|--------------|
| marketplace/Marketplace.jsx | /marketplace | Buyer | Available listings |
| buyer/BuyerDealView.jsx | /buyer/deals/:id | Buyer | Buyer deal view |
| buyer/BuyerInbox.jsx | /buyer/inbox | Buyer | Inquiries, responses |
| buyer/BuyerResponses.jsx | /buyer/responses | Buyer | Response tracking |
| buyer/BuyerCriteria.jsx | /buyer/criteria | Buyer | Search criteria |
| buyer/SavedSearches.jsx | /buyer/searches | Buyer | Saved filters |
| buyer/DealComparison.jsx | /buyer/compare | Buyer | Side-by-side comparison |
| distribution/BuyerReviewQueue.jsx | /buyer/reviews | Buyer | Pending reviews |
| distribution/DealProgress.jsx | /buyer/progress/:id | Buyer | Progress tracking |
| distribution/BuyerAuthorizationDetail.jsx | /buyer/auth/:id | Buyer | Authorization review |
| distribution/DistributionManagement.jsx | /distributions/:id | Buyer/GP | Distribution workflow |

#### Seller Pages (4 pages)

| Page | Path | Role | Key Features |
|------|------|------|--------------|
| seller/SellerDealView.jsx | /seller/deals/:id | Seller | Seller deal view |
| property/ListForSaleWizard.jsx | /property/list | Seller | Multi-step listing wizard |
| property/RefinanceAnalysis.jsx | /property/:id/refi | Seller | Refi opportunity |
| property/ReportsGenerator.jsx | /property/:id/reports | Seller | Report generation |

#### Legal & Counsel (4 pages)

| Page | Path | Role | Key Features |
|------|------|------|--------------|
| legal/GPCounselHome.jsx | /legal/counsel | Counsel | Work dashboard, open requests |
| legal/LegalDocumentReview.jsx | /legal/documents/:id | Counsel | Document review/approval |
| legal/LegalVault.jsx | /legal/vault | Counsel | Document repository |
| legal/PlaybookBuilder.jsx | /legal/playbooks | Counsel/Admin | Workflow definitions |

#### Onboarding (5 pages)

| Page | Path | Role | Key Features |
|------|------|------|--------------|
| onboarding/OrgOnboarding.jsx | /onboarding/org | Admin | Org setup |
| onboarding/OrgOnboardingWizard.jsx | /onboarding/wizard | Admin | Multi-step wizard |
| onboarding/OnboardingStatus.jsx | /onboarding/status | Admin | Progress tracker |
| onboarding/OnboardingReviewQueue.jsx | /onboarding/review | Admin | Review queue |
| onboarding/AdminOnboardingQueue.jsx | /onboarding/admin | Admin | Admin tasks |

#### Operations & Communication (3 pages)

| Page | Path | Role | Key Features |
|------|------|------|--------------|
| Inbox.jsx | /inbox | GP/Multi | Task inbox with scopes, deal-linked actions |
| Contacts.jsx | /contacts | GP | Directory (brokers, lenders, attorneys) |
| EmailApprovalQueue.jsx | /email/approvals | GP/Admin | Email approval before sending |

#### Lender (1 page)

| Page | Path | Role | Key Features |
|------|------|------|--------------|
| LenderPortal.jsx | /lender | Lender | Exposure console, DSCR monitoring, covenant tracking |

#### Analysis & Reporting (3 pages)

| Page | Path | Role | Key Features |
|------|------|------|--------------|
| Explain.jsx | /explain | GP/Analyst | AI-powered analysis, scenario modeling |
| AuditExport.jsx | /audit/export | Admin/Auditor | Export for regulatory purposes |
| om/OMEditor.jsx | /om/:dealId | GP/Counsel | Offering memo editor |

#### Settings (1 page)

| Page | Path | Role | Key Features |
|------|------|------|--------------|
| Settings.jsx | /settings | All | Profile, notifications, workspace preferences |

**Total**: 76 frontend pages across 8 role categories

---

## Data Models & Entities

### Kernel Database (PostgreSQL) - 15 Core Tables

#### Deal & Actor Models

**Deal**
```typescript
{
  id: UUID,
  name: string,
  state: DealState,  // Draft | UnderReview | Approved | Closed | Operating | ...
  stressMode: StressMode,  // SM-0 | SM-1 | SM-2 | SM-3
  isDraft: boolean,
  createdAt: DateTime,
  updatedAt: DateTime
}
Relations: actorRoles[], authorityRules[], artifacts[], events[], materials[], obligations[]
```

**Actor**
```typescript
{
  id: UUID,
  name: string,
  type: "HUMAN" | "SYSTEM",
  createdAt: DateTime
}
Relations: actorRoles[], events[], obligations[], relationships[]
```

**Role**
```typescript
{
  id: UUID,
  name: string,  // GP, Analyst, Lender, Counsel, etc.
  orgId: UUID,
  createdAt: DateTime
}
Relations: actorRoles[]
```

**ActorRole** (Junction table)
```typescript
{
  actorId: UUID (FK),
  roleId: UUID (FK),
  dealId: UUID (FK),
  createdAt: DateTime
}
Composite key: [actorId, roleId, createdAt]
```

#### Authority & State Management

**AuthorityRule**
```typescript
{
  id: UUID,
  dealId: UUID (FK),
  action: string,  // APPROVE_DEAL, FINALIZE_CLOSING, etc.
  threshold: number,
  rolesAllowed: string[],
  rolesRequired: string[],
  createdAt: DateTime
}
```

**DraftState** (Simulation workspace)
```typescript
{
  id: UUID,
  dealId: UUID (FK, unique),
  lastModified: DateTime,
  createdAt: DateTime
}
Relations: simulatedEvents[], gatesPreviewed[]
```

**SimulatedEvent**
```typescript
{
  id: UUID,
  draftStateId: UUID (FK),
  type: EventType,
  actorId: UUID,
  payload: JSON,
  authorityContext: JSON,
  evidenceRefs: string[],
  sequenceOrder: number,
  createdAt: DateTime
}
Index: [draftStateId, sequenceOrder]
```

#### Deal Content Models

**MaterialObject** (Timestamped deal data)
```typescript
{
  id: UUID,
  dealId: UUID (FK),
  type: string,  // RentRoll, UnderwritingSummary, etc.
  data: JSON,
  truthClass: "DOC" | "HUMAN" | "AI",
  asOf: DateTime,
  sourceRef: string,
  createdAt: DateTime,
  updatedAt: DateTime
}
Relations: revisions[]
```

**MaterialRevision** (Audit trail)
```typescript
{
  id: UUID,
  materialId: UUID (FK),
  dealId: UUID (FK),
  type: string,
  data: JSON,
  truthClass: "DOC" | "HUMAN" | "AI",
  createdAt: DateTime
}
Index: [dealId, createdAt], [materialId, createdAt]
```

**Artifact** (File uploads)
```typescript
{
  id: UUID,
  dealId: UUID (FK),
  filename: string,
  mimeType: string,
  sizeBytes: number,
  sha256Hex: string (unique),
  storageKey: string,
  uploaderId: UUID,
  createdAt: DateTime
}
Index: [dealId]
Relations: links[]
```

**ArtifactLink** (Provenance mapping)
```typescript
{
  id: UUID,
  dealId: UUID (FK),
  artifactId: UUID (FK),
  eventId: UUID,
  materialId: UUID,
  tag: string,
  createdAt: DateTime
}
Index: [dealId], [artifactId]
```

#### Event & Audit Models

**Event** (Append-only ledger)
```typescript
{
  id: UUID,
  dealId: UUID (FK),
  type: EventType,  // ReviewOpened, DealApproved, etc.
  payload: JSON,
  actorId: UUID,
  authorityContext: JSON,
  evidenceRefs: string[],
  sequenceNumber: number,
  previousEventHash: string,  // SHA-256 chain link
  eventHash: string,           // This event's hash
  createdAt: DateTime
}
Index: [dealId, sequenceNumber]
```

**Event Types** (from shared/src/index.ts):
- ReviewOpened, DealApproved, ClosingReadinessAttested, ClosingFinalized
- OperationsActivated, MaterialChangeDetected, ChangeReconciled
- DistressDeclared, DistressResolved, FreezeImposed, FreezeLifted
- ExitFinalized, DealTerminated, DataDisputed
- ApprovalGranted, ApprovalDenied, OverrideAttested

**Deal States**:
- Draft → UnderReview → Approved → ReadyToClose → Closed
- Operating → Changed → Distressed → Resolved → Exited/Terminated
- Frozen (court/regulator hold)

**Stress Modes**:
- SM-0: Normal operation
- SM-1: Data disputed (requires resolution)
- SM-2: Distress active (enhanced monitoring)
- SM-3: Frozen (court/regulator hold)

#### Future Graph Models

**Obligation** (Rights & obligations tracking)
```typescript
{
  id: UUID,
  dealId: UUID (FK),
  fromActorId: UUID (FK),
  toActorId: UUID (FK, nullable),
  obligationType: "APPROVAL" | "MATERIAL_SUBMISSION" | "ATTESTATION",
  action: string,
  status: "PENDING" | "FULFILLED" | "WAIVED" | "EXPIRED",
  fulfilledByEventId: UUID,
  dueBy: DateTime,
  createdAt: DateTime,
  updatedAt: DateTime
}
Index: [dealId, status], [fromActorId, status]
```

**Relationship** (Actor relationships)
```typescript
{
  id: UUID,
  dealId: UUID (FK),
  actorAId: UUID (FK),
  actorBId: UUID (FK),
  relationType: "REPRESENTS" | "EMPLOYS" | "LENDS_TO",
  establishedAt: DateTime,
  terminatedAt: DateTime
}
Index: [dealId], [actorAId, relationType]
```

---

### BFF Database (SQLite) - 120+ Tables

*(Comprehensive listing of key models organized by domain)*

#### Authentication & Multi-Tenant Models

**Organization**
```typescript
{
  id: UUID,
  name: string,
  slug: string (unique),
  domain: string (unique),
  type: "GP" | "BROKERAGE" | "BUYER",
  status: "ACTIVE" | "SUSPENDED" | "DELETED",
  createdAt: DateTime,
  updatedAt: DateTime
}
Relations: users[], brokerUsers[]
```

**AuthUser**
```typescript
{
  id: UUID,
  email: string,
  passwordHash: string,
  name: string,
  organizationId: UUID (FK),
  role: "GP" | "GP Analyst" | "Lender" | "Counsel" | "LP" | "Admin" | "Broker" | ...,
  status: "PENDING" | "ACTIVE" | "SUSPENDED",
  ssoProvider: "GOOGLE" | "MICROSOFT" | null,
  ssoId: string,
  verifiedAt: DateTime,
  verifiedBy: UUID,
  brokerageId: UUID (FK),
  brokerLicenseNo: string,
  brokerLicenseState: string,
  createdAt: DateTime,
  updatedAt: DateTime
}
Relations: organization, brokerage, sessions[], verificationRequests[]
```

**AuthSession**
```typescript
{
  id: UUID,
  userId: UUID (FK),
  token: string (unique),
  expiresAt: DateTime,
  revokedAt: DateTime,
  userAgent: string,
  ipAddress: string,
  createdAt: DateTime
}
Index: [token], [userId], [expiresAt]
```

#### AI & LLM Models

**LLMParseSession** (Document extraction tracking)
```typescript
{
  id: UUID,
  userId: UUID,
  dealId: UUID,
  inputText: string,
  inputSource: string,
  provider: string,
  model: string,
  promptVersion: string,
  schemaVersion: string,
  temperature: number,
  startedAt: DateTime,
  completedAt: DateTime,
  latencyMs: number,
  status: string,
  errorMessage: string,
  rawProviderResponse: JSON,
  parsedResult: JSON,
  evaluatorReport: JSON,
  forceAccepted: boolean,
  forceAcceptedRationale: string,
  attempts: number
}
Relations: provenance[]
```

**LLMFieldProvenance** (Field-level lineage)
```typescript
{
  id: UUID,
  sessionId: UUID (FK),
  fieldPath: string,  // e.g., "rentRoll.units[0].currentRent"
  value: any,
  source: string,
  confidence: number,
  rationale: string,
  evidenceNeeded: string,
  artifactId: UUID,
  asOf: DateTime
}
Index: [sessionId], [fieldPath]
```

**AIInteractionLog** (Security audit)
```typescript
{
  id: UUID,
  userId: UUID,
  userRole: string,
  organizationId: UUID,
  dealId: UUID,
  endpoint: string,
  promptSummary: string,
  fullPrompt: string,
  fullResponse: string,
  systemPromptHash: string,
  modelUsed: string,
  contextFields: JSON,
  factsIncluded: JSON,
  responseLength: number,
  validationPassed: boolean,
  validationIssues: JSON,
  sanitizationApplied: boolean,
  jailbreakScore: number,
  jailbreakPatterns: string[],
  outputValidationPassed: boolean,
  outputValidationIssues: JSON,
  createdAt: DateTime
}
Index: [userId], [dealId], [organizationId], [createdAt]
```

**AIConsent** (GDPR compliance)
```typescript
{
  id: UUID,
  userId: UUID (unique),
  organizationId: UUID,
  consentGiven: boolean,
  consentVersion: string,
  allowDealParsing: boolean,
  allowChatAssistant: boolean,
  allowDocumentAnalysis: boolean,
  allowInsights: boolean,
  consentedAt: DateTime,
  withdrawnAt: DateTime,
  expiresAt: DateTime,
  ipAddress: string,
  userAgent: string,
  consentMethod: string,
  createdAt: DateTime,
  updatedAt: DateTime
}
Index: [organizationId], [consentGiven], [expiresAt]
```

#### LP Investor Models

**LPInvitation**
```typescript
{
  id: UUID,
  dealId: UUID,
  lpEntityName: string,
  lpEmail: string,
  commitment: number,
  ownershipPct: number,
  status: "PENDING" | "ACCEPTED" | "EXPIRED" | "CANCELLED",
  createdByUserId: UUID,
  createdAt: DateTime,
  acceptedAt: DateTime,
  expiresAt: DateTime,
  actorId: UUID,
  shareClassId: UUID (FK)
}
Unique: [dealId, lpEmail]
Index: [dealId], [lpEmail], [status], [shareClassId]
Relations: shareClass, emailDrafts[], reminderState
```

**LPActor**
```typescript
{
  id: UUID,
  dealId: UUID,
  email: string,
  entityName: string,
  actorId: UUID,
  commitment: number,
  ownershipPct: number,
  status: "ACTIVE" | "EXITED" | "TRANSFERRED",
  authUserId: UUID,
  organizationId: UUID,
  shareClassId: UUID (FK),
  createdAt: DateTime,
  updatedAt: DateTime
}
Unique: [email, dealId, shareClassId]
Index: [dealId], [email], [status], [organizationId], [shareClassId]
Relations: shareClass, transfersFrom[], transfersTo[]
```

**ShareClass** (Multi-class LP structure)
```typescript
{
  id: UUID,
  dealId: UUID,
  organizationId: UUID,
  name: string,  // "Class A", "Class B"
  code: string,  // "A", "B"
  description: string,
  preferredReturn: number,  // 0.08 = 8%
  managementFee: number,
  carryPercent: number,
  votingRights: boolean,
  priority: number,  // Waterfall priority
  createdBy: UUID,
  createdByName: string,
  createdAt: DateTime,
  updatedAt: DateTime
}
Unique: [dealId, code]
Index: [dealId], [organizationId]
Relations: lpActors[], lpInvitations[]
```

**LPTransfer** (Secondary trading)
```typescript
{
  id: UUID,
  dealId: UUID,
  organizationId: UUID,
  fromLpActorId: UUID (FK),
  toLpActorId: UUID (FK),
  effectiveDate: DateTime,
  transferAmount: number,
  transferPct: number,
  status: "PENDING" | "APPROVED" | "COMPLETED" | "CANCELLED",
  reason: string,
  documentId: UUID,
  approvalDocId: UUID,
  approvedAt: DateTime,
  approvedBy: UUID,
  completedAt: DateTime,
  createdBy: UUID,
  createdAt: DateTime
}
Index: [dealId], [fromLpActorId], [toLpActorId], [status]
Relations: fromLpActor, toLpActor
```

**LPPortalSession** (Magic link sessions)
```typescript
{
  id: UUID,
  lpActorId: UUID (FK),
  token: string (unique),
  ipAddress: string,
  userAgent: string,
  createdAt: DateTime,
  expiresAt: DateTime,  // 7 days
  lastUsedAt: DateTime
}
Index: [lpActorId], [token], [expiresAt]
```

#### Financial Operations Models

**CapitalCall**
```typescript
{
  id: UUID,
  dealId: UUID,
  title: string,
  description: string,
  totalAmount: number,
  dueDate: DateTime,
  wireInstructions: JSON,
  purpose: "INITIAL_FUNDING" | "CAPEX" | "OPERATING_SHORTFALL" | "OTHER",
  status: "DRAFT" | "ISSUED" | "PARTIALLY_FUNDED" | "FUNDED" | "CANCELLED",
  issuedAt: DateTime,
  issuedBy: UUID,
  documentId: UUID,
  snapshotId: UUID,
  periodId: UUID,
  createdBy: UUID,
  createdAt: DateTime,
  updatedAt: DateTime
}
Index: [dealId], [status], [dueDate], [periodId]
Relations: allocations[]
```

**CapitalCallAllocation**
```typescript
{
  id: UUID,
  capitalCallId: UUID (FK),
  lpActorId: UUID (FK),
  amount: number,
  status: "PENDING" | "WIRE_INITIATED" | "FUNDED" | "OVERDUE",
  fundedAmount: number,
  fundedAt: DateTime,
  wireReference: string,
  wireInitiatedAt: DateTime,
  proofDocumentId: UUID,
  remindersSent: number,
  lastReminderAt: DateTime,
  notes: string,
  version: number,  // Optimistic concurrency
  createdAt: DateTime,
  updatedAt: DateTime
}
Unique: [capitalCallId, lpActorId]
Index: [lpActorId], [status]
Relations: capitalCall
```

**Distribution**
```typescript
{
  id: UUID,
  dealId: UUID,
  title: string,
  description: string,
  totalAmount: number,
  distributionDate: DateTime,
  period: string,  // "Q4 2025"
  type: "CASH_DISTRIBUTION" | "RETURN_OF_CAPITAL" | "TAX_DISTRIBUTION",
  status: "DRAFT" | "APPROVED" | "PROCESSING" | "PAID" | "CANCELLED",
  approvedAt: DateTime,
  approvedBy: UUID,
  waterfallCalcId: UUID,
  documentId: UUID,
  snapshotId: UUID,
  periodId: UUID,
  createdBy: UUID,
  createdAt: DateTime
}
Index: [dealId], [status], [distributionDate], [periodId]
Relations: allocations[]
```

**DistributionAllocation**
```typescript
{
  id: UUID,
  distributionId: UUID (FK),
  lpActorId: UUID (FK),
  grossAmount: number,
  withholdingAmount: number,
  netAmount: number,
  paymentMethod: "WIRE" | "ACH" | "CHECK",
  status: "PENDING" | "PROCESSING" | "PAID" | "FAILED",
  paidAt: DateTime,
  confirmationRef: string,
  notes: string,
  version: number
}
Unique: [distributionId, lpActorId]
Index: [lpActorId], [status]
Relations: distribution
```

**WaterfallStructure** (LP/GP split rules)
```typescript
{
  id: UUID,
  dealId: UUID (unique),
  lpEquity: number,
  gpEquity: number,
  preferredReturn: number,  // default 0.08
  promoteTiers: JSON,
  gpCatchUp: boolean,
  catchUpPercent: number,
  lookback: boolean,
  usePerClassWaterfall: boolean,
  createdBy: UUID,
  createdAt: DateTime
}
Relations: distributions[]
```

**WaterfallDistribution** (Calculated results)
```typescript
{
  id: UUID,
  dealId: UUID,
  scenarioId: UUID,
  structureId: UUID (FK),
  yearlyDistributions: JSON,
  lpIRR: number,
  gpIRR: number,
  lpEquityMultiple: number,
  gpEquityMultiple: number,
  totalPromote: number,
  lpTotalReturn: number,
  gpTotalReturn: number,
  calculatedAt: DateTime
}
Index: [dealId], [scenarioId], [structureId]
Relations: structure
```

#### Underwriting Models

**UnderwritingModel** (Core financial model)
```typescript
{
  id: UUID,
  dealId: UUID (unique),
  scenarioName: string,
  isBaseCase: boolean,
  purchasePrice: number,
  totalUnits: number,
  grossSF: number,
  grossPotentialRent: number,
  vacancyRate: number,
  effectiveGrossIncome: number,
  otherIncome: number,
  operatingExpenses: number,
  taxes: number,
  insurance: number,
  management: number,
  reserves: number,
  netOperatingIncome: number,
  loanAmount: number,
  interestRate: number,
  amortization: number,
  loanTerm: number,
  annualDebtService: number,
  goingInCapRate: number,
  cashOnCash: number,
  dscr: number,
  exitCapRate: number,
  holdPeriod: number,
  rentGrowth: number,
  expenseGrowth: number,
  irr: number,
  equityMultiple: number,
  lastCalculatedAt: DateTime,
  status: "DRAFT" | "READY" | "SUBMITTED",
  createdAt: DateTime,
  updatedAt: DateTime
}
Index: [dealId], [status]
```

**UnderwritingInput** (Field lineage tracking)
```typescript
{
  id: UUID,
  dealId: UUID,
  fieldPath: string,
  value: JSON,
  sourceType: "DOCUMENT" | "AI_EXTRACTION" | "EXCEL_IMPORT" | "HUMAN_ENTRY" | "CALCULATION",
  source: string,
  sourceId: UUID,
  documentId: UUID,
  documentName: string,
  documentPage: number,
  documentCell: string,
  aiModel: string,
  aiConfidence: number,
  setBy: UUID,
  setByName: string,
  rationale: string,
  formula: string,
  inputFields: JSON,
  sourceDocId: UUID,
  confidence: number,
  setAt: DateTime,
  supersededAt: DateTime,
  supersededBy: UUID,
  verifiedBy: UUID,
  verifiedAt: DateTime
}
Index: [dealId, fieldPath], [dealId, supersededAt], [sourceType]
```

**UnderwritingConflict** (Cross-document conflicts)
```typescript
{
  id: UUID,
  dealId: UUID,
  fieldPath: string,
  conflictType: "VALUE_MISMATCH" | "UNIT_COUNT" | "EXPENSE_ANOMALY",
  severity: "INFO" | "WARNING" | "ERROR",
  sourceA: string,
  valueA: any,
  sourceB: string,
  valueB: any,
  difference: number,
  percentDiff: number,
  description: string,
  status: "OPEN" | "RESOLVED" | "IGNORED",
  resolution: string,
  resolvedBy: UUID,
  resolvedAt: DateTime,
  createdAt: DateTime
}
Index: [dealId, status], [severity]
```

**DocumentExtraction**
```typescript
{
  id: UUID,
  dealId: UUID,
  artifactId: UUID,
  documentType: "RENT_ROLL" | "T12" | "LOAN_TERMS" | "APPRAISAL",
  extractedData: JSON,
  confidence: number,
  extractedAt: DateTime,
  extractedBy: UUID,
  status: "EXTRACTED" | "APPLIED" | "SUPERSEDED"
}
Unique: [dealId, artifactId]
Index: [dealId], [documentType]
```

**RentRollUnit** (Unit-level detail)
```typescript
{
  id: UUID,
  dealId: UUID,
  extractionId: UUID (FK),
  unitNumber: string,
  unitType: "1BR" | "2BR" | "Studio" | ...,
  sqft: number,
  currentRent: number,
  marketRent: number,
  leaseStart: DateTime,
  leaseEnd: DateTime,
  status: "OCCUPIED" | "VACANT" | "NOTICE" | "MTM",
  tenant: string
}
Index: [dealId], [extractionId]
```

**T12LineItem** (Trailing 12 months financials)
```typescript
{
  id: UUID,
  dealId: UUID,
  extractionId: UUID (FK),
  category: "REVENUE" | "EXPENSE",
  lineItem: string,
  annualAmount: number,
  monthlyAmounts: JSON
}
Index: [dealId], [extractionId]
```

#### Document & Provenance Models

**ExtractionClaim** (AI-extracted values)
```typescript
{
  id: UUID,
  dealId: UUID,
  fieldPath: string,
  claimedValue: JSON,
  documentId: UUID (FK),
  documentName: string,
  documentType: "RENT_ROLL" | "T12" | "LOI" | "LOAN_TERMS",
  pageNumber: number,
  boundingBox: JSON,
  cellReference: string,
  textSnippet: string,
  snippetHash: string,
  extractionId: UUID (FK),
  aiModel: "gpt-4o" | "gpt-4o-mini",
  aiConfidence: number,
  extractedAt: DateTime,
  status: "PENDING" | "VERIFIED" | "REJECTED" | "SUPERSEDED",
  verifiedBy: UUID,
  verifiedAt: DateTime,
  rejectionReason: string,
  correctedValue: JSON,
  supersededBy: UUID,
  supersededAt: DateTime
}
Index: [dealId, fieldPath], [dealId, status], [extractionId]
```

**DocumentVersion** (Version control)
```typescript
{
  id: UUID,
  dealId: UUID,
  documentType: "IC_MEMO" | "LOI" | "PSA" | "DD_LIST" | "CLOSING_STATEMENT",
  version: number,
  status: "DRAFT" | "BINDING" | "EXECUTED" | "EFFECTIVE",
  contentHash: string,
  storageKey: string,
  format: "PDF" | "DOCX" | "MD",
  pageCount: number,
  templateId: UUID,
  templateVersion: string,
  provenanceMap: JSON,
  watermarkText: string,
  createdBy: UUID,
  createdAt: DateTime,
  promotedAt: DateTime,
  executedAt: DateTime,
  effectiveDate: DateTime,
  parentVersionId: UUID
}
Unique: [dealId, documentType, version]
Index: [dealId, documentType], [status]
```

**DealEvent** (BFF event mirror)
```typescript
{
  id: UUID,
  dealId: UUID,
  eventType: "STATE_TRANSITION" | "CLAIM_VERIFIED" | "DOCUMENT_GENERATED",
  eventData: JSON,
  actorId: UUID,
  actorName: string,
  actorRole: "GP" | "ANALYST" | "LENDER" | "COUNSEL" | "SYSTEM",
  authorityContext: JSON,
  evidenceRefs: JSON,
  sequenceNumber: number,
  fromState: string,
  toState: string,
  previousEventHash: string,
  eventHash: string,
  occurredAt: DateTime
}
Index: [dealId, sequenceNumber], [dealId, eventType], [occurredAt]
```

**EvidencePack** (Compliance bundles)
```typescript
{
  id: UUID,
  dealId: UUID,
  packType: "CLOSING_PACK" | "IC_PACK" | "AUDIT_PACK",
  name: string,
  description: string,
  manifest: JSON,
  storageKey: string,
  contentHash: string,
  sizeBytes: number,
  fileCount: number,
  generatedAt: DateTime,
  generatedBy: UUID,
  asOfTimestamp: DateTime,
  dealStateSnapshot: JSON,
  validationStatus: "PENDING" | "VALID" | "INVALID",
  validationErrors: JSON
}
Index: [dealId], [packType], [generatedAt]
```

#### Audit & Compliance Models

**PermissionAuditLog**
```typescript
{
  id: UUID,
  actorId: UUID,
  actorName: string,
  targetUserId: UUID,
  targetUserName: string,
  action: "ROLE_CHANGE" | "STATUS_CHANGE" | "VERIFICATION_APPROVED" | ...,
  beforeValue: JSON,
  afterValue: JSON,
  reason: string,
  timestamp: DateTime,
  ipAddress: string
}
Index: [targetUserId], [actorId], [timestamp], [action]
```

**Snapshot** (Point-in-time state)
```typescript
{
  id: UUID,
  dealId: UUID,
  snapshotType: "CAP_TABLE" | "DISTRIBUTION_CALC" | "CAPITAL_CALL_CALC",
  lpOwnership: JSON,
  capTableHash: string,  // SHA-256
  waterfallRules: JSON,
  rulebookHash: string,
  createdAt: DateTime,
  createdBy: UUID,
  reason: string
}
Index: [dealId], [snapshotType], [createdAt]
```

**AccountingPeriod** (GL close workflow)
```typescript
{
  id: UUID,
  dealId: UUID,
  year: number,
  quarter: number,  // 1-4 or 0 for annual
  periodType: "QUARTERLY" | "ANNUAL",
  startDate: DateTime,
  endDate: DateTime,
  status: "OPEN" | "SOFT_CLOSE" | "HARD_CLOSE",
  softClosedAt: DateTime,
  softClosedBy: UUID,
  hardClosedAt: DateTime,
  hardClosedBy: UUID,
  closeSnapshotId: UUID,
  createdAt: DateTime,
  notes: string
}
Unique: [dealId, year, quarter]
Index: [dealId, status], [dealId, year]
```

#### Additional Key Models
*(Listing ~30 more tables)*

- **Notification**, **NotificationPreference**, **ChatTask**
- **Conversation**, **ConversationParticipant**, **Message**
- **NewsInsight**, **NewsInteraction**
- **ReviewRequest**, **MagicLinkToken**, **DealSubmission**, **PortalComment**
- **DealAssignment**, **WorkflowTask**
- **DealIssue**, **DealIssueUpdate**, **MajorEvent**, **MajorEventConsent**
- **InvestorUpdate**, **LPQuestion**, **Subscription**
- **LPDocument**, **LPDocumentPermission**, **LPNotificationPreference**, **LPPaymentProfile**
- **DealMarketingRoom**, **MarketingRoomAccess**, **MarketingRoomInterest**
- **ExcelImport**, **ExcelCell**
- **EmailIntake**, **EmailAttachment**
- **UnderwritingScenario**, **UnderwritingMemo**
- **DataLineage**, **AssumptionSnapshot**, **AssumptionVariance**, **ExtractionConflict**
- **DDCategory**, **DDTemplateItem**
- **ApprovalRecord**, **DealState**
- **GeneratedDocument**, **DealProfile**, **UserSession**
- **DealCorrection**

**Total**: 120+ tables in BFF database

---

### Cross-Database Relationships

#### Data Flow: Kernel → BFF

1. **Deal ID Linkage**: BFF tables reference `dealId` as natural key (no FK to Kernel)
2. **Actor/User Mapping**:
   - Kernel: Actor (UUID) with type HUMAN/SYSTEM
   - BFF: AuthUser (UUID) with role-based permissions
   - Mapping: Kernel actorId ≈ BFF userId for humans
3. **Event Publishing**: Kernel Event → BFF DealEvent (mirror audit trail)
4. **Authority Context**: Kernel AuthorityRule + authorityContext → BFF ApprovalRecord

#### Key Integration Points

**Deal State**:
- Kernel: Deal.state + DraftState (simulation)
- BFF: DealState (workflow state machine)
- Sync: BFF reflects Kernel transitions

**Material Objects**:
- Kernel: MaterialObject (typed data)
- BFF: UnderwritingInput, ExtractionClaim
- Flow: BFF extracts → materializes in Kernel

**Evidence Chain**:
- Kernel: Artifact + ArtifactLink (provenance)
- BFF: DocumentExtraction + ExtractionClaim
- Both: SHA-256 hash verification

**Financial Operations**:
- Kernel: Authority gates
- BFF: CapitalCall, Distribution, WaterfallStructure
- Dependency: Kernel gates BFF operations

---

## API Reference

### Kernel API Endpoints (Port 3001)

**Base URL**: `http://localhost:3001` (dev) | `https://kernel.dealos.io` (prod)

#### Deal Operations

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/deals` | Required | Create new deal |
| GET | `/deals/:dealId` | Required | Get deal details |
| GET | `/deals/:dealId/events` | Required | List events for deal |
| GET | `/deals/:dealId/events/verify` | Required | Verify hash chain integrity |
| POST | `/deals/:dealId/events` | Required | Create event (authority gated) |
| GET | `/deals/:dealId/snapshot?at={ISO}` | Required | Point-in-time state |
| POST | `/deals/:dealId/explain` | Required | Why is action blocked? |
| GET | `/deals/:dealId/proofpack` | Required | Compliance archive (ZIP) |

**Example: Create Deal**
```bash
curl -X POST http://localhost:3001/deals \
  -H "Content-Type: application/json" \
  -d '{
    "name": "123 Main Street Apartments",
    "actorId": "uuid-of-gp"
  }'
```

**Example: Explain Blocked Action**
```bash
curl -X POST http://localhost:3001/deals/abc123/explain \
  -d '{
    "action": "APPROVE_DEAL",
    "actorId": "uuid-of-analyst"
  }'

# Response:
{
  "allowed": false,
  "reasons": [
    "Actor does not have GP role (required for APPROVE_DEAL)"
  ],
  "requiredRoles": ["GP"],
  "threshold": 1
}
```

---

### BFF API Endpoints (Port 8787)

**Base URL**: `http://localhost:8787` (dev) | `https://api.dealos.io` (prod)

#### Authentication Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/signup` | Public | Create user account |
| POST | `/api/auth/login` | Public | Login, returns JWT |
| POST | `/api/auth/logout` | Required | Revoke session |
| GET | `/api/auth/me` | Required | Current user info |
| GET | `/api/organizations/public` | Public | Orgs for signup |

**Example: Login**
```bash
curl -X POST http://localhost:8787/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "gp@canonical.com",
    "password": "gp123"
  }'

# Response:
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "gp@canonical.com",
    "role": "GP",
    "organizationId": "uuid"
  }
}
```

#### Deal Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/deals` | Required | List deals (org-filtered) |
| POST | `/api/deals` | GP/Admin | Create deal (proxies to Kernel) |
| GET | `/api/deals/:dealId/home` | Required | Deal dashboard |
| GET | `/api/deals/:dealId/records` | Required | Full records |
| GET | `/api/deals/:dealId/assignments` | Required | User assignments |
| POST | `/api/deals/:dealId/assign` | GP/Admin | Assign user |

#### LP Onboarding & Portal Endpoints (30+ endpoints)

**LP Invitations**

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/lp/invitations` | GP/Admin | Send LP invitation |
| POST | `/api/lp/invitations/:id/accept` | Public | Accept invitation |
| GET | `/api/lp/deals/:dealId/invitations` | GP/Admin | List invitations |
| POST | `/api/lp/bulk-import` | GP/Admin | Bulk import (1-1000 LPs) |

**Example: Send Invitation**
```bash
curl -X POST http://localhost:8787/api/lp/invitations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "lpEntityName": "Acme Capital Partners",
    "lpEmail": "invest@acme.example.com",
    "dealId": "550e8400-e29b-41d4-a716-446655440000",
    "commitment": 5000000,
    "ownershipPct": 10
  }'

# Response (201):
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "dealId": "550e8400-e29b-41d4-a716-446655440000",
  "lpEmail": "invest@acme.example.com",
  "status": "PENDING",
  "commitment": 5000000,
  "ownershipPct": 10,
  "expiresAt": "2026-02-24T12:00:00Z"
}
```

**LP Portal Access**

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/lp/portal/magic-link` | GP/Admin | Generate magic link |
| GET | `/api/lp/portal/session/:token` | Magic Token | Validate session |
| POST | `/api/lp/portal/session/:token/refresh` | Magic Token | Refresh token |
| DELETE | `/api/lp/portal/session/:token` | Magic Token | Logout |
| GET | `/api/lp/portal` | LP | LP portal landing |
| GET | `/api/lp/portal/deals/:dealId` | LP | Investment detail |
| GET | `/api/lp/portal/my-investments` | LP (Auth) | Investments list |
| GET | `/api/lp/portal/my-investments/:dealId/statement` | LP (Auth) | Financial statement |

**LP Reports**

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/lp/portal/deals/:dealId/report` | LP | Export LP statement |
| POST | `/api/lp/reports/generate` | GP/Admin | Custom reports |

**Custom Report Types**:
- `capital_statement` - Aggregates capital calls/distributions
- `distribution_summary` - Timeline of distributions
- `irr_performance` - Capital events timeline

#### Financial Operations Endpoints (35+ endpoints)

**Capital Calls**

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/capital-calls/summary` | GP/Admin | Org summary |
| GET | `/api/deals/:dealId/capital-calls` | GP/Admin | List calls |
| POST | `/api/deals/:dealId/capital-calls` | GP | Create call |
| POST | `/api/deals/:dealId/capital-calls/:callId/issue` | GP | Issue to LPs |
| PATCH | `/api/deals/:dealId/capital-calls/:callId` | GP | Update draft |
| POST | `/api/deals/:dealId/capital-calls/:callId/cancel` | GP | Cancel call |
| POST | `/api/deals/:dealId/capital-calls/:callId/generate-notices` | GP | Generate PDFs |

**LP Capital Call Endpoints**

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/lp/portal/my-investments/:dealId/capital-calls` | LP | View calls |
| GET | `/api/lp/portal/.../capital-calls/:callId` | LP | Call detail |
| POST | `/api/lp/portal/.../capital-calls/:callId/wire-initiated` | LP | Mark wire initiated |
| POST | `/api/lp/portal/.../capital-calls/:callId/upload-proof` | LP | Upload wire proof |

**Distributions** (similar structure to capital calls)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/distributions/summary` | GP/Admin | Org summary |
| GET | `/api/deals/:dealId/distributions` | GP/Admin | List distributions |
| POST | `/api/deals/:dealId/distributions` | GP | Create distribution |
| GET | `/api/lp/portal/my-investments/:dealId/distributions` | LP | View distributions |

#### Underwriting & Analysis Endpoints (15+ endpoints)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/deals/:dealId/extract` | GP/Analyst | Extract from documents |
| POST | `/api/deals/:dealId/analyze` | GP/Analyst | Run underwriting analysis |
| POST | `/api/deals/:dealId/scenarios` | GP/Analyst | Compare scenarios |
| POST | `/api/deals/:dealId/sensitivity` | GP/Analyst | Sensitivity matrix |
| GET | `/api/deals/:dealId/sectors` | GP/Analyst | Sector configs |

**Document Extraction Types**:
- Rent roll extraction with confidence scoring
- T12 (trailing 12 months) extraction
- Loan terms extraction
- Appraisal data extraction

#### Notification Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/notifications` | Required | List user notifications |
| PATCH | `/api/notifications/:id/read` | Required | Mark as read |
| POST | `/api/notifications/:id/snooze` | Required | Snooze notification |
| DELETE | `/api/notifications/:id` | Required | Dismiss |
| PUT | `/api/notifications/preferences` | Required | Update preferences |

#### Admin Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/verification-queue` | Admin | Pending approvals |
| GET | `/api/admin/users` | Admin | User list |
| POST | `/api/admin/verification/:requestId/approve` | Admin | Approve user |
| POST | `/api/admin/verification/:requestId/reject` | Admin | Reject user |
| PATCH | `/api/admin/users/:userId/role` | Admin | Update role |
| PATCH | `/api/admin/users/:userId/status` | Admin | Suspend/activate |
| POST | `/api/admin/verification/bulk-approve` | Admin | Bulk approve |

**Total**: 200+ endpoints across BFF

---

### Authentication Patterns

#### JWT Authentication (Standard)
```javascript
// Request
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

// Middleware extracts authUser
{
  id: "uuid",
  email: "user@example.com",
  role: "GP",
  organizationId: "uuid",
  name: "John Doe"
}
```

#### Magic Link Authentication (LP Portal)
```bash
# 1. GP generates magic link
POST /api/lp/portal/magic-link
{
  "lpEmail": "lp@example.com",
  "dealId": "uuid"
}

# Response:
{
  "magicLink": "https://dealos.io/lp/portal/session/abc123token",
  "expiresAt": "2026-02-01T12:00:00Z"
}

# 2. LP clicks link, validates session
GET /api/lp/portal/session/abc123token

# Response:
{
  "lpActorId": "uuid",
  "lpEmail": "lp@example.com",
  "dealId": "uuid",
  "commitment": 5000000,
  "shareClass": { ... }
}
```

---

## Integration Points

### External Services

#### OpenAI (LLM Integration)
- **Purpose**: Document extraction, AI assistant, conflict detection
- **Models**: gpt-4o, gpt-4o-mini
- **Endpoints**:
  - `/api/deals/:dealId/extract` - Document parsing
  - `/api/llm/explain` - AI explanations
  - `/api/ai-assistant` - Chat assistant
- **Security**:
  - AI consent tracking (GDPR)
  - Jailbreak detection
  - Output validation
  - Prompt injection prevention

#### SendGrid (Email)
- **Purpose**: LP invitations, capital call notices, distribution statements
- **Email Types**:
  - LP invitation emails with magic links
  - Capital call reminders
  - Distribution notifications
  - Investor updates
- **Configuration**: `BFF_SENDGRID_API_KEY` in .env

#### n8n (Workflow Automation)
- **Purpose**: Webhook notifications, workflow automation
- **Webhook Endpoints**:
  - LP invitation accepted
  - Capital call issued
  - Distribution approved
  - Major event notifications
- **Integration**: `server/routes/n8n-callbacks.js`
- **Configuration**: `BFF_LP_NOTIFICATION_WEBHOOK_URL`

#### MailHog (Dev Email Testing)
- **Purpose**: Email testing in development (port 8025)
- **UI**: http://localhost:8025
- **Docker**: Included in docker-compose.yml

### Internal Service Communication

#### BFF → Kernel API Proxy

**Kernel Client** (`server/lib/kernel-client.js`):
```javascript
const kernelClient = {
  async getDeal(dealId) {
    const res = await fetch(`${KERNEL_API_URL}/deals/${dealId}`);
    return res.json();
  },

  async createEvent(dealId, event) {
    const res = await fetch(`${KERNEL_API_URL}/deals/${dealId}/events`, {
      method: 'POST',
      body: JSON.stringify(event)
    });
    return res.json();
  }
}
```

**Caching Strategy**:
- Deal cache TTL: 5000ms (configurable)
- Cache invalidation on mutations
- Cache key: `deal:${dealId}`

#### UI → BFF Client

**BFF Client** (`src/api/bffClient.js`):
```javascript
export const bff = {
  async getDeals() {
    const res = await fetch('/api/deals', {
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    return res.json();
  },

  async createCapitalCall(dealId, data) {
    const res = await fetch(`/api/deals/${dealId}/capital-calls`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    return res.json();
  }
}
```

### Webhook Events

**n8n Webhook Payload Format**:
```json
{
  "event": "LP_INVITATION_ACCEPTED",
  "timestamp": "2026-01-25T12:00:00Z",
  "dealId": "uuid",
  "lpEmail": "lp@example.com",
  "commitment": 5000000,
  "metadata": {
    "shareClass": "A",
    "acceptedAt": "2026-01-25T12:00:00Z"
  }
}
```

**Event Types**:
- `LP_INVITATION_SENT`
- `LP_INVITATION_ACCEPTED`
- `CAPITAL_CALL_ISSUED`
- `CAPITAL_CALL_FUNDED`
- `DISTRIBUTION_APPROVED`
- `DISTRIBUTION_PAID`
- `MAJOR_EVENT_ANNOUNCED`

---

## Feature Specifications

### Deal Lifecycle Management

**States**:
1. **Draft** - Initial creation, data entry
2. **UnderReview** - Analyst/GP review in progress
3. **Approved** - GP approval granted
4. **ReadyToClose** - All closing conditions met
5. **Closed** - Transaction closed, entity formed
6. **Operating** - Property in operations
7. **Changed** - Material change detected
8. **Distressed** - Financial distress declared
9. **Resolved** - Distress resolved
10. **Frozen** - Court/regulator hold
11. **Exited** - Property sold, deal exited
12. **Terminated** - Deal cancelled

**State Transitions** (Event-driven):
- Draft → UnderReview: `ReviewOpened`
- UnderReview → Approved: `DealApproved`
- Approved → ReadyToClose: `ClosingReadinessAttested`
- ReadyToClose → Closed: `ClosingFinalized`
- Closed → Operating: `OperationsActivated`
- Operating → Changed: `MaterialChangeDetected`
- Changed → Operating: `ChangeReconciled`
- Operating → Distressed: `DistressDeclared`
- Distressed → Resolved: `DistressResolved`
- Any → Frozen: `FreezeImposed`
- Frozen → [Previous]: `FreezeLifted`
- Operating/Distressed → Exited: `ExitFinalized`
- Any → Terminated: `DealTerminated`

**Stress Modes**:
- **SM-0**: Normal operation
- **SM-1**: Data disputed (requires resolution)
- **SM-2**: Distress active (enhanced monitoring, reporting)
- **SM-3**: Frozen (all operations halted by authority)

**Authority Rules** (Examples):
- `APPROVE_DEAL`: GP role, threshold 1
- `FINALIZE_CLOSING`: GP + Lender + Escrow, threshold 3
- `IMPOSE_FREEZE`: Court/Regulator/Trustee, threshold 1

**Material Requirements**:
- `APPROVE_DEAL`: UnderwritingSummary (HUMAN truth class)
- `ATTEST_READY_TO_CLOSE`: FinalUnderwriting + SourcesAndUses (DOC truth class)
- `FINALIZE_CLOSING`: WireConfirmation + EntityFormationDocs (DOC truth class)

**Truth Classes**:
- **DOC (3)**: Documentary evidence (highest trust, can satisfy HUMAN requirements)
- **HUMAN (2)**: Human attestation
- **AI (1)**: AI-inferred (lowest trust, cannot satisfy requirements alone)

---

### LP Onboarding & Portal

**Status**: ✅ Complete (Phase 2 implemented January 2026)

**Features**:

1. **Invitation Workflow**
   - GP sends invitation via `POST /api/lp/invitations`
   - Email sent with magic link (30-day expiry)
   - LP accepts via magic link
   - Kernel actor created, share class assigned
   - Status tracking: PENDING → ACCEPTED → ACTIVE

2. **Bulk Import**
   - `POST /api/lp/bulk-import`
   - Supports 1-1000 LPs in single batch
   - Per-item error tracking
   - 207 Multi-Status response
   - n8n webhook emission for audit
   - Cache invalidation post-import

3. **LP Portal Access**
   - Magic link authentication (7-day sessions)
   - Read-only view of investments
   - Portfolio summary with metrics
   - Capital calls with payment tracking
   - Distributions with waterfall breakdown
   - Documents (K-1s, quarterly reports, tax elections)
   - Investment detail with performance (IRR, equity multiple)

4. **LP Reports**
   - Capital statement (calls + distributions aggregated)
   - Distribution summary (timeline with amounts)
   - IRR performance (capital events timeline)
   - Date range filtering
   - LP email filtering (single or batch)
   - JSON export with proper headers

5. **Share Class Support**
   - Multi-class LP structure (Class A, Class B, etc.)
   - Per-class economic terms:
     - Preferred return (e.g., 8%)
     - Management fee
     - Carry percent
     - Voting rights
     - Waterfall priority
   - LPs assigned to share classes on invitation

6. **LP Transfers** (Secondary Trading)
   - Transfer between LPs
   - Status: PENDING → APPROVED → COMPLETED
   - Document tracking (transfer agreement, approval docs)
   - Effective date tracking
   - Audit trail with approval chain

**Implementation Files**:
- Backend: `server/routes/lp-onboarding.js`, `server/routes/lp-portal-access.js`
- Frontend: `src/pages/LPPortal.jsx`, `src/pages/lp/*.jsx` (14 pages)
- Database: LPInvitation, LPActor, ShareClass, LPTransfer, LPPortalSession

---

### Financial Operations

#### Capital Calls

**Status**: ✅ Implemented

**Workflow**:
1. **Draft**: GP creates call with title, amount, due date, wire instructions
2. **Issue**: GP issues to LPs, status → ISSUED
3. **LP Payment**:
   - LP marks wire initiated (`POST .../wire-initiated`)
   - LP uploads wire proof (`POST .../upload-proof`)
   - GP marks funded (`POST .../mark-funded`)
4. **Tracking**: Status per allocation (PENDING → WIRE_INITIATED → FUNDED)
5. **Reminders**: Automated reminders via n8n webhook
6. **Overdue**: Status → OVERDUE if past due date

**Features**:
- Pro-rata allocation by commitment
- Cents-based arithmetic (no floating point errors)
- Share class support
- Allocation sum invariant checking
- Integrity logging
- Cap table snapshots (reproducibility)
- Optimistic concurrency (version checking)
- PDF notice generation
- n8n webhook notifications

**Cap Table Snapshot**:
```json
{
  "id": "uuid",
  "dealId": "uuid",
  "snapshotType": "CAPITAL_CALL_CALC",
  "lpOwnership": [
    { "lpActorId": "uuid", "commitment": 5000000, "ownershipPct": 10 }
  ],
  "capTableHash": "sha256...",
  "createdAt": "2026-01-25T12:00:00Z",
  "reason": "Capital call #3 allocation calculation"
}
```

#### Distributions

**Status**: ✅ Implemented

**Workflow**:
1. **Draft**: GP creates distribution with amount, date, period
2. **Waterfall Calculation**: Calculate LP/GP split using WaterfallStructure
3. **Approve**: GP approves distribution
4. **Processing**: Status → PROCESSING, payments initiated
5. **Paid**: Payments complete, status → PAID

**Waterfall Features**:
- LP/GP equity split
- Preferred return (e.g., 8%)
- Promote tiers (e.g., 0-8% → 90/10, 8-12% → 80/20, 12%+ → 70/30)
- GP catch-up
- Lookback provisions
- Per-class waterfall support
- IRR calculation (LP, GP)
- Equity multiple tracking

**Distribution Types**:
- CASH_DISTRIBUTION - Regular cash flow distribution
- RETURN_OF_CAPITAL - Capital return
- TAX_DISTRIBUTION - Tax obligation distribution

**Allocation Example**:
```json
{
  "distributionId": "uuid",
  "lpActorId": "uuid",
  "grossAmount": 50000,
  "withholdingAmount": 5000,
  "netAmount": 45000,
  "paymentMethod": "WIRE",
  "status": "PAID",
  "confirmationRef": "WIRE123456"
}
```

#### Investor Updates

**Status**: ✅ Implemented

**Update Types**:
- QUARTERLY_UPDATE - Regular quarterly update
- MILESTONE - Major milestone announcement
- ISSUE_ALERT - Issue/problem notification
- GENERAL - General communication

**Sections**:
- Headline
- What Changed (JSON)
- Metrics (NOI, occupancy, rent growth, etc.)
- Plan vs Actual (variance analysis)
- Risks & Mitigations
- Next Quarter Priorities
- Attachments (reports, documents)

**Q&A Feature**:
- LPs can ask questions (public or private)
- GP responds with answers
- Status: PENDING → ANSWERED → CLOSED

---

### Underwriting & Intelligence

**Status**: ✅ Implemented

**AI-Assisted Extraction**:

1. **Rent Roll Extraction**
   - Unit-level detail (unit number, type, sqft, rent)
   - Lease dates, tenant names, status
   - Confidence scoring per field
   - Conflict detection (e.g., total units mismatch)

2. **T12 Extraction**
   - Revenue/expense line items
   - Monthly amounts (12 months)
   - Annual totals
   - Category classification

3. **Loan Terms Extraction**
   - Loan amount, interest rate
   - Amortization, term
   - Origination fees
   - Prepayment penalties

**Underwriting Model**:
- Purchase price, units, SF
- Revenue (GPR, vacancy, EGI, other income)
- Expenses (OpEx, taxes, insurance, management, reserves)
- NOI calculation
- Debt service (loan amount, rate, amortization)
- Returns (cap rate, cash-on-cash, DSCR, IRR, equity multiple)
- Exit assumptions (exit cap, hold period)
- Growth assumptions (rent growth, expense growth)

**Scenario Comparison**:
- Base case, downside, value-add scenarios
- Side-by-side comparison
- Sensitivity analysis (hold period, exit cap)

**Conflict Detection**:
- Value mismatches (rent roll vs T12)
- Unit count discrepancies
- Expense anomalies
- Severity: INFO | WARNING | ERROR
- Status: OPEN → RESOLVED → IGNORED
- Resolution tracking with notes

**Data Lineage**:
- Complete history per field
- Source tracking (document, page, cell)
- AI model + confidence
- Human verification status
- Superseded value tracking
- Provenance chain for compliance

**Memo Generation**:
- Quick summary (1-2 pages)
- Detailed analysis (10+ pages)
- Recommendation, risks, mitigations
- Status: DRAFT → READY → SUBMITTED

---

### Due Diligence

**Status**: ✅ Implemented

**12-Category Checklist**:
1. Title & Survey
2. Environmental (Phase I, II)
3. Physical Inspection
4. Financial Review
5. Leases & Tenants
6. Legal & Zoning
7. Insurance
8. Property Management
9. Capital Improvements
10. Operating Agreements
11. Third-Party Reports
12. Closing Documents

**Item Tracking**:
- Priority: CRITICAL | HIGH | MEDIUM | LOW
- Status: NOT_STARTED | IN_PROGRESS | COMPLETED | WAIVED
- Responsible party: BUYER | SELLER | COUNSEL | LENDER | TITLE_CO
- Document requirements
- AI suggestions & risks

**Features**:
- Template-based checklist (DDTemplateItem)
- Deal-specific customization
- Document matching (auto-detect uploaded docs)
- Pending approvals queue
- Progress tracking

---

### Broker & Marketplace Features

**Status**: ✅ Implemented

**Broker Portal**:
- Broker dashboard with metrics
- Listing submissions
- Commission tracking
- Brokerage management
- Broker accept wizard (multi-step):
  1. Agreement review
  2. Commission negotiation
  3. Marketing plan
  4. Final confirmation

**Marketplace**:
- Public/private listings
- Deal teaser/marketing room
- Access requests (gated listings)
- Indications of interest
- Buyer criteria matching
- Saved searches

**Listing Workflow**:
1. **Seller**: List property via wizard
2. **GP**: Invite broker via `POST /api/broker/invitations`
3. **Broker**: Accept invitation, negotiate terms
4. **Broker**: Market property, track buyer interest
5. **Buyer**: Submit inquiry via marketplace
6. **Broker**: Respond to inquiries
7. **Buyer**: Submit offer
8. **Seller/GP**: Review offers, select buyer
9. **Closing**: Execute transaction

---

### Legal & Counsel Features

**Status**: ✅ Implemented

**GP Counsel Dashboard**:
- Work obligation dashboard
- Open requests by deal
- Team activity feed
- Document review queue

**Legal Vault**:
- Centralized document repository
- Version control
- Access control (per-document permissions)
- Search & filter

**Playbook Builder**:
- Define legal workflows
- Checklists per deal type
- Covenant tracking
- Compliance monitoring

**Document Review**:
- Review/approve legal documents
- Redlining support
- Approval chain tracking
- Status: DRAFT → UNDER_REVIEW → APPROVED → EXECUTED

---

### Document Generation & Provenance

**Status**: ✅ Implemented

**Generated Documents**:
- IC Memo (Investment Committee)
- LOI (Letter of Intent)
- PSA (Purchase & Sale Agreement)
- DD List (Due Diligence Checklist)
- Closing Statement
- Capital call notices (PDF)
- Distribution statements (PDF)
- K-1s, quarterly reports

**Version Control**:
- Version tracking (v1, v2, v3...)
- Status: DRAFT → BINDING → EXECUTED → EFFECTIVE
- Content hash (SHA-256)
- Parent version tracking
- Promotion/execution timestamps

**Provenance Mapping**:
- Field-level provenance (which source for each field)
- Evidence pack generation (ZIP with all sources)
- Watermark support
- Template versioning

**Evidence Pack**:
```json
{
  "packType": "CLOSING_PACK",
  "name": "123 Main Street - Closing Package",
  "manifest": {
    "documents": [
      { "type": "PSA", "versionId": "uuid", "hash": "sha256..." },
      { "type": "WIRE_CONFIRMATION", "artifactId": "uuid", "hash": "sha256..." }
    ],
    "provenance": {
      "purchasePrice": { "source": "PSA Section 1.1", "documentId": "uuid" }
    }
  },
  "dealStateSnapshot": { ... },
  "validationStatus": "VALID"
}
```

---

### Security & Compliance

**Audit Trail**:
- Kernel: SHA-256 hash chain (tamper-evident)
- BFF: DealEvent + PermissionAuditLog
- AI interactions logged (AIInteractionLog)
- Financial mutations logged
- Permission changes logged

**Point-in-Time Replay**:
- `GET /deals/:dealId/snapshot?at=2026-01-15T12:00:00Z`
- Replay all events up to timestamp
- Reconstruct exact state at any point in time
- Proofpack generation for regulators

**Compliance Features**:
- AI consent tracking (GDPR)
- Data lineage (every field traceable to source)
- Snapshots (frozen state for reproducibility)
- Accounting period close (soft/hard close)
- Evidence packs (ZIP with complete audit trail)

**Integrity Checks**:
- Allocation sum invariants (capital calls, distributions)
- Cap table hash verification
- Event hash chain verification
- Document content hash verification

---

## Security Architecture

### Authentication & Authorization

#### JWT Authentication

**Token Format**:
```json
{
  "userId": "uuid",
  "email": "user@example.com",
  "role": "GP",
  "organizationId": "uuid",
  "name": "John Doe",
  "iat": 1706194800,
  "exp": 1706281200
}
```

**Token Lifecycle**:
- Issued on login (`POST /api/auth/login`)
- 24-hour expiry
- Stored in AuthSession table (soft revoke support)
- Validated on every request via `extractAuthUser()` middleware

**Password Security**:
- bcrypt hashing (cost factor 10)
- Minimum length: 8 characters
- No password in logs or error messages

**Session Management**:
- Session tokens tracked in database
- Soft revoke: `revokedAt` timestamp
- Hard revoke: Delete session record
- Logout: `POST /api/auth/logout` revokes session

#### Role-Based Access Control (RBAC)

**Roles**:
- **GP**: Full deal management, financial operations
- **GP Analyst**: Deal analysis, limited modifications (assignment-based)
- **LP**: Read-only investment view, payment tracking
- **Admin**: User management, system configuration
- **Broker**: Listing management, commission tracking
- **Brokerage Admin**: Broker firm management
- **Lender**: Risk monitoring, exposure tracking
- **Counsel**: Legal review, document approval
- **Regulator**: Read-only audit access
- **Auditor**: Read-only compliance access

**Permission Patterns**:

1. **requireAuth** - Any authenticated user
   ```javascript
   const authUser = await requireAuth(req, res);
   if (!authUser) return;
   ```

2. **requireGP** - GP or Admin only
   ```javascript
   const authUser = await requireGP(req, res);
   if (!authUser) return;
   ```

3. **requireAdmin** - Admin only
   ```javascript
   const authUser = await requireAdmin(req, res);
   if (!authUser) return;
   ```

4. **requireLPEntitlement** - LP with specific deal access
   ```javascript
   const lpContext = await requireLPEntitlement(req, res, dealId, token);
   if (!lpContext) return;
   ```

#### Organization Isolation

**Pattern 1: Direct resource with organizationId**
```javascript
const resource = await prisma.someModel.findUnique({ where: { id } });
if (!resource) return sendError(res, 404, "Not found");

if (resource.organizationId && resource.organizationId !== authUser.organizationId) {
  return sendError(res, 403, "Access denied - belongs to different organization");
}
```

**Pattern 2: Resource linked to deal (FK chain)**
```javascript
const resource = await prisma.someModel.findUnique({
  where: { id },
  include: { deal: true }  // Include the deal to access organizationId
});
if (!resource) return sendError(res, 404, "Not found");

if (resource.deal?.organizationId && resource.deal.organizationId !== authUser.organizationId) {
  return sendError(res, 403, "Access denied - belongs to different organization");
}
```

**Pattern 3: Using requireDealAccess helper**
```javascript
import { requireDealAccess } from "../middleware/auth.js";

const hasAccess = await requireDealAccess(authUser, dealId, res);
if (!hasAccess) return;
```

### Audit Logging

**When to Log**:
- Financial operations (capital calls, distributions, payments)
- Access control changes (role changes, assignments, permissions)
- Sensitive data modifications (verification approvals, document deletions)

**How to Log**:
```javascript
import { logPermissionAction } from "../middleware/auth.js";

await logPermissionAction({
  actorId: authUser.id,
  actorName: authUser.name,
  targetUserId: targetUser.id,
  targetUserName: targetUser.name,
  action: 'DISTRIBUTION_MARKED_PAID',
  beforeValue: { status: 'PENDING' },
  afterValue: { status: 'PAID', amount: 50000 },
  ipAddress: req.headers["x-forwarded-for"] || req.socket?.remoteAddress
});
```

**Standard Action Names**:
- USER_ROLE_CHANGED, USER_STATUS_CHANGED
- DEAL_ASSIGNMENT_CREATED, DEAL_ASSIGNMENT_REMOVED
- DISTRIBUTION_MARKED_PAID, CAPITAL_CALL_ISSUED
- VERIFICATION_APPROVED, VERIFICATION_REJECTED
- DOCUMENT_DELETED, PERMISSIONS_UPDATED

### IDOR Prevention

**Checklist for New Endpoints**:
1. Identify the resource's org chain:
   - Does the model have `organizationId`? → Check directly
   - Does it have `dealId`? → Include deal and check `deal.organizationId`
   - Is it a sub-resource? → Trace the FK chain to deal/org

2. Add the check BEFORE any mutation or data return

3. Use consistent error messages: "Access denied - [resource] belongs to different organization"

### Identity: Safe vs Unsafe

**SAFE (use these)**:
- `authUser.id` - User identification for all purposes
- `authUser.email` - User email (validated from JWT)
- `authUser.role` - Role-based authorization
- `authUser.organizationId` - Org isolation checks
- `authUser.name` - Display name

**UNSAFE (never use for authorization)**:
- `x-user-id` header - Spoofable (client can set any value)
- `x-actor-role` header - Spoofable (client can claim any role)
- `x-user-name` header - Spoofable (only use for display fallback)

### Data Integrity

**Kernel Hash Chain**:
```
Event 1 → Event 2 → Event 3 → ...
   │        │        │
   └─hash───┴─hash───┘
```

- Each event includes `previousEventHash`
- Chain verified via `GET /deals/:id/events/verify`
- Tamper detection: Any modification breaks chain

**Financial Integrity**:
- Allocation sum invariants (sum must equal total)
- Cents-based arithmetic (avoid floating point errors)
- Optimistic concurrency (version checking)
- Cap table snapshots (frozen state)
- Waterfall reproducibility (snapshot + rules)

**Document Integrity**:
- SHA-256 content hash for all files
- Artifact uniqueness (sha256Hex unique constraint)
- Provenance mapping (which source for which field)
- Evidence packs (ZIP with complete audit trail)

---

## Development Reference

### Quick Start

**Docker (Recommended)**:
```bash
cd "Real Estate Project"
docker-compose -f canonical-deal-os/docker-compose.yml up
```

**Native Node.js**:
```bash
# Terminal 1: Kernel API
cd cre-kernel-phase1
npm install
npm run prisma:migrate
npm run dev:api  # Port 3001

# Terminal 2: BFF Server
cd canonical-deal-os
npm install
npm run db:generate
npm run db:push
npm run bff  # Port 8787

# Terminal 3: Vite UI
cd canonical-deal-os
npm run dev  # Port 5173
```

### Adding a New BFF Route

1. **Create route file**: `server/routes/my-feature.js`

```javascript
import { sendJson, sendError, readJsonBody } from "./helpers.js";
import { mySchema } from "../../src/lib/contracts.js";

export async function handleMyFeature(req, res, authUser) {
  // Validate request body
  const body = await readJsonBody(req);
  const parsed = mySchema.safeParse(body);
  if (!parsed.success) {
    return sendError(res, 400, "Validation failed", parsed.error.flatten());
  }

  // Business logic here...

  return sendJson(res, 200, { result: "success" });
}
```

2. **Register in server/index.js**:

```javascript
import { handleMyFeature } from "./routes/my-feature.js";

// In dispatch section:
if (method === "POST" && path === "/api/my-feature") {
  const authUser = await requireGP(req, res);
  if (!authUser) return;
  return handleMyFeature(req, res, authUser);
}
```

3. **Add Zod schema to contracts.js**:

```javascript
// src/lib/contracts.js
export const mySchema = z.object({
  field1: z.string(),
  field2: z.number().optional()
});
```

4. **Add fixture for validation**:

```json
// fixtures/http/my-feature-request.json
{
  "_comment": "Request to my-feature endpoint",
  "field1": "example",
  "field2": 42
}
```

5. **Update manifest**:

```json
// contracts/manifest.json
{
  "http": {
    "my-feature-request.json": {
      "schema": "mySchema",
      "description": "Request body for POST /api/my-feature"
    }
  }
}
```

6. **Run validation**:

```bash
npm run validate:contracts
```

### Adding a Kernel Event Type

1. **Add to shared types**: `cre-kernel-phase1/packages/shared/src/index.ts`

```typescript
export const EventTypes = {
  // ... existing types
  MyNewEvent: "MyNewEvent"
};
```

2. **Add gating rules** (if needed): `cre-kernel-phase1/apps/kernel-api/src/server.ts`

```typescript
const gateEventTypes = new Set([
  // ... existing gated events
  "MyNewEvent"
]);
```

3. **Add state transition**: `cre-kernel-phase1/apps/kernel-api/src/projection.ts`

```typescript
// In projectDealLifecycle()
case "MyNewEvent":
  return "NewState";
```

4. **Add fixture**:

```json
// fixtures/events/my-new-event.json
{
  "_comment": "My new event description",
  "type": "MyNewEvent",
  "payload": { ... },
  "actorId": "uuid",
  "authorityContext": { ... }
}
```

5. **Write test**: `cre-kernel-phase1/apps/kernel-api/test/my-new-event.test.ts`

### Adding a Frontend Page

1. **Create page component**: `src/pages/MyPage.jsx`

```jsx
import { useQuery } from "@tanstack/react-query";
import { mySchema } from "../lib/contracts";

export default function MyPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-data"],
    queryFn: async () => {
      const res = await fetch("/api/my-endpoint", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      return mySchema.parse(json);  // Validate contract
    }
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <div>{/* Render UI */}</div>;
}
```

2. **Add route**: `src/App.jsx`

```jsx
<Route path="/my-page" element={<MyPage />} />
```

### Testing

**Unit Tests (Jest)**:
```bash
cd canonical-deal-os
npm test
npm run test:watch  # Watch mode
```

**E2E Tests (Playwright)**:
```bash
cd canonical-deal-os
npm run e2e          # Run all
npm run e2e:ui       # Interactive UI
npm run e2e:headed   # See browser
```

**Contract Validation**:
```bash
npm run validate:contracts
```

### Common Commands

```bash
# From repository root
npm run docker:up           # Start all via Docker
npm run docker:down         # Stop all
npm run start               # Start BFF + Kernel + UI (native)
npm run test                # Run all tests
npm run validate:contracts  # Validate fixtures

# From canonical-deal-os
npm run db:generate         # Generate Prisma client
npm run db:push             # Push schema to database
npm run db:seed             # Seed sample data
npm run db:seed:auth        # Seed test users
npm run lint                # ESLint
npm run lint:fix            # Auto-fix
```

### Test Accounts

After running `npm run db:seed:auth`:
- **Admin**: admin@canonical.com / admin123
- **GP**: gp@canonical.com / gp123
- **Analyst**: analyst@canonical.com / analyst123

---

## Appendices

### Glossary of Terms

| Term | Definition |
|------|------------|
| **Authority Gating** | Role-based approval thresholds that must be met before actions are permitted |
| **BFF** | Backend-for-Frontend - orchestration layer between UI and Kernel |
| **Cap Table** | Capitalization table showing LP ownership percentages |
| **Carry** | GP profit share (carried interest) in waterfall distributions |
| **DealState** | Current lifecycle state of a deal (Draft, Approved, Closed, etc.) |
| **DSCR** | Debt Service Coverage Ratio (NOI / annual debt service) |
| **Event Sourcing** | Architectural pattern where state changes are stored as immutable events |
| **Hash Chain** | Linked sequence of cryptographic hashes for tamper detection |
| **IDOR** | Insecure Direct Object Reference - security vulnerability |
| **IRR** | Internal Rate of Return (annualized return metric) |
| **Kernel** | Core event ledger and state machine (source of truth) |
| **LP** | Limited Partner (passive investor) |
| **GP** | General Partner (sponsor/operator) |
| **Magic Link** | Temporary authentication link (no password required) |
| **Material** | Typed deal data (rent roll, underwriting, etc.) with truth class |
| **NOI** | Net Operating Income (revenue - operating expenses) |
| **Org Isolation** | Multi-tenancy pattern ensuring data cannot cross organizations |
| **Proofpack** | ZIP bundle with complete audit trail for compliance |
| **Provenance** | Lineage tracking showing origin and transformation of data |
| **RBAC** | Role-Based Access Control |
| **Snapshot** | Frozen point-in-time state for reproducibility |
| **Stress Mode** | Enhanced monitoring state (SM-0, SM-1, SM-2, SM-3) |
| **T12** | Trailing 12 months (financial statement) |
| **Truth Class** | Data quality indicator (DOC > HUMAN > AI) |
| **Waterfall** | Cascading distribution rules (pref return, promote tiers, catch-up) |

### Kernel Event Types Reference

| Event Type | Triggers Transition | Description |
|------------|---------------------|-------------|
| ReviewOpened | Draft → UnderReview | GP initiates review process |
| DealApproved | UnderReview → Approved | GP approves deal |
| ClosingReadinessAttested | Approved → ReadyToClose | All closing conditions met |
| ClosingFinalized | ReadyToClose → Closed | Transaction closed, entity formed |
| OperationsActivated | Closed → Operating | Property operations begin |
| MaterialChangeDetected | Operating → Changed | Significant change detected |
| ChangeReconciled | Changed → Operating | Change resolved, back to normal |
| DistressDeclared | Operating → Distressed | Financial distress declared |
| DistressResolved | Distressed → Resolved | Distress situation resolved |
| FreezeImposed | Any → Frozen | Court/regulator hold imposed |
| FreezeLifted | Frozen → [Previous] | Hold lifted, resume operations |
| ExitFinalized | Operating/Distressed → Exited | Property sold, deal exited |
| DealTerminated | Any → Terminated | Deal cancelled |
| DataDisputed | (No state change) | Data accuracy challenged |
| ApprovalGranted | (No state change) | Authority approval granted |
| ApprovalDenied | (No state change) | Authority approval denied |
| OverrideAttested | (No state change) | Override attestation recorded |

### State Machine Diagram

```
                    ┌─────────────────────────────────────┐
                    │                                     │
                    ▼                                     │
┌───────┐    ┌────────────┐    ┌──────────┐    ┌────────────────┐
│ Draft │───▶│ UnderReview│───▶│ Approved │───▶│ ReadyToClose   │
└───────┘    └────────────┘    └──────────┘    └────────────────┘
  ReviewOpened   DealApproved   ClosingReadinessAttested    │
                                                            │
                                               ClosingFinalized
                                                            │
                                                            ▼
                                                    ┌────────────┐
            ┌──────────────────────────────────────│   Closed   │
            │                                       └────────────┘
            │                                    OperationsActivated
            │                                              │
            │                                              ▼
            │                                      ┌────────────┐
            │    MaterialChangeDetected ◀─────────│ Operating  │
            │              │                       └────────────┘
            │              ▼                              │
            │       ┌──────────┐     ChangeReconciled    │
            │       │ Changed  │─────────────────────────┘
            │       └──────────┘
            │                          DistressDeclared
            │                                │
            │                                ▼
            │                        ┌────────────┐
            │                        │ Distressed │
            │                        └────────────┘
            │                         DistressResolved
            │                                │
            └────────────────────────────────┘
                                             │
                                    ExitFinalized
                                             │
                                             ▼
                                     ┌────────────┐
                                     │   Exited   │
                                     └────────────┘

         Any State ──FreezeImposed──▶ Frozen
         Frozen ────FreezeLifted────▶ [Previous State]
         Any State ──DealTerminated─▶ Terminated
```

### Links to Detailed Documentation

| Document | Purpose | Location |
|----------|---------|----------|
| **CONTEXT.md** | Quick start guide | [CONTEXT.md](CONTEXT.md) |
| **ARCHITECTURE.md** | Technical deep dive | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| **CONTRIBUTING.md** | Development workflow | [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) |
| **contracts/README.md** | API contract system | [contracts/README.md](contracts/README.md) |
| **CLAUDE.md** | AI assistant context | [CLAUDE.md](CLAUDE.md) |
| **SECURITY_GUIDELINES.md** | Security patterns | [canonical-deal-os/SECURITY_GUIDELINES.md](canonical-deal-os/SECURITY_GUIDELINES.md) |
| **LP_API_REFERENCE.md** | LP endpoint docs | [canonical-deal-os/LP_API_REFERENCE.md](canonical-deal-os/LP_API_REFERENCE.md) |
| **LP_IMPLEMENTATION_STATUS.md** | LP feature status | [canonical-deal-os/LP_IMPLEMENTATION_STATUS.md](canonical-deal-os/LP_IMPLEMENTATION_STATUS.md) |

---

**End of System Compendium**

*This document consolidates architectural information from CONTEXT.md, ARCHITECTURE.md, CONTRIBUTING.md, contracts/README.md, SECURITY_GUIDELINES.md, and comprehensive component inventories. For detailed implementation specifics, refer to the linked documentation.*
