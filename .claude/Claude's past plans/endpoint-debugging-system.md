# Plan: Endpoint Debugging & Error Tracking System

**Date**: January 15, 2026
**Status**: Ready for Implementation

## User Decisions

| Decision | Choice |
|----------|--------|
| Scope | **Full system** - Endpoint tests + Frontend overlay + BFF logger + Debug API |
| Error display | **Floating panel** - Collapsible panel in corner with recent API errors |

---

## Problem Statement

Currently debugging server errors is painful - you have to:
1. Notice errors in browser console (often buried in noise)
2. Manually check which service is down
3. Hunt through server logs to find the actual error
4. Cross-reference frontend API calls with backend routes

**Goal**: Create a system that makes endpoint errors immediately visible and actionable.

---

## Existing Infrastructure

### Tests (3 files in `server/__tests__/`)
| File | Coverage |
|------|----------|
| `doc-factory.test.js` | Document generation pipeline, Prisma models |
| `email-intake.test.js` | Email intake workflow, document classification |
| `lp-onboarding.test.js` | LP invitation/actor management |

### Scripts Already Created
| Script | Purpose |
|--------|---------|
| `scripts/health.js` | Check if Kernel, BFF, Vite are up |
| `scripts/start-all.js` | Start all services with health monitoring |

### BFF Routes (27 route files, ~100+ endpoints)
- Consistent error format: `{ message, details }`
- Prefixed console logging: `[EmailIntake]`, `[Excel Import]`, etc.
- Standard HTTP status codes: 400, 403, 404, 409, 500, 502

---

## Proposed Solution

### 1. Endpoint Test Suite (`scripts/test-endpoints.js`)

A comprehensive endpoint smoke test that:
- Hits every critical endpoint
- Reports pass/fail with response times
- Shows actual error messages (not just "500")
- Groups by feature area

```
npm run test:endpoints

=== Endpoint Health Check ===

[Deals]
  ✓ GET  /api/deals                    42ms
  ✓ POST /api/deals                    89ms (created test-deal-123)
  ✓ GET  /api/deals/:id/home           31ms

[Deal State]
  ✓ GET  /api/deals/:id/state          18ms
  ✗ GET  /api/deals/:id/state/blockers 500ms
    └─ Error: Deal not found: abc-123

[Chat]
  ✓ GET  /api/chat/conversations       22ms
  ✗ POST /api/chat/conversations       401ms
    └─ Error: Unauthorized
```

### 2. Frontend Error Overlay (Development Only)

A non-intrusive toast/panel that shows API errors in real-time:

```
┌─────────────────────────────────────┐
│ 🔴 API Errors (3)            [Hide] │
├─────────────────────────────────────┤
│ GET /api/deals/abc/insights   500   │
│ └─ Deal not found: abc              │
│                                     │
│ GET /api/activity-feed        500   │
│ └─ Database connection failed       │
│                                     │
│ GET /api/chat/conversations   502   │
│ └─ Kernel unavailable               │
└─────────────────────────────────────┘
```

### 3. BFF Request Logger Middleware

Add structured logging for all requests:

```javascript
// Every request logs:
{
  timestamp: "2026-01-15T17:56:02.123Z",
  method: "GET",
  path: "/api/deals/abc/home",
  status: 500,
  duration: 145,
  error: "Deal not found",
  stack: "..." // only in dev
}
```

### 4. API Health Dashboard Route

New endpoint: `GET /api/debug/status`

Returns comprehensive system status:
```json
{
  "services": {
    "kernel": { "status": "up", "latency": 12 },
    "database": { "status": "up", "latency": 3 },
    "cache": { "entries": 42, "hitRate": 0.87 }
  },
  "recentErrors": [
    { "path": "/api/deals/abc/insights", "error": "Deal not found", "count": 3 }
  ],
  "endpoints": {
    "total": 98,
    "tested": 45,
    "failing": 2
  }
}
```

---

## Implementation Plan

### Phase 1: Endpoint Test Suite (Priority)

**File**: `scripts/test-endpoints.js`

**Endpoints to test** (grouped by criticality):

**Critical (app won't work without these):**
- `GET /api/deals` - Deal listing
- `GET /api/deals/:id/home` - Deal overview
- `GET /api/deals/:id/records` - Deal records
- `GET /api/deals/:id/state` - Deal state
- `GET /api/home` - Homepage data

**Important (core features):**
- `GET /api/deals/:id/state/blockers` - Blockers
- `GET /api/deals/:id/state/available-transitions` - Transitions
- `GET /api/chat/conversations` - Chat
- `GET /api/activity-feed` - Activity feed
- `GET /api/review-requests` - Review queue

**Nice-to-have:**
- Document generation endpoints
- Excel import endpoints
- LP portal endpoints

### Phase 2: Frontend Error Overlay

**File**: `src/components/dev/ApiErrorOverlay.jsx`

- Only renders in development (`import.meta.env.DEV`)
- Intercepts fetch errors from `bffClient.js`
- Shows collapsible panel with recent errors
- Persists across page navigation
- One-click copy error details

### Phase 3: BFF Request Logger

**File**: `server/middleware/request-logger.js`

- Wraps all route handlers
- Logs request start/end with timing
- Captures errors with stack traces
- Stores recent errors in memory (last 100)
- Exposes via `/api/debug/recent-errors`

### Phase 4: Debug Status Endpoint

**File**: `server/routes/debug.js`

- `GET /api/debug/status` - System overview
- `GET /api/debug/recent-errors` - Recent error list
- `GET /api/debug/cache` - Cache statistics
- Only enabled in development

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `scripts/test-endpoints.js` | Create | Endpoint smoke test suite |
| `src/components/dev/ApiErrorOverlay.jsx` | Create | Frontend error display |
| `src/api/bffClient.js` | Modify | Add error event emitter |
| `src/App.jsx` | Modify | Add ApiErrorOverlay component |
| `server/middleware/request-logger.js` | Create | Request/error logging |
| `server/routes/debug.js` | Create | Debug status endpoints |
| `server/index.js` | Modify | Add logger middleware, debug routes |
| `package.json` | Modify | Add `test:endpoints` script |

---

## Verification

1. **Run endpoint tests**: `npm run test:endpoints`
   - Should show all critical endpoints passing
   - Should show clear error messages for failures

2. **Check error overlay**:
   - Trigger a 500 error (e.g., invalid deal ID)
   - Error should appear in overlay within 1 second
   - Should show path, status, and error message

3. **Check debug endpoint**: `curl http://localhost:8787/api/debug/status`
   - Should return JSON with service health
   - Should include recent errors if any

---

## Summary

**What you'll get:**

1. `npm run test:endpoints` - Instant visibility into which endpoints are broken
2. Floating error panel in browser - See API errors as they happen without digging through console
3. `GET /api/debug/status` - One curl to see full system health
4. Structured request logging - Every request/error logged with timing

**Time to debug an error goes from 10+ minutes to ~30 seconds.**
