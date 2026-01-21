import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server";
import { createPrismaClient } from "../src/prisma";

describe("Actor list endpoints", () => {
  const prisma = createPrismaClient();
  const app = buildServer();

  const createDeal = async (name = "Actors Deal") => {
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

  it("creates an actor linked to a role for the deal", async () => {
    const dealId = await createDeal();

    const response = await app.inject({
      method: "POST",
      url: `/deals/${dealId}/actors`,
      payload: { name: "GP Actor", type: "HUMAN", role: "GP" }
    });

    expect(response.statusCode).toBe(201);
    const actor = response.json();
    expect(actor.id).toBeTruthy();
    expect(actor.roles).toContain("GP");
    expect(actor.dealId).toBe(dealId);
  });

  it("lists actors with roles for a deal", async () => {
    const dealId = await createDeal();
    const gpId = await createActorWithRole(dealId, "GP");
    await createActorWithRole(dealId, "LENDER");

    const secondRole = await app.inject({
      method: "POST",
      url: `/deals/${dealId}/actors/${gpId}/roles`,
      payload: { role: "LENDER" }
    });

    expect(secondRole.statusCode).toBe(200);

    const response = await app.inject({
      method: "GET",
      url: `/deals/${dealId}/actors`
    });

    expect(response.statusCode).toBe(200);
    const actors = response.json();
    const gpActor = actors.find((actor: { id: string }) => actor.id === gpId);
    expect(gpActor).toBeTruthy();
    expect(gpActor.roles).toContain("GP");
    expect(gpActor.roles).toContain("LENDER");
  });

  it("returns a single actor with roles", async () => {
    const dealId = await createDeal();
    const actorId = await createActorWithRole(dealId, "GP");

    const response = await app.inject({
      method: "GET",
      url: `/deals/${dealId}/actors/${actorId}`
    });

    expect(response.statusCode).toBe(200);
    const actor = response.json();
    expect(actor.id).toBe(actorId);
    expect(actor.roles).toContain("GP");
  });

  it("returns 404 when deal is missing", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/deals/00000000-0000-0000-0000-000000000000/actors"
    });

    expect(response.statusCode).toBe(404);
  });
});
