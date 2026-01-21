# Architecture Deep Dive

This document provides a detailed technical overview of the CRE Deal Management Platform.

## System Design

### Three-Service Architecture

The platform consists of three independently deployable services:

```
┌────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Vite React UI                          │  │
│  │  - Role-based views (GP, LP, Admin, Lender)              │  │
│  │  - TanStack Query for data fetching                      │  │
│  │  - Zod validation on forms                               │  │
│  │  - Radix UI + Tailwind CSS                               │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                    ORCHESTRATION LAYER                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    BFF Server                             │  │
│  │  - JWT authentication & session management               │  │
│  │  - Organization isolation enforcement                    │  │
│  │  - Kernel API proxy with caching                        │  │
│  │  - LP portal access control                             │  │
│  │  - LLM integration (OpenAI) for deal parsing            │  │
│  │  - Email notifications (SendGrid)                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    SQLite (BFF)                           │  │
│  │  - LLM session cache & provenance                        │  │
│  │  - AI consent tracking                                   │  │
│  │  - LP invitation tokens                                  │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                      LEDGER LAYER                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Kernel API                             │  │
│  │  - Immutable event ledger with SHA-256 hash chain        │  │
│  │  - Deal lifecycle state machine                          │  │
│  │  - Authority gating (role-based thresholds)              │  │
│  │  - Material requirements (truth class validation)        │  │
│  │  - Point-in-time snapshot replay                         │  │
│  │  - Compliance proofpack generation                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  PostgreSQL (Kernel)                      │  │
│  │  - Events (immutable, hash-chained)                      │  │
│  │  - Materials (versioned with revisions)                  │  │
│  │  - Artifacts (file metadata + SHA-256)                   │  │
│  │  - Authority rules                                       │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

---

## Kernel API (cre-kernel-phase1)

The kernel is the **source of truth** for all deal data. It operates as an event-sourced system with blockchain-like integrity guarantees.

### Event Ledger

Every state change is recorded as an immutable event:

```typescript
// Event structure (simplified)
{
  id: "uuid",
  dealId: "uuid",
  type: "DealApproved",           // Event type
  actorId: "uuid",                // Who did this
  payload: { ... },               // Event-specific data
  authorityContext: { ... },      // Rules that permitted this
  evidenceRefs: ["artifact-id"],  // Supporting documents
  sequenceNumber: 42,             // Monotonic ordering
  previousEventHash: "sha256...", // Chain link
  eventHash: "sha256...",         // This event's hash
  createdAt: "2026-01-21T..."
}
```

### Hash Chain Integrity

Each event's hash includes the previous event's hash, creating a tamper-evident chain:

```
Event 1 ──hash──▶ Event 2 ──hash──▶ Event 3 ──hash──▶ ...
   │                │                │
   └── includes ────┴── includes ────┘
       previous         previous
       hash             hash
```

Verification endpoint: `GET /deals/:dealId/events/verify`

### Deal State Machine

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
```

### Stress Modes

- **SM-0**: Normal operation
- **SM-1**: Data disputed (requires resolution)
- **SM-2**: Distress active (enhanced monitoring)
- **SM-3**: Frozen (court/regulator hold)

### Authority Gating

Actions require role-based approval thresholds:

| Action | Allowed Roles | Threshold |
|--------|--------------|-----------|
| OPEN_REVIEW | GP | 1 |
| APPROVE_DEAL | GP | 1 |
| ATTEST_READY_TO_CLOSE | GP, Legal | 2 |
| FINALIZE_CLOSING | GP, Lender, Escrow | 3 |
| ACTIVATE_OPERATIONS | GP, Operator | 2 |
| IMPOSE_FREEZE | Court, Regulator, Trustee | 1 |

### Material Requirements

Certain actions require materials at specific truth levels:

| Action | Required Material | Required Truth |
|--------|------------------|----------------|
| APPROVE_DEAL | UnderwritingSummary | HUMAN |
| ATTEST_READY_TO_CLOSE | FinalUnderwriting, SourcesAndUses | DOC |
| FINALIZE_CLOSING | WireConfirmation, EntityFormationDocs | DOC |

### Key Endpoints

```
POST   /deals                          # Create deal
GET    /deals/:dealId                  # Get deal details
GET    /deals/:dealId/events           # List events
GET    /deals/:dealId/events/verify    # Verify hash chain
POST   /deals/:dealId/events           # Create event (gated)
GET    /deals/:dealId/snapshot?at=ISO  # Point-in-time state
POST   /deals/:dealId/explain          # Why is action blocked?
GET    /deals/:dealId/proofpack        # Compliance archive (ZIP)
```

---

## BFF Server (canonical-deal-os/server)

The BFF (Backend-for-Frontend) handles authentication, authorization, and orchestration.

