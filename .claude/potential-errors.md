# Potential Errors Report

**Generated**: 2026-01-22T00:54:23.130Z
**Total Issues**: 175

This file contains potential issues found by static analysis.
Review these before they become runtime errors.

**Commands for Claude:**
- "find potential bugs" - Claude reads this file and offers fixes
- "fix potential errors" - Claude fixes issues one by one

---

## Summary

| Severity | Count | Description |
|----------|-------|-------------|
| HIGH | 52 | Security/crash risks |
| MEDIUM | 8 | Data integrity risks |
| LOW | 115 | Code quality issues |

---

## 🔴 HIGH Severity Issues (52)

### MISSING_VALIDATION

**File**: `server/routes/accounting-periods.js:92`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/actions.js:263`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/admin.js:130`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/ai-assistant.js:1748`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/ai-consent.js:77`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_AUTH

**File**: `server/routes/ai-consent.js:216`

**Problem**: Handler 'handleGetPolicy' does not check authentication

**Impact**: Unauthorized users may access this endpoint

**Fix**: Add auth check:
```javascript
const authUser = await requireAuthOrThrow(req);
```

---

### MISSING_VALIDATION

**File**: `server/routes/auth.js:53`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/brokerages.js:43`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/buyer-portal.js:34`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/capital-calls.js:211`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/contacts.js:355`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/dd-checklist.js:54`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/deal-assignments.js:69`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/deal-intake.js:100`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/deal-state.js:145`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/deal-submissions.js:10`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/deals.js:170`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_AUTH

**File**: `server/routes/debug.js:48`

**Problem**: Handler 'handleDebugStatus' does not check authentication

**Impact**: Unauthorized users may access this endpoint

**Fix**: Add auth check:
```javascript
const authUser = await requireAuthOrThrow(req);
```

---

### MISSING_AUTH

**File**: `server/routes/debug.js:93`

**Problem**: Handler 'handleDebugErrors' does not check authentication

**Impact**: Unauthorized users may access this endpoint

**Fix**: Add auth check:
```javascript
const authUser = await requireAuthOrThrow(req);
```

---

### MISSING_AUTH

**File**: `server/routes/debug.js:117`

**Problem**: Handler 'handleDebugClear' does not check authentication

**Impact**: Unauthorized users may access this endpoint

**Fix**: Add auth check:
```javascript
const authUser = await requireAuthOrThrow(req);
```

---

### MISSING_AUTH

**File**: `server/routes/debug.js:135`

**Problem**: Handler 'handleDebugEndpoints' does not check authentication

**Impact**: Unauthorized users may access this endpoint

**Fix**: Add auth check:
```javascript
const authUser = await requireAuthOrThrow(req);
```

---

### MISSING_VALIDATION

**File**: `server/routes/distribution.js:35`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/distributions.js:218`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/document-change.js:50`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/document-generation.js:34`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/email-intake.js:561`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_AUTH

**File**: `server/routes/email-intake.js:446`

**Problem**: Handler 'handleListEmailIntakes' does not check authentication

**Impact**: Unauthorized users may access this endpoint

**Fix**: Add auth check:
```javascript
const authUser = await requireAuthOrThrow(req);
```

---

### MISSING_VALIDATION

**File**: `server/routes/events.js:132`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/evidence-pack.js:31`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_AUTH

**File**: `server/routes/excel-import.js:528`

**Problem**: Handler 'handleGetMappableFields' does not check authentication

**Impact**: Unauthorized users may access this endpoint

**Fix**: Add auth check:
```javascript
const authUser = await requireAuthOrThrow(req);
```

---

### MISSING_AUTH

**File**: `server/routes/excel-import.js:620`

**Problem**: Handler 'handleGetExportTemplates' does not check authentication

**Impact**: Unauthorized users may access this endpoint

**Fix**: Add auth check:
```javascript
const authUser = await requireAuthOrThrow(req);
```

---

### MISSING_VALIDATION

**File**: `server/routes/integrations.js:298`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/investor-updates.js:175`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/lender-portal.js:138`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/listing-agreements.js:51`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/llm.js:38`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/lp-documents.js:38`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/lp-onboarding.js:114`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/lp-portal-access.js:68`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/lp-transfers.js:151`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/magic-links.js:15`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/news-insights.js:112`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/notifications.js:222`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/om-management.js:47`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/permission-gate.js:38`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/provenance.js:18`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/review-requests.js:10`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/seller-portal.js:47`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/share-classes.js:236`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_VALIDATION

