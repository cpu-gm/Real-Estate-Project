import { PrismaClient } from "@prisma/client";
import { getDatabaseUrl } from "./config";

export function createPrismaClient(): PrismaClient {
  const databaseUrl = getDatabaseUrl();

  return new PrismaClient({
    datasources: databaseUrl ? { db: { url: databaseUrl } } : undefined
  });
}
