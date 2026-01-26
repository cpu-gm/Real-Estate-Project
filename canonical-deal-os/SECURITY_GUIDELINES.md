# Security Guidelines for canonical-deal-os

This document defines security patterns that MUST be followed for all new code.

---

## Core Principles

1. **Never trust headers for authorization** - Only use `authUser` from validated JWT
2. **Always enforce org isolation** - Every resource access must verify organizationId
3. **Audit privileged operations** - Financial mutations and access control changes need logs
4. **Fail closed** - If in doubt, deny access

---

## Authentication Patterns

### For GP/Admin endpoints:
```javascript
// In dispatch (index.js)
const authUser = await requireGP(req, res);
if (!authUser) return;
return handleSomething(req, res, authUser);

// In handler
export async function handleSomething(req, res, authUser) {
  // authUser is guaranteed to be GP or Admin
}
```

### For any authenticated user:
```javascript
const authUser = await requireAuth(req, res);
if (!authUser) return;
```

### For LP endpoints:
```javascript
const lpContext = await requireLPEntitlement(req, res, dealId, token);
if (!lpContext) return;
// lpContext.lpEmail and lpContext.lpActorId are verified
```

---

## Organization Isolation Patterns

### Pattern 1: Direct resource with organizationId
```javascript
const resource = await prisma.someModel.findUnique({ where: { id } });
if (!resource) return sendError(res, 404, "Not found");

if (resource.organizationId && resource.organizationId !== authUser.organizationId) {
  return sendError(res, 403, "Access denied - belongs to different organization");
}
```

### Pattern 2: Resource linked to deal (FK chain)
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

### Pattern 3: Using requireDealAccess helper
```javascript
import { requireDealAccess } from "../middleware/auth.js";

// Verify deal access (handles 404 and 403 responses)
const hasAccess = await requireDealAccess(authUser, dealId, res);
if (!hasAccess) return;
```

---

## Audit Logging Patterns

### When to log:
- Financial operations (capital calls, distributions, payments)
- Access control changes (role changes, assignments, permissions)
- Sensitive data modifications (verification approvals, document deletions)

### How to log:
```javascript
import { logPermissionAction } from "../middleware/auth.js";

await logPermissionAction({
  actorId: authUser.id,
  actorName: authUser.name,
  targetUserId: targetUser.id,        // Optional - who is affected
  targetUserName: targetUser.name,    // Optional
  action: 'DISTRIBUTION_MARKED_PAID', // Descriptive action name
  beforeValue: { status: 'PENDING' }, // Optional - state before change
  afterValue: { status: 'PAID', amount: 50000 },
  ipAddress: req.headers["x-forwarded-for"] || req.socket?.remoteAddress
});
```

### Standard action names:
- `USER_ROLE_CHANGED`
- `USER_STATUS_CHANGED`
- `DEAL_ASSIGNMENT_CREATED`
- `DEAL_ASSIGNMENT_REMOVED`
- `DISTRIBUTION_MARKED_PAID`
- `CAPITAL_CALL_ISSUED`
- `VERIFICATION_APPROVED`
- `VERIFICATION_REJECTED`
- `DOCUMENT_DELETED`
- `PERMISSIONS_UPDATED`

---

## IDOR Prevention Checklist

When creating an endpoint that accepts an ID parameter:

1. **Identify the resource's org chain**:
   - Does the model have `organizationId`? -> Check directly
   - Does it have `dealId`? -> Include deal and check `deal.organizationId`
   - Is it a sub-resource? -> Trace the FK chain to deal/org

2. **Add the check BEFORE any mutation or data return**

3. **Use consistent error messages**: "Access denied - [resource] belongs to different organization"

---

## Identity: What to Use vs. Avoid

### SAFE (use these):
| Source | Usage |
|--------|-------|
| `authUser.id` | User identification for all purposes |
| `authUser.email` | User email (validated from JWT) |
| `authUser.role` | Role-based authorization |
| `authUser.organizationId` | Org isolation checks |
| `authUser.name` | Display name |

### UNSAFE (never use for authorization):
| Header | Problem |
|--------|---------|
| `x-user-id` | Spoofable - client can set any value |
| `x-actor-role` | Spoofable - client can claim any role |
| `x-user-name` | Spoofable - only use for display fallback |
| `x-canonical-user-id` | Debug only - disabled in production |
| `x-debug-user-id` | Debug only - disabled in production |

---

## New Endpoint Template

