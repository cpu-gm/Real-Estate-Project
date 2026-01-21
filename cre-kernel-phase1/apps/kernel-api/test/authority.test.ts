import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server";
import { createPrismaClient } from "../src/prisma";
import { EventTypes } from "@kernel/shared";

describe("Authority rules", () => {
  const prisma = createPrismaClient();
  const app = buildServer();

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

  const createDeal = async (name = "Authority Deal") => {
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
    actorId: string | null,
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

  it("rejects unknown event type", async () => {
    const dealId = await createDeal();
    const actorId = await createActorWithRole(dealId, "GP");

    const response = await appendEvent(dealId, actorId, "UnknownType");

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toBe("Unknown event type");
  });

  it("rejects events without actorId", async () => {
    const dealId = await createDeal();

    const response = await appendEvent(dealId, null, EventTypes.ReviewOpened);

    expect(response.statusCode).toBe(400);
  });

  it("seeds authority rules on deal creation", async () => {
    const dealId = await createDeal();

    const count = await prisma.authorityRule.count({
      where: { dealId }
    });

    expect(count).toBe(15);
  });

  it("allows GP to open review", async () => {
    const dealId = await createDeal();
    const actorId = await createActorWithRole(dealId, "GP");

    const response = await appendEvent(dealId, actorId, EventTypes.ReviewOpened);

    expect(response.statusCode).toBe(201);
  });

  it("requires approvals before DealApproved", async () => {
    const dealId = await createDeal();
    const gp = await createActorWithRole(dealId, "GP");

    const review = await appendEvent(dealId, gp, EventTypes.ReviewOpened);
    expect(review.statusCode).toBe(201);

    const blocked = await appendEvent(dealId, gp, EventTypes.DealApproved);
    expect(blocked.statusCode).toBe(409);

    const approval = await appendEvent(dealId, gp, EventTypes.ApprovalGranted, {
      action: "APPROVE_DEAL"
    });
    expect(approval.statusCode).toBe(201);

    await addMaterial(dealId, "UnderwritingSummary", "HUMAN");

    const approved = await appendEvent(dealId, gp, EventTypes.DealApproved);
    expect(approved.statusCode).toBe(201);

    const dealResponse = await app.inject({
      method: "GET",
      url: `/deals/${dealId}`
    });

    expect(dealResponse.statusCode).toBe(200);
    expect(dealResponse.json().state).toBe("Approved");
  });

  it("requires approvals for ClosingFinalized", async () => {
    const dealId = await createDeal();
    const gp = await createActorWithRole(dealId, "GP");
    const lender = await createActorWithRole(dealId, "LENDER");
    const escrow = await createActorWithRole(dealId, "ESCROW");

    const blocked = await appendEvent(dealId, gp, EventTypes.ClosingFinalized);
    expect(blocked.statusCode).toBe(409);

    await appendEvent(dealId, gp, EventTypes.ApprovalGranted, {
      action: "FINALIZE_CLOSING"
    });
    await appendEvent(dealId, lender, EventTypes.ApprovalGranted, {
      action: "FINALIZE_CLOSING"
    });
    await appendEvent(dealId, escrow, EventTypes.ApprovalGranted, {
      action: "FINALIZE_CLOSING"
    });

    await addMaterial(dealId, "WireConfirmation", "DOC");
    await addMaterial(dealId, "EntityFormationDocs", "DOC");

    const approved = await appendEvent(dealId, gp, EventTypes.ClosingFinalized);
    expect(approved.statusCode).toBe(201);
  });

  it("rejects actors without allowed role", async () => {
    const dealId = await createDeal();
    const actorId = await createActorWithRole(dealId, "LEGAL");

    const response = await appendEvent(dealId, actorId, EventTypes.ReviewOpened);

    expect(response.statusCode).toBe(403);
  });
});

