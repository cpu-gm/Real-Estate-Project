import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

const rootEnvPath = resolve(__dirname, "..", "..", "..", ".env");

if (existsSync(rootEnvPath)) {
  loadEnv({ path: rootEnvPath });
} else {
  loadEnv();
}

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set. Create .env from .env.example and set a valid Postgres URL."
  );
  process.exit(1);
}

console.log(
  "If prompted for a migration name, use 'init' for first-time setup or a short name for schema changes."
);

execSync("npx prisma migrate dev --schema prisma/schema.prisma", {
  stdio: "inherit",
  cwd: resolve(__dirname, "..")
});