```javascript
/**
 * [Description of what this endpoint does]
 * [HTTP METHOD] /api/path/:id
 *
 * Security:
 * - Auth: requireGP | requireAuth | requireLPEntitlement
 * - Org isolation: Via [direct|deal FK|requireDealAccess]
 * - Audit: [Yes - action name | No - read only]
 */
export async function handleSomething(req, res, resourceId, authUser) {
  const prisma = getPrisma();

  // 1. Fetch resource with org chain
  const resource = await prisma.model.findUnique({
    where: { id: resourceId },
    include: { deal: true }  // If needed for org check
  });

  if (!resource) {
    return sendError(res, 404, "Resource not found");
  }

  // 2. Org isolation check
  if (resource.deal?.organizationId && resource.deal.organizationId !== authUser.organizationId) {
    return sendError(res, 403, "Access denied - resource belongs to different organization");
  }

  // 3. Business logic...

  // 4. Audit log (if mutation)
  if (isMutation) {
    await logPermissionAction({
      actorId: authUser.id,
      actorName: authUser.name,
      action: 'ACTION_NAME',
      afterValue: { /* relevant data */ },
      ipAddress: req.headers["x-forwarded-for"] || req.socket?.remoteAddress
    });
  }

  // 5. Return response
  sendJson(res, 200, { resource });
}
```

---

## Code Review Security Checklist

When reviewing PRs, verify:

- [ ] All new endpoints use `requireAuth`/`requireGP`/`requireAdmin` from dispatch
- [ ] No use of `x-actor-role` or `x-user-id` headers for authorization
- [ ] Resources fetched by ID include org chain and have isolation check
- [ ] Financial operations create audit log entries
- [ ] Error messages don't leak internal details
- [ ] No new `resolveUserId(req)` calls - use `authUser.id` instead

---

## Testing Security

After implementing, verify with curl:

```bash
# Cross-org access should fail
curl -X GET "http://localhost:8787/api/resource/$OTHER_ORG_ID" \
  -H "Authorization: Bearer $MY_JWT"
# Expected: 403

# Header spoofing should fail
curl -X POST "http://localhost:8787/api/protected" \
  -H "Authorization: Bearer $LP_JWT" \
  -H "x-actor-role: Admin"
# Expected: 403 (role from JWT used, not header)

# Audit log created for privileged operations
# Check: SELECT * FROM PermissionAuditLog WHERE action='YOUR_ACTION'
```

---

## Quick Reference: Auth Middleware

| Middleware | Use When |
|------------|----------|
| `requireAuth(req, res)` | Any authenticated user needed |
| `requireGP(req, res)` | GP or Admin role required |
| `requireAdmin(req, res)` | Admin role only |
| `requireDealAccess(authUser, dealId, res)` | Verify user can access specific deal |
| `requireLPEntitlement(req, res, dealId, token)` | LP portal access |
| `validateNotSelfApproval(approverId, creatorId)` | Prevent maker-checker bypass |
| `checkApprovalExists(dealId, approvalType)` | Verify prerequisite approval |
| `logPermissionAction({...})` | Create audit trail |

---

## HTTP Security Headers

All responses automatically include security headers via `server/middleware/security-headers.js`.

### Standard Security Headers

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Content-Type-Options` | `nosniff` | Prevent MIME type sniffing |
| `X-Frame-Options` | `DENY` | Prevent clickjacking via iframes |
| `X-XSS-Protection` | `1; mode=block` | Legacy XSS protection for older browsers |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Control referrer header leakage |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | HTTPS enforcement (production only) |

### Content Security Policy

The CSP is configured for an API server:

```
default-src 'self';
script-src 'none';
style-src 'none';
img-src 'none';
connect-src 'self';
frame-ancestors 'none';
form-action 'none';
base-uri 'self'
```

### CORS Configuration

CORS is controlled via `server/middleware/cors.js` with environment-based origin validation.

**Configuration:**
```bash
# Set allowed origins (comma-separated)
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8787

# Debug logging
DEBUG_CORS=true
```

**Default origins (development):**
- `http://localhost:5173` (Vite frontend)
- `http://localhost:8787` (BFF)
- `http://localhost:3000` (Alternative)

**Key behaviors:**
- Valid origins are reflected back
- Invalid origins receive first allowed origin (browser will block)
- Preflight (OPTIONS) requests handled with 204 No Content
- Credentials allowed (`Access-Control-Allow-Credentials: true`)
- Headers allowed: `Content-Type, Authorization, X-Request-Id, X-Idempotency-Key`

**Testing CORS:**
```bash
# Valid origin
curl -H "Origin: http://localhost:5173" http://localhost:8787/health
# Access-Control-Allow-Origin: http://localhost:5173

# Invalid origin
curl -H "Origin: http://evil.com" http://localhost:8787/health
# Access-Control-Allow-Origin: http://localhost:5173 (first allowed, browser blocks)
```

