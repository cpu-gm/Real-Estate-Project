# API Contracts

This directory documents the API contracts for the CRE Deal Management Platform.

## What is Contract-First Development?

Contract-first development means we define our API shapes (schemas) before writing code. This ensures:

1. **Consistency** - Frontend and backend agree on data shapes
2. **Validation** - Requests and responses are validated against schemas
3. **Documentation** - Schemas serve as living documentation
4. **Testing** - Fixtures can be validated automatically

## Schema Locations

### HTTP Contracts (Canonical Source)

All HTTP request/response schemas are defined in:

```
canonical-deal-os/src/lib/contracts.js
```

This file contains **Zod schemas** that define:
- Request payloads (what the client sends)
- Response payloads (what the server returns)
- Shared types (reused across endpoints)

**Key schemas:**

| Schema | Purpose |
|--------|---------|
| `createDealRequestSchema` | Request body for POST /api/deals |
| `dealSchema` | Single deal response shape |
| `dealListResponseSchema` | Array of deals |
| `dealHomeResponseSchema` | Deal detail page data |
| `lpInvitationRequestSchema` | LP invitation request |
| `explainBlockSchema` | Blocked action explanation |
| `explainAllowedSchema` | Allowed action confirmation |

### Kernel Event Contracts

Event types and shared constants are defined in:

```
cre-kernel-phase1/packages/shared/src/index.ts
```

**Key exports:**

```typescript
// Event types
export const EventTypes = {
  ReviewOpened: "ReviewOpened",
  DealApproved: "DealApproved",
  ClosingFinalized: "ClosingFinalized",
  // ... more
};

// Deal lifecycle states
export const DealStates = {
  Draft: "Draft",
  UnderReview: "UnderReview",
  Approved: "Approved",
  // ... more
};

// Truth class hierarchy
export type TruthIndicator = "DOC" | "HUMAN" | "AI";
```

### Kernel API Schemas (Inline)

Kernel request validation schemas are defined inline in:

```
cre-kernel-phase1/apps/kernel-api/src/server.ts (lines 20-123)
```

**Key schemas:**

| Schema | Purpose |
|--------|---------|
| `createDealSchema` | POST /deals request |
| `createEventSchema` | POST /deals/:id/events request |
| `createMaterialSchema` | POST /deals/:id/materials request |
| `explainBodySchema` | POST /deals/:id/explain request |

## How to Validate

Run contract validation from the repository root:

```bash
npm run validate:contracts
```

This command:
1. Loads fixtures from `/fixtures/http/` and `/fixtures/events/`
2. Imports Zod schemas from `contracts.js`
3. Validates each fixture against its schema
4. Reports any mismatches
5. Exits with code 1 on failure (blocks CI)

## How to Add New Contracts

### Step 1: Define the Zod Schema

Add to `canonical-deal-os/src/lib/contracts.js`:

```javascript
// Request schema
export const myFeatureRequestSchema = z.object({
  name: z.string().min(1),
  value: z.number().optional()
});

// Response schema
export const myFeatureResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string()
});
```

### Step 2: Create Example Fixtures

Add annotated examples to `/fixtures/http/`:

```json
// fixtures/http/my-feature-request.json
{
  "_comment": "Request to create my feature",
  "name": "Example Name",
  "value": 42
}
```

```json
// fixtures/http/my-feature-response.json
{
  "_comment": "Response after creating my feature",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Example Name",
  "createdAt": "2026-01-21T10:00:00.000Z"
}
```

### Step 3: Update Validation Script

Add schema mapping in `/scripts/validate-contracts.js`:

```javascript
const schemaMap = {
  // ... existing mappings
  'my-feature-request.json': myFeatureRequestSchema,
  'my-feature-response.json': myFeatureResponseSchema
};
```

### Step 4: Run Validation

```bash
npm run validate:contracts
```

If validation fails, fix the fixture or schema until they match.

## Fixture Annotation Convention

Fixtures use `_comment` fields to explain the data:

```json
{
  "_comment": "Main description of this fixture",
  "field1": "value",
  "_field1_comment": "Explanation of field1",
  "nested": {
    "_comment": "Description of nested object",
    "innerField": 123
  }
}
```

The validation script strips `_comment` fields before validating.

## Directory Structure

```
contracts/
├── README.md           # This file
├── http/
│   └── README.md       # HTTP schema documentation
├── events/
│   └── README.md       # Kernel event documentation
└── examples/
    └── README.md       # Usage examples
```

## Related Documentation

- [fixtures/](../fixtures/) - Example JSON payloads
- [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) - System architecture
- [docs/CONTRIBUTING.md](../docs/CONTRIBUTING.md) - Development workflow
