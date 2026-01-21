# AI Coding Instructions for GitHub Monorepo

## Architecture Overview

This is a **CRE (Commercial Real Estate) deal management system** with three core layers:

1. **Kernel API** (`cre-kernel-phase1/apps/kernel-api`) - TypeScript/Fastify backend
   - Owns deal lifecycle, authorities, materials, and gating logic
   - Single source of truth for deal state
   - Port 3001 (local dev)

2. **Canonical BFF** (`canonical-deal-os/server`) - Node.js/Express proxy layer
   - Bridges Kernel API and UI
   - Manages SQLite provenance/airlock (local evidence tracking)
   - OpenAI LLM integration for deal parsing
   - Port 8787 (local dev)

3. **Canonical UI** (`canonical-deal-os/src`) - React + Vite + Radix UI
   - Kernel-faithful: derives no authority/gating logic locally
   - Base44 platform optional integration
   - Port 5173 or 5000 (local dev)

**Key Principle**: Kernel is authority. BFF proposes, Kernel accepts/rejects.

## Essential Workflows

### Local Development (3 Terminals)
```
Terminal 1: cre-kernel-phase1/ → npm run dev:api
Terminal 2: canonical-deal-os/ → npm run dev:bff
Terminal 3: canonical-deal-os/ → npm run dev
```

### Database Setup (Kernel)
```powershell
# cre-kernel-phase1/.env
DATABASE_URL=postgres://localhost/cre_kernel
npm run prisma:migrate
```

### Testing
- **Kernel**: `npm test` (uses DATABASE_URL_TEST, separate test DB)
- **BFF**: Check logs in `.data/` and `.err.log` files

## Critical Data Flows

