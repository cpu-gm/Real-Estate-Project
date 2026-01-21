import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { buildServer } from "../src/server";
import { createPrismaClient } from "../src/prisma";
import { DealStates, EventTypes, StressModes } from "@kernel/shared";

describe("Deal lifecycle projection", () => {
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

  const seedGateMaterials = async (dealId: string) => {
    await addMaterial(dealId, "UnderwritingSummary", "HUMAN");
    await addMaterial(dealId, "FinalUnderwriting", "DOC");
    await addMaterial(dealId, "SourcesAndUses", "DOC");
    await addMaterial(dealId, "WireConfirmation", "DOC");
    await addMaterial(dealId, "EntityFormationDocs", "DOC");
    await addMaterial(dealId, "PropertyManagementAgreement", "DOC");
  };

  const createDeal = async (name = "Lifecycle Deal") => {
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
    const response = await app.inject({
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

    expect(response.statusCode).toBe(201);
    return response.json();
  };

  const grantApproval = async (dealId: string, actorId: string, action: string) => {
    return appendEvent(dealId, actorId, EventTypes.ApprovalGranted, { action });
  };

  const getDeal = async (dealId: string) => {
    const response = await app.inject({
      method: "GET",
      url: `/deals/${dealId}`
    });

    expect(response.statusCode).toBe(200);
    return response.json();
  };

  const advanceToOperating = async (dealId: string, actors: {
    gp: string;
    legal: string;
    lender: string;
    escrow: string;
    operator: string;
  }) => {
    await seedGateMaterials(dealId);
    await appendEvent(dealId, actors.gp, EventTypes.ReviewOpened);
    await grantApproval(dealId, actors.gp, "APPROVE_DEAL");
    await appendEvent(dealId, actors.gp, EventTypes.DealApproved);

    await grantApproval(dealId, actors.gp, "ATTEST_READY_TO_CLOSE");
    await grantApproval(dealId, actors.legal, "ATTEST_READY_TO_CLOSE");
    await appendEvent(dealId, actors.gp, EventTypes.ClosingReadinessAttested);

    await grantApproval(dealId, actors.gp, "FINALIZE_CLOSING");
    await grantApproval(dealId, actors.lender, "FINALIZE_CLOSING");
    await grantApproval(dealId, actors.escrow, "FINALIZE_CLOSING");
    await appendEvent(dealId, actors.gp, EventTypes.ClosingFinalized);

    await grantApproval(dealId, actors.gp, "ACTIVATE_OPERATIONS");
    await grantApproval(dealId, actors.operator, "ACTIVATE_OPERATIONS");
    await appendEvent(dealId, actors.gp, EventTypes.OperationsActivated);
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

  it("creates a deal in Draft/SM-0", async () => {
    const dealId = await createDeal();
    const deal = await getDeal(dealId);

    expect(deal.state).toBe(DealStates.Draft);
    expect(deal.stressMode).toBe(StressModes.SM0);
  });

  it("projects core lifecycle transitions", async () => {
    const dealId = await createDeal();
    const gp = await createActorWithRole(dealId, "GP");
    const legal = await createActorWithRole(dealId, "LEGAL");
    const lender = await createActorWithRole(dealId, "LENDER");
    const escrow = await createActorWithRole(dealId, "ESCROW");
    const operator = await createActorWithRole(dealId, "OPERATOR");

    await seedGateMaterials(dealId);

    await appendEvent(dealId, gp, EventTypes.ReviewOpened);
    let deal = await getDeal(dealId);
    expect(deal.state).toBe(DealStates.UnderReview);
    expect(deal.stressMode).toBe(StressModes.SM0);

    await grantApproval(dealId, gp, "APPROVE_DEAL");
    await appendEvent(dealId, gp, EventTypes.DealApproved);
    deal = await getDeal(dealId);
    expect(deal.state).toBe(DealStates.Approved);
    expect(deal.stressMode).toBe(StressModes.SM0);

    await grantApproval(dealId, gp, "ATTEST_READY_TO_CLOSE");
    await grantApproval(dealId, legal, "ATTEST_READY_TO_CLOSE");
    await appendEvent(dealId, gp, EventTypes.ClosingReadinessAttested);
    deal = await getDeal(dealId);
    expect(deal.state).toBe(DealStates.ReadyToClose);
    expect(deal.stressMode).toBe(StressModes.SM0);

    await grantApproval(dealId, gp, "FINALIZE_CLOSING");
    await grantApproval(dealId, lender, "FINALIZE_CLOSING");
    await grantApproval(dealId, escrow, "FINALIZE_CLOSING");
    await appendEvent(dealId, gp, EventTypes.ClosingFinalized);
    deal = await getDeal(dealId);
    expect(deal.state).toBe(DealStates.Closed);
    expect(deal.stressMode).toBe(StressModes.SM0);

    await grantApproval(dealId, gp, "ACTIVATE_OPERATIONS");
    await grantApproval(dealId, operator, "ACTIVATE_OPERATIONS");
    await appendEvent(dealId, gp, EventTypes.OperationsActivated);
    deal = await getDeal(dealId);
    expect(deal.state).toBe(DealStates.Operating);
    expect(deal.stressMode).toBe(StressModes.SM0);
  });

  it("handles change and reconciliation", async () => {
    const dealId = await createDeal();
    const gp = await createActorWithRole(dealId, "GP");
    const legal = await createActorWithRole(dealId, "LEGAL");
    const lender = await createActorWithRole(dealId, "LENDER");
    const escrow = await createActorWithRole(dealId, "ESCROW");
    const operator = await createActorWithRole(dealId, "OPERATOR");

    await advanceToOperating(dealId, { gp, legal, lender, escrow, operator });

    await appendEvent(dealId, gp, EventTypes.MaterialChangeDetected);
    let deal = await getDeal(dealId);
    expect(deal.state).toBe(DealStates.Changed);

    await appendEvent(dealId, gp, EventTypes.ChangeReconciled);
    deal = await getDeal(dealId);
    expect(deal.state).toBe(DealStates.Operating);
  });

  it("handles distress lifecycle and stress mode", async () => {
    const dealId = await createDeal();
    const gp = await createActorWithRole(dealId, "GP");
    const legal = await createActorWithRole(dealId, "LEGAL");
    const lender = await createActorWithRole(dealId, "LENDER");
    const escrow = await createActorWithRole(dealId, "ESCROW");
    const operator = await createActorWithRole(dealId, "OPERATOR");

    await advanceToOperating(dealId, { gp, legal, lender, escrow, operator });

    await appendEvent(dealId, gp, EventTypes.DistressDeclared);
    let deal = await getDeal(dealId);
    expect(deal.state).toBe(DealStates.Distressed);
    expect(deal.stressMode).toBe(StressModes.SM2);

    await grantApproval(dealId, gp, "RESOLVE_DISTRESS");
    await grantApproval(dealId, lender, "RESOLVE_DISTRESS");
    await appendEvent(dealId, gp, EventTypes.DistressResolved);
    deal = await getDeal(dealId);
    expect(deal.state).toBe(DealStates.Resolved);
    expect(deal.stressMode).toBe(StressModes.SM0);
  });

  it("retains SM-1 after distress resolves if disputed", async () => {
    const dealId = await createDeal();
    const gp = await createActorWithRole(dealId, "GP");
    const legal = await createActorWithRole(dealId, "LEGAL");
    const lender = await createActorWithRole(dealId, "LENDER");
    const escrow = await createActorWithRole(dealId, "ESCROW");
    const operator = await createActorWithRole(dealId, "OPERATOR");

    await appendEvent(dealId, gp, EventTypes.DataDisputed);
    await advanceToOperating(dealId, { gp, legal, lender, escrow, operator });
    await appendEvent(dealId, gp, EventTypes.DistressDeclared);
    await grantApproval(dealId, gp, "RESOLVE_DISTRESS");
    await grantApproval(dealId, lender, "RESOLVE_DISTRESS");
    await appendEvent(dealId, gp, EventTypes.DistressResolved);

    const deal = await getDeal(dealId);
    expect(deal.state).toBe(DealStates.Resolved);
    expect(deal.stressMode).toBe(StressModes.SM1);
  });

  it("elevates stress mode on DataDisputed", async () => {
    const dealId = await createDeal();
    const gp = await createActorWithRole(dealId, "GP");

    await appendEvent(dealId, gp, EventTypes.DataDisputed);
    const deal = await getDeal(dealId);

    expect(deal.stressMode).toBe(StressModes.SM1);
  });

  it("freezes and restores state", async () => {
    const dealId = await createDeal();
    const gp = await createActorWithRole(dealId, "GP");
    const legal = await createActorWithRole(dealId, "LEGAL");
    const lender = await createActorWithRole(dealId, "LENDER");
    const escrow = await createActorWithRole(dealId, "ESCROW");
    const operator = await createActorWithRole(dealId, "OPERATOR");
    const court = await createActorWithRole(dealId, "COURT");

    await advanceToOperating(dealId, { gp, legal, lender, escrow, operator });

    await appendEvent(dealId, court, EventTypes.FreezeImposed);
    let deal = await getDeal(dealId);
    expect(deal.state).toBe(DealStates.Frozen);
    expect(deal.stressMode).toBe(StressModes.SM3);

    await appendEvent(dealId, court, EventTypes.FreezeLifted);
    deal = await getDeal(dealId);
    expect(deal.state).toBe(DealStates.Operating);
    expect(deal.stressMode).toBe(StressModes.SM0);
  });

  it("forces Exited and Terminated", async () => {
    const dealId = await createDeal();
    const gp = await createActorWithRole(dealId, "GP");

    await appendEvent(dealId, gp, EventTypes.ExitFinalized);
    let deal = await getDeal(dealId);
    expect(deal.state).toBe(DealStates.Exited);

    await appendEvent(dealId, gp, EventTypes.DealTerminated);
    deal = await getDeal(dealId);
    expect(deal.state).toBe(DealStates.Terminated);
  });

  it("returns 404 for missing deal", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/deals/${randomUUID()}`
    });

    expect(response.statusCode).toBe(404);
  });
});

