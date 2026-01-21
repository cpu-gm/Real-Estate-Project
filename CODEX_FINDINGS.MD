CODEX FINDINGS
==============

Scope
-----
This report captures access control and identity mapping findings from static code inspection.
No code was changed. Findings will be appended as additional issues are investigated.

Environment
-----------
- Vite UI: http://localhost:5173
- BFF API: http://localhost:8787
- Kernel API: http://localhost:3001

Issue 1: Cross-org review request visibility and response
--------------------------------------------------------
Status: Confirmed in code (runtime test pending)

Summary
- Global review request list endpoint exposes requests across orgs to any authenticated user.
- Respond endpoint allows any GP to respond to any review request ID without org/deal access check.
- Attribution uses resolveUserId (raw Authorization header) instead of validated authUser.id.

Evidence
- Global list is only requireAuth and no org filter:
  - `canonical-deal-os/server/index.js:0830`
  - `canonical-deal-os/server/routes/review-requests.js:0079`
- Respond endpoint is only requireGP and handler has no org/deal check:
  - `canonical-deal-os/server/index.js:0837`
  - `canonical-deal-os/server/routes/review-requests.js:0169`
- GET by id performs org check (but only for that route):
  - `canonical-deal-os/server/routes/review-requests.js:0112`
- resolveUserId uses Authorization header string (token) and debug header in non-prod:
  - `canonical-deal-os/server/index.js:0439`

Impact
- Org A GP can see Org B review requests via `/api/review-requests`.
- Org A GP can approve/reject Org B review requests if they know the request ID.
- Review attribution and notifications may be tied to token strings, not user IDs.

Potential diagnostics
- Run the leakage test (create in Org B, list/respond in Org A) against BFF port 8787.
- Verify the list response for `/api/review-requests` is filtered by deal org.

Potential actionable insights
- Enforce org isolation for list/response paths using dealId -> org resolution.
- Use validated authUser.id for requestedBy/reviewedBy attribution.
- Require GP for global list (or scope it to org).

Notes
- Attempted leakage test failed because BFF was not reachable on port 8787 at the time.

Issue 2: Org isolation depends on BFF store population
------------------------------------------------------
Status: Confirmed in code (risk depends on data path)

Summary
- requireDealAccess uses store.dealIndex for org isolation.
- If record.organizationId is null/missing, org check is bypassed.
- Store only upserts org data on deal creation via BFF.

Evidence
- Org check only runs when record.organizationId is set:
  - `canonical-deal-os/server/index.js:0540`
- Store updated on deal creation only:
  - `canonical-deal-os/server/routes/deals.js:0242`
  - `canonical-deal-os/server/store.js:0076`

Impact
- Deals created outside BFF or with missing org in store may bypass org isolation.
- Any endpoint using requireDealAccess inherits this risk.

Potential diagnostics
- Create a deal directly in kernel, do not upsert store, then attempt cross-org access via BFF.
- Inspect `canonical-deal-os/server/.data/store.json` for missing organizationId entries.

Potential actionable insights
- Ensure store is synced with kernel deals and org IDs or enforce org checks via authoritative source.

Issue 3: Notifications/activity/tasks identity uses resolveUserId (token string)
-------------------------------------------------------------------------------
Status: Confirmed in code (runtime behavior depends on environment)

Summary
- Notification and task endpoints use resolveUserId (deprecated) for scoping.
- resolveUserId uses x-debug-user-id in non-prod or raw Authorization header in prod.
- This creates potential identity mismatch and/or cross-user access in non-prod.

Evidence
- Notifications list and mutations use resolveUserId:
  - `canonical-deal-os/server/index.js:2271`
  - `canonical-deal-os/server/routes/notifications.js:0007`
- Activity feed uses resolveActorRole (deprecated):
  - `canonical-deal-os/server/index.js:2320`
  - `canonical-deal-os/server/routes/notifications.js:0107`
- resolveUserId and resolveDebugUserId behavior:
  - `canonical-deal-os/server/index.js:0439`
  - `canonical-deal-os/server/index.js:0417`

