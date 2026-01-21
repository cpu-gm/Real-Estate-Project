# CRE Deal Management Platform - Claude Code Context

## Instructions for Claude
IMPORTANT: Before any compaction or when context is running low (~90%+):
1. Update the "Current Project State" section at the bottom of this file
2. List what was accomplished this session
3. Note any blockers, active work, and next steps
4. This ensures context survives compaction

---

## Quick Context (Read First After Compaction)
3-service architecture for Commercial Real Estate deal management:
- **Kernel API** (port 3001): Core business logic, deal lifecycle, authority gating
- **BFF** (port 8787): Authentication, LP portal, LLM integration, Kernel proxy
- **Vite UI** (port 5173): React frontend with role-based views

Two projects: `cre-kernel-phase1` (core logic) and `canonical-deal-os` (GP/LP portal)

## Architecture Diagram
```
User -> Vite UI (5173) -> BFF (8787) -> Kernel API (3001) -> PostgreSQL
                           |
                           +-> SQLite (LLM cache)
                           +-> SendGrid (LP emails)
                           +-> OpenAI (deal parsing)
```

---

## Key Files for LP/GP Development

### LP Routes & Portal
- `canonical-deal-os/server/routes/lp-onboarding.js` - LP onboarding API endpoints
- `canonical-deal-os/server/routes/lp-portal-access.js` - LP portal access control
- `canonical-deal-os/server/routes/lp-documents.js` - LP document management
- `canonical-deal-os/src/pages/LPPortal.jsx` - LP dashboard page
- `canonical-deal-os/src/pages/LPPortalAuth.jsx` - LP authentication page
- `canonical-deal-os/src/pages/LPInvestmentDetail.jsx` - LP investment details
- `canonical-deal-os/src/pages/LPInvestmentDetailAuth.jsx` - LP auth for investment detail

### GP/Deal Management
- `canonical-deal-os/src/pages/Deals.jsx` - Deal listing page
- `canonical-deal-os/src/pages/DealOverview.jsx` - Single deal view
- `canonical-deal-os/src/pages/CreateDeal.jsx` - Deal creation
- `canonical-deal-os/src/pages/Home.jsx` - GP home/dashboard
- `canonical-deal-os/server/routes/deals.js` - Deal API endpoints

### Financial Operations
- `canonical-deal-os/server/routes/capital-calls.js` - Capital call management
- `canonical-deal-os/server/routes/distributions.js` - Distribution management
- `canonical-deal-os/server/routes/investor-updates.js` - Investor communications

### Authorization & Auth
- `canonical-deal-os/src/lib/permissions.js` - RBAC logic
- `canonical-deal-os/server/routes/auth.js` - Authentication endpoints
- `canonical-deal-os/server/routes/admin.js` - Admin endpoints
- `canonical-deal-os/src/pages/AdminDashboard.jsx` - Admin UI

### Kernel Core Logic
- `cre-kernel-phase1/apps/kernel-api/src/index.ts` - API entry point
- `cre-kernel-phase1/apps/kernel-api/src/config.ts` - Configuration
- `cre-kernel-phase1/apps/kernel-api/src/projection.ts` - Deal projections
- `cre-kernel-phase1/apps/kernel-api/src/prisma.ts` - Database client

### Database Schemas
- `canonical-deal-os/server/prisma/schema.prisma` - BFF database schema
- `cre-kernel-phase1/apps/kernel-api/prisma/schema.prisma` - Kernel database schema

### Other Key Routes
- `canonical-deal-os/server/routes/llm.js` - LLM/AI integration
- `canonical-deal-os/server/routes/underwriting.js` - Underwriting logic
- `canonical-deal-os/server/routes/notifications.js` - Notification system
- `canonical-deal-os/server/routes/magic-links.js` - Magic link auth
- `canonical-deal-os/server/routes/lender-portal.js` - Lender portal

---

## Commands Reference

### Development (from canonical-deal-os)
```bash
npm run start         # Start all services (BFF + Kernel + Vite)
npm run health        # Check if all services are running
npm run dev           # Vite dev server only (port 5173)
npm run bff           # BFF server only (port 8787)
```

### Kernel (from cre-kernel-phase1)
```bash
npm run dev:api       # Kernel API (port 3001)
```

