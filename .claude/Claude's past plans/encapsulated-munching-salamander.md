# CRE OS: Dual-UI + Traceability Kernel Implementation Plan

## The Vision
CRE OS is the **end-to-end operating system for the entire real estate ecosystem** — transactions, capital markets, asset management, money movement, securitization, compliance, analytics, modeling, legal, tax, accounting, and investor reporting.

This works because of one core innovation: **document ⇄ data ⇄ workflow traceability**.

Whether a workflow is:
- **Built natively** in CRE OS
- **Connected via API** from external systems (Yardi, Argus, CoStar, banks, servicers, legal platforms)
- **Executed by humans** or **AI agents**

...every number, claim, approval, and payment is traceable to source evidence, policy checks, and versioned decision history.

## Why Traceability Enables the One-Stop-Shop

| Without Traceability | With Traceability |
|---------------------|-------------------|
| External data is a black box | External data is anchored to evidence and logged as events |
| API integrations create liability | API integrations become first-class auditable actors |
| "Trust us" is the only answer | "Verify it yourself" is always possible |
| Fragmented systems, fragmented trust | One system of record, universal trust |

**The traceability kernel is what makes CRE OS defensible as the industry hub.** Without it, you're just another aggregator. With it, you're the legal record of everything that happened.

## Guiding Principle
**Traceability is the product.** UI, AI agents, workflows, and APIs are views and executors layered on top of an immutable traceability kernel.

## Validation Rule (The Regulator Reconstruction Test)
> Given only the regulator UI and exported data, can an auditor recreate every material decision, verification, and transaction without ambiguity?

Any component that fails this test must be redesigned at the traceability or API layer—not patched in the UI.

---

## Scope: Full Real Estate Lifecycle

The traceability kernel must support events from the entire ecosystem:

| Domain | Example Events | Example External Systems |
|--------|---------------|-------------------------|
| **Transactions** | Offer submitted, contract signed, closing completed | DocuSign, title companies |
| **Capital Markets** | Deal structured, tranche priced, syndication closed | Bloomberg, pricing services |
| **Asset Management** | Lease signed, rent collected, expense paid | Yardi, MRI, AppFolio |
| **Money Movement** | Distribution calculated, wire initiated, payment settled | Banks, payment processors |
| **Securitization** | Pool formed, rating assigned, bond issued | Rating agencies, trustees |
| **Compliance** | Policy evaluated, exception flagged, attestation signed | Compliance vendors |
| **Analytics** | Valuation updated, DSCR calculated, forecast generated | Argus, CoStar |
| **Modeling** | Waterfall run, scenario analyzed, sensitivity tested | Excel models, proprietary tools |
| **Legal** | Document drafted, reviewed, executed | Legal platforms, e-signature |
| **Tax** | Depreciation calculated, K-1 generated, filing prepared | Tax software |
| **Accounting** | Journal entry posted, trial balance generated | QuickBooks, NetSuite |
| **Investor Reporting** | Report generated, portal updated, distribution notice sent | Portal systems |

Every event from every domain flows through the traceability kernel and appears in the regulator timeline.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SHARED BACKEND                               │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                   TRACEABILITY KERNEL                            │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐ │ │
│  │  │ Event Ledger │ │  Evidence    │ │ Policy Evaluation        │ │ │
│  │  │ (append-only)│ │  Objects     │ │ Records                  │ │ │
│  │  └──────────────┘ └──────────────┘ └──────────────────────────┘ │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐ │ │
│  │  │ Actor        │ │  Version     │ │ Attestation & Permission │ │ │
│  │  │ Registry     │ │  Snapshots   │ │ Framework                │ │ │
│  │  └──────────────┘ └──────────────┘ └──────────────────────────┘ │ │
│  │  ┌──────────────────────────────────────────────────────────┐   │ │
│  │  │              SHA-256 HASH CHAIN                           │   │ │
│  │  └──────────────────────────────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                      API CONTRACTS                               │ │
│  │  Every call: emits event → declares actor → is replayable       │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
           │                                        │
           ▼                                        ▼