Impact
- In dev/non-prod, an authenticated user can pass x-debug-user-id to read another user's notifications/tasks.
- In prod, userId may be treated as the token string, causing mismatched identity and missing data.

Potential diagnostics
- In non-prod, call `/api/notifications` with x-debug-user-id set to another user's id.
- Verify whether notifications created via authUser.id are visible to the same user.

Potential actionable insights
- Scope notifications/activity/tasks using validated authUser.id consistently.
- Treat x-debug-user-id strictly as local dev tooling with additional guardrails.

Issue 4: Excel import cross-org access (importId endpoints)
----------------------------------------------------------
Status: Needs runtime verification; code indicates risk due to schema mismatch.

Summary
- ImportId-based endpoints (/api/excel-imports/:id, /mappings, /apply, /sheet) are gated only by requireAuth/requireGP at dispatch.
- Handlers attempt org isolation by including a deal relation and checking deal.organizationId.
- Prisma schema has no Deal model or ExcelImport -> Deal relation, and ExcelImport has no organizationId.
- This likely yields a runtime error (unknown include) or silently bypasses org isolation.

Deep dive trace
- Upload is deal-scoped and writes ExcelImport + ExcelCell records after requireGPWithDealAccess:
  - `canonical-deal-os/server/index.js:1393`
  - `canonical-deal-os/server/routes/excel-import.js:0146`
  - `canonical-deal-os/server/routes/excel-import.js:0170`
- ImportId endpoints are auth-only at dispatch and rely on a missing deal relation:
  - `canonical-deal-os/server/index.js:1409`
  - `canonical-deal-os/server/index.js:1418`
  - `canonical-deal-os/server/index.js:1427`
  - `canonical-deal-os/server/index.js:1436`
  - `canonical-deal-os/server/routes/excel-import.js:0249`
- Apply endpoint mutates underwriting state for the dealId on the import:
  - `canonical-deal-os/server/routes/excel-import.js:0390`
  - `canonical-deal-os/server/routes/excel-import.js:0417`
  - `canonical-deal-os/server/routes/excel-import.js:0441`

Evidence
- Dispatch gates for importId endpoints use requireAuth/requireGP (not requireDealAccess):
  - `canonical-deal-os/server/index.js:1409`
  - `canonical-deal-os/server/index.js:1418`
  - `canonical-deal-os/server/index.js:1427`
  - `canonical-deal-os/server/index.js:1436`
- Handlers rely on include: { deal: true } and deal.organizationId:
  - `canonical-deal-os/server/routes/excel-import.js:249`
  - `canonical-deal-os/server/routes/excel-import.js:309`
  - `canonical-deal-os/server/routes/excel-import.js:378`
  - `canonical-deal-os/server/routes/excel-import.js:469`
- Prisma schema lacks a Deal model and ExcelImport has no relation or org field:
  - `canonical-deal-os/server/prisma/schema.prisma:0987`
  - `canonical-deal-os/server/prisma/schema.prisma:0507` (DealProfile exists, no relation)

Impact
- If the include fails, endpoints may return 500 and leave org checks ineffective.
- If include is ignored or returns null, any authenticated user could access another org's import by ID.

Potential diagnostics
- Create an Excel import in Org B, then call:
  - GET /api/excel-imports/:id (Org A token)
  - PATCH /api/excel-imports/:id/mappings (Org A GP token)
  - POST /api/excel-imports/:id/apply (Org A GP token)
  - GET /api/excel-imports/:id/sheet/:sheetName (Org A token)
- Observe whether response is 403, 200, or 500.

Potential actionable insights
- Enforce org isolation using a persisted org identifier on ExcelImport or a reliable deal->org join.
- Use requireDealAccess for importId endpoints if dealId is known.

Issue 5: Chat public channel listing lacks org filter
-----------------------------------------------------
Status: Confirmed in code (runtime test pending)

Summary
- /api/chat/conversations lists public and role-based channels without filtering by organizationId.
- Conversations are created with organizationId, and other chat endpoints enforce org isolation.
- This means Org A could see Org B public/role-based channels and their last messages/participants.

