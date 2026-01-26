# Deal State Machine Mapping

## Overview

This document maps the relationship between the **Kernel** state machine (authoritative source of truth) and the **BFF** state machine (workflow orchestration). The Kernel owns the deal lifecycle for regulatory compliance; the BFF orchestrates day-to-day workflow steps.

**Version:** 1.0
**Last Updated:** 2026-01-26
**Sprint:** 1 - Production Readiness

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          DEAL LIFECYCLE                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    KERNEL (Authoritative)                          │ │
│  │                                                                    │ │
│  │  Draft → UnderReview → Approved → ReadyToClose → Closed            │ │
│  │    │                                               │               │ │
│  │    ├─────────────────────────────────────────────►Operating        │ │
│  │    │                                               │               │ │
│  │    │                                         Changed/Distressed    │ │
│  │    │                                               │               │ │
│  │    └─────────────────────────────────────────────►Exited           │ │
│  │                                                    │               │ │
│  │  [Frozen] <──────── FreezeImposed ─────────────────┘               │ │
│  │                                                                    │ │
│  │  [Terminated] <──── DealTerminated                                 │ │
│  │                                                                    │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                    │                                     │
│                            sync via events                               │
│                                    ▼                                     │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                     BFF (Workflow Orchestration)                   │ │
│  │                                                                    │ │
│  │  INTAKE_RECEIVED → DATA_ROOM_INGESTED → EXTRACTION_COMPLETE        │ │
│  │         │                                        │                 │ │
│  │         ▼                                        ▼                 │ │
│  │  UNDERWRITING_DRAFT → IC_READY → LOI_DRAFT → LOI_SENT              │ │
│  │                                                  │                 │ │
│  │                                                  ▼                 │ │
│  │  LOI_ACCEPTED → PSA_DRAFT → PSA_EXECUTED → DD_ACTIVE               │ │
│  │                                                  │                 │ │
│  │                                                  ▼                 │ │
│  │  DD_COMPLETE → FINANCING_IN_PROGRESS → FINANCING_COMMITTED         │ │
│  │                                                  │                 │ │
│  │                                                  ▼                 │ │
│  │  CLEAR_TO_CLOSE → CLOSED                                           │ │
│  │                                                                    │ │
│  │  [DEAD] [ON_HOLD] ← Terminal/Pause states                          │ │
│  │                                                                    │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Kernel State Machine

### States (12 total)

| State | Description | Terminal |
|-------|-------------|----------|
| `Draft` | Initial state, deal being created | No |
| `UnderReview` | Under IC review | No |
| `Approved` | IC approved | No |
| `ReadyToClose` | Closing readiness attested | No |
| `Closed` | Deal closed | No |
| `Operating` | Post-close operations | No |
| `Changed` | Material change detected | No |
| `Distressed` | Distress declared | No |
| `Resolved` | Distress resolved | No |
| `Frozen` | Regulatory/legal freeze | No |
| `Exited` | Deal exited | Yes |
| `Terminated` | Deal terminated | Yes |

### Events (17 total)

| Event | From State | To State | Description |
|-------|------------|----------|-------------|
| `ReviewOpened` | Draft | UnderReview | Deal submitted for IC review |
| `DealApproved` | UnderReview | Approved | IC approves the deal |
| `ClosingReadinessAttested` | Approved | ReadyToClose | All closing conditions met |
| `ClosingFinalized` | ReadyToClose | Closed | Deal closed |
| `OperationsActivated` | Closed/Resolved | Operating | Post-close ops begin |
| `MaterialChangeDetected` | Operating | Changed | Deviation from plan |
| `ChangeReconciled` | Changed | Operating | Change resolved |
| `DistressDeclared` | Operating/Changed | Distressed | Financial stress |
| `DistressResolved` | Distressed | Resolved | Stress mitigated |
| `FreezeImposed` | Any non-terminal | Frozen | Regulatory freeze |
| `FreezeLifted` | Frozen | Previous | Freeze removed |
| `ExitFinalized` | Operating/Changed | Exited | Deal sold/exited |
| `DealTerminated` | Any | Terminated | Deal killed |
| `DataDisputed` | Any | - | Claim disputed (no state change) |
| `ApprovalGranted` | - | - | Authority approval logged |
| `ApprovalDenied` | - | - | Authority approval denied |
| `OverrideAttested` | - | - | Override with attestation |

