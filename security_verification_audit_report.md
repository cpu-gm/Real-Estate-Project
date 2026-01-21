Security Verification Audit Report
Identity / Orgs / Permissions Hardening
1. Route Inventory (Critical Routes Only)
Based on exhaustive analysis of server/index.js (1792 lines) and all route handler files:

Routes WITH Auth Guards ✅
METHOD	PATH	HANDLER	GUARDS FOUND
GET	/api/deals	deals.js:36	extractAuthUser → org filter via authUser.organizationId
POST	/api/deals	deals.js:134	authUser check + role GP/Admin + audit log
GET	/api/deals/:id/home	deals.js:246	extractAuthUser + checkDealAccess + org isolation
GET	/api/deals/:id/records	deals.js:296	extractAuthUser + checkDealAccess + org isolation
POST	/api/deals/:id/explain	actions.js:199	extractAuthUser + org isolation
POST	/api/deals/:id/actions/:type	actions.js:263	extractAuthUser + requireGP + org isolation + audit log
GET	/api/deals/:id/capital-calls	capital-calls.js:78	requireDealOrgAccess
POST	/api/deals/:id/capital-calls	capital-calls.js:201	requireGP (ACTIVE check)
POST	/api/deals/:id/capital-calls/:id/issue	capital-calls.js:286	requireGP + self-approval prevention
GET	/api/deals/:id/distributions	distributions.js:78	requireDealOrgAccess
POST	/api/deals/:id/distributions	distributions.js:198	requireGP
POST	/api/deals/:id/distributions/:id/approve	distributions.js:287	requireGP + self-approval prevention
POST	/api/deals/:id/distributions/:id/process	distributions.js:350	requireGP + approval record prerequisite
GET	/api/deals/:id/investor-updates	investor-updates.js:78	requireDealOrgAccess
POST	/api/deals/:id/investor-updates	investor-updates.js:175	requireGP
GET	/api/deals/:id/assignments	deal-assignments.js:48	requireDealOrgAccess
POST	/api/deals/:id/assignments	deal-assignments.js:69	requireDealOrgAccess + requireGP
GET	/api/admin/*	admin.js	requireAdmin (all handlers)
Routes MISSING Auth Guards ❌ (CRITICAL GAPS)
METHOD	PATH	HANDLER	REQUIRED	FOUND	RISK
GET	/api/deals/:id/state	deal-state.js:66	requireAuth + orgIso	NONE	HIGH
POST	/api/deals/:id/state/transition	deal-state.js:95	requireGP + orgIso	NONE	CRITICAL
GET	/api/deals/:id/state/available-transitions	deal-state.js:153	requireAuth + orgIso	NONE	HIGH
GET	/api/deals/:id/state/blockers	deal-state.js:178	requireAuth + orgIso	NONE	HIGH
GET	/api/deals/:id/state/events	deal-state.js:200	requireAuth + orgIso	NONE	HIGH
GET	/api/events	index.js:684	requireAuth	NONE	MEDIUM
GET	/api/inbox	index.js:1039	requireAuth	NONE	MEDIUM
GET	/api/home	index.js:1044	requireAuth	NONE	LOW
POST	/api/deals/:id/events	index.js:689	requireGP + orgIso	NONE	CRITICAL
POST	/api/deals/:id/corrections	index.js:714	requireAuth + orgIso	NONE	HIGH
GET	/api/deals/:id/data-trust	index.js:719	requireAuth + orgIso	NONE	HIGH
POST	/api/deals/:id/provenance	index.js:724	requireAuth + orgIso	NONE	HIGH
POST	/api/deals/:id/smart-parse	index.js:730	requireAuth + orgIso	NONE	HIGH
POST	/api/deals/:id/extract	index.js:743	requireAuth + orgIso	NONE	HIGH
GET	/api/deals/:id/underwriting	index.js:755	requireAuth + orgIso	NONE	HIGH
PATCH	/api/deals/:id/underwriting	index.js:758	requireGP + orgIso	NONE	CRITICAL
POST	/api/deals/:id/underwriting/calculate	index.js:764	requireAuth + orgIso	NONE	HIGH
GET	/api/deals/:id/claims	index.js:1606	requireAuth + orgIso	NONE	HIGH
POST	/api/deals/:id/claims/bulk-verify	index.js:1630	requireGP + orgIso	NONE	CRITICAL
POST	/api/deals/:id/documents/generate	index.js:1700	requireAuth + orgIso	NONE	HIGH
GET	/api/deals/:id/documents	index.js:1706	requireAuth + orgIso	NONE	HIGH
POST	/api/deals/:id/evidence-pack/generate	index.js:1732	requireAuth + orgIso	NONE	HIGH
GET	/api/chat/*	index.js:1459-1500	requireAuth	NONE	MEDIUM
GET	/api/notifications	index.js:1503	requireAuth	NONE	MEDIUM
POST	/api/magic-links	index.js:567	requireGP	NONE	HIGH
POST	/api/integrations/webhook	index.js:1442	N/A (webhook)	NONE	MEDIUM
POST	/api/email-intake/webhook	index.js:657	N/A (webhook)	NONE	MEDIUM
2. Guard Coverage Verdicts
A. Auth Required on Protected Endpoints: FAIL ❌
Evidence: Many deal-scoped routes do NOT call extractAuthUser or any guard:

deal-state.js:66-257 - ALL handlers have NO auth check
underwriting.js handlers - NO auth checks
verification-queue.js handlers - NO auth checks
document-generation.js handlers - NO auth checks
evidence-pack.js handlers - NO auth checks
B. ACTIVE Status Enforced: PASS ✅
Evidence: extractAuthUser in auth.js:402-404:


if (!user || user.status !== 'ACTIVE') {
  return null;
}
All routes using extractAuthUser correctly reject non-ACTIVE users. The local requireGP functions in capital-calls.js, distributions.js, and investor-updates.js also check user.status !== 'ACTIVE'.

C. Org Isolation on Deal-Scoped Endpoints: FAIL ❌
Evidence of gaps:

deal-state.js - ALL handlers missing org isolation
underwriting.js handlers - Missing org isolation
verification-queue.js handlers - Missing org isolation
document-generation.js handlers - Missing org isolation
evidence-pack.js handlers - Missing org isolation
Passing routes: capital-calls.js, distributions.js, investor-updates.js, deal-assignments.js, deals.js, actions.js all have org isolation.

D. Roles Enforced Server-Side: PARTIAL PASS ⚠️
GP/Admin enforcement: ✅ Present on privileged handlers in capital-calls.js, distributions.js, investor-updates.js, actions.js, deals.js
LP enforcement: ✅ LP endpoints check authUser.role === "LP"
Gap: Many deal endpoints have NO role check at all (see A above)

E. Authority Constraints: PASS ✅
Self-approval prevention:

capital-calls.js:305-307: if (capitalCall.createdBy === authUser.id) return sendError(res, 403, "Cannot issue your own capital call")
distributions.js:306-308: if (distribution.createdBy === authUser.id) return sendError(res, 403, "Cannot approve your own distribution")
Approval prerequisite for process:

distributions.js:368-385: Requires approval record + validates approver ≠ creator
Note: "Any GP can approve" model remains - different GP can approve another GP's submission.

F. Audit Logging: PASS ✅
Logged actions:

admin.js:179-190: VERIFICATION_APPROVED
admin.js:257-269: VERIFICATION_REJECTED
admin.js:327-338: ROLE_CHANGE
admin.js:408-419: STATUS_CHANGE
deals.js:223-233: DEAL_CREATED
actions.js:439-450: ACTION_* execution
capital-calls.js:319-332: CAPITAL_CALL_ISSUANCE (via ApprovalRecord)
distributions.js:320-333: DISTRIBUTION_APPROVAL (via ApprovalRecord)
3. Bypass Hunt (Top 15)
#	Route	File:Line	Vulnerability	Severity
1	POST /api/deals/:id/state/transition	deal-state.js:95	No auth, no org isolation, can transition any deal state	CRITICAL
2	PATCH /api/deals/:id/underwriting	underwriting.js	No auth, can modify underwriting model	CRITICAL
3	POST /api/deals/:id/events	index.js:689	No auth, can append events to any deal	CRITICAL
4	POST /api/deals/:id/claims/bulk-verify	verification-queue.js	No auth, can verify claims	CRITICAL
5	POST /api/deals/:id/claims/bulk-reject	verification-queue.js	No auth, can reject claims	CRITICAL
6	GET /api/deals/:id/state	deal-state.js:66	No auth, leaks deal state info	HIGH
7	GET /api/deals/:id/underwriting	underwriting.js	No auth, leaks financial model	HIGH
8	POST /api/deals/:id/documents/generate	document-generation.js	No auth, can generate docs	HIGH
9	POST /api/deals/:id/evidence-pack/generate	evidence-pack.js	No auth, can generate packs	HIGH
10	POST /api/deals/:id/smart-parse	smart-parse.js	No auth, can trigger parsing	HIGH
11	POST /api/deals/:id/extract	underwriting.js	No auth, can trigger extraction	HIGH
12	POST /api/magic-links	magic-links.js	No auth, can create magic links	HIGH
13	GET /api/events	events.js	No auth, leaks all events	MEDIUM
14	GET /api/inbox	inbox.js	No auth, leaks inbox data	MEDIUM
15	GET /api/chat/*	chat.js	No auth on conversation endpoints	MEDIUM
4. Repro Script (curl commands)

# Prereqs: Replace tokens with actual JWT values
AUTH_GP="Bearer <gp-user-token-org-A>"
AUTH_LP="Bearer <lp-user-token>"
AUTH_ORG_B="Bearer <gp-user-token-org-B>"
DEAL_ID_ORG_A="<deal-id-belonging-to-org-A>"

# ===== TEST 1: LP cannot POST /api/deals =====
# Expected: 403 "GP or Admin role required"
curl -X POST http://localhost:8787/api/deals \
  -H "Authorization: $AUTH_LP" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Deal"}'

# ===== TEST 2: Cross-org user cannot access deal home =====
# Expected: 403 "Access denied - deal belongs to different organization"
curl -X GET "http://localhost:8787/api/deals/$DEAL_ID_ORG_A/home" \
  -H "Authorization: $AUTH_ORG_B"

# ===== TEST 3: Self-approval blocked for distributions =====
# First create a distribution (as GP), then try to approve with same user
DIST_ID="<distribution-id-created-by-this-user>"
curl -X POST "http://localhost:8787/api/deals/$DEAL_ID_ORG_A/distributions/$DIST_ID/approve" \
  -H "Authorization: $AUTH_GP"
# Expected: 403 "Cannot approve your own distribution"

# ===== TEST 4: Process distribution without approval blocked =====
# Create distribution, skip approval, try to process
curl -X POST "http://localhost:8787/api/deals/$DEAL_ID_ORG_A/distributions/$DIST_ID/process" \
  -H "Authorization: $AUTH_GP"
# Expected: 400 "Distribution must be approved before processing"

# ===== TEST 5: PENDING user rejected =====
AUTH_PENDING="Bearer <pending-user-token>"
curl -X GET "http://localhost:8787/api/deals/$DEAL_ID_ORG_A/capital-calls" \
  -H "Authorization: $AUTH_PENDING"
# Expected: 401 "Not authenticated" (extractAuthUser returns null for non-ACTIVE)

# ===== BYPASS REPRO: State transition without auth =====
# This SHOULD fail but currently SUCCEEDS
curl -X POST "http://localhost:8787/api/deals/$DEAL_ID_ORG_A/state/transition" \
  -H "Content-Type: application/json" \
  -d '{"toState":"CLOSED"}'
# Current: 200 success (BUG!)
# Expected: 401 "Not authenticated"
5. Patch Plan
Summary: 3 FAILs require patching
Requirement	Verdict	Action Needed
A. Auth on protected	FAIL	Add guards to 20+ endpoints
C. Org isolation	FAIL	Add org checks to 15+ endpoints
Patch 1: deal-state.js - Add auth and org isolation
File: server/routes/deal-state.js
Lines: Add at top + modify each handler


// Add import at top
import { extractAuthUser } from "./auth.js";
import { readStore } from "../store.js";

// Add helper function
async function requireDealOrgAccess(req, res, dealId) {
  const authUser = await extractAuthUser(req);
  if (!authUser) {
    sendJson(res, 401, { success: false, error: "Not authenticated" });
    return null;
  }
  const store = await readStore();
  const record = store.dealIndex.find((item) => item.id === dealId);
  if (!record) {
    sendJson(res, 404, { success: false, error: "Deal not found" });
    return null;
  }
  if (record.organizationId && record.organizationId !== authUser.organizationId) {
    sendJson(res, 403, { success: false, error: "Access denied" });
    return null;
  }
  return authUser;
}

// Modify handleGetDealState (line 66)
async function handleGetDealState(req, res, dealId) {
  const authUser = await requireDealOrgAccess(req, res, dealId);
  if (!authUser) return;
  // ... rest unchanged
}

// Modify handleTransitionState (line 95) - also require GP
async function handleTransitionState(req, res, dealId, readJsonBody, ...) {
  const authUser = await requireDealOrgAccess(req, res, dealId);
  if (!authUser) return;
  if (!['GP', 'Admin'].includes(authUser.role)) {
    return sendJson(res, 403, { success: false, error: "GP or Admin required" });
  }
  // ... rest unchanged
}

// Apply same pattern to ALL handlers in this file
Patch 2: Create shared middleware usage
Ensure all deal-scoped routes in server/index.js call extractAuthUser and check org isolation BEFORE passing to handler.

Files to modify:

server/routes/underwriting.js - ALL handlers
server/routes/verification-queue.js - ALL handlers
server/routes/document-generation.js - ALL handlers
server/routes/evidence-pack.js - ALL handlers
server/routes/smart-parse.js - ALL handlers
server/routes/events.js - ALL handlers
server/routes/inbox.js - handleInbox
server/routes/magic-links.js - handleCreateMagicLink
server/routes/chat.js - ALL handlers
Test Cases to Add (1 per FAIL)

// test/auth-guards.test.js

// Test A: Auth required on deal-state
test('GET /api/deals/:id/state requires auth', async () => {
  const res = await fetch(`${BASE}/api/deals/${dealId}/state`);
  expect(res.status).toBe(401);
});

// Test C: Org isolation on deal-state
test('GET /api/deals/:id/state blocks cross-org', async () => {
  const res = await fetch(`${BASE}/api/deals/${dealIdOrgA}/state`, {
    headers: { Authorization: `Bearer ${tokenOrgB}` }
  });
  expect(res.status).toBe(403);
});
Summary
Requirement	Verdict	Evidence
A. Auth on protected endpoints	FAIL	20+ routes missing extractAuthUser
B. ACTIVE status enforced	PASS	extractAuthUser rejects non-ACTIVE
C. Org isolation on deal endpoints	FAIL	15+ routes missing org check
D. Roles enforced server-side	PARTIAL	Present where auth exists, missing where auth missing
E. Authority constraints	PASS	Self-approval + prerequisite enforced
F. Audit logging	PASS	All privileged actions logged
Critical Finding: The deal-state.js routes and all underwriting/verification-queue/document-generation routes have ZERO authentication or authorization. Any anonymous user can transition deal states, modify underwriting models, and generate documents.