### Testing
```bash
npm run e2e           # Run all E2E tests (Playwright)
npm run e2e:ui        # Interactive UI mode
npm run e2e:headed    # See browser while running
npm run test          # Jest unit tests
npm run test:watch    # Jest watch mode
npm run test:endpoints # API smoke tests
```

### Database
```bash
npm run db:generate   # Generate Prisma client
npm run db:push       # Push schema to database
npm run db:migrate    # Run migrations
npm run db:seed       # Seed sample deal data
npm run db:seed:auth  # Seed auth test users
```

### Validation
```bash
npm run lint          # ESLint
npm run lint:fix      # Auto-fix lint issues
npm run validate:all  # Run all validations
```

---

## Test Accounts
After running `npm run db:seed:auth`:
- **Admin**: admin@canonical.com / admin123
- **GP**: gp@canonical.com / gp123
- **Analyst** (pending): analyst@canonical.com / analyst123

## Roles
GP, GP Analyst, LP, Admin, Lender, Counsel, Regulator, Auditor

---

## API Endpoints Quick Reference

### LP Endpoints (BFF /api/lp/*)
- `POST /api/lp/invite` - Send LP invitation
- `POST /api/lp/accept-invite` - Accept invitation
- `GET /api/lp/portal/:lpId` - LP portal data
- `GET /api/lp/deals` - LP's deals list

### Deal Endpoints (BFF /api/*)
- `GET /api/deals` - All deals
- `GET /api/deals/:id` - Single deal
- `POST /api/deals` - Create deal
- `PUT /api/deals/:id` - Update deal

### Kernel Proxy (BFF /api/kernel/*)
Proxies requests to Kernel API at localhost:3001

---

## Documentation Index
| File | Purpose |
|------|---------|
| `canonical-deal-os/SECURITY_GUIDELINES.md` | **Security patterns (READ FIRST for new endpoints)** |
| `canonical-deal-os/LP_API_REFERENCE.md` | Full LP endpoint documentation |
| `canonical-deal-os/DEPLOYMENT_GUIDE.md` | Staging/prod deployment |
| `canonical-deal-os/LP_IMPLEMENTATION_STATUS.md` | Feature completion status |
| `canonical-deal-os/CLAUDE.md` | Project-specific dev commands |
| `cre-kernel-phase1/README.md` | Kernel setup and API docs |

---

## Security Quick Reference (MANDATORY for new endpoints)

### Before writing ANY new endpoint, verify:
1. **Auth**: Use `requireAuth`/`requireGP`/`requireAdmin` from dispatch
2. **Org isolation**: Include deal FK, check `authUser.organizationId`
3. **Identity**: Use `authUser.*` only, NEVER `x-user-id`/`x-actor-role` headers
4. **Audit**: Log financial mutations with `logPermissionAction()`

### Reusable helpers (server/middleware/auth.js):
```javascript
// Auth gates
requireAuth(req, res)              // Any authenticated user
requireGP(req, res)                // GP or Admin
requireAdmin(req, res)             // Admin only
requireLPEntitlement(req, res, dealId, token)  // LP access

// Org isolation
requireDealAccess(authUser, dealId, res)       // Deal-level check
requireOrgIsolation(resource, authUser, res, "document")  // Resource check
fetchWithOrgCheck({ prisma, model, id, authUser, res })   // Fetch + check

// Audit
logPermissionAction({ actorId, action, afterValue, ... })
```

See `canonical-deal-os/SECURITY_GUIDELINES.md` for full patterns and examples.

---

## Current Project State
<!-- Auto-updated by SessionEnd: 2026-01-20 2:53:24 PM -->

### Session Info
- Last compaction/session end: 2026-01-20 2:53:24 PM
- Hook trigger: SessionEnd

### Active Work
- [Review and update manually after resuming]

### Known Issues
- [Update as needed]

### Recent Changes
- Session ended/compacted on 2026-01-20

### Next Steps
- [Continue from where you left off]

---

## Environment Variables

### BFF (.env)
```
KERNEL_API_URL=http://localhost:3001
BFF_PORT=8787
BFF_OPENAI_API_KEY=your_key (optional, for LLM features)
```

### Vite (.env.local)
```
VITE_BASE44_APP_ID=your_app_id (optional)
VITE_BASE44_APP_BASE_URL=your_backend_url (optional)
```