┌─────────────────────────┐            ┌─────────────────────────┐
│   REGULATOR PLATFORM    │            │  PROFESSIONAL PLATFORM  │
│   (Separate App)        │            │  (Separate App)         │
│                         │            │                         │
│  - Read-only by default │            │  - Task-driven UX       │
│  - Verification Ledger  │            │  - AI agents (active)   │
│  - Timeline view        │            │  - Execution workflows  │
│  - Compliance export    │            │  - Hidden compliance    │
│  - AI: explain only     │            │  - Speed optimized      │
└─────────────────────────┘            └─────────────────────────┘
```

---

## PHASE 0: Traceability Kernel (No UI)

### 0.1 Event Ledger Schema
Create an append-only, hash-chained event table that serves as the single source of truth.

**File:** `backend/src/config/migrations/001_event_ledger.sql`

```sql
CREATE TABLE event_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_num BIGSERIAL UNIQUE NOT NULL,

  -- Event identity
  event_type VARCHAR(100) NOT NULL,
  event_category VARCHAR(50) NOT NULL, -- 'evidence', 'verification', 'transaction', 'workflow', 'system'

  -- Actor (who/what caused this)
  actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('human', 'ai_agent', 'system', 'api_client')),
  actor_id UUID, -- references users, ai_agents, or api_keys
  actor_name TEXT NOT NULL,
  actor_context JSONB, -- session info, IP, agent config, etc.

  -- Target (what was affected)
  target_type VARCHAR(100), -- 'deal', 'capital_class', 'payment_event', etc.
  target_id UUID,

  -- Event data
  payload JSONB NOT NULL,
  intent TEXT, -- human-readable description of why this happened

  -- Evidence linkage
  evidence_refs UUID[], -- references to evidence_artifacts
  policy_refs UUID[], -- references to policies that were evaluated

  -- Hash chain
  prev_hash TEXT NOT NULL,
  event_hash TEXT NOT NULL,

  -- Timestamps
  occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Immutability constraint
  CONSTRAINT no_updates CHECK (TRUE) -- enforced via triggers
);

CREATE INDEX idx_event_ledger_type ON event_ledger(event_type);
CREATE INDEX idx_event_ledger_target ON event_ledger(target_type, target_id);
CREATE INDEX idx_event_ledger_actor ON event_ledger(actor_type, actor_id);
CREATE INDEX idx_event_ledger_occurred ON event_ledger(occurred_at DESC);

-- Prevent updates/deletes
CREATE OR REPLACE FUNCTION prevent_ledger_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Event ledger is immutable. Updates and deletes are not allowed.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_ledger_immutability
BEFORE UPDATE OR DELETE ON event_ledger
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_modification();
```

### 0.2 Actor Registry
Define all actors that can create events.

**File:** `backend/src/config/migrations/002_actor_registry.sql`

```sql
CREATE TABLE actor_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('human', 'ai_agent', 'system', 'api_client')),
  name TEXT NOT NULL,

  -- For humans: references users table
  user_id UUID REFERENCES users(id),

  -- For AI agents
  agent_config JSONB, -- model, temperature, system prompt hash, etc.
  agent_capabilities TEXT[], -- what actions this agent can perform

  -- For API clients
  api_key_hash TEXT,
  api_permissions TEXT[],

  -- For system processes
  system_process_name TEXT,

  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deactivated_at TIMESTAMP
);

-- AI Agent definitions
CREATE TABLE ai_agent_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,

  -- Capabilities
  can_execute_actions BOOLEAN DEFAULT FALSE,
  can_make_recommendations BOOLEAN DEFAULT FALSE,
  allowed_action_types TEXT[],

  -- Context restrictions
  allowed_in_professional_ui BOOLEAN DEFAULT TRUE,
  allowed_in_regulator_ui BOOLEAN DEFAULT TRUE,

  -- Configuration
  model_id TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  system_prompt_hash TEXT NOT NULL,
  temperature NUMERIC(3,2) DEFAULT 0.7,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 0.3 Evidence Object Model Enhancement
Extend current evidence tables with hash verification.