### Authentication Flow

```
1. User submits credentials
2. BFF validates against local database
3. JWT issued with { userId, role, organizationId }
4. Frontend includes JWT in Authorization header
5. BFF middleware extracts & validates on each request
6. authUser object passed to route handlers
```

### Organization Isolation

All data is scoped to organizations:

```javascript
// Every query includes org check
const deals = await prisma.deal.findMany({
  where: {
    organizationId: authUser.organizationId
  }
});
```

### Route Organization (44 files)

```
server/routes/
├── auth.js                # Login, signup, password reset
├── admin.js               # User management
├── deals.js               # Deal CRUD (proxies to kernel)
├── deal-state.js          # Lifecycle transitions
├── lp-onboarding.js       # LP invitations
├── lp-portal-access.js    # LP portal auth
├── capital-calls.js       # Capital call workflow
├── distributions.js       # Distribution management
├── ai-assistant.js        # LLM chat integration
├── llm.js                 # Deal parsing with OpenAI
├── provenance.js          # Data lineage tracking
├── unified-audit.js       # Audit log queries
└── ... (30+ more)
```

### Auth Middleware

```javascript
// server/middleware/auth.js

// Require any authenticated user
requireAuth(req, res)

// Require GP or Admin role
requireGP(req, res)

// Require Admin role
requireAdmin(req, res)

// Require LP entitlement for specific deal
requireLPEntitlement(req, res, dealId, token)
```

---

## Frontend (canonical-deal-os/src)

### Principles

1. **Kernel-Faithful**: UI shows exactly what kernel returns, never overrides
2. **Role-Based**: Different views for GP, LP, Admin, Lender
3. **Contract-Enforced**: Zod schemas validate API responses

### Key Pages

```
src/pages/
├── Home.jsx               # GP dashboard
├── Deals.jsx              # Deal list
├── DealOverview.jsx       # Deal detail (largest: 71K lines)
├── CreateDeal.jsx         # New deal form
├── CapitalCalls.jsx       # Capital call management
├── Distributions.jsx      # Distribution management
├── LPPortal.jsx           # LP dashboard
├── LPPortalAuth.jsx       # LP unauthenticated access
├── AdminDashboard.jsx     # Admin controls
└── ... (20+ more)
```

### Zod Contracts

All API contracts defined in `src/lib/contracts.js`:

```javascript
import { z } from "zod";

export const dealSchema = z.object({
  id: z.string(),
  name: z.string(),
  lifecycle_state: z.string().nullable().optional(),
  stress_mode: z.boolean().optional(),
  truth_health: z.enum(["healthy", "warning", "danger"]).nullable().optional(),
  // ... more fields
});

// Validate API responses
const result = dealSchema.safeParse(apiResponse);
if (!result.success) {
  console.error("Contract violation", result.error);
}
```

---

## Data Models

### Kernel (PostgreSQL)

```
Deal
├── id, name, state, stressMode
├── Events[] (immutable, hash-chained)
├── Materials[] (versioned)
├── Artifacts[] (files with SHA-256)
├── Actors[] (participants)
├── AuthorityRules[] (approval thresholds)
└── DraftState (simulation workspace)
```

### BFF (SQLite)

```
User
├── id, email, passwordHash, role, organizationId, status

LLMParseSession
├── id, inputHash, outputHash, provenance[]

AIInteractionLog
├── id, userId, action, inputSummary, outputSummary

LPInvitation
├── id, dealId, lpEmail, token, expiresAt
```

---

## Security Model

### Authentication
- JWT tokens with 24-hour expiry
- bcrypt password hashing (cost factor 12)
- Refresh token rotation

### Authorization
- Role-based access control (RBAC)
- Organization isolation on all queries
- Deal-level permissions for LPs

### Audit Trail
- All financial mutations logged
- Actor identity from validated JWT only
- Never trust client-provided identity headers

### Data Integrity
- Kernel events are immutable
- SHA-256 hash chain prevents tampering
- Point-in-time replay for verification

---

## Development Notes

### Adding a New BFF Route

1. Create file in `server/routes/`
2. Export handler functions
3. Import and register in `server/index.js`
4. Add Zod schema to `src/lib/contracts.js`
5. Add fixture to `/fixtures/http/`
6. Run `npm run validate:contracts`

### Adding a Kernel Event Type

1. Add to `packages/shared/src/index.ts`
2. Add gating rules if needed (server.ts)
3. Add state transition in projection.ts
4. Add fixture to `/fixtures/events/`
5. Write test in `apps/kernel-api/test/`

---

## Related Documentation

- [CONTEXT.md](../CONTEXT.md) - Quick start guide
- [CONTRIBUTING.md](CONTRIBUTING.md) - Development workflow
- [contracts/README.md](../contracts/README.md) - API contracts