**File**: `server/routes/smart-parse.js:27`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

### MISSING_AUTH

**File**: `server/routes/underwriting.js:2252`

**Problem**: Handler 'handleGetAllSectors' does not check authentication

**Impact**: Unauthorized users may access this endpoint

**Fix**: Add auth check:
```javascript
const authUser = await requireAuthOrThrow(req);
```

---

### MISSING_VALIDATION

**File**: `server/routes/verification-queue.js:173`

**Problem**: Route reads JSON body but does not use validateBody() for schema validation

**Impact**: Invalid input can cause crashes or unexpected behavior

**Fix**: Add Zod schema validation:
```javascript
const body = await validateBody(Schema)(req, readJsonBody);
```

---

## 🟡 MEDIUM Severity Issues (8)

### MISSING_ERROR_HANDLING

**File**: `server/routes/debug.js:21`

**Problem**: External call 'fetch' is not wrapped in try-catch

**Impact**: Network errors may crash the request

**Fix**: Wrap in try-catch:
```javascript
try {
  const result = await fetch(...);
} catch (err) {
  throw ApiError.internal("fetch failed");
}
```

---

### MISSING_ERROR_HANDLING

**File**: `server/routes/document-change.js:277`

**Problem**: External call 'fetch' is not wrapped in try-catch

**Impact**: Network errors may crash the request

**Fix**: Wrap in try-catch:
```javascript
try {
  const result = await fetch(...);
} catch (err) {
  throw ApiError.internal("fetch failed");
}
```

---

### MISSING_ERROR_HANDLING

**File**: `server/routes/email-intake.js:11`

**Problem**: External call 'sendEmail' is not wrapped in try-catch

**Impact**: Network errors may crash the request

**Fix**: Wrap in try-catch:
```javascript
try {
  const result = await sendEmail(...);
} catch (err) {
  throw ApiError.internal("sendEmail failed");
}
```

---

### MISSING_ERROR_HANDLING

**File**: `server/routes/email-intake.js:397`

**Problem**: External call 'sendEmail' is not wrapped in try-catch

**Impact**: Network errors may crash the request

**Fix**: Wrap in try-catch:
```javascript
try {
  const result = await sendEmail(...);
} catch (err) {
  throw ApiError.internal("sendEmail failed");
}
```

---

### MISSING_ERROR_HANDLING

**File**: `server/routes/integrations.js:252`

**Problem**: External call 'fetch' is not wrapped in try-catch

**Impact**: Network errors may crash the request

**Fix**: Wrap in try-catch:
```javascript
try {
  const result = await fetch(...);
} catch (err) {
  throw ApiError.internal("fetch failed");
}
```

---

### MISSING_ERROR_HANDLING

**File**: `server/routes/unified-audit.js:122`

**Problem**: External call 'fetch' is not wrapped in try-catch

**Impact**: Network errors may crash the request

**Fix**: Wrap in try-catch:
```javascript
try {
  const result = await fetch(...);
} catch (err) {
  throw ApiError.internal("fetch failed");
}
```

---

### MISSING_ERROR_HANDLING

**File**: `server/routes/unified-audit.js:238`

**Problem**: External call 'fetch' is not wrapped in try-catch

**Impact**: Network errors may crash the request

**Fix**: Wrap in try-catch:
```javascript
try {
  const result = await fetch(...);
} catch (err) {
  throw ApiError.internal("fetch failed");
}
```

---

### MISSING_ERROR_HANDLING

**File**: `server/routes/unified-audit.js:296`

**Problem**: External call 'fetch' is not wrapped in try-catch

**Impact**: Network errors may crash the request

**Fix**: Wrap in try-catch:
```javascript
try {
  const result = await fetch(...);
} catch (err) {
  throw ApiError.internal("fetch failed");
}
```

---

## 🟢 LOW Severity Issues (115)

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/accounting-periods.js:144`

**Problem**: Nested property access 'period.startDate.toISOString' may throw if 'period' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
period?.startDate?.toISOString
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/actions.js:446`

**Problem**: Nested property access 'parsedAction.data.toUpperCase' may throw if 'parsedAction' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
parsedAction?.data?.toUpperCase
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/admin.js:184`

**Problem**: Nested property access 'request.user.name' may throw if 'request' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
request?.user?.name
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/ai-assistant.js:166`

