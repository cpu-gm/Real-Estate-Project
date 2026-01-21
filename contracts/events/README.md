# Kernel Event Schemas

This document describes the event types and structure used by the Kernel event ledger.

## Event Envelope Structure

Every kernel event follows this structure:

```javascript
{
  // Identity
  id: string,                    // UUID
  dealId: string,                // UUID of parent deal

  // Event content
  type: string,                  // Event type (see list below)
  actorId: string?,              // UUID of actor who triggered event
  payload: object,               // Event-specific data
  authorityContext: object,      // Rules that permitted this event
  evidenceRefs: string[],        // Artifact IDs supporting this event

  // Hash chain (immutable audit trail)
  sequenceNumber: number,        // Monotonic counter within deal
  previousEventHash: string?,    // SHA-256 of previous event
  eventHash: string?,            // SHA-256 of this event

  // Metadata
  createdAt: string              // ISO timestamp
}
```

## Event Types

Defined in: `cre-kernel-phase1/packages/shared/src/index.ts`

### Lifecycle Events

| Event Type | Description | State Transition |
|------------|-------------|------------------|
| `ReviewOpened` | Deal submitted for review | Draft → UnderReview |
| `DealApproved` | GP approves deal | UnderReview → Approved |
| `ClosingReadinessAttested` | Ready to close attestation | Approved → ReadyToClose |
| `ClosingFinalized` | Closing completed | ReadyToClose → Closed |
| `OperationsActivated` | Operations begin | Closed → Operating |
| `ExitFinalized` | Deal exited | Any → Exited |
| `DealTerminated` | Deal terminated | Any → Terminated |

### Change Events

| Event Type | Description | State Transition |
|------------|-------------|------------------|
| `MaterialChangeDetected` | Material change flagged | Operating → Changed |
| `ChangeReconciled` | Change resolved | Changed → Operating |

### Distress Events

| Event Type | Description | Effect |
|------------|-------------|--------|
| `DistressDeclared` | Distress situation | Sets SM-2 stress mode |
| `DistressResolved` | Distress resolved | Clears stress mode |
| `FreezeImposed` | Court/regulator freeze | Sets SM-3 stress mode |
| `FreezeLifted` | Freeze removed | Clears SM-3 |

### Approval Events

| Event Type | Description |
|------------|-------------|
| `ApprovalGranted` | Actor approves an action |
| `ApprovalDenied` | Actor denies an action |
| `OverrideAttested` | Override of normal rules |
| `DataDisputed` | Data accuracy disputed |

## Gated Events

These events require authority validation before creation:

```javascript
const gateEventTypes = [
  "DealApproved",
  "ClosingReadinessAttested",
  "ClosingFinalized",
  "OperationsActivated",
  "DistressResolved"
];
```

For gated events, the kernel validates:
1. **Authority rules** - Actor has required role
2. **Approval threshold** - Enough approvals collected
3. **Material requirements** - Required materials exist at sufficient truth level

## Example Events

### ReviewOpened

```json
{
  "type": "ReviewOpened",
  "actorId": "550e8400-e29b-41d4-a716-446655440001",
  "payload": {
    "reason": "Initial deal submission"
  },
  "authorityContext": {
    "role": "GP"
  },
  "evidenceRefs": []
}
```

### DealApproved

```json
{
  "type": "DealApproved",
  "actorId": "550e8400-e29b-41d4-a716-446655440001",
  "payload": {
    "approvalNotes": "All underwriting materials verified"
  },
  "authorityContext": {
    "role": "GP",
    "overrideReason": null
  },
  "evidenceRefs": ["artifact-uuid-1", "artifact-uuid-2"]
}
```

### ApprovalGranted

```json
{
  "type": "ApprovalGranted",
  "actorId": "550e8400-e29b-41d4-a716-446655440002",
  "payload": {
    "action": "FINALIZE_CLOSING",
    "comment": "All documents reviewed and approved"
  },
  "authorityContext": {
    "role": "LENDER"
  },
  "evidenceRefs": ["wire-confirmation-artifact-id"]
}
```

## Hash Chain Verification

The kernel maintains an immutable hash chain:

```
Event 1: hash = SHA256(dealId + seq:1 + type + payload + null)
Event 2: hash = SHA256(dealId + seq:2 + type + payload + Event1.hash)
Event 3: hash = SHA256(dealId + seq:3 + type + payload + Event2.hash)
```

To verify integrity:

```bash
GET /deals/:dealId/events/verify
```

Returns:
```json
{
  "valid": true,
  "issues": [],
  "eventsChecked": 42,
  "chainIntact": true
}
```

## Related Files

- **Type definitions:** `cre-kernel-phase1/packages/shared/src/index.ts`
- **Event creation:** `cre-kernel-phase1/apps/kernel-api/src/audit.ts`
- **State machine:** `cre-kernel-phase1/apps/kernel-api/src/projection.ts`
- **Example fixtures:** `/fixtures/events/`
