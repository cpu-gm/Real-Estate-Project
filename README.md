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
API defaults to port 3001. Health check: `GET http://localhost:3001/health` returns `{ "status": "ok" }`.

## Run tests
```powershell
npm test
```
Tests use a real database. Set `DATABASE_URL_TEST` in `.env` to a separate test database (for example, `cre_kernel_test`) and ensure it has the same migration applied. To prep the test DB, temporarily point `DATABASE_URL` at the test database and run `npm run prisma:migrate`.

## Phase 2A UI
- Set `NEXT_PUBLIC_KERNEL_API_URL` in the root `.env` (see `.env.example`).
- Run the API and UI in separate terminals:
  - `npm run dev:api`
  - `npm run dev:ui`
- UI URLs:
  - `http://localhost:3000/`
  - `http://localhost:3000/deals/{dealId}/timeline`
  - `http://localhost:3000/deals/{dealId}/action`
  - `http://localhost:3000/deals/{dealId}/materials`
- The UI is kernel-faithful and does not derive lifecycle/authority/gating logic.
- UI runs on port 3000 and targets the kernel at port 3001 by default.

## Kernel issues
- Materials endpoints are not implemented in the kernel yet. The UI will show a placeholder on the Materials screen.

## Stop & Reset Local Dev
Stop running `npm run dev:api` and `npm run dev:ui` with Ctrl+C in each terminal first.
```powershell
netstat -ano | findstr ":3000"
netstat -ano | findstr ":3001"
taskkill /PID <PID> /F
```
