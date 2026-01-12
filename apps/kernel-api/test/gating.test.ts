import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server";
import { createPrismaClient } from "../src/prisma";
import { EventTypes } from "@kernel/shared";

describe("Material gating and overrides", () => {
  const prisma = createPrismaClient();
  const app = buildServer();

  const createDeal = async (name = "Gating Deal") => {
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
      payload: { name: `${role} Actor`, type: "HUMAN" }
    });

    expect(actorResponse.statusCode).toBe(201);
    const actorId = actorResponse.json().id as string;

    const roleResponse = await app.inject({
      method: "POST",
      url: `/deals/${dealId}/actors/${actorId}/roles`,
      payload: { role }
    });

    expect(roleResponse.statusCode).toBe(200);
    return actorId;
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

  const addMaterial = async (
    dealId: string,
    type: string,
    truthClass: "DOC" | "HUMAN" | "AI"
  ) => {
    await prisma.materialObject.create({
      data: {
        dealId,
        type,
        data: {},
        truthClass
      }
    });
  };

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.event.deleteMany();
    await prisma.materialObject.deleteMany();
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

  it("blocks DealApproved without required materials and explains", async () => {
    const dealId = await createDeal();
    const gp = await createActorWithRole(dealId, "GP");

    const review = await appendEvent(dealId, gp, EventTypes.ReviewOpened);
    expect(review.statusCode).toBe(201);

    const approval = await appendEvent(dealId, gp, EventTypes.ApprovalGranted, {
      action: "APPROVE_DEAL"
    });
    expect(approval.statusCode).toBe(201);

    const blocked = await appendEvent(dealId, gp, EventTypes.DealApproved);
    expect(blocked.statusCode).toBe(409);
    const blockedBody = blocked.json();
    expect(blockedBody.status).toBe("BLOCKED");
    expect(blockedBody.action).toBe("APPROVE_DEAL");
    expect(
      blockedBody.reasons.some(
        (reason: { type: string; materialType?: string }) =>
          reason.type === "MISSING_MATERIAL" &&
          reason.materialType === "UnderwritingSummary"
      )
    ).toBe(true);
    expect(blockedBody.nextSteps[0].canBeFixedByRoles).toContain("GP");
    expect(blockedBody.nextSteps[0].canBeOverriddenByRoles).toContain("GP");

    await addMaterial(dealId, "UnderwritingSummary", "AI");
    const stillBlocked = await appendEvent(dealId, gp, EventTypes.DealApproved);
    expect(stillBlocked.statusCode).toBe(409);
    const stillBody = stillBlocked.json();
    expect(
      stillBody.reasons.some(
        (reason: { type: string; currentTruth?: string }) =>
          reason.type === "INSUFFICIENT_TRUTH" && reason.currentTruth === "AI"
      )
    ).toBe(true);

    await addMaterial(dealId, "UnderwritingSummary", "HUMAN");
    const approved = await appendEvent(dealId, gp, EventTypes.DealApproved);
    expect(approved.statusCode).toBe(201);
  });

  it("blocks ClosingFinalized without DOC materials and allows override", async () => {
    const dealId = await createDeal();
    const gp = await createActorWithRole(dealId, "GP");
    const lender = await createActorWithRole(dealId, "LENDER");
    const escrow = await createActorWithRole(dealId, "ESCROW");

    const approval1 = await appendEvent(dealId, gp, EventTypes.ApprovalGranted, {
      action: "FINALIZE_CLOSING"
    });
    expect(approval1.statusCode).toBe(201);
    const approval2 = await appendEvent(
      dealId,
      lender,
      EventTypes.ApprovalGranted,
      {
        action: "FINALIZE_CLOSING"
      }
    );
    expect(approval2.statusCode).toBe(201);
    const approval3 = await appendEvent(
      dealId,
      escrow,
      EventTypes.ApprovalGranted,
      {
        action: "FINALIZE_CLOSING"
      }
    );
    expect(approval3.statusCode).toBe(201);

    const blocked = await appendEvent(dealId, gp, EventTypes.ClosingFinalized);
    expect(blocked.statusCode).toBe(409);
    const blockedBody = blocked.json();
    expect(
      blockedBody.reasons.some(
        (reason: { materialType?: string }) =>
          reason.materialType === "WireConfirmation"
      )
    ).toBe(true);
    expect(
      blockedBody.reasons.some(
        (reason: { materialType?: string }) =>
          reason.materialType === "EntityFormationDocs"
      )
    ).toBe(true);

    const override = await appendEvent(dealId, gp, EventTypes.OverrideAttested, {
      action: "FINALIZE_CLOSING",
      reason: "Manual override"
    });
    expect(override.statusCode).toBe(201);

    const finalized = await appendEvent(
      dealId,
      gp,
      EventTypes.ClosingFinalized
    );
    expect(finalized.statusCode).toBe(201);
  });

  it("rejects override by unauthorized role", async () => {
    const dealId = await createDeal();
    const legal = await createActorWithRole(dealId, "LEGAL");

    const response = await appendEvent(
      dealId,
      legal,
      EventTypes.OverrideAttested,
      {
        action: "FINALIZE_CLOSING",
        reason: "Not allowed"
      }
    );

    expect(response.statusCode).toBe(403);
  });
});
