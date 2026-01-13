import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server";
import { createPrismaClient } from "../src/prisma";
import { EventTypes } from "@kernel/shared";

describe("Snapshot and explain replay", () => {
  const prisma = createPrismaClient();
  const app = buildServer();

  const createDeal = async (name = "Snapshot Deal") => {
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

  it("replays snapshot and explain at time", async () => {
    const dealId = await createDeal();
    const gp = await createActorWithRole(dealId, "GP");
    const lender = await createActorWithRole(dealId, "LENDER");
    const escrow = await createActorWithRole(dealId, "ESCROW");

    const base = new Date(Date.now() + 2000);
    const t0 = new Date(base.getTime() - 1000);
    const tApproval1 = new Date(base.getTime());
    const tApproval2 = new Date(base.getTime() + 200);
    const tApproval3 = new Date(base.getTime() + 400);
    const tMaterial1 = new Date(base.getTime() + 800);
    const tMaterial2 = new Date(base.getTime() + 1200);

    await prisma.event.create({
      data: {
        dealId,
        type: EventTypes.ApprovalGranted,
        actorId: gp,
        payload: { action: "FINALIZE_CLOSING" },
        authorityContext: {},
        evidenceRefs: [],
        createdAt: tApproval1
      }
    });

    await prisma.event.create({
      data: {
        dealId,
        type: EventTypes.ApprovalGranted,
        actorId: lender,
        payload: { action: "FINALIZE_CLOSING" },
        authorityContext: {},
        evidenceRefs: [],
        createdAt: tApproval2
      }
    });

    await prisma.event.create({
      data: {
        dealId,
        type: EventTypes.ApprovalGranted,
        actorId: escrow,
        payload: { action: "FINALIZE_CLOSING" },
        authorityContext: {},
        evidenceRefs: [],
        createdAt: tApproval3
      }
    });

    const wireMaterial = await prisma.materialObject.create({
      data: {
        dealId,
        type: "WireConfirmation",
        data: { evidenceRefs: [], meta: {} },
        truthClass: "DOC",
        createdAt: tMaterial1
      }
    });

    await prisma.materialRevision.create({
      data: {
        materialId: wireMaterial.id,
        dealId,
        type: wireMaterial.type,
        truthClass: wireMaterial.truthClass,
        data: wireMaterial.data,
        createdAt: tMaterial1
      }
    });

    const entityMaterial = await prisma.materialObject.create({
      data: {
        dealId,
        type: "EntityFormationDocs",
        data: { evidenceRefs: [], meta: {} },
        truthClass: "DOC",
        createdAt: tMaterial2
      }
    });

    await prisma.materialRevision.create({
      data: {
        materialId: entityMaterial.id,
        dealId,
        type: entityMaterial.type,
        truthClass: entityMaterial.truthClass,
        data: entityMaterial.data,
        createdAt: tMaterial2
      }
    });

    const snapshotT0 = await app.inject({
      method: "GET",
      url: `/deals/${dealId}/snapshot?at=${encodeURIComponent(t0.toISOString())}`
    });
    expect(snapshotT0.statusCode).toBe(200);
    const snapshotBody0 = snapshotT0.json();
    expect(snapshotBody0.projection.state).toBe("Draft");

    const snapshotT1 = await app.inject({
      method: "GET",
      url: `/deals/${dealId}/snapshot?at=${encodeURIComponent(new Date(tApproval1.getTime() - 1).toISOString())}`
    });
    expect(snapshotT1.statusCode).toBe(200);
    const snapshotBody1 = snapshotT1.json();
    expect(snapshotBody1.approvals.FINALIZE_CLOSING.satisfied).toBe(false);

    const snapshotT2 = await app.inject({
      method: "GET",
      url: `/deals/${dealId}/snapshot?at=${encodeURIComponent(tApproval3.toISOString())}`
    });
    expect(snapshotT2.statusCode).toBe(200);
    const snapshotBody2 = snapshotT2.json();
    expect(snapshotBody2.approvals.FINALIZE_CLOSING.satisfied).toBe(true);

    const snapshotT3 = await app.inject({
      method: "GET",
      url: `/deals/${dealId}/snapshot?at=${encodeURIComponent(tMaterial1.toISOString())}`
    });
    expect(snapshotT3.statusCode).toBe(200);
    const snapshotBody3 = snapshotT3.json();
    const finalizeReqsT3 = snapshotBody3.materials.requiredFor.FINALIZE_CLOSING;
    expect(
      finalizeReqsT3.some(
        (req: { type: string; status: string }) =>
          req.type === "EntityFormationDocs" && req.status === "MISSING"
      )
    ).toBe(true);

    const snapshotT4 = await app.inject({
      method: "GET",
      url: `/deals/${dealId}/snapshot?at=${encodeURIComponent(tMaterial2.toISOString())}`
    });
    expect(snapshotT4.statusCode).toBe(200);
    const snapshotBody4 = snapshotT4.json();
    const finalizeReqsT4 = snapshotBody4.materials.requiredFor.FINALIZE_CLOSING;
    expect(finalizeReqsT4.every((req: { status: string }) => req.status === "OK")).toBe(true);

    const explainT1 = await app.inject({
      method: "POST",
      url: `/deals/${dealId}/explain?at=${encodeURIComponent(new Date(tApproval1.getTime() - 1).toISOString())}`,
      payload: {
        action: "FINALIZE_CLOSING",
        actorId: gp,
        payload: {},
        authorityContext: {},
        evidenceRefs: []
      }
    });
    expect(explainT1.statusCode).toBe(200);
    const explainBody1 = explainT1.json();
    expect(explainBody1.status).toBe("BLOCKED");
    expect(
      explainBody1.reasons.some(
        (reason: { type: string }) => reason.type === "APPROVAL_THRESHOLD"
      )
    ).toBe(true);

    const explainT4 = await app.inject({
      method: "POST",
      url: `/deals/${dealId}/explain?at=${encodeURIComponent(tMaterial2.toISOString())}`,
      payload: {
        action: "FINALIZE_CLOSING",
        actorId: gp,
        payload: {},
        authorityContext: {},
        evidenceRefs: []
      }
    });
    expect(explainT4.statusCode).toBe(200);
    const explainBody4 = explainT4.json();
    expect(explainBody4.status).toBe("ALLOWED");
  });
});