**File:** `backend/src/config/migrations/003_evidence_enhanced.sql`

```sql
ALTER TABLE evidence_artifacts
  ADD COLUMN IF NOT EXISTS content_hash TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS hash_algorithm VARCHAR(20) DEFAULT 'sha256',
  ADD COLUMN IF NOT EXISTS extraction_metadata JSONB,
  ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS frozen_by UUID REFERENCES users(id);

-- Evidence extraction records (what data was pulled from evidence)
CREATE TABLE evidence_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id UUID NOT NULL REFERENCES evidence_artifacts(id),

  -- What was extracted
  extraction_type VARCHAR(50) NOT NULL, -- 'field_value', 'table_data', 'text_range'
  extracted_value JSONB NOT NULL,
  confidence NUMERIC(4,3) DEFAULT 1.0,

  -- Where in the document
  location_selector JSONB, -- page, coordinates, cell references, etc.
  highlighted_text TEXT,

  -- Verification
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMP,
  verification_method VARCHAR(50), -- 'human_review', 'ai_extraction', 'ocr', 'api_import'

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(id)
);
```

### 0.4 Policy Evaluation Records
Track every policy check and its outcome.

**File:** `backend/src/config/migrations/004_policy_evaluation.sql`

```sql
CREATE TABLE policy_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What was evaluated
  target_type VARCHAR(100) NOT NULL,
  target_id UUID NOT NULL,

  -- Policy reference
  policy_id UUID REFERENCES evidence_policies(id),
  policy_rule_snapshot JSONB NOT NULL, -- frozen copy of rule at evaluation time

  -- Inputs
  input_values JSONB NOT NULL,
  input_evidence_refs UUID[],

  -- Outcome
  result VARCHAR(20) NOT NULL CHECK (result IN ('pass', 'fail', 'warning', 'not_applicable', 'pending')),
  result_reason TEXT,
  result_details JSONB,

  -- Actor
  evaluated_by_type VARCHAR(20) NOT NULL, -- 'human', 'ai_agent', 'system'
  evaluated_by_id UUID,

  -- Timing
  evaluated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Linkage to event ledger
  event_id UUID REFERENCES event_ledger(id)
);
```

### 0.5 Version Snapshot Enhancement
Freeze state at any point for reconstruction.

**File:** `backend/src/config/migrations/005_version_snapshots_enhanced.sql`

```sql
ALTER TABLE version_snapshots
  ADD COLUMN IF NOT EXISTS snapshot_hash TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS is_sealed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sealed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS sealed_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS event_sequence_at BIGINT; -- last event_ledger.sequence_num included

-- Attestations (formal sign-offs)
CREATE TABLE attestations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What is being attested
  attestation_type VARCHAR(50) NOT NULL, -- 'snapshot_approval', 'compliance_certification', 'evidence_verification'
  target_type VARCHAR(100) NOT NULL,
  target_id UUID NOT NULL,

  -- Who is attesting
  attested_by UUID NOT NULL REFERENCES users(id),
  attested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- What they're attesting to
  statement TEXT NOT NULL,
  scope JSONB, -- what specific aspects are covered

  -- Cryptographic signature
  signature_data JSONB, -- public key, signature, algorithm

  -- Linkage
  snapshot_id UUID REFERENCES version_snapshots(id),
  event_id UUID REFERENCES event_ledger(id)
);
```

### 0.6 Event Ledger Service
Core service for creating hash-chained events.

**File:** `backend/src/services/eventLedgerService.js`

