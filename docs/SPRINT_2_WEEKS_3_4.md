# Sprint 2: Weeks 3-4 Execution Plan

**Sprint Duration:** Days 11-20 (10 working days)
**Focus:** Idempotency Extension, Observability Validation, Operations Automation, Disaster Recovery Drills
**Estimated Effort:** ~24 hours

---

## Pre-Sprint Checklist

Before starting Sprint 2, verify:

- [ ] Sprint 1 complete (111 tests passing)
- [ ] `docs/STATE_MACHINE_MAPPING.md` exists
- [ ] `docs/SECURITY_INVARIANTS.md` exists
- [ ] Request ID propagation working (`server/kernel.js` modified)
- [ ] All 6 Sprint 1 test suites passing

```bash
# Verify Sprint 1 completion
cd canonical-deal-os
npm test -- --testPathPattern="authority-enforcement|kernel-truth|tenancy-isolation|request-id|audit-logging|ai-redaction"
```

---

## Week 3: Idempotency and Production Hardening (Days 11-15)

### Day 11: Idempotency Schema and Infrastructure

**Goal:** Extend idempotency pattern from `actions.js` to financial operations

**Tasks:**

1. **Add idempotencyKey to Prisma schema**
   - File: `server/prisma/schema.prisma`
   - Add `idempotencyKey String? @unique` to CapitalCall and Distribution models

2. **Create idempotency middleware**
   - File: `server/middleware/idempotency.js`
   - Extract pattern from `server/routes/actions.js` (lines 45-120)
   - Create reusable middleware with configurable TTL (24 hours default)

3. **Run database migration**
   ```bash
   npm run db:push
   ```

**Acceptance Criteria:**
- [ ] Schema updated with idempotencyKey fields
- [ ] Middleware extracted and reusable
- [ ] Database migration applied successfully

**Log Output:** `logs/sprint2/day11-idempotency-schema.log`

---

### Day 12: Idempotency for Capital Calls

**Goal:** Apply idempotency to capital call creation

**Tasks:**

1. **Modify capital-calls.js**
   - File: `server/routes/capital-calls.js`
   - Add `Idempotency-Key` header handling to POST endpoint
   - Store idempotency key with capital call record
   - Return cached response for duplicate requests

2. **Create idempotency tests for capital calls**
   - File: `server/__tests__/idempotency-capital-calls.test.js`
   - Test cases:
     - Duplicate request with same key returns same result
     - Different keys create separate records
     - Expired key allows new creation
     - Missing key still works (optional header)

**Test Command:**
```bash
npm test -- --testPathPattern=idempotency-capital-calls
```

**Acceptance Criteria:**
- [ ] POST /api/deals/:id/capital-calls accepts Idempotency-Key header
- [ ] Duplicate requests return 200 with cached response (not 201)
- [ ] 8+ idempotency tests passing

**Log Output:** `logs/sprint2/day12-idempotency-capital-calls.log`

---

### Day 13: Idempotency for Distributions

**Goal:** Apply idempotency to distribution creation

**Tasks:**

1. **Modify distributions.js**
   - File: `server/routes/distributions.js`
   - Add `Idempotency-Key` header handling to POST endpoint
   - Store idempotency key with distribution record
   - Return cached response for duplicate requests

2. **Create idempotency tests for distributions**
   - File: `server/__tests__/idempotency-distributions.test.js`
   - Test cases:
     - Duplicate distribution request returns cached response
     - Different amounts with same key still returns cached (prevents tampering)
     - Key uniqueness per organization (not global)

**Test Command:**
```bash
npm test -- --testPathPattern=idempotency-distributions
```

**Acceptance Criteria:**
- [ ] POST /api/distributions accepts Idempotency-Key header
- [ ] Duplicate requests return cached response
- [ ] 8+ idempotency tests passing

**Log Output:** `logs/sprint2/day13-idempotency-distributions.log`

---

### Day 14: Observability Infrastructure Validation

**Goal:** Verify existing circuit breaker, retry, and logging infrastructure

**Tasks:**

1. **Validate circuit breaker tests**
   - File: `server/__tests__/circuit-breaker.test.js`
   - Run existing test suite
   - Verify admin endpoint: `GET /api/debug/circuits`

2. **Validate retry logic tests**
   - File: `server/__tests__/retry.test.js`
   - Run existing test suite
   - Verify exponential backoff configuration

3. **Validate structured logging tests**
   - File: `server/__tests__/logger.test.js`
   - Run existing test suite
   - Verify JSON output format in production mode