**Problem**: Nested property access 'context.data.deals' may throw if 'context' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
context?.data?.deals
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/ai-assistant.js:179`

**Problem**: Nested property access 't._count.status' may throw if 't' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
t?._count?.status
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/ai-assistant.js:193`

**Problem**: Nested property access 'store.dealIndex.find' may throw if 'store' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
store?.dealIndex?.find
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/ai-assistant.js:314`

**Problem**: Nested property access 'm.conversation.name' may throw if 'm' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
m?.conversation?.name
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/ai-assistant.js:398`

**Problem**: Nested property access 'data.deals.slice' may throw if 'data' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
data?.deals?.slice
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/ai-assistant.js:715`

**Problem**: Nested property access 'rateLimitResult.retryAfterSeconds.toString' may throw if 'rateLimitResult' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
rateLimitResult?.retryAfterSeconds?.toString
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/ai-assistant.js:884`

**Problem**: Nested property access 'outputValidation.issues.length' may throw if 'outputValidation' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
outputValidation?.issues?.length
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/ai-assistant.js:913`

**Problem**: Nested property access 'error.message.includes' may throw if 'error' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
error?.message?.includes
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/ai-assistant.js:1821`

**Problem**: Nested property access 'url.searchParams.get' may throw if 'url' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
url?.searchParams?.get
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/ai-consent.js:245`

**Problem**: Nested property access 'url.searchParams.get' may throw if 'url' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
url?.searchParams?.get
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/auth.js:197`

**Problem**: Nested property access 'user.organization.id' may throw if 'user' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
user?.organization?.id
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/brokerages.js:134`

**Problem**: Nested property access 'b._count.brokerUsers' may throw if 'b' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
b?._count?.brokerUsers
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/brokerages.js:181`

**Problem**: Nested property access 'brokerage.brokerUsers.length' may throw if 'brokerage' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
brokerage?.brokerUsers?.length
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/brokerages.js:292`

**Problem**: Nested property access 'l._count.distributions' may throw if 'l' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
l?._count?.distributions
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/buyer-portal.js:210`

**Problem**: Nested property access 'recipient.distribution.dealDraft' may throw if 'recipient' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
recipient?.distribution?.dealDraft
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/capital-calls.js:98`

**Problem**: Nested property access 'cc.allocations.reduce' may throw if 'cc' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
cc?.allocations?.reduce
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/capital-calls.js:152`

**Problem**: Nested property access 'capitalCall.allocations.map' may throw if 'capitalCall' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
capitalCall?.allocations?.map
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/capital-calls.js:389`

**Problem**: Nested property access 'updated.issuedAt.toISOString' may throw if 'updated' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
updated?.issuedAt?.toISOString
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/capital-calls.js:512`

**Problem**: Nested property access 'authUser.email.toLowerCase' may throw if 'authUser' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
authUser?.email?.toLowerCase
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/chat.js:113`

**Problem**: Nested property access 'conv.participants.length' may throw if 'conv' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
conv?.participants?.length
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/chat.js:117`

**Problem**: Nested property access 'lastMessage.content.substring' may throw if 'lastMessage' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
lastMessage?.content?.substring
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/chat.js:259`

**Problem**: Nested property access 'conversation.participants.some' may throw if 'conversation' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
conversation?.participants?.some
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/chat.js:340`

**Problem**: Nested property access 'm.createdAt.toISOString' may throw if 'm' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
m?.createdAt?.toISOString
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/chat.js:482`

**Problem**: Nested property access 'message.createdAt.toISOString' may throw if 'message' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
message?.createdAt?.toISOString
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/dd-checklist.js:100`

**Problem**: Nested property access 'result.checklist.id' may throw if 'result' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
result?.checklist?.id
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/dd-checklist.js:157`

**Problem**: Nested property access 'url.searchParams.get' may throw if 'url' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
url?.searchParams?.get
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/deal-intake.js:157`

**Problem**: Nested property access 'url.searchParams.get' may throw if 'url' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
url?.searchParams?.get
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/deal-state.js:187`

**Problem**: Nested property access 'result.state.currentState' may throw if 'result' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
result?.state?.currentState
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/deal-submissions.js:82`

**Problem**: Nested property access 'tokenResult.tokenRecord.id' may throw if 'tokenResult' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
tokenResult?.tokenRecord?.id
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/deals.js:191`

**Problem**: Nested property access 'parsed.data.name' may throw if 'parsed' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
parsed?.data?.name
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/deals.js:332`

