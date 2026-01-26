# Contributing Guide

This guide covers the development workflow for the CRE Deal Management Platform.

## Prerequisites

- **Node.js 20+** (LTS recommended)
- **Docker Desktop** (for PostgreSQL and full-stack dev)
- **Git** with LF line endings configured

## Development Setup

### Option 1: Docker (Recommended)

The easiest way to get started:

```bash
# Clone the repository
git clone <repo-url>
cd "Real Estate Project"

# Start all services
docker-compose -f canonical-deal-os/docker-compose.yml up

# Services available at:
# - Kernel: http://localhost:3001
# - BFF: http://localhost:8787
# - UI: http://localhost:5173
# - MailHog: http://localhost:8025
```

### Option 2: Native Node.js

For faster iteration on specific services:

```bash
# 1. Start PostgreSQL (required for Kernel)
docker-compose -f canonical-deal-os/docker-compose.yml up postgres

# 2. Terminal 1: Kernel API
cd cre-kernel-phase1
npm install
npm run prisma:migrate
npm run dev:api

# 3. Terminal 2: BFF Server
cd canonical-deal-os
npm install
npm run db:generate
npm run db:push
npm run bff

# 4. Terminal 3: Vite UI
cd canonical-deal-os
npm run dev
```

### Seed Test Data

```bash
# Create test users (admin, gp, analyst)
npm --prefix canonical-deal-os run db:seed:auth

# Create sample deal data
npm --prefix canonical-deal-os run db:seed
```

## Root Commands

Run these from the repository root:

```bash
npm run docker:up       # Start all services via Docker
npm run docker:down     # Stop all services
npm run kernel:dev      # Start Kernel API only
npm run bff:dev         # Start BFF only
npm run ui:dev          # Start Vite UI only
npm run start           # Start BFF + Kernel + UI (native)
npm run test            # Run all tests
npm run lint            # Run ESLint
npm run validate:contracts  # Validate fixtures against schemas
```

## Code Organization

### Adding a New BFF Route

1. **Create the route file:**
   ```bash
   # server/routes/my-feature.js
   ```

2. **Export handler functions:**
   ```javascript
   import { sendJson, sendError, readJsonBody } from "./helpers.js";
   import { mySchema } from "../../src/lib/contracts.js";

   export async function handleMyFeature(req, res) {
     const { authUser } = req;  // From middleware

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

3. **Register in server/index.js:**
   ```javascript
   import { handleMyFeature } from "./routes/my-feature.js";

   // In the route dispatch section:
   if (method === "POST" && path === "/api/my-feature") {
     return handleMyFeature(req, res, readJsonBody, sendJson, sendError);
   }
   ```

4. **Add Zod schema to contracts.js:**
   ```javascript
   // src/lib/contracts.js
   export const mySchema = z.object({
     field1: z.string(),
     field2: z.number().optional()
   });
   ```

5. **Add fixture for validation:**
   ```bash
   # fixtures/http/my-feature-request.json
   ```

6. **Run validation:**
   ```bash
   npm run validate:contracts
   ```

### Adding a New Kernel Event Type

1. **Add to shared types:**
   ```typescript
   // cre-kernel-phase1/packages/shared/src/index.ts
   export const EventTypes = {
     // ... existing types
     MyNewEvent: "MyNewEvent"
   };
   ```

2. **Add to allowed events (if gated):**
   ```typescript
   // cre-kernel-phase1/apps/kernel-api/src/server.ts
   const gateEventTypes = new Set([
     // ... existing gated events
     "MyNewEvent"
   ]);
   ```

3. **Add state transition:**
   ```typescript
   // cre-kernel-phase1/apps/kernel-api/src/projection.ts
   // Add case in projectDealLifecycle()
   ```

4. **Add fixture:**
   ```bash
   # fixtures/events/my-new-event.json
   ```

5. **Write test:**
   ```typescript
   // cre-kernel-phase1/apps/kernel-api/test/my-new-event.test.ts
   ```

### Adding a Frontend Page

1. **Create page component:**
   ```jsx
   // src/pages/MyPage.jsx
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

     // Render UI...
   }
   ```

2. **Add route:**
   ```jsx
   // src/App.jsx
   <Route path="/my-page" element={<MyPage />} />
   ```

## Testing

### Unit Tests (Jest)

```bash
# BFF tests
cd canonical-deal-os
npm test
npm run test:watch  # Watch mode