4. **Create integration validation script**
   - File: `scripts/validate-observability.cjs`
   - Test circuit breaker admin endpoints
   - Test logger produces valid JSON
   - Test retry profiles for all services

**Test Commands:**
```bash
npm test -- --testPathPattern=circuit-breaker
npm test -- --testPathPattern=retry
npm test -- --testPathPattern=logger
node scripts/validate-observability.cjs
```

**Acceptance Criteria:**
- [ ] All circuit breaker tests passing
- [ ] All retry tests passing
- [ ] All logger tests passing
- [ ] Debug endpoints accessible and returning valid data

**Log Output:** `logs/sprint2/day14-observability-validation.log`

---

### Day 15: Error Taxonomy and Metrics

**Goal:** Standardize error codes and validate metrics endpoint

**Tasks:**

1. **Create error taxonomy file**
   - File: `server/lib/errors.js`
   - Define standard error classes:
     - `AuthRequiredError` (401)
     - `ForbiddenRoleError` (403)
     - `ForbiddenOrgError` (403 → 404 for cross-org)
     - `ValidationError` (400)
     - `NotFoundError` (404)
     - `ServiceUnavailableError` (503)

2. **Validate metrics endpoint**
   - Verify `/api/metrics` returns Prometheus format
   - Check counters: `http_requests_total`, `http_errors_total`
   - Check histograms: `http_request_duration_seconds`

3. **Create metrics validation tests**
   - File: `server/__tests__/metrics-validation.test.js`
   - Test Prometheus format compliance
   - Test error code categorization

**Test Command:**
```bash
npm test -- --testPathPattern=metrics
curl http://localhost:8787/api/metrics
```

**Acceptance Criteria:**
- [ ] Error classes created with consistent codes
- [ ] Metrics endpoint returns valid Prometheus format
- [ ] Error taxonomy documented in SECURITY_INVARIANTS.md

**Log Output:** `logs/sprint2/day15-error-taxonomy.log`

---

### Week 3 Checkpoint

**Must Pass (Binary):**
- [ ] Idempotency keys implemented for capital calls (8+ tests)
- [ ] Idempotency keys implemented for distributions (8+ tests)
- [ ] Circuit breaker tests passing (existing suite)
- [ ] Retry tests passing (existing suite)
- [ ] Logger tests passing (existing suite)
- [ ] Metrics endpoint returns valid Prometheus format

**Run Full Week 3 Validation:**
```bash
npm test -- --testPathPattern="idempotency|circuit-breaker|retry|logger|metrics"
```

---

## Week 4: Operations, Backups, and Incident Drill (Days 16-20)

### Day 16: Operations Documentation Review

**Goal:** Verify existing operations docs and identify gaps

**Tasks:**

1. **Review DEPLOYMENT_GUIDE.md**
   - Verify staging deployment procedure accurate
   - Verify production deployment procedure accurate
   - Check health check documentation

2. **Review DEPLOYMENT_CHECKLIST.md**
   - Verify all 18 checklist items current
   - Update any outdated items

3. **Create operations validation script**
   - File: `scripts/validate-operations.cjs`
   - Check all health endpoints accessible
   - Check all debug endpoints accessible
   - Verify Sentry DSN configured (if in prod)

**Commands:**
```bash
node scripts/validate-operations.cjs
node canonical-deal-os/scripts/health.js
```

**Acceptance Criteria:**
- [ ] DEPLOYMENT_GUIDE.md reviewed and current
- [ ] DEPLOYMENT_CHECKLIST.md reviewed and current
- [ ] All health/debug endpoints verified
- [ ] Gap list documented (if any)

**Log Output:** `logs/sprint2/day16-operations-review.log`

---

### Day 17: Backup Automation Scripts

**Goal:** Create automated backup scripts for PostgreSQL and SQLite

**Tasks:**

1. **Create PostgreSQL backup script**
   - File: `scripts/backup-postgres.sh`
   - Timestamped backup filename
   - Gzip compression
   - SHA256 checksum generation
   - Optional S3 upload

2. **Create SQLite backup script**
   - File: `scripts/backup-sqlite.sh`
   - Use SQLite `.backup` command
   - Timestamp and compress

3. **Create backup verification script**
   - File: `scripts/verify-backup-integrity.sh`
   - Validate checksum
   - Test restore to temp database
   - Verify row counts

4. **Create restore scripts**
   - File: `scripts/restore-postgres.sh`
   - File: `scripts/restore-sqlite.sh`
   - Pre-restore backup of current state
   - Restore from specified file
   - Post-restore verification