**Problem**: Nested property access 'store.dealProfiles.find' may throw if 'store' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
store?.dealProfiles?.find
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/distribution.js:118`

**Problem**: Nested property access 'result.distribution.id' may throw if 'result' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
result?.distribution?.id
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/distribution.js:320`

**Problem**: Nested property access 'distribution.recipients.length' may throw if 'distribution' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
distribution?.recipients?.length
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/distributions.js:113`

**Problem**: Nested property access 'd.createdAt.toISOString' may throw if 'd' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
d?.createdAt?.toISOString
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/distributions.js:150`

**Problem**: Nested property access 'distribution.allocations.map' may throw if 'distribution' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
distribution?.allocations?.map
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/distributions.js:336`

**Problem**: Nested property access 'c.class.preferredReturn' may throw if 'c' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
c?.class?.preferredReturn
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/distributions.js:379`

**Problem**: Nested property access 'waterfallResult.summary.lpTotalReturn' may throw if 'waterfallResult' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
waterfallResult?.summary?.lpTotalReturn
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/distributions.js:656`

**Problem**: Nested property access 'updated.approvedAt.toISOString' may throw if 'updated' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
updated?.approvedAt?.toISOString
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/distributions.js:883`

**Problem**: Nested property access 'authUser.email.toLowerCase' may throw if 'authUser' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
authUser?.email?.toLowerCase
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/document-generation.js:71`

**Problem**: Nested property access 'result.generatedDocument.id' may throw if 'result' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
result?.generatedDocument?.id
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/document-generation.js:253`

**Problem**: Nested property access 'pdf.buffer.length' may throw if 'pdf' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
pdf?.buffer?.length
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/email-intake.js:186`

**Problem**: Nested property access 'docs.canonical.com' may throw if 'docs' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
docs?.canonical?.com
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/email-intake.js:475`

**Problem**: Nested property access 'i.attachments.map' may throw if 'i' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
i?.attachments?.map
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/email-intake.js:582`

**Problem**: Nested property access 'test.canonical.app' may throw if 'test' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
test?.canonical?.app
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/evidence-pack.js:68`

**Problem**: Nested property access 'result.evidencePack.id' may throw if 'result' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
result?.evidencePack?.id
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/evidence-pack.js:171`

**Problem**: Nested property access 'error.message.includes' may throw if 'error' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
error?.message?.includes
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/excel-import.js:47`

**Problem**: Nested property access 'officedocument.spreadsheetml.sheet' may throw if 'officedocument' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
officedocument?.spreadsheetml?.sheet
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/excel-import.js:197`

**Problem**: Nested property access 'parsed.cells.length' may throw if 'parsed' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
parsed?.cells?.length
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/excel-import.js:572`

**Problem**: Nested property access 'url.searchParams.get' may throw if 'url' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
url?.searchParams?.get
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/home.js:104`

**Problem**: Nested property access 'item.next_action.actionType' may throw if 'item' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
item?.next_action?.actionType
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/inbox.js:57`

**Problem**: Nested property access 'store.dealIndex.map' may throw if 'store' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
store?.dealIndex?.map
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/inbox.js:71`

**Problem**: Nested property access 'task.updatedAt.toISOString' may throw if 'task' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
task?.updatedAt?.toISOString
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/integrations.js:415`

**Problem**: Nested property access 'detection.changes.map' may throw if 'detection' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
detection?.changes?.map
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/investor-updates.js:103`

**Problem**: Nested property access 'u.createdAt.toISOString' may throw if 'u' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
u?.createdAt?.toISOString
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/investor-updates.js:165`

**Problem**: Nested property access 'update.createdAt.toISOString' may throw if 'update' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
update?.createdAt?.toISOString
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/investor-updates.js:311`

**Problem**: Nested property access 'updated.publishedAt.toISOString' may throw if 'updated' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
updated?.publishedAt?.toISOString
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/investor-updates.js:368`

**Problem**: Nested property access 'authUser.email.toLowerCase' may throw if 'authUser' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
authUser?.email?.toLowerCase
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/investor-updates.js:536`

**Problem**: Nested property access 'q.createdAt.toISOString' may throw if 'q' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
q?.createdAt?.toISOString
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/investor-updates.js:598`

**Problem**: Nested property access 'question.createdAt.toISOString' may throw if 'question' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
question?.createdAt?.toISOString
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/lender-portal.js:124`

**Problem**: Nested property access 'validation.tokenRecord.expiresAt' may throw if 'validation' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
validation?.tokenRecord?.expiresAt
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/listing-agreements.js:176`

