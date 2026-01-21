# HTTP API Schemas

This document describes the key HTTP request/response schemas used by the BFF API.

All schemas are defined in: `canonical-deal-os/src/lib/contracts.js`

## Deal Management

### Create Deal

**Endpoint:** `POST /api/deals`

**Request Schema:** `createDealRequestSchema`

```javascript
{
  name: string,              // Required: Deal name (min 1 char)
  profile: {                 // Optional: Deal profile data
    asset_type: string?,     // "Multifamily", "Office", "Retail", etc.
    asset_address: string?,
    asset_city: string?,
    asset_state: string?,
    purchase_price: number?,
    square_footage: number?,
    unit_count: number?,
    year_built: number?,
    noi: number?,            // Net Operating Income
    cap_rate: number?,       // Capitalization rate
    ltv: number?,            // Loan-to-value ratio
    dscr: number?,           // Debt service coverage ratio
    senior_debt: number?,
    mezzanine_debt: number?,
    preferred_equity: number?,
    common_equity: number?,
    gp_name: string?,
    lender_name: string?,
    deal_summary: string?
  },
  sessionId: string?         // Optional: LLM parse session ID
}
```

**Response Schema:** `dealSchema`

```javascript
{
  id: string,                    // UUID
  name: string,
  lifecycle_state: string?,      // "Draft", "UnderReview", etc.
  stress_mode: boolean?,
  stress_mode_label: string?,    // "SM-0", "SM-1", etc.
  truth_health: "healthy" | "warning" | "danger"?,
  next_action: string?,          // Suggested next action
  next_action_type: string?,
  blocked_by: string?,           // What's blocking progress
  created_date: string?,         // ISO timestamp
  updated_date: string?,
  profile: { ... }?,             // Same as request profile
  profile_meta: {
    source: string?,
    asOf: string?
  }?
}
```

---

### Get Deal Home

**Endpoint:** `GET /api/deals/:id/home`

**Response Schema:** `dealHomeResponseSchema`

```javascript
{
  deal: dealSchema,
  events: [dealEventSchema],
  authorities: [authoritySchema],
  covenants: [covenantSchema],
  evidence: {
    total_artifacts: number,
    last_uploaded_at: string?
  }
}
```

---

### Explain Action

**Endpoint:** `POST /api/deals/:id/explain`

**Request Schema:** `explainBodySchema` (kernel)

```javascript
{
  action: string,            // "APPROVE_DEAL", "FINALIZE_CLOSING", etc.
  actorId: string?,          // UUID of actor attempting action
  payload: object?,          // Action-specific data
  authorityContext: object?, // Role context
  evidenceRefs: string[]?    // Supporting artifact IDs
}
```

**Response Schema:** `explainBlockSchema` OR `explainAllowedSchema`

Blocked response:
```javascript
{
  action: string,
  status: "BLOCKED",
  reasons: [{
    type: "MISSING_MATERIAL" | "INSUFFICIENT_TRUTH" | "AUTHORITY" | "APPROVAL_THRESHOLD",
    message: string,
    materialType: string?,
    requiredTruth: "DOC" | "HUMAN"?,
    currentTruth: "DOC" | "HUMAN" | "AI" | null?
  }],
  nextSteps: [{
    description: string,
    canBeFixedByRoles: string[],
    canBeOverriddenByRoles: string[]
  }]
}
```

Allowed response:
```javascript
{
  status: "ALLOWED",
  action: string,
  at: string?,               // ISO timestamp
  projectionSummary: {
    state: string?,
    stressMode: string?
  }?
}
```

---

## LP Portal

### Send LP Invitation

**Endpoint:** `POST /api/lp/invitations`

**Request Schema:** `lpInvitationRequestSchema`

```javascript
{
  lpEntityName: string,      // LP entity name
  lpEmail: string,           // Email to send invitation
  dealId: string,            // UUID of deal
  commitment: number,        // Dollar amount committed
  ownershipPct: number       // Percentage ownership
}
```

---

## Schema Validation Example

```javascript
import { createDealRequestSchema } from './contracts.js';

// Validate incoming request
const parsed = createDealRequestSchema.safeParse(requestBody);

if (!parsed.success) {
  // Handle validation error
  console.error(parsed.error.flatten());
  return res.status(400).json({ error: "Validation failed" });
}

// Use validated data
const validData = parsed.data;
```

---

## Related Files

- **Schema definitions:** `canonical-deal-os/src/lib/contracts.js`
- **Example fixtures:** `/fixtures/http/`
- **Validation script:** `/scripts/validate-contracts.js`