### Debugging Security Headers

Enable debug logging:
```bash
DEBUG_SECURITY_HEADERS=true
DEBUG_CORS=true
```

Verify headers with curl:
```bash
curl -I http://localhost:8787/health
# Should include all security headers
```

---

## Observability (Sprint 2)

The platform includes comprehensive observability features for production monitoring.

### Error Tracking (Sentry)

Sentry integration provides centralized error tracking with context.

**Configuration:**
```bash
# Get DSN from https://sentry.io
SENTRY_DSN=https://xxx@sentry.io/project-id
APP_VERSION=1.0.0

# Debug logging
DEBUG_SENTRY=true
```

**Automatic features:**
- Captures unhandled exceptions and rejections
- Filters out 4xx client errors (not our fault)
- Filters health check errors
- Scrubs Authorization headers from breadcrumbs
- Graceful flush on shutdown

**Manual capture:**
```javascript
import { captureException, captureMessage } from './lib/sentry.js';

// Capture exception with context
captureException(error, {
  userId: authUser.id,
  requestId: req.headers['x-request-id'],
  organizationId: authUser.organizationId,
  path: req.url
});

// Capture message
captureMessage('Something noteworthy happened', 'warning', { userId });
```

### Prometheus Metrics

Prometheus-compatible metrics are exposed at `/metrics`.

**Available metrics:**

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `http_request_duration_seconds` | Histogram | method, path, status_code | Request latency |
| `http_requests_total` | Counter | method, path, status_code | Total requests |
| `http_active_connections` | Gauge | - | Current connections |
| `db_query_duration_seconds` | Histogram | operation, table | Database latency |
| `llm_call_duration_seconds` | Histogram | model, endpoint | LLM API latency |
| `llm_tokens_used_total` | Counter | model, type | Token usage |
| `errors_total` | Counter | type, path | Error count |
| `deals_created_total` | Counter | - | Business metric |
| `distributions_total` | Counter | - | Business metric |
| `capital_calls_total` | Counter | - | Business metric |
| `lp_invitations_total` | Counter | status | Business metric |

**Recording custom metrics:**
```javascript
import { recordDealCreated, recordLlmCall, recordError } from './lib/metrics.js';

// Business events
recordDealCreated();

// LLM calls
recordLlmCall('gpt-4', '/v1/chat/completions', durationMs, promptTokens, completionTokens);

// Errors
recordError('VALIDATION_FAILED', '/api/deals');
```

**Scraping config (prometheus.yml):**
```yaml
scrape_configs:
  - job_name: 'cre-bff'
    static_configs:
      - targets: ['localhost:8787']
    metrics_path: '/metrics'
```

### Structured Logging (Winston)

Structured JSON logging for production, readable format for development.

**Configuration:**
```bash
# Log level: debug, info, warn, error
LOG_LEVEL=info

# Optional file logging
LOG_FILE=/var/log/cre-bff/app.log
LOG_ERROR_FILE=/var/log/cre-bff/error.log

# Debug mode
DEBUG_LOGGER=true
```

**Usage:**
```javascript
import { createLogger, logError, logSecurityEvent, logAuditEvent } from './lib/logger.js';

// Component logger
const log = createLogger('my-component');
log.info('Something happened', { dealId, userId });

// Request-scoped logger
const reqLog = log.withRequestId(req.headers['x-request-id']);
reqLog.debug('Processing request');

// User-scoped logger
const userLog = log.withUser(authUser);
userLog.info('User action');

// Security events
logSecurityEvent('INVALID_TOKEN', { ip, userAgent });

// Audit events (compliance)
logAuditEvent('CREATE_DISTRIBUTION', { userId, dealId, amount });

// Error logging
logError(error, { component: 'payments', requestId });
```

**Log format (production - JSON):**
```json
{
  "timestamp": "2026-01-25T12:00:00.000Z",
  "level": "info",
  "message": "HTTP Request",
  "service": "cre-bff",
  "component": "http",
  "method": "GET",
  "path": "/api/deals",
  "statusCode": 200,
  "durationMs": 150
}
```

**Log format (development - readable):**
```
12:00:00.000 info[http]: HTTP Request {"method":"GET","path":"/api/deals"}
```

### Debugging Observability

```bash
# Enable all debug flags
DEBUG_SENTRY=true
DEBUG_METRICS=true
DEBUG_LOGGER=true

# Check metrics endpoint
curl http://localhost:8787/metrics

# View structured logs
LOG_LEVEL=debug npm run bff
```