```javascript
const crypto = require('crypto');
const pool = require('../config/db');

class EventLedgerService {
  /**
   * Record an event to the immutable ledger
   * Every action in the system flows through this function
   */
  static async recordEvent({
    eventType,
    eventCategory,
    actorType,
    actorId,
    actorName,
    actorContext = {},
    targetType = null,
    targetId = null,
    payload,
    intent,
    evidenceRefs = [],
    policyRefs = [],
    client = null
  }) {
    const useClient = client || pool;

    // Get previous hash
    const prevResult = await useClient.query(
      `SELECT event_hash FROM event_ledger ORDER BY sequence_num DESC LIMIT 1`
    );
    const prevHash = prevResult.rows[0]?.event_hash || 'GENESIS';

    // Create event hash
    const eventData = {
      eventType,
      eventCategory,
      actorType,
      actorId,
      actorName,
      targetType,
      targetId,
      payload,
      intent,
      prevHash,
      timestamp: new Date().toISOString()
    };
    const eventHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(eventData))
      .digest('hex');

    // Insert event
    const result = await useClient.query(
      `INSERT INTO event_ledger (
        event_type, event_category,
        actor_type, actor_id, actor_name, actor_context,
        target_type, target_id,
        payload, intent,
        evidence_refs, policy_refs,
        prev_hash, event_hash
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        eventType, eventCategory,
        actorType, actorId, actorName, JSON.stringify(actorContext),
        targetType, targetId,
        JSON.stringify(payload), intent,
        evidenceRefs, policyRefs,
        prevHash, eventHash
      ]
    );

    return result.rows[0];
  }

  /**
   * Verify hash chain integrity
   */
  static async verifyChain(fromSequence = 1, toSequence = null) {
    const query = toSequence
      ? `SELECT * FROM event_ledger WHERE sequence_num >= $1 AND sequence_num <= $2 ORDER BY sequence_num`
      : `SELECT * FROM event_ledger WHERE sequence_num >= $1 ORDER BY sequence_num`;

    const result = await pool.query(query, toSequence ? [fromSequence, toSequence] : [fromSequence]);

    let prevHash = 'GENESIS';
    const issues = [];

    for (const event of result.rows) {
      if (event.sequence_num > 1 && event.prev_hash !== prevHash) {
        issues.push({
          sequenceNum: event.sequence_num,
          expected: prevHash,
          actual: event.prev_hash,
          type: 'broken_chain'
        });
      }
      prevHash = event.event_hash;
    }

    return {
      verified: issues.length === 0,
      eventsChecked: result.rows.length,
      issues
    };
  }

  /**
   * Reconstruct state at a specific point in time
   */
  static async reconstructStateAt(targetId, targetType, asOfSequence) {
    const events = await pool.query(
      `SELECT * FROM event_ledger
       WHERE target_type = $1 AND target_id = $2 AND sequence_num <= $3
       ORDER BY sequence_num`,
      [targetType, targetId, asOfSequence]
    );

    return {
      events: events.rows,
      reconstructedAt: new Date(),
      asOfSequence
    };
  }
}

module.exports = EventLedgerService;
```

---

## PHASE 1: Regulator Platform (Separate App)

### 1.1 App Structure
Create a new React app for the regulator platform.

**Directory:** `regulator-platform/`

```
regulator-platform/
├── src/
│   ├── components/
│   │   ├── timeline/
│   │   │   ├── VerificationTimeline.jsx
│   │   │   ├── TimelineEvent.jsx
│   │   │   ├── EventDetailPanel.jsx
│   │   │   └── EvidenceViewer.jsx
│   │   ├── reconstruction/
│   │   │   ├── StateReconstructor.jsx
│   │   │   └── SnapshotViewer.jsx
│   │   ├── export/
│   │   │   ├── ComplianceExport.jsx
│   │   │   └── AuditPackGenerator.jsx
│   │   ├── ai/
│   │   │   └── ExplanatoryChat.jsx
│   │   └── layout/
│   │       ├── AuditorShell.jsx
│   │       └── Navigation.jsx
│   ├── pages/
│   │   ├── VerificationLedger.jsx
│   │   ├── DealReconstruction.jsx
│   │   ├── EvidenceExplorer.jsx
│   │   ├── PolicyAudit.jsx
│   │   └── ComplianceExport.jsx
│   ├── api/
│   │   └── auditClient.js
│   └── App.jsx
```

### 1.2 Verification Timeline Component
The primary interface for regulators.

**File:** `regulator-platform/src/components/timeline/VerificationTimeline.jsx`

```jsx
// Core verification timeline showing immutable event history
// Each event displays: Actor, Evidence refs, Policy applied, Outcome, Hash

