import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

let envLoaded = false;

export function loadEnvironment(): void {
  if (envLoaded) {
    return;
  }

  const rootEnvPath = resolve(__dirname, "..", "..", "..", ".env");
  if (existsSync(rootEnvPath)) {
    loadEnv({ path: rootEnvPath });
  } else {
    loadEnv();
  }

  envLoaded = true;
}

export function getPort(): number {
  loadEnvironment();
  return Number(process.env.PORT) || 3001;
}

export function getDatabaseUrl(): string | undefined {
  loadEnvironment();

  if (process.env.NODE_ENV === "test" && process.env.DATABASE_URL_TEST) {
    return process.env.DATABASE_URL_TEST;
  }

  return process.env.DATABASE_URL;
}
