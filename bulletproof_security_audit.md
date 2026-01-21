Bulletproof Security Audit: Identity, Orgs, Permissions
Date: January 17, 2026
Auditor: Claude Code (Opus 4.5)
Scope: Pre-automation security verification for money-moving workflows

VERDICT: NOT BULLETPROOF
10 Critical Vulnerabilities Must Be Fixed Before Money-Moving Automation

Executive Summary
Criterion	Status	Evidence
A) No cross-org IDOR	FAIL	6+ endpoints lack org checks
B) No identity spoofing	FAIL	x-actor-role spoofable for chat authZ
C) Money-moving authority	PARTIAL	Good maker-checker, but gaps exist
D) Public endpoints fail-closed	PASS	Webhooks/tokens validated
E) Audit log coverage	FAIL	8+ privileged mutations unlogged
TOP 10 VULNERABILITIES
V1: CRITICAL - Excel Import IDOR (Cross-Org Access)
Exploit: GP from Org-A can access/modify Excel imports belonging to Org-B
Routes:

GET /api/excel-imports/:importId
PATCH /api/excel-imports/:importId/mappings
POST /api/excel-imports/:importId/apply
GET /api/excel-imports/:importId/sheet/:sheetName
Evidence: server/index.js:1287-1316 - Only requireAuth or requireGP, no org check
Patch:


// Add to each handler in excel-import.js
const excelImport = await prisma.excelImport.findUnique({ where: { id: importId }, include: { deal: true } });
if (excelImport.deal.organizationId !== authUser.organizationId) {
  return sendError(res, 403, "Access denied - import belongs to different organization");
}
V2: CRITICAL - x-actor-role Header Spoofing
Exploit: Any authenticated user can spoof role to join role-restricted chat conversations
Route: POST /api/chat/conversations/:id/join
Evidence:

server/index.js:366-372 - resolveActorRole() reads x-actor-role header without validation
server/routes/chat.js:27-35 - canAccessConversation() uses unvalidated role
Patch:


// Replace all uses of resolveActorRole(req) with authUser.role
// In index.js, remove resolveActorRole function or gate it like resolveDebugUserId

// chat.js - Replace:
const userRole = resolveUserRole(req);
// With:
const userRole = authUser.role; // authUser comes from requireAuth
V3: CRITICAL - LP Document Endpoints Missing Org Check
Exploit: GP from Org-A can delete/modify permissions on Org-B's LP documents
Routes:

DELETE /api/lp/documents/:docId (server/index.js:1570)
PUT /api/lp/documents/:docId/permissions (server/index.js:1577)
Evidence: Only requireGP guard, no document→deal→org chain validation
Patch:


// lp-documents.js - Add to handleLPDeleteDocument and handleLPUpdatePermissions
const doc = await prisma.lPDocument.findUnique({ where: { id: docId }, include: { deal: true } });
if (!doc) return sendError(res, 404, "Document not found");
if (doc.deal.organizationId !== authUser.organizationId) {
  return sendError(res, 403, "Access denied - document belongs to different organization");
}
V4: CRITICAL - Review Request IDOR
Exploit: Any authenticated user can read any review request
Route: GET /api/review-requests/:reviewId
Evidence: server/index.js:726-731 - Only requireAuth, no org check
Patch:


// review-requests.js - handleGetReviewRequest
const request = await prisma.reviewRequest.findUnique({ where: { id: reviewId }, include: { deal: true } });
if (request.deal.organizationId !== authUser.organizationId) {
  return sendError(res, 403, "Access denied");
}
V5: CRITICAL - LLM Force-Accept No Auth Gate
Exploit: Unauthenticated request can force-accept LLM parsing results
Route: POST /api/llm/parse-deal/force-accept
Evidence: server/routes/llm.js:262-287 - No authentication check at all
Patch:


// index.js dispatch (around line 912)
if (req.method === "POST" && path === "/api/llm/parse-deal/force-accept") {
  const authUser = await requireGP(req, res); // ADD THIS
  if (!authUser) return;
  return handleForceAccept(req, res, getPrisma);
}
V6: HIGH - Chat Conversation IDOR (Participant-Only Check)
Exploit: Cross-org users may access conversations if they guess conversation ID
Routes:

GET /api/chat/conversations/:id
GET /api/chat/conversations/:id/messages
POST /api/chat/conversations/:id/messages
Evidence: server/routes/chat.js:229-260 - Only checks participant membership, no org validation
Patch:


// chat.js - Add org check after participant check
if (conversation.organizationId && conversation.organizationId !== authUser.organizationId) {
  return sendError(res, 403, "Access denied - conversation belongs to different organization");
}
Note: Requires adding organizationId field to Conversation model

V7: HIGH - Distribution Mark-as-Paid No Audit Log
Exploit: Financial transaction with zero audit trail - forensic blindness
Route: POST /api/deals/:id/distributions/:id/allocations/:id/mark-paid
Evidence: server/routes/distributions.js:413-463 - No audit log created
Patch:


// distributions.js - Add after successful update
await prisma.permissionAuditLog.create({
  data: {
    actorId: authUser.id,
    actorName: authUser.name,
    action: 'DISTRIBUTION_MARKED_PAID',
    afterValue: JSON.stringify({ distributionId, allocationId, paidAmount, confirmationRef }),
    ipAddress: req.headers["x-forwarded-for"] || req.socket?.remoteAddress
  }
});
V8: HIGH - LP Preferences No Auth
Exploit: Any user can read/modify any LP actor's notification preferences
Routes:

GET /api/lp/preferences?lpActorId=xxx
PUT /api/lp/preferences
Evidence: server/routes/lp-portal-access.js:542-590 - No authentication check
Patch:


// lp-portal-access.js - handleLPGetPreferences, handleLPUpdatePreferences
// Verify authUser owns this lpActorId
const lpActor = await prisma.lPActor.findUnique({ where: { id: lpActorId } });
if (lpActor.authUserId !== authUser.id && lpActor.email !== authUser.email) {
  return sendError(res, 403, "Access denied - not your LP actor");
}
V9: MEDIUM - Deal Assignment No Audit Log
Exploit: Analyst access control changes have no audit trail
Routes:

POST /api/deals/:id/assignments
DELETE /api/deals/:id/assignments/:id
Evidence: server/routes/deal-assignments.js:69-175 - No audit log
Patch:


// deal-assignments.js - Add after assignment create/delete
await prisma.permissionAuditLog.create({
  data: {
    actorId: authUser.id,
    action: 'DEAL_ASSIGNMENT_CHANGED',
    afterValue: JSON.stringify({ dealId, analystId, operation: 'assign'/'unassign' })
  }
});
V10: MEDIUM - LP Invitation Endpoints Missing Role Gate
Exploit: Any authenticated user (even LP role) can send LP invitations
Route: POST /api/lp/invitations
Evidence: server/routes/lp-onboarding.js:44-141 - No requireGP check
Patch:


// index.js dispatch (line 1476)
if (req.method === "POST" && path === "/api/lp/invitations") {
  const authUser = await requireGP(req, res); // Already exists, verify it's enforced
  if (!authUser) return;
  return handleSendInvitation(...);
}
IDOR AUDIT SUMMARY
Endpoint	ID Source	Org Check	Verdict
GET /api/excel-imports/:id	URL param	MISSING	VULNERABLE
PATCH /api/excel-imports/:id/mappings	URL param	MISSING	VULNERABLE
POST /api/excel-imports/:id/apply	URL param	MISSING	VULNERABLE
GET /api/excel-imports/:id/sheet/:name	URL param	MISSING	VULNERABLE
GET /api/review-requests/:id	URL param	MISSING	VULNERABLE
DELETE /api/lp/documents/:id	URL param	MISSING	VULNERABLE
PUT /api/lp/documents/:id/permissions	URL param	MISSING	VULNERABLE
GET /api/chat/conversations/:id	URL param	Participant only	VULNERABLE
GET /api/lp/preferences	Query param	MISSING	VULNERABLE
GET /api/submissions/:id	URL param	Via deal FK	SAFE
GET /api/deals/:id/capital-calls/:id	URL params	Via requireDealAccess	SAFE
GET /api/deals/:id/distributions/:id	URL params	Via requireDealAccess	SAFE
IDENTITY SPOOFING AUDIT SUMMARY
Header/Function	Usage	Status
x-debug-user-id	Debug only	SAFE - Disabled in production
x-canonical-user-id	Debug only	SAFE - Disabled in production
x-user-id	Audit logging	SAFE - Not used for authZ
x-user-name	Display only	SAFE - Not used for authZ
x-actor-role	Chat authorization	UNSAFE - Spoofable for conversation access
resolveUserId(req)	Logging fallback	SAFE - Returns 'anonymous' in prod
resolveActorRole(req)	Chat role check	UNSAFE - Reads unvalidated header
AUTHORITY AUDIT SUMMARY
Operation	Role Gate	Self-Approval Prevention	Approval Prerequisite	Audit Log
Capital Call Issue	requireGP	YES (line 305)	Creates ApprovalRecord	YES
Distribution Approve	requireGP	YES (line 306)	Creates ApprovalRecord	YES
Distribution Process	requireGP	N/A	YES - Checks approval exists (line 369)	NO
Distribution Mark-Paid	requireGP	NO	NO	MISSING
Claim Verify	Dispatch only	N/A	N/A	YES (DealEvent)
Claim Reject	Dispatch only	N/A	N/A	YES (DealEvent)
State Transition	requireGPWithDealAccess	N/A	N/A	YES (DealEvent)
LLM Force-Accept	NONE	N/A	N/A	Partial (no actor)
LP Invitation	Should be requireGP	N/A	N/A	Webhook only
User Role Change	requireAdmin	N/A	N/A	YES
AUDIT LOG COVERAGE
Mutation	Logged	Log Type	Actor	Before/After
Capital Call Create	NO	-	-	-
Capital Call Issue	YES	ApprovalRecord	YES	NO
Distribution Create	NO	-	-	-
Distribution Approve	YES	ApprovalRecord	YES	NO
Distribution Process	NO	-	-	-
Distribution Mark-Paid	MISSING	-	-	-
Deal Creation	MISSING	-	-	-
Deal Assignment	MISSING	-	-	-
Deal Unassignment	MISSING	-	-	-
LP Invitation Send	Webhook only	No DB	YES	NO
LP Invitation Accept	Webhook only	No DB	YES	NO
LLM Force-Accept	Partial	LLMParseSession	NO ACTOR	NO
User Role Change	YES	PermissionAuditLog	YES	YES
User Status Change	YES	PermissionAuditLog	YES	YES
Verification Approve/Reject	YES	PermissionAuditLog	YES	YES
LP VISIBILITY AUDIT
PASS - LP field filtering is comprehensive:

LP_VISIBLE_DEAL_FIELDS enforced in lp-onboarding.js
All LP endpoints filter to published/issued status only
Per-LP allocation scoping prevents cross-LP data leakage
No alternate endpoints expose full deal objects to LPs
Side letter isolation via SPECIFIC_LPS visibility model
MINIMAL PATCH PLAN
Priority 1 (Block Deployment)
V5: Add requireGP to /api/llm/parse-deal/force-accept - 1 line
V2: Replace resolveActorRole(req) with authUser.role in chat.js - 5 lines
V1: Add org check to excel-import.js handlers - 20 lines
V3: Add org check to lp-documents.js delete/permissions - 10 lines
Priority 2 (Before Automation Go-Live)
V4: Add org check to review-requests.js - 5 lines
V8: Add auth to lp-portal-access.js preferences - 10 lines
V7: Add audit log to distributions.js mark-paid - 10 lines
V9: Add audit log to deal-assignments.js - 10 lines
Priority 3 (Technical Debt)
V6: Add organizationId to Conversation model - Schema change
V10: Verify requireGP enforcement on LP invitation - Verify only
VERIFICATION TESTS
After patching, run these curl commands:


# V1: Excel import cross-org blocked
curl -X GET "http://localhost:8787/api/excel-imports/$ORG_B_IMPORT_ID" \
  -H "Authorization: $ORG_A_GP_JWT"
# Expected: 403

# V2: x-actor-role spoofing blocked
curl -X POST "http://localhost:8787/api/chat/conversations/$CONV_ID/join" \
  -H "Authorization: $LP_JWT" \
  -H "x-actor-role: Admin"
