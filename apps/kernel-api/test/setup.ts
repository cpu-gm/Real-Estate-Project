import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

process.env.NODE_ENV = "test";

const rootEnvPath = resolve(__dirname, "..", "..", "..", ".env");
if (existsSync(rootEnvPath)) {
  loadEnv({ path: rootEnvPath });
} else {
  loadEnv();
}
