# CRE Kernel Phase 1

## Prereqs
- Node.js + npm
- Postgres running locally

## Setup (PowerShell)
```powershell
npm install
Copy-Item .env.example .env
# Edit .env and set DATABASE_URL to your local Postgres credentials
```

## Database setup (local Postgres)
- Set `DATABASE_URL` in the root `.env` (no real passwords committed).
- Ensure the `cre_kernel` database exists locally.
- The first migration already exists. Apply it with `npm run prisma:migrate`.
- Prisma will prompt for a migration name only when the schema changes. For the first run, use `init` or accept the existing migration.
- Troubleshooting: if `pgpass.conf` causes a wrong password, delete `C:\\Users\\majes\\AppData\\Roaming\\postgresql\\pgpass.conf`.

## Apply migration
```powershell
npm run prisma:migrate
```
If `DATABASE_URL` is missing, the migrate script will exit with a clear error. Create `.env` from `.env.example` and set a valid Postgres URL.

## Run API
```powershell
npm run dev:api
```
Health check: `GET http://localhost:3001/health` returns `{ "status": "ok" }`.

## Run tests
```powershell
npm test
```
Tests use a real database. Set `DATABASE_URL_TEST` in `.env` to a separate test database (for example, `cre_kernel_test`) and ensure it has the same migration applied. To prep the test DB, temporarily point `DATABASE_URL` at the test database and run `npm run prisma:migrate`.
