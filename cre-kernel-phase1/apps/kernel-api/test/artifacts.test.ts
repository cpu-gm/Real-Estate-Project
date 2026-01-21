import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server";
import { createPrismaClient } from "../src/prisma";

process.env.KERNEL_FAST_TEST = "1";

describe("Artifacts API", () => {
  const prisma = createPrismaClient();
  const app = buildServer();

  const createDeal = async () => {
    const response = await app.inject({
      method: "POST",
      url: "/deals",
      payload: { name: "Artifact Deal" }
    });

    expect(response.statusCode).toBe(201);
    return response.json().id as string;
  };

  const buildMultipartPayload = (
    filename: string,
    content: string,
    contentType = "text/plain"
  ) => {
    const boundary = "----kernel-artifact-boundary";
    const header =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`;
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

  it("uploads, lists, and downloads artifacts", async () => {
    const dealId = await createDeal();

    const { payload, headers } = buildMultipartPayload("note.txt", "hello");
    const uploadResponse = await app.inject({
      method: "POST",
      url: `/deals/${dealId}/artifacts`,
      payload,
      headers
    });

    expect(uploadResponse.statusCode).toBe(201);
    const uploadBody = uploadResponse.json();
    expect(uploadBody.artifactId).toBeDefined();
    expect(uploadBody.sha256Hex).toMatch(/^[a-f0-9]{64}$/i);

    const listResponse = await app.inject({
      method: "GET",
      url: `/deals/${dealId}/artifacts`
    });

    expect(listResponse.statusCode).toBe(200);
    const listBody = listResponse.json();
    expect(listBody).toHaveLength(1);

    const downloadResponse = await app.inject({
      method: "GET",
      url: `/deals/${dealId}/artifacts/${uploadBody.artifactId}/download`
    });

    expect(downloadResponse.statusCode).toBe(200);
    expect(downloadResponse.body).toBe("hello");
  }, 20000);
});