### Deal Provenance Sync (BFF → Kernel)
When a field is marked DOC-backed in the UI:
1. BFF stores original value in SQLite provenance table
2. Maps field path → material type via Kernel endpoint: `GET /deals/:dealId/schema/field-material-map`
3. Creates/updates kernel material with artifact reference
4. **Rollback on failure**: Reverts provenance if kernel rejects
5. See: [server/routes/provenance.js](../canonical-deal-os/server/routes/provenance.js#L80)

### Evidence Artifacts
- Evidence lives in kernel `materials.evidenceRefs[]`
- Each artifact has `type`, `uri`, `summary`
- Field-to-material mappings defined in Kernel (Phase 2: per asset type)
- BFF queries Kernel for mappings, falls back to local cache
- See: [cre-kernel-phase1/apps/kernel-api/src/server.ts:1962](../cre-kernel-phase1/apps/kernel-api/src/server.ts#L1962)

### LLM Deal Parsing (Optional)
- Triggered by BFF `/api/llm/parse-deal` endpoint
- Requires `BFF_OPENAI_API_KEY` env var
- Returns parsed deal profile + airlock recommendations
- See [server/routes/llm.js](../canonical-deal-os/server/routes/llm.js)

## Project-Specific Patterns

### Zod Schemas as Contracts
All request/response validation uses Zod. Schemas live in [src/lib/contracts.js](../canonical-deal-os/src/lib/contracts.js):
- `dealSchema`, `dealProfileSchema`, `actionTypeSchema`, etc.
- Always validate with `.parse()` or `.safeParse()`
- BFF reuses these schemas from frontend

### Idempotency via SQLite Store
BFF implements idempotency keys in [server/store.js](../canonical-deal-os/server/store.js):
- Prevents duplicate operations on retries
- Stores request hash + response payload
- Check before expensive Kernel operations

### Kernel Error Handling
- Missing kernel? Returns HTTP 502 (see [server/kernel.js](../canonical-deal-os/server/kernel.js))
- Kernel gating failures? Rollback sync operations
- Log all errors with context (sync type, field, deal ID)

### Environment Variables
**BFF** ([canonical-deal-os/.env.example](../canonical-deal-os/.env.example)):
- `KERNEL_API_URL` (default: `http://localhost:3001`)
- `BFF_PORT` (default: `8787`)
- `BFF_OPENAI_API_KEY`, `BFF_OPENAI_MODEL`, `BFF_OPENAI_TEMPERATURE`

**Kernel** ([cre-kernel-phase1/.env.example](../cre-kernel-phase1/.env.example)):
- `DATABASE_URL` (Postgres connection)
- `DATABASE_URL_TEST` (for tests)

## Key Files by Function

| Task | File | Note |
## BFF Modular Architecture (Phase 1 Refactor)

**As of January 2026**, the BFF has been refactored from a monolithic 1,789-line file into modular route handlers:

```
server/
  index.js                (260 lines: server setup, route registration, CORS)
  routes/
    deals.js              (300 lines: list, create, home, records + caching)
    actions.js            (400 lines: explain, action, idempotency, actor mgmt)
    events.js             (180 lines: list events, create events)
    llm.js                (290 lines: parse-deal, corrections, data-trust)
    provenance.js         (150 lines: provenance update, field-to-material sync)
    inbox.js              (160 lines: inbox by scope)
  kernel.js               (Stream proxying, error handling, material sync)
  store.js                (Provenance, idempotency, actor state in SQLite)
  runtime.js              (Caching, in-flight memoization)
  airlock.js              (Evidence scoring, field evaluators)
  llm.js                  (OpenAI integration)
  mappers.js              (Deal/event/authority transformations)
  db.js                   (Prisma client)
```

**Benefits:**
- ✅ Separation of concerns: each module owns one workflow
- ✅ Testability: easy to unit test individual routes
- ✅ Phase 2 ready: LP onboarding gets its own `routes/lp-onboarding.js`
- ✅ Maintainability: simpler debugging, clearer dependencies

## Key Files by Function

| Task | File | Note |
|------|------|------|
| BFF route registration | [server/index.js](../canonical-deal-os/server/index.js) | 260 lines, server startup + path routing |
| Deal routes | [server/routes/deals.js](../canonical-deal-os/server/routes/deals.js) | List, create, home, records + caching logic |
| Action/gating routes | [server/routes/actions.js](../canonical-deal-os/server/routes/actions.js) | Explain, action execution, idempotency |
| Event routes | [server/routes/events.js](../canonical-deal-os/server/routes/events.js) | List and create events |
| LLM routes | [server/routes/llm.js](../canonical-deal-os/server/routes/llm.js) | Deal parsing, corrections, data-trust |
| Provenance routes | [server/routes/provenance.js](../canonical-deal-os/server/routes/provenance.js) | Field-to-material sync with rollback |
| Inbox routes | [server/routes/inbox.js](../canonical-deal-os/server/routes/inbox.js) | Inbox by scope (mine, waiting, risk, data_requests) |
| **LP Onboarding routes** | [server/routes/lp-onboarding.js](../canonical-deal-os/server/routes/lp-onboarding.js) | **LP invitations, portal landing, investment detail, exports** |
| Kernel proxy | [server/kernel.js](../canonical-deal-os/server/kernel.js) | Stream proxying, error handling, material creation |
| Kernel field mappings | [cre-kernel-phase1/apps/kernel-api/src/server.ts:1962](../cre-kernel-phase1/apps/kernel-api/src/server.ts#L1962) | `GET /deals/:dealId/schema/field-material-map` (new in Phase 1.1) |
| Field-to-material mapping | [server/mappers.js](../canonical-deal-os/server/mappers.js) | Fallback mappings for BFF; queries Kernel first |
| SQLite store | [server/store.js](../canonical-deal-os/server/store.js) | Provenance, idempotency, actor state |
| Airlock (trust model) | [server/airlock.js](../canonical-deal-os/server/airlock.js) | Evidence scoring, field evaluators |
| **LP Contracts/Schemas** | [src/lib/contracts.js](../canonical-deal-os/src/lib/contracts.js) | **Zod schemas for LP invitations, portal, investments** |
| **LP Database Models** | [server/prisma/schema.prisma](../canonical-deal-os/server/prisma/schema.prisma) | **LPInvitation, LPActor models (SQLite)** |
| Kernel schema | [cre-kernel-phase1/apps/kernel-api/src](../cre-kernel-phase1/apps/kernel-api/src) | TypeScript, Prisma ORM, deal lifecycle |
| UI components | [src/components](../canonical-deal-os/src/components) | Radix UI + React, kernel-faithful |

## Common Debugging

**"Kernel unavailable"** → Check `npm run dev:api` is running on port 3001

**Material sync fails** → Check [server/routes/provenance.js](../canonical-deal-os/server/routes/provenance.js) logs; verify Kernel endpoint `GET /deals/:dealId/schema/field-material-map` responds

**Route returns 404** → Check path regex in [server/index.js](../canonical-deal-os/server/index.js); verify route module exports the handler

**LLM parse returns empty** → Check `BFF_OPENAI_API_KEY` set; verify prompt in [server/routes/llm.js](../canonical-deal-os/server/routes/llm.js)

**Test DB issues** → Delete `C:\Users\majes\AppData\Roaming\postgresql\pgpass.conf` if password wrong; restart Postgres

## LP Onboarding Workflow (Phase 2 Implementation)

**Purpose**: Read-only Limited Partner portal with invitation-based access, capital event tracking, and covenant compliance reporting.

**Philosophy**: "LPs see the same truth the GP sees − minus the machinery."

### LP Portal Architecture

**Route Module**: [server/routes/lp-onboarding.js](../canonical-deal-os/server/routes/lp-onboarding.js) (550 lines)

**Database Models** (Prisma):
- `LPInvitation` - Tracks LP invitations (pending, accepted, rejected, revoked)
- `LPActor` - Maps LP email → Kernel actor ID + commitment/ownership

**Key Endpoints**:

| Endpoint | Method | Purpose | Access |
|----------|--------|---------|--------|
| `/api/lp/invitations` | POST | Send LP invitation for deal | GP (Kernel authority check) |
| `/api/lp/invitations/:id/accept` | POST | Accept LP invite (creates Kernel actor) | LP via token |
| `/api/lp/deals/:dealId/invitations` | GET | List invitations for deal | GP |
| `/api/lp/portal` | GET | LP landing (portfolio summary) | LP (by email) |
| `/api/lp/portal/deals/:dealId` | GET | LP investment detail (capital events, compliance) | LP (verified access) |
| `/api/lp/portal/deals/:dealId/report` | GET | Export capital statement + event summary | LP (timestamped) |
| `/api/lp/actors/:dealId` | GET | List active LP actors | GP |

### LP Portal Data Views (Read-Only)

**Landing Screen** (`/api/lp/portal`):
- Portfolio summary: active investments, capital committed/deployed, distributions YTD
- Investment list: name, asset type, status, last update, key notes (plain English)
- No IRR projections, no forecast claims

**Investment Detail** (`/api/lp/portal/deals/:dealId`):
- **Ownership**: entity, commitment, ownership %, effective dates
- **Capital Events**: calls, distributions, returns (from Kernel events)
- **Compliance**: status (COMPLIANT/AMENDED/AT_RISK), amended covenant count
- **Performance**: cash in/out, net invested, distributions to date
- **Documents**: offering docs, amendments, quarterly reports (read-only links)

**Export** (`/api/lp/portal/deals/:dealId/report`):
- Capital statement with timestamp ("Generated on [DATE]. Reflects verified data as of [TIMESTAMP].")
- Event summaries (capital calls, distributions)
- Disclaimer language for disputes

### LP Invitation Flow

1. **GP sends invite**: `POST /api/lp/invitations`
   - Body: `{ lpEntityName, lpEmail, dealId, commitment, ownershipPct }`
   - Creates pending invitation (30-day expiry)
   - Sends email notification with the acceptance link (`/api/lp/invitations/{id}/accept`) and emits `LP_INVITATION_SENT` webhook when the notification endpoints are configured

2. **LP accepts**: `POST /api/lp/invitations/:invitationId/accept`
   - Creates Kernel actor with role "LP"
   - Stores LP actor in BFF for future access control
   - Updates invitation status → ACCEPTED

3. **LP accesses portal**: Requests to `/api/lp/portal` authenticated by email header
   - BFF verifies LP has accepted invitation for deal
   - Returns read-only investment data
   - All data timestamp-verified from Kernel

### Environment Variables (BFF)

Add to `.env`:
```
BFF_LP_PORTAL_TTL_MS=5000        # Cache LP portal queries
BFF_LP_INVITATION_EXPIRY_DAYS=30 # Invitation expiration
BFF_PUBLIC_URL=http://localhost:8787 # Public host used in accept links
BFF_LP_INVITATION_BASE_URL=http://localhost:8787 # Override accept link domain
BFF_LP_INVITATION_EMAIL_ENDPOINT=     # Optional transactional email endpoint
BFF_LP_INVITATION_EMAIL_API_KEY=       # Optional bearer key for the email provider
BFF_LP_INVITATION_EMAIL_FROM=          # Optional from address like "Canonical LP Portal <noreply@canonical.com>"
BFF_LP_NOTIFICATION_WEBHOOK_URL=       # Optional webhook URL for capital events/invitations
BFF_LP_NOTIFICATION_WEBHOOK_SECRET=    # Shared secret for the webhook header
BFF_LP_NOTIFICATION_WEBHOOK_HEADER=X-LP-Webhook-Secret # Header name used for the secret
```

### Caching Strategy

- LP portal landing: 5-second cache per user (recompute portfolio on kernel updates)
- Investment detail: 5-second cache per deal per user
- Invalidation: On deal event append, new capital call, or distribution processed

### Error Handling (LP-Safe)

**404 Invitation expired** → "Invitation has been revoked or expired. Contact GP."

**403 No access** → "You do not have access to this investment."

**502 Kernel unavailable** → "Unable to fetch current investment data. Please retry."

All LP error messages are user-facing (no tech jargon).

## File Organization Conventions

- **Modular routes**: New workflows → new file in `server/routes/`
- **Contracts first**: API changes → update Zod schema in [src/lib/contracts.js](../canonical-deal-os/src/lib/contracts.js)
- **BFF as mediator**: Never call Kernel directly from UI; route through BFF
- **Query Kernel for mappings**: Field-to-material mapping lives in Kernel (enables Phase 2 multi-tenant)
- **Preserve kernel authority**: Don't cache gating decisions in BFF
- **Type safety**: Use `z.object().parse()` for all untrusted input

---

*Last updated: January 2026 | For CRE Kernel Phase 1 + Canonical UI (Refactored)*

