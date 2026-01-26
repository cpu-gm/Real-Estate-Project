# CRE Deal Management Platform

A 3-service architecture for Commercial Real Estate deal lifecycle management with regulatory-grade audit trails.

## Quick Start (Docker - Recommended)

```bash
# Start all services
docker-compose -f canonical-deal-os/docker-compose.yml up

# Or use root orchestration
npm run docker:up
```

**Services:**
| Service | URL | Description |
|---------|-----|-------------|
| Kernel API | http://localhost:3001 | Event ledger, state machine, authority gating |
| BFF Server | http://localhost:8787 | Auth, LP portal, kernel proxy |
| Vite UI | http://localhost:5173 | React frontend |
| MailHog | http://localhost:8025 | Email testing (dev only) |
| PostgreSQL | localhost:5432 | Kernel database |

## Quick Start (Native Node.js)

```bash
# Terminal 1: Start Kernel (requires PostgreSQL)
npm run kernel:dev

# Terminal 2: Start BFF
npm run bff:dev

# Terminal 3: Start UI
npm run ui:dev
```

## Architecture Overview

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Vite UI   │───▶│     BFF     │───▶│   Kernel    │
│  (React)    │    │  (Node.js)  │    │ (Fastify)   │
│  port 5173  │    │  port 8787  │    │  port 3001  │
└─────────────┘    └─────────────┘    └─────────────┘
                          │                   │
                          ▼                   ▼
                   ┌─────────────┐    ┌─────────────┐
                   │   SQLite    │    │ PostgreSQL  │
                   │ (LLM cache) │    │  (events)   │
                   └─────────────┘    └─────────────┘
```

**Trust Model:**
- **Kernel** = Source of truth. Records events, enforces authority rules, maintains hash chain.
- **BFF** = Orchestration layer. Handles auth, proxies to kernel, caches for performance.
- **UI** = Presentation only. Kernel-faithful - shows what kernel says, never overrides.

## Key Concepts

### Deal Lifecycle States
```
Draft → UnderReview → Approved → ReadyToClose → Closed → Operating
                                                           ↓
                                              Changed ←── Distressed
                                                 ↓
                                              Exited / Terminated
```

### Authority Gating
Actions require role-based approvals:
- `APPROVE_DEAL` - GP only, threshold 1
- `FINALIZE_CLOSING` - GP + Lender + Escrow, threshold 3
- `IMPOSE_FREEZE` - Court/Regulator/Trustee, threshold 1

### Truth Classes
Data provenance hierarchy:
- **DOC** (3) - Documentary evidence (highest trust)
- **HUMAN** (2) - Human attestation
- **AI** (1) - AI-inferred (lowest trust)

DOC can satisfy HUMAN requirements. AI cannot satisfy any requirements alone.

## Repository Structure

```
├── canonical-deal-os/       # BFF + React Frontend
│   ├── server/              # Node.js BFF (44 route files)
│   │   ├── routes/          # API endpoints
│   │   ├── middleware/      # Auth gates
│   │   └── prisma/          # SQLite schema
│   ├── src/                 # React app
│   │   ├── lib/contracts.js # Zod schemas (canonical)
│   │   └── pages/           # React pages
│   └── docker-compose.yml   # Full stack Docker config
│
├── cre-kernel-phase1/       # Event Ledger Kernel
│   ├── apps/kernel-api/     # Fastify API
│   │   ├── src/server.ts    # Routes + inline schemas
│   │   ├── src/audit.ts     # SHA-256 hash chain
│   │   └── prisma/          # PostgreSQL schema
│   └── packages/shared/     # Shared types
│
├── contracts/               # API contract documentation
├── fixtures/                # Example payloads
├── scripts/                 # Validation & utilities
└── docs/                    # Architecture docs
```

## Security Notes

- **Never commit `.env` files** - Use `.env.example` as template
- **JWT auth** - BFF validates tokens, extracts `authUser`
- **Org isolation** - All queries filter by `organizationId`
- **Audit trail** - Financial mutations logged via `logPermissionAction()`

See `CODEX_FINDINGS.MD` and `bulletproof_security_audit.md` for security audit results.

## Test Accounts (after seeding)

```bash
npm --prefix canonical-deal-os run db:seed:auth
```

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@canonical.com | admin123 |
| GP | gp@canonical.com | gp123 |
| Analyst | analyst@canonical.com | analyst123 |

## Contract System

The platform uses **contract-first development** with Zod schemas as the single source of truth for API shapes.

### What is a Contract?

A contract is a Zod schema that defines the exact shape of data flowing between services:
- **Request contracts** - What clients send to the API
- **Response contracts** - What the API returns
- **Event contracts** - Structure of kernel events

Contracts are validated at runtime (requests/responses) and in CI (fixtures).

### Canonical Schema Locations

| Type | File | Description |
|------|------|-------------|
| HTTP Schemas | `canonical-deal-os/src/lib/contracts.js` | All BFF request/response schemas |
| Event Types | `cre-kernel-phase1/packages/shared/src/index.ts` | EventTypes, DealStates, TruthIndicator |
| Kernel Events | `contracts/schemas.js` | kernelEventSchema (event envelope) |

**Future location (migration in progress):**
```
canonical-deal-os/src/contracts/
├── http/           # HTTP request/response schemas
├── events/         # Event payload schemas
└── index.js        # Canonical export point
```

### Fixture→Schema Manifest

The manifest at `contracts/manifest.json` maps every fixture to its schema:

```json
{
  "http": {
    "create-deal-request.json": { "schema": "createDealRequestSchema" },
    "create-deal-response.json": { "schema": "dealSchema" }
  },
  "events": {
    "review-opened.json": { "schema": "kernelEventSchema" }
  }
}
```

**STRICT MODE:** Every fixture MUST be listed. Unmapped fixtures fail CI.

### Validation in CI

```bash
npm run validate:contracts    # Validate all fixtures
npm run contracts:check       # Alias for validation
```

The CI job `validate-contracts` runs on every PR and blocks merge if:
1. Any fixture is unmapped in manifest.json
2. Any fixture fails schema validation
3. Any schema import fails

### Quick Reference

| Task | Command/File |
|------|--------------|
| Validate fixtures | `npm run validate:contracts` |
| Add new schema | `canonical-deal-os/src/lib/contracts.js` |
| Add new fixture | `fixtures/http/` or `fixtures/events/` |
| Map fixture→schema | `contracts/manifest.json` |
| Re-export for validation | `contracts/schemas.js` |

See [contracts/README.md](contracts/README.md) for detailed documentation.

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Deep technical architecture |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) | Development workflow |
| [contracts/README.md](contracts/README.md) | API contract system |
| [CLAUDE.md](CLAUDE.md) | AI assistant context |
| [canonical-deal-os/SECURITY_GUIDELINES.md](canonical-deal-os/SECURITY_GUIDELINES.md) | Security patterns |
