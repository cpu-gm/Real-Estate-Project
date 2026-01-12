import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { buildServer } from "../src/server";
import { createPrismaClient } from "../src/prisma";
import { EventTypes } from "@kernel/shared";

describe("Deals and events", () => {
  const prisma = createPrismaClient();
  const app = buildServer();

  const createDeal = async (name = "Alpha Deal") => {
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

  it("POST /deals creates a Draft deal with SM-0", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/deals",
      payload: { name: "Alpha Deal" }
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.name).toBe("Alpha Deal");
    expect(body.state).toBe("Draft");
    expect(body.stressMode).toBe("SM-0");
    expect(body.id).toBeDefined();
    expect(body.createdAt).toBeDefined();
    expect(body.updatedAt).toBeDefined();
  });

  it("POST /deals/:id/events creates an event and GET returns it", async () => {
    const dealId = await createDeal("Event Deal");
    const actorId = await createActorWithRole(dealId, "GP");

    const eventResponse = await app.inject({
      method: "POST",
      url: `/deals/${dealId}/events`,
      payload: {
        type: EventTypes.ReviewOpened,
        actorId,
        payload: {},
        authorityContext: {},
        evidenceRefs: ["ref-1"]
      }
    });

    expect(eventResponse.statusCode).toBe(201);
    const eventBody = eventResponse.json();
    expect(eventBody.dealId).toBe(dealId);
    expect(eventBody.type).toBe(EventTypes.ReviewOpened);
    expect(eventBody.actorId).toBe(actorId);

    const getResponse = await app.inject({
      method: "GET",
      url: `/deals/${dealId}/events`
    });

    expect(getResponse.statusCode).toBe(200);
    const events = getResponse.json();
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe(eventBody.id);
  });

  it("POST /deals/:id/events returns 404 for missing deal", async () => {
    const missingDealId = randomUUID();

    const response = await app.inject({
      method: "POST",
      url: `/deals/${missingDealId}/events`,
      payload: {
        type: EventTypes.ReviewOpened,
        actorId: randomUUID(),
        payload: {},
        authorityContext: {},
        evidenceRefs: []
      }
    });

    expect(response.statusCode).toBe(404);
  });

  it("POST /deals/:id/events returns 400 for missing actor", async () => {
    const dealId = await createDeal("Actor Deal");

    const response = await app.inject({
      method: "POST",
      url: `/deals/${dealId}/events`,
      payload: {
        type: EventTypes.ReviewOpened,
        actorId: randomUUID(),
        payload: {},
        authorityContext: {},
        evidenceRefs: []
      }
    });

    expect(response.statusCode).toBe(400);
  });

  it("GET /deals/:id/events returns 404 for missing deal", async () => {
    const missingDealId = randomUUID();

    const response = await app.inject({
      method: "GET",
      url: `/deals/${missingDealId}/events`
    });

    expect(response.statusCode).toBe(404);
  });
});
