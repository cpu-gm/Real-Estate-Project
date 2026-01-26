# Security Invariants

## Overview

This document defines the security invariants that MUST hold true at all times in the CRE Deal Management Platform. These invariants are enforced through code, tested automatically, and audited regularly.

**Version:** 1.0
**Last Updated:** 2026-01-26
**Sprint:** 1 - Production Readiness
**Classification:** Internal Security Document

---

## Table of Contents

1. [Tenancy Isolation](#1-tenancy-isolation)
2. [Authority Enforcement](#2-authority-enforcement)
3. [Data Integrity](#3-data-integrity)
4. [Authentication & Session](#4-authentication--session)
5. [Audit Completeness](#5-audit-completeness)
6. [AI Boundary Control](#6-ai-boundary-control)
7. [Threat Model](#7-threat-model)

---

## 1. Tenancy Isolation

### Invariant

> **Users from Organization A MUST NEVER access resources belonging to Organization B.**

### Implementation

All database queries MUST include `organizationId` filtering:

```javascript
// CORRECT: Always filter by organization
const deals = await prisma.deal.findMany({
  where: {
    organizationId: authUser.organizationId,  // Required
    status: 'ACTIVE'
  }
});

// WRONG: Missing organization filter - SECURITY VIOLATION
const deals = await prisma.deal.findMany({
  where: { status: 'ACTIVE' }
});
```

### Error Response

Cross-organization access attempts MUST return `404 Not Found`, NOT `403 Forbidden`:

```javascript
// CORRECT: Return 404 to prevent enumeration
if (deal.organizationId !== authUser.organizationId) {
  return res.status(404).json({ error: 'Deal not found' });
}

// WRONG: 403 reveals resource existence
if (deal.organizationId !== authUser.organizationId) {
  return res.status(403).json({ error: 'Access denied' });  // VIOLATION
}
```

### Testing

- File: `server/__tests__/tenancy-isolation.test.js`
- Tests: 21 assertions covering deals, documents, users
- Run: `npm test -- --testPathPatterns=tenancy-isolation`

### Audit Events

Cross-organization access attempts are logged:

```javascript
await logSecurityEvent('CROSS_ORG_ACCESS_ATTEMPT', {
  resourceType: 'deal',
  resourceId: dealId,
  requestingUserId: authUser.id,
  requestingOrgId: authUser.organizationId,
  resourceOrgId: deal.organizationId
});
```

---

## 2. Authority Enforcement

### Invariant

> **State transitions and privileged actions require explicit authority approval matching defined thresholds.**

### Truth Class Hierarchy

```
DOC > HUMAN > AI

DOC   = Uploaded document evidence (contracts, executed docs)
HUMAN = Explicit human attestation
AI    = AI-derived claims (must be promoted before use)
```

### Authority Rules

| Action | Required Approvals | Material Requirements |
|--------|-------------------|----------------------|
| `OPEN_REVIEW` | 1 GP | None |
| `APPROVE_DEAL` | 2 GP | UnderwritingSummary (HUMAN) |
| `ATTEST_READY_TO_CLOSE` | 2 GP | FinalUnderwriting (DOC), SourcesAndUses (DOC) |
| `FINALIZE_CLOSING` | 1 GP | WireConfirmation (DOC), EntityFormationDocs (DOC) |
| `IMPOSE_FREEZE` | 1 Regulator/Counsel/GP | None |
| `LIFT_FREEZE` | 1 Regulator/Counsel | None |

### Implementation

```javascript
// Authority check before action
function checkAuthority(action, approvals, materials) {
  const rule = AUTHORITY_RULES[action];

  // 1. Check approval threshold
  const validApprovals = approvals.filter(a => rule.rolesAllowed.includes(a.role));
  if (validApprovals.length < rule.threshold) {
    throw new AuthorityError('Insufficient approvals');
  }

  // 2. Check material requirements
  for (const req of rule.materials) {
    const material = materials.find(m => m.type === req.type);
    if (!material || !isTruthSufficient(material.truthClass, req.requiredTruth)) {
      throw new AuthorityError(`Missing or insufficient ${req.type}`);
    }
  }

  return true;
}
```

### Testing

- File: `server/__tests__/authority-enforcement.test.js`
- Tests: 18 assertions covering roles, truth classes, materials
- Run: `npm test -- --testPathPatterns=authority-enforcement`

---

## 3. Data Integrity

### Invariant

> **All deal events form an immutable, verifiable hash chain.**

### Hash Chain Structure

```javascript
eventHash = SHA256(JSON.stringify({
  dealId,
  sequenceNumber,
  eventType,
  eventData,
  previousHash: previousEvent?.eventHash || null,
  timestamp: new Date().toISOString()
}));
```

### Verification

```javascript
async function verifyEventChain(dealId) {
  const events = await prisma.dealEvent.findMany({
    where: { dealId },
    orderBy: { sequenceNumber: 'asc' }
  });

  for (let i = 1; i < events.length; i++) {
    if (events[i].previousEventHash !== events[i-1].eventHash) {
      return { valid: false, brokenAt: i };
    }
  }

  return { valid: true };
}
```

### Kernel Authority

> **Kernel is the single source of truth. BFF state MUST NOT contradict Kernel state.**

State mapping enforcement:
- BFF `CLOSED` → Kernel `Closed`
- BFF `DEAD` → Kernel `Terminated`
- BFF `ON_HOLD` → Kernel `Frozen`

### Testing

- File: `server/__tests__/kernel-truth-invariants.test.js`
- Tests: 15 assertions covering state sync, hash chain, consistency
- Run: `npm test -- --testPathPatterns=kernel-truth-invariants`

---

## 4. Authentication & Session

### Invariant

> **All API requests MUST be authenticated. Identity MUST come from JWT claims, NEVER from spoofable headers.**

### Implementation

```javascript
// CORRECT: Use validated JWT claims
const authUser = await extractAuthUser(req);  // From JWT
const userId = authUser.id;
const orgId = authUser.organizationId;

// WRONG: Trusting request headers - SECURITY VIOLATION
const userId = req.headers['x-user-id'];  // Spoofable!
const orgId = req.headers['x-org-id'];    // Spoofable!
```

### Session Security

- JWT tokens expire after 24 hours
- Refresh tokens stored server-side
- Session invalidation on password change
- Rate limiting on auth endpoints (5 req/min)

### Middleware Chain

```javascript
// Required order
app.use(rateLimiter);
app.use(corsMiddleware);
app.use(authMiddleware);
app.use(orgIsolationMiddleware);
app.use(requestLogger);
```

---

## 5. Audit Completeness

### Invariant

> **All security-relevant actions MUST be logged to the audit trail.**

### Auditable Actions

| Category | Actions |
|----------|---------|
| Authentication | login, logout, password_change, session_invalidation |
| Authorization | role_grant, role_revoke, permission_check_failed |
| Data Access | deal_view, document_download, report_export |
| State Changes | deal_transition, approval_granted, approval_denied |
| Financial | capital_call_issued, distribution_processed |
| Security | cross_org_attempt, rate_limit_hit, auth_failure |

### Audit Log Schema

```javascript
{
  id: uuid,
  timestamp: datetime,
  actorId: uuid,
  actorName: string,
  actorRole: string,
  action: string,
  resourceType: string,
  resourceId: uuid,
  organizationId: uuid,
  beforeValue: json,
  afterValue: json,
  requestId: string,      // For correlation
  ipAddress: string,
  userAgent: string,
  outcome: 'SUCCESS' | 'FAILURE' | 'BLOCKED'
}
```

### Retention

- Audit logs retained for 7 years (regulatory requirement)
- Read-only after creation
- Integrity verified via hash chain

### Testing

Audit logging is verified in integration tests:

```javascript
test('financial action creates audit log', async () => {
  const beforeTime = new Date();

  await processCapitalCall(dealId, amount, authUser);

  const log = await prisma.permissionAuditLog.findFirst({
    where: {
      actorId: authUser.id,
      action: 'CAPITAL_CALL_ISSUED',
      createdAt: { gte: beforeTime }
    }
  });

  expect(log).toBeDefined();
  expect(log.afterValue).toContain(amount);
});
```

---

## 6. AI Boundary Control

### Invariant

> **AI-generated content MUST be clearly labeled and CANNOT directly modify authoritative data without human approval.**

### Truth Class Boundaries

```
AI Claims:
- Can be created by extraction pipelines
- Stored with truthClass: 'AI'
- Displayed with "[AI]" badge in UI
- Cannot satisfy DOC or HUMAN requirements

Promotion Path:
AI → HUMAN: Human reviews and attests
HUMAN → DOC: Document evidence uploaded
```

### AI Redaction

Sensitive fields are redacted from AI context:

```javascript
const REDACTED_FIELDS = [
  'ssn',
  'taxId',
  'bankAccount',
  'routingNumber',
  'password',
  'apiKey',
  'secretKey'
];

function prepareForAI(data) {
  return redactFields(data, REDACTED_FIELDS);
}
```

### Implementation

```javascript
// AI extraction creates claim with AI truthClass
const claim = await prisma.extractionClaim.create({
  data: {
    dealId,
    field: 'purchasePrice',
    value: extractedValue,
    truthClass: 'AI',           // Cannot be DOC or HUMAN
    sourceDocument: documentId,
    confidence: 0.92
  }
});

// Human promotion
async function promoteClaim(claimId, userId) {
  await prisma.extractionClaim.update({
    where: { id: claimId },
    data: {
      truthClass: 'HUMAN',
      promotedBy: userId,
      promotedAt: new Date()
    }
  });

  await auditLog('CLAIM_PROMOTED', { claimId, from: 'AI', to: 'HUMAN' });
}
```

---

## 7. Threat Model

### STRIDE Analysis

| Threat | Mitigation |
|--------|------------|
| **S**poofing | JWT-based auth, no header trust |
| **T**ampering | Hash chains, input validation, CSRF tokens |
| **R**epudiation | Comprehensive audit logging |
| **I**nformation Disclosure | 404 not 403, error message scrubbing |
| **D**enial of Service | Rate limiting, circuit breakers |
| **E**levation of Privilege | RBAC, org isolation, least privilege |

### Attack Surfaces

| Surface | Protection |
|---------|------------|
| Public API | Rate limiting, auth required, input validation |
| File Upload | Type checking, size limits, virus scan |
| Database | Parameterized queries, ORM enforcement |
| External APIs | Circuit breakers, timeouts, retries |
| Email/SMS | Template escaping, rate limits |

### Security Headers

```javascript
// Required on all responses
{
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Content-Security-Policy': "default-src 'self'",
  'Referrer-Policy': 'strict-origin-when-cross-origin'
}
```

---

## Validation Checklist

Before deploying any changes, verify:

- [ ] All new endpoints use `requireAuth` or `requireGP` middleware
- [ ] All database queries include `organizationId` filter
- [ ] Cross-org access returns 404, not 403
- [ ] Financial mutations have audit logging
- [ ] AI-generated content has truthClass 'AI'
- [ ] Request ID is propagated to all downstream services
- [ ] Error messages don't leak sensitive information
- [ ] New routes added to rate limiting configuration

---

## Test Commands

Run all security tests:

```bash
cd canonical-deal-os

# Individual test suites
npm test -- --testPathPatterns=tenancy-isolation
npm test -- --testPathPatterns=authority-enforcement
npm test -- --testPathPatterns=kernel-truth-invariants
npm test -- --testPathPatterns=request-id-propagation

# All Sprint 1 security tests
npm test -- --testPathPatterns="tenancy-isolation|authority-enforcement|kernel-truth-invariants|request-id-propagation"
```

---

## References

- [SECURITY_GUIDELINES.md](../canonical-deal-os/SECURITY_GUIDELINES.md) - Implementation patterns
- [STATE_MACHINE_MAPPING.md](./STATE_MACHINE_MAPPING.md) - State transition rules
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Development workflow