**Problem**: Nested property access 'agreement.seller.organizationId' may throw if 'agreement' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
agreement?.seller?.organizationId
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/llm.js:61`

**Problem**: Nested property access 'parsed.data.inputText' may throw if 'parsed' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
parsed?.data?.inputText
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/llm.js:362`

**Problem**: Nested property access 'task.createdAt.toISOString' may throw if 'task' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
task?.createdAt?.toISOString
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/lp-documents.js:82`

**Problem**: Nested property access 'body.lpActorIds.map' may throw if 'body' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
body?.lpActorIds?.map
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/lp-documents.js:109`

**Problem**: Nested property access 'document.createdAt.toISOString' may throw if 'document' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
document?.createdAt?.toISOString
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/lp-documents.js:145`

**Problem**: Nested property access 'doc.permissions.some' may throw if 'doc' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
doc?.permissions?.some
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/lp-onboarding.js:126`

**Problem**: Nested property access 'parsed.data.dealId' may throw if 'parsed' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
parsed?.data?.dealId
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/lp-onboarding.js:218`

**Problem**: Nested property access 'invitation.expiresAt.toISOString' may throw if 'invitation' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
invitation?.expiresAt?.toISOString
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/lp-onboarding.js:392`

**Problem**: Nested property access 'updated.createdAt.toISOString' may throw if 'updated' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
updated?.createdAt?.toISOString
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/lp-onboarding.js:441`

**Problem**: Nested property access 'inv.createdAt.toISOString' may throw if 'inv' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
inv?.createdAt?.toISOString
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/lp-onboarding.js:670`

**Problem**: Nested property access 'lpActor.shareClass.id' may throw if 'lpActor' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
lpActor?.shareClass?.id
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/lp-onboarding.js:813`

**Problem**: Nested property access 'body.investors.length' may throw if 'body' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
body?.investors?.length
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/lp-onboarding.js:860`

**Problem**: Nested property access 'results.invitations.some' may throw if 'results' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
results?.invitations?.some
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/lp-onboarding.js:1011`

**Problem**: Nested property access 'filters.lpEmails.length' may throw if 'filters' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
filters?.lpEmails?.length
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/lp-portal-access.js:115`

**Problem**: Nested property access 'session.expiresAt.toISOString' may throw if 'session' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
session?.expiresAt?.toISOString
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/lp-portal-access.js:211`

**Problem**: Nested property access 'la.shareClass.id' may throw if 'la' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
la?.shareClass?.id
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/lp-portal-access.js:256`

**Problem**: Nested property access 'updated.expiresAt.toISOString' may throw if 'updated' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
updated?.expiresAt?.toISOString
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/lp-portal-access.js:328`

**Problem**: Nested property access 'authUser.email.toLowerCase' may throw if 'authUser' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
authUser?.email?.toLowerCase
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/lp-portal-access.js:477`

**Problem**: Nested property access 'preferences.updatedAt.toISOString' may throw if 'preferences' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
preferences?.updatedAt?.toISOString
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/lp-portal-access.js:642`

**Problem**: Nested property access 'lpActor.shareClass.id' may throw if 'lpActor' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
lpActor?.shareClass?.id
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/lp-portal-access.js:774`

**Problem**: Nested property access 'statement.distributions.summary' may throw if 'statement' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
statement?.distributions?.summary
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/lp-transfers.js:309`

**Problem**: Nested property access 'transfer.fromLpActor.entityName' may throw if 'transfer' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
transfer?.fromLpActor?.entityName
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/lp-transfers.js:334`

**Problem**: Nested property access 'url.searchParams.get' may throw if 'url' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
url?.searchParams?.get
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/magic-links.js:58`

**Problem**: Nested property access 'result.tokenRecord.id' may throw if 'result' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
result?.tokenRecord?.id
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/notifications.js:52`

**Problem**: Nested property access 'n.createdAt.toISOString' may throw if 'n' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
n?.createdAt?.toISOString
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/notifications.js:147`

**Problem**: Nested property access 'msg.conversation.name' may throw if 'msg' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
msg?.conversation?.name
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/notifications.js:180`

**Problem**: Nested property access 'task.updatedAt.toISOString' may throw if 'task' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
task?.updatedAt?.toISOString
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/notifications.js:206`

**Problem**: Nested property access 'notif.createdAt.toISOString' may throw if 'notif' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
notif?.createdAt?.toISOString
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/notifications.js:315`

