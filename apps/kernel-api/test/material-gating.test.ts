import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server";
import { createPrismaClient } from "../src/prisma";
import { EventTypes } from "@kernel/shared";

describe("Materials API gating", () => {
  const prisma = createPrismaClient();
  const app = buildServer();

  const createDeal = async (name = "Materials Deal") => {
    const response = await app.inject({
      method: "POST",
      url: "/deals",
      payload: { name }
    });

    expect(response.statusCode).toBe(201);
    return response.json().id as string;
  };

  const createActorWithRole = async (dealId: string, role: string) => {
    const actorResponse = await app.inject({
      method: "POST",
      url: `/deals/${dealId}/actors`,
      payload: { name: `${role} Actor`, type: "HUMAN", role }
    });

    expect(actorResponse.statusCode).toBe(201);
    return actorResponse.json().id as string;
  };

  const appendEvent = async (
    dealId: string,
    actorId: string,
    type: string,
    payload: Record<string, unknown> = {}
  ) => {
    return app.inject({
      method: "POST",
      url: `/deals/${dealId}/events`,
      payload: {
        type,
        actorId,
        payload,
        authorityContext: {},
        evidenceRefs: []
      }
    });
  };

  const addMaterial = async (dealId: string, type: string) => {
    return app.inject({
      method: "POST",
      url: `/deals/${dealId}/materials`,
      payload: {
        type,
        truthClass: "DOC",
        evidenceRefs: [],
        meta: {}
      }
    });
  };

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.event.deleteMany();
    await prisma.materialRevision.deleteMany();
    await prisma.materialObject.deleteMany();
    await prisma.artifactLink.deleteMany();
    await prisma.artifact.deleteMany();
    await prisma.authorityRule.deleteMany();
    await prisma.actorRole.deleteMany();
    await prisma.role.deleteMany();
    await prisma.actor.deleteMany();
    await prisma.deal.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("requires DOC materials before ClosingFinalized", async () => {
    const dealId = await createDeal();
    const gp = await createActorWithRole(dealId, "GP");
    const lender = await createActorWithRole(dealId, "LENDER");
    const escrow = await createActorWithRole(dealId, "ESCROW");

    const approval1 = await appendEvent(dealId, gp, EventTypes.ApprovalGranted, {
      action: "FINALIZE_CLOSING"
    });
    expect(approval1.statusCode).toBe(201);

    const approval2 = await appendEvent(dealId, lender, EventTypes.ApprovalGranted, {
      action: "FINALIZE_CLOSING"
    });
    expect(approval2.statusCode).toBe(201);

    const approval3 = await appendEvent(dealId, escrow, EventTypes.ApprovalGranted, {
      action: "FINALIZE_CLOSING"
    });
    expect(approval3.statusCode).toBe(201);

    const blocked = await appendEvent(dealId, gp, EventTypes.ClosingFinalized);
    expect(blocked.statusCode).toBe(409);
    const blockedBody = blocked.json();
    expect(
      blockedBody.reasons.some(
        (reason: { type?: string; materialType?: string }) =>
          reason.type === "MISSING_MATERIAL" && reason.materialType === "WireConfirmation"
      )
    ).toBe(true);

    const wireResponse = await addMaterial(dealId, "WireConfirmation");
    expect(wireResponse.statusCode).toBe(201);

    const stillBlocked = await appendEvent(dealId, gp, EventTypes.ClosingFinalized);
    expect(stillBlocked.statusCode).toBe(409);
    const stillBody = stillBlocked.json();
    expect(
      stillBody.reasons.some(
        (reason: { type?: string; materialType?: string }) =>
          reason.type === "MISSING_MATERIAL" && reason.materialType === "EntityFormationDocs"
      )
    ).toBe(true);

    const entityResponse = await addMaterial(dealId, "EntityFormationDocs");
    expect(entityResponse.statusCode).toBe(201);

    const finalized = await appendEvent(dealId, gp, EventTypes.ClosingFinalized);
    expect(finalized.statusCode).toBe(201);
  });
});