**Test Commands:**
```bash
bash scripts/backup-postgres.sh
bash scripts/backup-sqlite.sh
bash scripts/verify-backup-integrity.sh backups/latest.sql.gz
```

**Acceptance Criteria:**
- [ ] PostgreSQL backup script creates valid backup
- [ ] SQLite backup script creates valid backup
- [ ] Checksum verification working
- [ ] Restore scripts documented and tested

**Log Output:** `logs/sprint2/day17-backup-scripts.log`

---

### Day 18: Backup Restore Drill

**Goal:** Execute full backup/restore drill and document results

**Tasks:**

1. **Create backup restore drill script**
   - File: `scripts/backup-restore-drill.sh`
   - Steps:
     1. Create backup of current state
     2. Record metrics (deal count, event count, latest event hash)
     3. Drop and recreate database (simulated disaster)
     4. Restore from backup
     5. Verify hash chain integrity
     6. Compare metrics

2. **Execute drill**
   - Run drill script
   - Document time to restore
   - Document any issues

3. **Create drill report**
   - File: `logs/sprint2/backup-restore-drill-report.md`
   - Document RTO achieved vs target (< 1 hour)
   - Document any failures or issues
   - List remediation actions

**Test Command:**
```bash
bash scripts/backup-restore-drill.sh 2>&1 | tee logs/sprint2/backup-restore-drill.log
```

**Acceptance Criteria:**
- [ ] Backup created successfully
- [ ] Database dropped and recreated
- [ ] Restore completed successfully
- [ ] Hash chain integrity verified
- [ ] Metrics match pre-backup state
- [ ] Total time < RTO (1 hour)

**Log Output:** `logs/sprint2/day18-backup-drill.log`

---

### Day 19: Incident Simulation and Response

**Goal:** Execute incident drill simulating Kernel API outage

**Tasks:**

1. **Create incident drill script**
   - File: `scripts/incident-drill.sh`
   - Steps:
     1. T+0: Stop Kernel API
     2. T+2min: Verify circuit breaker opens
     3. T+5min: Attempt deal creation (expect 503)
     4. T+10min: Restart Kernel API
     5. T+12min: Verify circuit breaker closes
     6. T+15min: Retry deal creation (expect success)
     7. T+20min: Generate incident report

2. **Execute drill**
   - Run incident drill script
   - Document timeline
   - Capture logs

3. **Create incident report**
   - File: `logs/sprint2/incident-drill-report.md`
   - Document detection time
   - Document mitigation effectiveness
   - Document recovery time
   - List improvements

**Test Command:**
```bash
bash scripts/incident-drill.sh 2>&1 | tee logs/sprint2/incident-drill.log
```

**Acceptance Criteria:**
- [ ] Kernel API stopped successfully
- [ ] Circuit breaker opened within 2 minutes
- [ ] BFF returned 503 (not 500) during outage
- [ ] Kernel API restarted successfully
- [ ] Circuit breaker closed after recovery
- [ ] Deal creation succeeded after recovery
- [ ] Incident timeline documented

**Log Output:** `logs/sprint2/day19-incident-drill.log`

---

### Day 20: Production Readiness Checklist and Sprint Review

**Goal:** Complete production readiness checklist and final sprint review

**Tasks:**

1. **Create production readiness checklist**
   - File: `docs/PRODUCTION_READINESS_CHECKLIST.md`
   - Categories:
     - Security (SSL, JWT, rate limits, CORS, headers)
     - Monitoring (health checks, metrics, Sentry, alerting)
     - Logging (structured logs, retention, audit backup)
     - Backups (automated, restore verified, RTO < 1 hour)
     - Testing (all tests passing, E2E coverage, negative tests)
     - Documentation (runbooks, API docs, architecture diagrams)
     - Compliance (audit logs immutable, provenance, GDPR)
     - Disaster Recovery (backup drill passed, incident drill passed)
     - Performance (load testing, SLA targets)
     - Dependencies (third-party fallbacks)

2. **Run final Sprint 2 test suite**
   ```bash
   npm test -- --testPathPattern="idempotency|circuit-breaker|retry|logger|metrics"
   ```

3. **Generate Sprint 2 summary**
   - Total new tests created
   - Total scripts created
   - Documentation updated
   - Issues encountered and resolved

4. **Update GTM Readiness Scorecard**
   - Update plan file with Sprint 2 results
   - Mark completed items

**Acceptance Criteria:**
- [ ] Production readiness checklist 100% complete
- [ ] All Sprint 2 tests passing
- [ ] Backup drill report complete
- [ ] Incident drill report complete
- [ ] GTM scorecard updated