### Authority Thresholds

| Transition | Required Authority | Truth Class |
|------------|-------------------|-------------|
| Draft → UnderReview | GP Analyst | HUMAN |
| UnderReview → Approved | GP + Material Docs | DOC |
| Approved → ReadyToClose | GP + Counsel + Lender | DOC |
| ReadyToClose → Closed | GP + All Parties | DOC |
| Any → Frozen | Regulator/Counsel | HUMAN |
| Any → Terminated | GP (override) | HUMAN |

### Truth Classes (DOC > HUMAN > AI)

- **DOC**: Requires uploaded evidence (contracts, executed docs)
- **HUMAN**: Requires explicit human attestation
- **AI**: AI-derived claims, must be verified before promotion

---

## BFF State Machine

### States (18 total)

| State | Description | Maps to Kernel |
|-------|-------------|----------------|
| `INTAKE_RECEIVED` | Deal intake submitted | Draft |
| `DATA_ROOM_INGESTED` | Documents uploaded | Draft |
| `EXTRACTION_COMPLETE` | AI extraction done | Draft |
| `UNDERWRITING_DRAFT` | Model in progress | Draft/UnderReview |
| `IC_READY` | Ready for IC | UnderReview |
| `LOI_DRAFT` | LOI being drafted | UnderReview |
| `LOI_SENT` | LOI sent to seller | UnderReview |
| `LOI_ACCEPTED` | LOI accepted | Approved |
| `PSA_DRAFT` | PSA being drafted | Approved |
| `PSA_EXECUTED` | PSA signed | Approved |
| `DD_ACTIVE` | Due diligence active | Approved |
| `DD_COMPLETE` | DD completed | Approved |
| `FINANCING_IN_PROGRESS` | Financing being arranged | ReadyToClose |
| `FINANCING_COMMITTED` | Financing committed | ReadyToClose |
| `CLEAR_TO_CLOSE` | Ready to close | ReadyToClose |
| `CLOSED` | Deal closed | Closed |
| `DEAD` | Deal killed | Terminated |
| `ON_HOLD` | Deal paused | Frozen |

### Transition Rules

| From State | To States | Required Approvals | Required Docs | Blocker Checks |
|------------|-----------|-------------------|---------------|----------------|
| `INTAKE_RECEIVED` | DATA_ROOM_INGESTED, DEAD | None | None | None |
| `DATA_ROOM_INGESTED` | EXTRACTION_COMPLETE, DEAD, ON_HOLD | None | RENT_ROLL, T12 | hasSourceDocuments |
| `EXTRACTION_COMPLETE` | UNDERWRITING_DRAFT, DEAD, ON_HOLD | ANALYST | None | allClaimsVerified |
| `UNDERWRITING_DRAFT` | IC_READY, DEAD, ON_HOLD | ANALYST, SENIOR_ANALYST | None | noOpenConflicts, hasUnderwritingModel |
| `IC_READY` | LOI_DRAFT, DEAD, ON_HOLD | GP | IC_MEMO | hasICMemo |
| `LOI_DRAFT` | LOI_SENT, DEAD, ON_HOLD | GP | LOI | None |
| `LOI_SENT` | LOI_ACCEPTED, DEAD, ON_HOLD | None | None | None |
| `LOI_ACCEPTED` | PSA_DRAFT, DEAD, ON_HOLD | None | None | None |
| `PSA_DRAFT` | PSA_EXECUTED, DEAD, ON_HOLD | GP, COUNSEL | PSA | None |
| `PSA_EXECUTED` | DD_ACTIVE, DEAD | None | None | hasPSAExecuted |
| `DD_ACTIVE` | DD_COMPLETE, DEAD | None | DD_LIST | None |
| `DD_COMPLETE` | FINANCING_IN_PROGRESS, DEAD | VP | None | ddItemsComplete |
| `FINANCING_IN_PROGRESS` | FINANCING_COMMITTED, DEAD | None | None | None |
| `FINANCING_COMMITTED` | CLEAR_TO_CLOSE, DEAD | GP, LENDER, COUNSEL | CLOSING_STATEMENT | hasLoanCommitment |
| `CLEAR_TO_CLOSE` | CLOSED | GP, LENDER | WIRE_CONFIRMATION | allClosingDocsReady |
| `CLOSED` | None | - | - | - |
| `DEAD` | None | - | - | - |
| `ON_HOLD` | Previous states, DEAD | VP | None | None |

