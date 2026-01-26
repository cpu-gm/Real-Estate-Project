# API Contracts

This directory documents the API contracts for the CRE Deal Management Platform.

## What is Contract-First Development?

Contract-first development means we define our API shapes (schemas) before writing code. This ensures:

1. **Consistency** - Frontend and backend agree on data shapes
2. **Validation** - Requests and responses are validated against schemas
3. **Documentation** - Schemas serve as living documentation
4. **Testing** - Fixtures can be validated automatically

## Contract Source of Truth

### Canonical Sources

| Type | Location | Description |
|------|----------|-------------|
| **HTTP Schemas** | `canonical-deal-os/src/lib/contracts.js` | All Zod schemas for HTTP requests/responses |
| **Event Types** | `cre-kernel-phase1/packages/shared/src/index.ts` | EventTypes, DealStates, TruthIndicator |
| **Kernel API** | `cre-kernel-phase1/apps/kernel-api/src/server.ts:100-106` | Inline createEventSchema |

### Re-exports for Validation

```
contracts/
├── schemas.js      # Re-exports from canonical sources + kernelEventSchema
├── manifest.json   # Strict fixture→schema mapping (authoritative)
```

**IMPORTANT:** Do NOT define new schemas in `/contracts/schemas.js`. Add them to the canonical source (`contracts.js`) and re-export.

## Schema Inventory

### HTTP Schemas (from `canonical-deal-os/src/lib/contracts.js`)

| Schema | Line | Purpose |
|--------|------|---------|
| `createDealRequestSchema` | ~27 | Request body for POST /api/deals |
| `dealSchema` | ~52 | Single deal response shape |
| `lpInvitationRequestSchema` | ~448 | LP invitation request |
| `explainBlockSchema` | ~168 | Blocked action explanation |
| `explainAllowedSchema` | ~195 | Allowed action confirmation |

### Event Schemas (from `contracts/schemas.js`)

| Schema | Source | Purpose |
|--------|--------|---------|
| `kernelEventSchema` | Mirrors kernel-api/src/server.ts | Kernel event structure validation |

### Type Constants (from `cre-kernel-phase1/packages/shared/src/index.ts`)

```typescript
EventTypes = { ReviewOpened, DealApproved, ClosingFinalized, ... }
DealStates = { Draft, UnderReview, Approved, Closed, ... }
TruthIndicator = "DOC" | "HUMAN" | "AI"
```

## Fixture→Schema Manifest

The manifest at `/contracts/manifest.json` is the **authoritative** mapping. Every fixture MUST be listed:

```json
{
  "http": {
    "create-deal-request.json": { "schema": "createDealRequestSchema" },
    "create-deal-response.json": { "schema": "dealSchema" },
    "lp-invitation-request.json": { "schema": "lpInvitationRequestSchema" },
    "explain-blocked-response.json": { "schema": "explainBlockSchema" }
  },
  "events": {
    "review-opened.json": { "schema": "kernelEventSchema" },
    "deal-approved.json": { "schema": "kernelEventSchema" }
  }
}
```

## Validation (STRICT MODE)

Run contract validation from the repository root:

```bash
npm run validate:contracts
```

**Strict behavior:**
- Every fixture in `/fixtures/` MUST have a mapping in `manifest.json`
- Unmapped fixtures cause validation to FAIL (exit code 1)
- CI blocks merge until all fixtures are mapped and valid

### Validation Output

```
🔍 Validating API Contracts (STRICT MODE)

HTTP Fixtures (fixtures/http/):
  ✓ create-deal-request.json
  ✓ create-deal-response.json
  ✓ lp-invitation-request.json
  ✓ explain-blocked-response.json

Event Fixtures (fixtures/events/):
  ✓ review-opened.json
  ✓ deal-approved.json

──────────────────────────────────────────────────

📊 Results: 6/6 fixtures passed

✅ All contract validations passed (strict mode)
```

## How to Add New Contracts

### Step 1: Define the Zod Schema (in canonical source)

Add to `canonical-deal-os/src/lib/contracts.js`:

```javascript
export const myFeatureRequestSchema = z.object({
  name: z.string().min(1),
  value: z.number().optional()
});
```

### Step 2: Re-export in `/contracts/schemas.js`

```javascript
export {
  // ... existing exports
  myFeatureRequestSchema
} from '../canonical-deal-os/src/lib/contracts.js';
```

### Step 3: Create Fixture

Add to `/fixtures/http/my-feature-request.json`:

```json
{
  "_comment": "Request to create my feature",
  "name": "Example Name",
  "value": 42
}
```

### Step 4: Add to Manifest

Update `/contracts/manifest.json`:

```json
{
  "http": {
    "my-feature-request.json": {
      "schema": "myFeatureRequestSchema",
      "description": "Request body for POST /api/my-feature"
    }
  }
}
```

### Step 5: Run Validation

```bash
npm run validate:contracts
```

## Fixture Annotation Convention

Fixtures use `_comment` fields to explain the data:

```json
{
  "_comment": "Main description of this fixture",
  "field1": "value",
  "_field1_comment": "Explanation of field1"
}
```

The validation script strips `_` prefixed fields before validating.

## Directory Structure

```
contracts/
├── README.md           # This file
├── schemas.js          # Re-exports from canonical sources
├── manifest.json       # Strict fixture→schema mapping
├── http/
│   └── README.md       # HTTP schema documentation
├── events/
│   └── README.md       # Kernel event documentation
└── examples/
    └── README.md       # Usage examples
```

## Contract Versioning Convention

### Rules (NOT YET ENFORCED)

This section documents the versioning convention for future implementation.

**Version Format:** `v{major}` folders when breaking changes occur.

```
canonical-deal-os/src/contracts/
├── http/
│   ├── deals.schema.js        # Current (v1 implicit)
│   └── v2/
│       └── deals.schema.js    # Breaking change version
└── events/
    └── ...
```

**Semantic Expectations:**

| Change Type | Version Bump | Example |
|-------------|--------------|---------|
| Add optional field | None | `profile.newField?: string` |
| Add required field | MAJOR (v2) | `organizationId: string` (required) |
| Remove field | MAJOR (v2) | Remove `legacy_field` |
| Change field type | MAJOR (v2) | `price: string` → `price: number` |
| Rename field | MAJOR (v2) | `assetType` → `asset_type` |

**Migration Path:**
1. Create `v2/` folder with new schema
2. Update `contracts/index.js` to export both versions
3. Add deprecation notice to v1 schema
4. Migrate consumers over time
5. Remove v1 after migration complete

**Current Status:** All schemas are implicitly v1. No v2 folders exist yet.

---

## Related Documentation

- [fixtures/](../fixtures/) - Example JSON payloads
- [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) - System architecture
- [docs/CONTRIBUTING.md](../docs/CONTRIBUTING.md) - Development workflow