# Expected: 403 (LP cannot join Admin-only conversation)

# V3: LP document cross-org blocked
curl -X DELETE "http://localhost:8787/api/lp/documents/$ORG_B_DOC_ID" \
  -H "Authorization: $ORG_A_GP_JWT"
# Expected: 403

# V5: Force-accept requires auth
curl -X POST "http://localhost:8787/api/llm/parse-deal/force-accept" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"xxx","rationale":"test"}'
# Expected: 401

# V7: Mark-paid creates audit log
curl -X POST "http://localhost:8787/api/deals/$DEAL_ID/distributions/$DIST_ID/allocations/$ALLOC_ID/mark-paid" \
  -H "Authorization: $GP_JWT" \
  -d '{"confirmationRef":"WIRE123"}'
# Then verify: SELECT * FROM PermissionAuditLog WHERE action='DISTRIBUTION_MARKED_PAID'

# Self-approval still blocked
curl -X POST "http://localhost:8787/api/deals/$DEAL_ID/capital-calls/$CALL_ID/issue" \
  -H "Authorization: $CREATOR_JWT"
# Expected: 403 "Cannot issue your own capital call"

# Cross-org deal access blocked
curl -X GET "http://localhost:8787/api/deals/$ORG_B_DEAL_ID/capital-calls" \
  -H "Authorization: $ORG_A_GP_JWT"
# Expected: 403

# LP portal entitlement enforced
curl -X GET "http://localhost:8787/api/lp/portal" \
  -H "Authorization: $GP_JWT" \
  -H "x-user-id: victim-lp@example.com"
# Expected: 403 (GP has no LP investments, header ignored)

# Webhook fails closed
curl -X POST "http://localhost:8787/api/integrations/webhook" \
  -H "Content-Type: application/json" \
  -d '{"event":"test"}'
# Expected: 401 (no signature, secret not configured)
FILES TO MODIFY
File	Changes	Lines
server/index.js	Add requireGP to force-accept dispatch	~3
server/routes/chat.js	Replace resolveActorRole with authUser.role	~10
server/routes/excel-import.js	Add org check to 4 handlers	~20
server/routes/lp-documents.js	Add org check to delete/permissions	~10
server/routes/review-requests.js	Add org check to GET handler	~5
server/routes/lp-portal-access.js	Add auth to preferences handlers	~10
server/routes/distributions.js	Add audit log to mark-paid	~10
server/routes/deal-assignments.js	Add audit log to assign/unassign	~10
Total: ~78 lines of code changes

CONCLUSION
NOT READY FOR MONEY-MOVING AUTOMATION

Fix the 10 vulnerabilities above (Priority 1 and 2) before enabling:

Automated capital call issuance
Automated distribution processing
Bulk verification workflows
The LP visibility model and core maker-checker logic are solid. The gaps are primarily:

Missing org isolation on secondary resource types (excel imports, documents, reviews)
x-actor-role header spoofing for chat
Audit log gaps for financial operations
User approved the plan
The security audit is complete. Here's the summary:

VERDICT: NOT BULLETPROOF
10 Critical Vulnerabilities Found - Must be fixed before money-moving automation.

Key Findings:
Criterion	Status
A) No cross-org IDOR	FAIL - 6+ endpoints lack org checks
B) No identity spoofing	FAIL - x-actor-role spoofable for chat
C) Money-moving authority	PARTIAL - Good maker-checker exists
D) Public endpoints fail-closed	PASS
E) Audit log coverage	FAIL - 8+ mutations unlogged
Top 5 Critical Issues:
V5: LLM Force-Accept has NO authentication gate
V2: x-actor-role header spoofable for chat authorization
V1: Excel import endpoints allow cross-org access
V3: LP document delete/permissions allow cross-org access
V4: Review request endpoint allows cross-org read
What's Working Well:
LP visibility model is comprehensive - field filtering enforced
Capital call/distribution maker-checker implemented (self-approval blocked)
Distribution processing requires prior approval record
Webhooks and tokens fail closed when misconfigured
Debug headers (x-debug-user-id) disabled in production
Patch Required: ~78 lines across 8 files
The full plan with file:line evidence and minimal patches is in the plan file. Ready to implement when approved.