---

## State Synchronization

### BFF → Kernel Event Mapping

When BFF transitions occur, corresponding Kernel events should be emitted:

| BFF Transition | Kernel Event | Notes |
|----------------|--------------|-------|
| → IC_READY | ReviewOpened | Submits for IC review |
| → LOI_ACCEPTED | DealApproved | IC approved |
| → PSA_EXECUTED | ClosingReadinessAttested | PSA binds parties |
| → CLOSED | ClosingFinalized | Final closing |
| → DEAD | DealTerminated | Deal killed |
| → ON_HOLD | FreezeImposed | Deal paused |
| ON_HOLD → * | FreezeLifted | Resume from hold |

### Event Chain Integrity

Both systems maintain SHA-256 hash chains for audit integrity:

```javascript
// Kernel hash calculation
hash = SHA256(JSON.stringify({
  dealId,
  sequenceNumber,
  eventType,
  payload,
  previousHash,
  timestamp
}))

// BFF hash calculation (identical algorithm)
eventHash = crypto.createHash('sha256')
  .update(JSON.stringify({
    dealId, sequenceNumber, eventType,
    eventData, previousHash: previousHash || null,
    timestamp: new Date().toISOString()
  }))
  .digest('hex');
```

---

## Invariants

### Security Invariants

1. **Tenancy Isolation**: Users can only access deals in their organization
2. **Authority Enforcement**: State transitions require specified approvals
3. **Hash Chain Integrity**: Event chains must be verifiable
4. **Kernel Supremacy**: BFF state must not contradict Kernel state

### Operational Invariants

1. **No Backward Transitions**: States flow forward (except from ON_HOLD)
2. **Document Requirements**: Required docs must exist before transition
3. **Claim Verification**: AI claims must be verified before UNDERWRITING_DRAFT
4. **Approval Tracking**: All approvals logged with actor identity

---

## Validation Queries

### Verify State Consistency

```sql
-- Find deals where BFF state doesn't match expected Kernel state
SELECT
  d.id as deal_id,
  ds.currentState as bff_state,
  k.state as kernel_state
FROM Deal d
JOIN DealState ds ON d.id = ds.dealId
JOIN kernel.deals k ON d.kernelDealId = k.id
WHERE (
  (ds.currentState = 'CLOSED' AND k.state != 'Closed')
  OR (ds.currentState = 'DEAD' AND k.state != 'Terminated')
  OR (ds.currentState = 'ON_HOLD' AND k.state != 'Frozen')
);
```

### Verify Event Chain Integrity

```sql
-- Find broken hash chains
SELECT
  e1.id,
  e1.sequenceNumber,
  e1.previousEventHash,
  e2.eventHash as expected_previous_hash
FROM DealEvent e1
LEFT JOIN DealEvent e2 ON e1.dealId = e2.dealId
  AND e2.sequenceNumber = e1.sequenceNumber - 1
WHERE e1.sequenceNumber > 1
  AND e1.previousEventHash != e2.eventHash;
```

---

## Files Reference

| File | Purpose |
|------|---------|
| `cre-kernel-phase1/packages/shared/src/index.ts` | Kernel state/event types |
| `cre-kernel-phase1/apps/kernel-api/src/projection.ts` | Kernel state machine logic |
| `canonical-deal-os/server/services/deal-state-machine.js` | BFF state machine |
| `canonical-deal-os/server/routes/deal-state.js` | BFF state API endpoints |

---

## Testing Requirements

1. **Unit Tests**: Each state transition must be tested
2. **Integration Tests**: BFF → Kernel sync verified
3. **Invariant Tests**: Security invariants enforced
4. **Chain Integrity**: Hash chain verification automated

See `canonical-deal-os/server/__tests__/` for implementation.