Evidence
- Public channels query has no org filter:
  - `canonical-deal-os/server/routes/chat.js:57`
  - `canonical-deal-os/server/routes/chat.js:76`
- Conversation creation sets organizationId:
  - `canonical-deal-os/server/routes/chat.js:175`
- Org isolation enforced on conversation/message endpoints (but not list of public channels):
  - `canonical-deal-os/server/routes/chat.js:253`
  - `canonical-deal-os/server/routes/chat.js:296`

Impact
- Cross-org visibility of channel names, last message snippets, and participant counts.
- Potential leakage of recent message content (first 100 chars) for channels outside org.

Potential diagnostics
- Create a PUBLIC channel in Org B and post a message.
- As Org A, call GET /api/chat/conversations and check for the Org B channel.

Potential actionable insights
- Filter publicChannels by organizationId in handleListConversations.
- Consider enforcing org isolation for PUBLIC/ROLE_BASED channel discovery.

Issue 6: LP preferences access control appears fixed
----------------------------------------------------
Status: Verified in code (no issue found)

Summary
- /api/lp/preferences endpoints now require auth and verify ownership (authUserId or email) or GP/Admin role.

Evidence
- Dispatch uses requireAuth and passes authUser:
  - `canonical-deal-os/server/index.js:1826`
  - `canonical-deal-os/server/index.js:1835`
- Handler verifies lpActor ownership or GP/Admin:
  - `canonical-deal-os/server/routes/lp-portal-access.js:350`
  - `canonical-deal-os/server/routes/lp-portal-access.js:408`

Impact
- No cross-LP preference access observed in current code.

Potential diagnostics
- Attempt GET/PUT /api/lp/preferences with a different lpActorId from another user; expect 403.

Issue 7: LP document delete/permissions org isolation relies on missing Deal relation
------------------------------------------------------------------------------------
Status: Needs runtime verification; code indicates risk due to schema mismatch.

Summary
- DELETE /api/lp/documents/:docId and PUT /api/lp/documents/:docId/permissions are gated only by requireGP at dispatch.
- Handlers attempt org isolation via include: { deal: true } and deal.organizationId check.
- LPDocument model has no Deal relation or organizationId, so org check may fail or be bypassed.

Evidence
- Dispatch gates for delete/permissions use requireGP (no deal access):
  - `canonical-deal-os/server/index.js:1768`
  - `canonical-deal-os/server/index.js:1776`
- Handler org check relies on document.deal.organizationId:
  - `canonical-deal-os/server/routes/lp-documents.js:234`
  - `canonical-deal-os/server/routes/lp-documents.js:273`
- Prisma schema has no LPDocument -> Deal relation:
  - `canonical-deal-os/server/prisma/schema.prisma:1454`

Impact
- If include fails, endpoints may return 500 and org checks become ineffective.
- If include yields null, any GP could delete or change permissions on another org's LP documents by ID.

Potential diagnostics
- Create an LP document in Org B, then from Org A GP call:
  - DELETE /api/lp/documents/:docId
  - PUT /api/lp/documents/:docId/permissions
- Observe whether response is 403, 200, or 500.

Potential actionable insights
- Enforce org isolation using a persisted org identifier on LPDocument or a reliable deal->org join.
- Consider requiring deal-scoped access for destructive LP document operations.

Issue 8: LP document upload lacks deal/org access check
-------------------------------------------------------
Status: Confirmed in code (runtime test pending)

Summary
- POST /api/lp/documents is gated only by requireGP.
- Handler accepts dealId from request body and does not verify deal ownership or org access.
- Allows a GP to attach documents to any dealId they can guess.

Evidence
- Dispatch uses requireGP only:
  - `canonical-deal-os/server/index.js:1746`
- Handler does not check deal access or org:
  - `canonical-deal-os/server/routes/lp-documents.js:35`

Impact
- Cross-org document injection: GP can upload LP docs to other org deals by ID.

Potential diagnostics
- As Org A GP, upload an LP document with Org B dealId and observe success.

Potential actionable insights
- Require deal-scoped access for uploads (requireDealAccess or equivalent).
- Validate dealId against org before creating LPDocument.
