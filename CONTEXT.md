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

## Related Documentation

| Document | Purpose |
|----------|---------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Deep technical architecture |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) | Development workflow |
| [contracts/README.md](contracts/README.md) | API contract system |
| [CLAUDE.md](CLAUDE.md) | AI assistant context |
| [canonical-deal-os/SECURITY_GUIDELINES.md](canonical-deal-os/SECURITY_GUIDELINES.md) | Security patterns |
