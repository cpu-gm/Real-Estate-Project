# Contract Usage Examples

This document shows how contracts are used in actual code.

## Frontend: Validating API Responses

```jsx
// src/pages/DealDetail.jsx
import { useQuery } from "@tanstack/react-query";
import { dealHomeResponseSchema } from "../lib/contracts";
import { useAuth } from "../lib/AuthContext";

export default function DealDetail({ dealId }) {
  const { token } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: ["deal", dealId],
    queryFn: async () => {
      const res = await fetch(`/api/deals/${dealId}/home`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error("Failed to fetch deal");

      const json = await res.json();

      // Validate response matches contract
      const parsed = dealHomeResponseSchema.safeParse(json);
      if (!parsed.success) {
        console.error("Contract violation:", parsed.error);
        throw new Error("Invalid API response");
      }

      return parsed.data;
    }
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h1>{data.deal.name}</h1>
      <p>State: {data.deal.lifecycle_state}</p>
      <p>Events: {data.events.length}</p>
    </div>
  );
}
```

## Backend: Validating Request Bodies

```javascript
// server/routes/deals.js
import { createDealRequestSchema } from "../../src/lib/contracts.js";

export async function handleCreateDeal(req, res, readJsonBody, sendJson, sendError) {
  const { authUser } = req;

  // Read and validate request body
  const body = await readJsonBody(req);
  const parsed = createDealRequestSchema.safeParse(body);

  if (!parsed.success) {
    return sendError(res, 400, "Validation failed", {
      errors: parsed.error.flatten().fieldErrors
    });
  }

  const { name, profile } = parsed.data;

  // Call kernel to create deal
  const kernelResponse = await fetch(`${KERNEL_API_URL}/deals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });

  if (!kernelResponse.ok) {
    return sendError(res, 500, "Kernel error");
  }

  const deal = await kernelResponse.json();

  return sendJson(res, 201, {
    id: deal.id,
    name: deal.name,
    lifecycle_state: "Draft",
    created_date: new Date().toISOString()
  });
}
```

## Kernel: Inline Schema Validation

```typescript
// cre-kernel-phase1/apps/kernel-api/src/server.ts
import { z } from "zod";

const createEventSchema = z.object({
  type: z.string().trim().min(1).max(100),
  actorId: z.string().uuid(),
  payload: z.record(z.unknown()).optional().default({}),
  authorityContext: z.record(z.unknown()).optional().default({}),
  evidenceRefs: z.array(z.string()).optional().default([])
});

app.post("/deals/:dealId/events", async (req, reply) => {
  const { dealId } = req.params;

  // Validate request body
  const parsed = createEventSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Validation failed",
      details: parsed.error.flatten()
    });
  }

  const { type, actorId, payload, authorityContext, evidenceRefs } = parsed.data;

  // Create event...
});
```

## Form Validation with React Hook Form

```jsx
// src/components/CreateDealForm.jsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createDealRequestSchema } from "../lib/contracts";

export function CreateDealForm({ onSubmit }) {
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(createDealRequestSchema),
    defaultValues: {
      name: "",
      profile: {
        asset_type: null,
        purchase_price: null
      }
    }
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div>
        <label>Deal Name</label>
        <input {...register("name")} />
        {errors.name && <span>{errors.name.message}</span>}
      </div>

      <div>
        <label>Asset Type</label>
        <select {...register("profile.asset_type")}>
          <option value="">Select...</option>
          <option value="Multifamily">Multifamily</option>
          <option value="Office">Office</option>
          <option value="Retail">Retail</option>
        </select>
      </div>

      <div>
        <label>Purchase Price</label>
        <input
          type="number"
          {...register("profile.purchase_price", { valueAsNumber: true })}
        />
      </div>

      <button type="submit">Create Deal</button>
    </form>
  );
}
```

## Testing with Fixtures

```javascript
// server/__tests__/deals.test.js
import { describe, it, expect } from "vitest";
import { createDealRequestSchema, dealSchema } from "../../src/lib/contracts";
import createDealRequest from "../../../fixtures/http/create-deal-request.json";
import createDealResponse from "../../../fixtures/http/create-deal-response.json";

describe("Deal contracts", () => {
  it("request fixture matches schema", () => {
    // Strip _comment fields
    const cleaned = JSON.parse(JSON.stringify(createDealRequest, (k, v) =>
      k.startsWith("_") ? undefined : v
    ));

    const result = createDealRequestSchema.safeParse(cleaned);
    expect(result.success).toBe(true);
  });

  it("response fixture matches schema", () => {
    const cleaned = JSON.parse(JSON.stringify(createDealResponse, (k, v) =>
      k.startsWith("_") ? undefined : v
    ));

    const result = dealSchema.safeParse(cleaned);
    expect(result.success).toBe(true);
  });
});
```

## Related Files

- **Schema definitions:** `canonical-deal-os/src/lib/contracts.js`
- **Fixtures:** `/fixtures/http/` and `/fixtures/events/`
- **Validation script:** `/scripts/validate-contracts.js`