export default function VerificationTimeline({ dealId, filters }) {
  // Renders chronological, immutable timeline
  // No edit actions - pure observation
  // Click any event to see full lineage
}
```

### 1.3 Explanatory AI Chat
Read-only AI that explains but never executes.

**File:** `regulator-platform/src/components/ai/ExplanatoryChat.jsx`

```jsx
// AI chat that:
// - Answers questions about events and decisions
// - Always cites evidence and policy
// - Never offers recommendations
// - Never executes actions
// - Clearly states limitations

export default function ExplanatoryChat({ context }) {
  // System prompt enforces read-only, citation-required behavior
}
```

### 1.4 Key API Endpoints for Regulator

**File:** `backend/src/routes/audit.js`

```javascript
// GET /audit/timeline/:dealId - Full event timeline
// GET /audit/timeline/:dealId/reconstruct?as_of=<sequence> - State reconstruction
// GET /audit/evidence/:artifactId - Evidence with hash verification
// GET /audit/policy-evaluations/:dealId - All policy checks
// GET /audit/chain/verify - Hash chain verification
// POST /audit/export/compliance-pack - Generate audit package (PDF + CSV)
// POST /audit/ai/explain - Explanatory AI (read-only)
```

---

## PHASE 2: API Backend Contracts

The API layer is where CRE OS becomes the industry hub. Every API call — whether from:
- The native Professional Platform
- The Regulator Platform
- External systems (Yardi, Argus, servicers, banks, legal platforms)
- AI agents

...must emit a traceable event that can be reconstructed in the regulator timeline.

### External System Integration Pattern

When an external system (e.g., Yardi) pushes data:

```
┌──────────────┐      ┌───────────────────────────────────────────┐
│    Yardi     │      │               CRE OS                      │
│   (external) │─────▶│  1. API receives data                     │
│              │      │  2. Actor = "api_client:yardi_integration"│
│              │      │  3. Evidence artifact created (raw data)  │
│              │      │  4. Event logged with Yardi as actor      │
│              │      │  5. Policy evaluation runs                │
│              │      │  6. All visible in regulator timeline     │
└──────────────┘      └───────────────────────────────────────────┘
```

**Key principle**: External data is never trusted implicitly. It's anchored to:
- The source system (actor)
- The raw payload (evidence)
- The timestamp (when received)
- Any policy evaluations (verification)

### 2.1 Event-Emitting Middleware
Every API call must emit a traceable event.

**File:** `backend/src/middleware/eventEmitter.js`

```javascript
const EventLedgerService = require('../services/eventLedgerService');

