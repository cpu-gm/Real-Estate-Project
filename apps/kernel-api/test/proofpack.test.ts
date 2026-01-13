import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server";
import { createPrismaClient } from "../src/prisma";
import { EventTypes } from "@kernel/shared";

process.env.KERNEL_FAST_TEST = "1";

describe("Proof Pack export", () => {
  const prisma = createPrismaClient();
  const app = buildServer();

  const createDeal = async () => {
    const response = await app.inject({
      method: "POST",
      url: "/deals",
      payload: { name: "Proof Pack Deal" }
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
    const response = await app.inject({
      method: "POST",
      url: `/deals/${dealId}/materials`,
      payload: {
        type,
        truthClass: "DOC",
        evidenceRefs: [],
        meta: {}
      }
    });

    expect(response.statusCode).toBe(201);
    return response.json().id as string;
  };

  const buildMultipartPayload = (filename: string, content: string) => {
    const boundary = "----kernel-proofpack-boundary";
    const header =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      "Content-Type: text/plain\r\n\r\n";
    const footer = `\r\n--${boundary}--\r\n`;
    const payload = Buffer.concat([
      Buffer.from(header, "utf8"),
      Buffer.from(content, "utf8"),
      Buffer.from(footer, "utf8")
    ]);

    return {
      payload,
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`
      }
    };
  };

  const uploadArtifact = async (dealId: string, filename: string, content: string) => {
    const { payload, headers } = buildMultipartPayload(filename, content);
    const response = await app.inject({
      method: "POST",
      url: `/deals/${dealId}/artifacts`,
      payload,
      headers
    });

    expect(response.statusCode).toBe(201);
    return response.json().artifactId as string;
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

  it("exports a proof pack bundle", async () => {
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

    const wireId = await addMaterial(dealId, "WireConfirmation");
    const entityId = await addMaterial(dealId, "EntityFormationDocs");

    const artifactId1 = await uploadArtifact(dealId, "wire.txt", "wire");
    const artifactId2 = await uploadArtifact(dealId, "entity.txt", "entity");

    const link1 = await app.inject({
      method: "POST",
      url: `/deals/${dealId}/artifacts/${artifactId1}/link`,
      payload: { materialId: wireId }
    });
    expect(link1.statusCode).toBe(201);

    const link2 = await app.inject({
      method: "POST",
      url: `/deals/${dealId}/artifacts/${artifactId2}/link`,
      payload: { materialId: entityId }
    });
    expect(link2.statusCode).toBe(201);

    const at = new Date().toISOString();
    const response = await app.inject({
      method: "GET",
      url: `/deals/${dealId}/proofpack?at=${encodeURIComponent(at)}`
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/zip");
    const bodyBuffer = Buffer.from(response.body, "binary");
    const text = bodyBuffer.toString("utf8");
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain("manifest.json");
    expect(text).toContain("snapshot.json");
    expect(text).toContain("compliance-snapshot.pdf");
  }, 20000);
});