# Kernel tests (Vitest)
cd cre-kernel-phase1
npm test
```

### E2E Tests (Playwright)

```bash
cd canonical-deal-os

# Run all E2E tests
npm run e2e

# Interactive UI mode
npm run e2e:ui

# Debug mode (see browser)
npm run e2e:headed
```

### Contract Validation

```bash
# From repository root
npm run validate:contracts

# This validates:
# - fixtures/http/*.json against src/lib/contracts.js schemas
# - fixtures/events/*.json structure
```

## Code Style

### ESLint

```bash
npm --prefix canonical-deal-os run lint       # Check
npm --prefix canonical-deal-os run lint:fix   # Auto-fix
```

### EditorConfig

Install the EditorConfig plugin for your editor. Settings are in `.editorconfig`:
- 2-space indentation
- LF line endings
- UTF-8 encoding

### Conventions

- **File naming**: kebab-case for routes, PascalCase for React components
- **Exports**: Named exports for utilities, default exports for React pages
- **Imports**: Relative paths within packages, absolute for cross-package
- **Comments**: Only where logic isn't self-evident

## Git Workflow

### Branching

```bash
# Create feature branch
git checkout -b feature/my-feature

# Make changes, commit
git add .
git commit -m "Add my feature"

# Push and create PR
git push -u origin feature/my-feature
```

### Commit Messages

Format: `<type>: <description>`

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `refactor`: Code change that doesn't add features or fix bugs
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:
```
feat: Add LP distribution export endpoint
fix: Correct org isolation in capital calls query
docs: Update ARCHITECTURE.md with auth flow
```

### Contract Change Checklist

When modifying API contracts, complete this checklist before submitting PR:

- [ ] **Schema updated** - Modified `canonical-deal-os/src/contracts/` or `src/lib/contracts.js`
- [ ] **Fixture updated** - Updated/added fixture in `fixtures/http/` or `fixtures/events/`
- [ ] **Manifest updated** - Added fixture→schema mapping in `contracts/manifest.json`
- [ ] **CI passes** - Run `npm run contracts:check` locally
- [ ] **Backward compatibility** - Existing consumers won't break
  - Adding optional fields: OK
  - Adding required fields: Requires version bump (see versioning convention)
  - Removing/renaming fields: Requires version bump
- [ ] **Re-export updated** - If migrating schema, update `contracts/schemas.js`

### CI Requirements

All PRs must pass:
1. **Contract validation** - Fixtures match schemas
2. **Kernel tests** - Vitest suite passes
3. **BFF tests** - Jest suite passes
4. **Lint** - No ESLint errors
5. **Build** - Vite production build succeeds

## Troubleshooting

### Database Issues

```bash
# Reset Kernel database
cd cre-kernel-phase1/apps/kernel-api
npx prisma migrate reset

# Reset BFF database
cd canonical-deal-os
rm -rf server/.data/
npm run db:push
npm run db:seed:auth
```

### Port Conflicts

Default ports:
- 3001: Kernel API
- 8787: BFF Server
- 5173: Vite UI
- 5432: PostgreSQL

To use different ports, set environment variables in `.env`.

### Docker Issues

```bash
# Rebuild containers after dependency changes
docker-compose -f canonical-deal-os/docker-compose.yml up --build

# View logs
docker-compose -f canonical-deal-os/docker-compose.yml logs -f kernel

# Clean slate
docker-compose -f canonical-deal-os/docker-compose.yml down -v
```

## Related Documentation

- [CONTEXT.md](../CONTEXT.md) - Quick start
- [ARCHITECTURE.md](ARCHITECTURE.md) - Technical deep dive
- [contracts/README.md](../contracts/README.md) - API contracts
- [canonical-deal-os/SECURITY_GUIDELINES.md](../canonical-deal-os/SECURITY_GUIDELINES.md) - Security patterns