**Problem**: Nested property access 'url.searchParams.get' may throw if 'url' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
url?.searchParams?.get
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/notifications.js:371`

**Problem**: Nested property access 't.sourceMessage.content' may throw if 't' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
t?.sourceMessage?.content
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/notifications.js:466`

**Problem**: Nested property access 'updatedTask.createdAt.toISOString' may throw if 'updatedTask' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
updatedTask?.createdAt?.toISOString
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/om-management.js:133`

**Problem**: Nested property access 'dealDraft.brokers.some' may throw if 'dealDraft' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
dealDraft?.brokers?.some
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/om-management.js:285`

**Problem**: Nested property access 'omVersion.dealDraft.organizationId' may throw if 'omVersion' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
omVersion?.dealDraft?.organizationId
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/seller-portal.js:123`

**Problem**: Nested property access 'sd.dealDraft.id' may throw if 'sd' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
sd?.dealDraft?.id
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/seller-portal.js:215`

**Problem**: Nested property access 'dealDraft.brokers.map' may throw if 'dealDraft' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
dealDraft?.brokers?.map
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/seller-portal.js:327`

**Problem**: Nested property access 'tx.dealDraftSeller.update' may throw if 'tx' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
tx?.dealDraftSeller?.update
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/seller-portal.js:336`

**Problem**: Nested property access 'sellerRecord.dealDraft.organizationId' may throw if 'sellerRecord' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
sellerRecord?.dealDraft?.organizationId
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/share-classes.js:265`

**Problem**: Nested property access 'body.code.toUpperCase' may throw if 'body' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
body?.code?.toUpperCase
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/share-classes.js:372`

**Problem**: Nested property access 'shareClass.lpActors.length' may throw if 'shareClass' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
shareClass?.lpActors?.length
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/underwriting.js:152`

**Problem**: Nested property access 'extractedData.units.slice' may throw if 'extractedData' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
extractedData?.units?.slice
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/underwriting.js:425`

**Problem**: Nested property access 'calculated.income.effectiveGrossIncome' may throw if 'calculated' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
calculated?.income?.effectiveGrossIncome
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/underwriting.js:1660`

**Problem**: Nested property access 'cashFlowProjection.years.length' may throw if 'cashFlowProjection' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
cashFlowProjection?.years?.length
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/underwriting.js:1719`

**Problem**: Nested property access 'c.class.preferredReturn' may throw if 'c' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
c?.class?.preferredReturn
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/underwriting.js:1727`

**Problem**: Nested property access 'd.class.code' may throw if 'd' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
d?.class?.code
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/underwriting.js:1756`

**Problem**: Nested property access 'waterfallResult.summary.lpIRR' may throw if 'waterfallResult' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
waterfallResult?.summary?.lpIRR
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/unified-audit.js:73`

**Problem**: Nested property access 'url.searchParams.get' may throw if 'url' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
url?.searchParams?.get
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/unified-audit.js:88`

**Problem**: Nested property access 'bffWhere.occurredAt.lte' may throw if 'bffWhere' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
bffWhere?.occurredAt?.lte
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/unified-audit.js:110`

**Problem**: Nested property access 'e.occurredAt.toISOString' may throw if 'e' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
e?.occurredAt?.toISOString
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/verification-queue.js:39`

**Problem**: Nested property access 'url.searchParams.get' may throw if 'url' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
url?.searchParams?.get
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/verification-queue.js:80`

**Problem**: Nested property access 'claim.source.documentName' may throw if 'claim' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
claim?.source?.documentName
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/verification-queue.js:196`

**Problem**: Nested property access 'error.message.includes' may throw if 'error' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
error?.message?.includes
```

---

### POTENTIAL_NULL_ACCESS

**File**: `server/routes/verification-queue.js:265`

**Problem**: Nested property access 'results.verified.length' may throw if 'results' is null

**Impact**: May cause "Cannot read property of undefined" error

**Fix**: Use optional chaining:
```javascript
results?.verified?.length
```

---


## How to Use This Report

1. **Review HIGH severity issues first** - these can cause security issues or crashes
2. **Ask Claude to fix**: "fix the MISSING_AUTH issue in server/routes/deals.js"
3. **Re-run analysis**: `npm run analyze:errors` to verify fixes

## Running Analysis

```bash
npm run analyze:errors
```

This will scan all route files and update this report.