function eventEmitter(options = {}) {
  return async (req, res, next) => {
    const originalSend = res.send;

    res.send = async function(body) {
      // Record the event after successful response
      if (res.statusCode < 400 && req.eventConfig) {
        await EventLedgerService.recordEvent({
          eventType: req.eventConfig.eventType,
          eventCategory: req.eventConfig.eventCategory,
          actorType: req.actor?.type || 'system',
          actorId: req.actor?.id,
          actorName: req.actor?.name || 'Anonymous',
          actorContext: {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            sessionId: req.sessionId
          },
          targetType: req.eventConfig.targetType,
          targetId: req.eventConfig.targetId,
          payload: req.eventConfig.payload || req.body,
          intent: req.eventConfig.intent
        });
      }

      return originalSend.call(this, body);
    };

    next();
  };
}
```

### 2.2 Actor Resolution Middleware

**File:** `backend/src/middleware/actorResolver.js`

```javascript
// Resolves the actor (human, AI agent, API client, system) for every request
// Attaches req.actor with {type, id, name, capabilities}
```

### 2.3 Core API Contract Examples

Every endpoint follows this pattern:

```javascript
// POST /deals
router.post('/',
  actorResolver(),
  (req, res, next) => {
    req.eventConfig = {
      eventType: 'deal.created',
      eventCategory: 'transaction',
      targetType: 'deal',
      intent: 'Create new deal'
    };
    next();
  },
  eventEmitter(),
  async (req, res) => {
    // Business logic...
  }
);
```

---

## PHASE 3: Real Estate Professional Platform

### 3.1 App Structure

**Directory:** `professional-platform/`

```
professional-platform/
├── src/
│   ├── components/
│   │   ├── command-center/
│   │   │   ├── TaskDashboard.jsx
│   │   │   ├── BlockingIssues.jsx
│   │   │   └── QuickActions.jsx
│   │   ├── ai/
│   │   │   ├── AgentChat.jsx
│   │   │   ├── ActionConfirmation.jsx
│   │   │   └── AgentSuggestions.jsx
│   │   ├── deals/
│   │   │   ├── DealWorkflow.jsx
│   │   │   └── CapitalStackBuilder.jsx
│   │   └── evidence/
│   │       └── EvidenceUploader.jsx
│   ├── agents/
│   │   ├── evidenceAgent.js
│   │   ├── verificationAgent.js
│   │   ├── structuringAgent.js
│   │   └── complianceAgent.js
│   └── App.jsx
```

### 3.2 AI Agent Architecture

**File:** `professional-platform/src/agents/baseAgent.js`

```javascript
// All agents extend this base
// - Actions are confirmed before execution
// - All executions are logged as first-class events
// - Agent context includes which user authorized the action
```

### 3.3 Active AI Chat

**File:** `professional-platform/src/components/ai/AgentChat.jsx`

```jsx
// AI chat that:
// - Answers "why" questions
// - Suggests actions (with confirmation)
// - Executes workflows when authorized
// - Summarizes deal status
// - All actions logged to event ledger
```

---

## Critical Files to Modify/Create

### Backend (in order)
1. `backend/src/config/migrations/001_event_ledger.sql` - Create
2. `backend/src/config/migrations/002_actor_registry.sql` - Create
3. `backend/src/config/migrations/003_evidence_enhanced.sql` - Create
4. `backend/src/config/migrations/004_policy_evaluation.sql` - Create
5. `backend/src/config/migrations/005_version_snapshots_enhanced.sql` - Create
6. `backend/src/services/eventLedgerService.js` - Create
7. `backend/src/middleware/eventEmitter.js` - Create
8. `backend/src/middleware/actorResolver.js` - Create
9. `backend/src/routes/audit.js` - Create
10. `backend/src/services/aiAgentService.js` - Create

### Regulator Platform (new app)
11. `regulator-platform/` - Create entire app structure
12. Key component: `VerificationTimeline.jsx`
13. Key component: `ExplanatoryChat.jsx`

### Professional Platform (refactor existing)
14. Refactor `src/` to `professional-platform/`
15. Add agent system to existing components
16. Ensure all actions emit events

---

## Verification Checklist

Before each phase is complete, verify:

### Phase 0 Complete When:
- [ ] Event ledger table exists with hash chain
- [ ] Actor registry populated with system actors
- [ ] Evidence artifacts have content hashes
- [ ] Policy evaluations are recorded
- [ ] `verifyChain()` returns valid for all events
- [ ] State reconstruction works for any point in time

### Phase 1 Complete When:
- [ ] Regulator can view complete timeline for any deal
- [ ] Every event shows actor, evidence, policy, outcome, hash
- [ ] Compliance export generates verifiable PDF + CSV
- [ ] AI chat is explanatory only (cannot execute)
- [ ] **Regulator Reconstruction Test passes**

### Phase 2 Complete When:
- [ ] Every API endpoint emits events
- [ ] Every event has an actor
- [ ] Events are replayable (can reconstruct state)
- [ ] AI agent actions logged as first-class events

### Phase 3 Complete When:
- [ ] Professional UI optimized for speed
- [ ] AI agents can execute with confirmation
- [ ] Compliance is enforced invisibly
- [ ] All actions appear in regulator timeline

---

## Next Steps (Immediate)

1. **Review this plan** and confirm the sequence
2. **Phase 0 first**: Create the event ledger migration and service
3. **Test reconstruction**: Verify we can reconstruct state before building UIs