**Log Output:** `logs/sprint2/day20-final-review.log`

---

### Week 4 Checkpoint

**Must Pass (Binary):**
- [ ] Operations docs reviewed and current
- [ ] Backup scripts created and tested
- [ ] Backup restore drill passed (RTO < 1 hour)
- [ ] Incident simulation drill passed
- [ ] Production readiness checklist complete

**Run Full Week 4 Validation:**
```bash
bash scripts/backup-postgres.sh
bash scripts/verify-backup-integrity.sh backups/latest.sql.gz
cat logs/sprint2/backup-restore-drill-report.md
cat logs/sprint2/incident-drill-report.md
cat docs/PRODUCTION_READINESS_CHECKLIST.md
```

---

## Sprint 2 Deliverables Summary

### New Files Created

**Middleware:**
- `server/middleware/idempotency.js` - Reusable idempotency middleware

**Tests:**
- `server/__tests__/idempotency-capital-calls.test.js` - Capital call idempotency tests
- `server/__tests__/idempotency-distributions.test.js` - Distribution idempotency tests
- `server/__tests__/metrics-validation.test.js` - Metrics endpoint tests

**Scripts:**
- `scripts/backup-postgres.sh` - PostgreSQL backup automation
- `scripts/backup-sqlite.sh` - SQLite backup automation
- `scripts/restore-postgres.sh` - PostgreSQL restore
- `scripts/restore-sqlite.sh` - SQLite restore
- `scripts/verify-backup-integrity.sh` - Backup verification
- `scripts/backup-restore-drill.sh` - Full backup/restore drill
- `scripts/incident-drill.sh` - Incident simulation drill
- `scripts/validate-observability.cjs` - Observability validation
- `scripts/validate-operations.cjs` - Operations validation

**Documentation:**
- `docs/PRODUCTION_READINESS_CHECKLIST.md` - Go/no-go checklist

**Reports:**
- `logs/sprint2/backup-restore-drill-report.md` - Drill results
- `logs/sprint2/incident-drill-report.md` - Incident drill results

### Schema Changes

```prisma
model CapitalCall {
  // ... existing fields
  idempotencyKey  String?  @unique
}

model Distribution {
  // ... existing fields
  idempotencyKey  String?  @unique
}
```

### Test Count Targets

| Suite | Target Tests |
|-------|-------------|
| idempotency-capital-calls | 8+ |
| idempotency-distributions | 8+ |
| metrics-validation | 5+ |
| **Total New Sprint 2 Tests** | **21+** |

### Combined Sprint 1 + Sprint 2 Tests

| Sprint | Tests |
|--------|-------|
| Sprint 1 | 111 |
| Sprint 2 | 21+ |
| **Total** | **132+** |

---

## GTM Go/No-Go Criteria

After completing Sprint 2, all 5 areas must be marked PASS:

| Area | Criteria | Sprint | Status |
|------|----------|--------|--------|
| **1. Truth Enforcement** | Kernel authority cannot be bypassed | Sprint 1 | ⬜ |
| **2. Tenancy Isolation** | Cross-org access blocked in financial ops | Sprint 1 | ⬜ |
| **3. Audit Logging** | All financial mutations logged with correlation IDs | Sprint 1 | ⬜ |
| **4. Failure Safety** | Idempotency keys + circuit breaker | Sprint 2 | ⬜ |
| **5. Operations** | Backup/restore + incident drill passed | Sprint 2 | ⬜ |

**GTM Decision:**
- **GO:** All 5 areas marked PASS
- **NO-GO:** Any area marked FAIL (requires remediation)

---

## Execution Commands

```bash
# Start Sprint 2
mkdir -p logs/sprint2

# Day 11: Idempotency schema
npm run db:push

# Day 12-13: Idempotency tests
npm test -- --testPathPattern=idempotency

# Day 14: Observability validation
npm test -- --testPathPattern="circuit-breaker|retry|logger"

# Day 15: Metrics
npm test -- --testPathPattern=metrics

# Day 16: Operations review
node scripts/validate-operations.cjs

# Day 17: Backup scripts
bash scripts/backup-postgres.sh

# Day 18: Backup drill
bash scripts/backup-restore-drill.sh

# Day 19: Incident drill
bash scripts/incident-drill.sh

# Day 20: Final review
npm test -- --testPathPattern="idempotency|circuit-breaker|retry|logger|metrics"
```

---

**END OF SPRINT 2 PLAN**
