# Debug Command - API Error Analysis

When the user says "debug", "fix the error", "what went wrong", "check the error", or similar:

## Step 1: Read the Detailed Error Log

```
Read .claude/api-errors-detailed.json
```

This file contains:
- `latestError` - Full context of the most recent error
- `recentErrors` - Summary of last 10 errors

## Step 2: Understand the Error

From `latestError.error`:
- `code` - Error type (see Quick Reference below)
- `message` - What went wrong
- `suggestion` - How to fix it
- `stack` - Where it happened (for 500 errors)

From `latestError.sourceContext`:
- `routeFile` - Which file handles this route
- `handlerFunction` - Which function threw
- `relevantCode` - Code lines around the error
- `errorLocation` - Exact file:line:column

## Step 3: Check Source Code

Read the `sourceContext.routeFile` to see the full handler:
```
Read canonical-deal-os/{routeFile}
```

## Step 4: Check Git Context

From `latestError.gitContext`:
- `recentCommits` - Last 3 commits (might have introduced bug)
- `routeFileChanged` - If the file has uncommitted changes
- `uncommittedChanges` - Diff of uncommitted changes

## Step 5: Apply the Fix

Use `latestError.suggestedFix`:
- `type` - Category of fix needed
- `description` - What needs to change
- `steps` - Step-by-step instructions
- `codeExample` - Example code to add

## Error Code Quick Reference

| Code | Meaning | Common Fix |
|------|---------|------------|
| `AUTH_REQUIRED` | No/invalid token | Check Authorization header |
| `AUTH_TOKEN_EXPIRED` | Session expired | User needs to re-login |
| `FORBIDDEN_ROLE` | Wrong user role | Check requireGP/requireAdmin |
| `FORBIDDEN_ORG` | Cross-org access | Add org isolation check |
| `VALIDATION_FAILED` | Bad request data | Check Zod schema, add validation |
| `NOT_FOUND` | Resource missing | Verify ID, check database |
| `CONFLICT` | Duplicate resource | Handle existing record |
| `KERNEL_UNAVAILABLE` | Kernel API down | Check port 3001 |
| `INTERNAL_ERROR` | Uncaught exception | Check stack, add null check |

## Example Diagnosis Flow

1. User: "debug"
2. Read `.claude/api-errors-detailed.json`
3. See: `code: "VALIDATION_FAILED"`, `path: "/api/deals"`, `message: "propertyType is required"`
4. Read `server/routes/deals.js`
5. Find the handler, see it's missing Zod validation
6. Apply fix: Add `validateBody(CreateDealSchema)` at start of handler
7. Tell user what was wrong and show the fix

## Step 6: Replay the Request

Use `latestError.replay` to test after fixing:
- `curlCommand` - Copy, replace `<YOUR_TOKEN>`, run in terminal
- `fetchCode` - Copy to browser console to test
- `instructions` - Step-by-step replay guide

Example curl command from error log:
```bash
curl -X POST "http://localhost:8787/api/deals" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -d '{"name":"Test Deal"}'
```

---

## Live Error Monitoring

When user asks "any errors?" or "check for problems":

1. Read `.claude/error-alerts.md`
2. See alerts sorted by time (newest first)
3. Each alert shows: endpoint, error code, message
4. Offer to debug the most recent error

The error watcher runs automatically and updates this file every 5 seconds when new errors occur.

---

## Proactive Error Detection

When user says "find potential bugs" or "check for potential issues":

1. Run `npm run analyze:errors` (or check if recently run)
2. Read `.claude/potential-errors.md`
3. Review issues by severity:
   - HIGH (security/crash risks)
   - MEDIUM (data integrity risks)
   - LOW (code quality issues)
4. Offer to fix HIGH severity issues first

Static analysis detects:
- Missing validation on routes
- Unprotected endpoints (no auth check)
- Missing organization isolation
- Potential null/undefined access
- Missing error handling for external calls
- Hardcoded URLs

---

## Files to Check

| File | Purpose |
|------|---------|
| `.claude/api-errors-detailed.json` | Full error context (latest + recent) |
| `.claude/api-errors.log` | Simple error log (JSONL format) |
| `.claude/error-alerts.md` | Live error alerts (auto-updated) |
| `.claude/potential-errors.md` | Static analysis report |
| `canonical-deal-os/server/routes/*.js` | Route handlers |
| `canonical-deal-os/src/lib/contracts.js` | Zod schemas |

---

## Command Reference

| User Says | Claude Does |
|-----------|-------------|
| "debug" | Read error log, show issue + fix |
| "any errors?" | Read alert file, summarize recent |
| "find potential bugs" | Read analysis file, show by severity |
| "replay the request" | Show curl command from error |
| "check for problems" | Read alerts + potential errors |
