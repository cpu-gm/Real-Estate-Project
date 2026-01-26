/**
 * Route to File Mapping
 *
 * Maps API paths to their handler source files for debugging.
 * Used by error-context.js to provide source code context.
 */

// Route patterns mapped to their handler files
// Format: [regex pattern, file path, handler name hint]
const ROUTE_PATTERNS = [
  // Auth
  [/^\/api\/auth\/signup$/, 'server/routes/auth.js', 'handleSignup'],
  [/^\/api\/auth\/login$/, 'server/routes/auth.js', 'handleLogin'],
  [/^\/api\/auth\/logout$/, 'server/routes/auth.js', 'handleLogout'],
  [/^\/api\/auth\/me$/, 'server/routes/auth.js', 'handleGetMe'],

  // Admin
  [/^\/api\/admin\/verification-queue$/, 'server/routes/admin.js', 'handleGetVerificationQueue'],
  [/^\/api\/admin\/users$/, 'server/routes/admin.js', 'handleGetUsers'],
  [/^\/api\/admin\/verification-requests\/[^/]+\/approve$/, 'server/routes/admin.js', 'handleApproveVerification'],
  [/^\/api\/admin\/verification-requests\/[^/]+\/reject$/, 'server/routes/admin.js', 'handleRejectVerification'],
  [/^\/api\/admin\/users\/[^/]+\/role$/, 'server/routes/admin.js', 'handleUpdateUserRole'],
  [/^\/api\/admin\/users\/[^/]+\/status$/, 'server/routes/admin.js', 'handleUpdateUserStatus'],

  // Deals
  [/^\/api\/deals$/, 'server/routes/deals.js', 'handleListDeals/handleCreateDeal'],
  [/^\/api\/deals\/[^/]+\/home$/, 'server/routes/deals.js', 'handleDealHome'],
  [/^\/api\/deals\/[^/]+\/records$/, 'server/routes/deals.js', 'handleDealRecords'],
  [/^\/api\/deals\/[^/]+\/state$/, 'server/routes/deal-state.js', 'handleGetDealState'],
  [/^\/api\/deals\/[^/]+\/assignments$/, 'server/routes/deal-assignments.js', 'handleListDealAssignments'],

  // Deal Intake
  [/^\/api\/intake\/drafts$/, 'server/routes/deal-intake.js', 'handleListDrafts/handleCreateDraft'],
  [/^\/api\/intake\/drafts\/[^/]+$/, 'server/routes/deal-intake.js', 'handleGetDraft/handleUpdateDraft'],
  [/^\/api\/intake\/drafts\/[^/]+\/documents$/, 'server/routes/deal-intake.js', 'handleUploadDocuments'],
  [/^\/api\/intake\/drafts\/[^/]+\/claims$/, 'server/routes/deal-intake.js', 'handleGetClaims'],
  [/^\/api\/intake\/drafts\/[^/]+\/conflicts$/, 'server/routes/deal-intake.js', 'handleGetConflicts'],

  // Distribution
  [/^\/api\/distribution/, 'server/routes/distribution.js', 'distribution handlers'],

  // LP Portal
  [/^\/api\/lp\/invite$/, 'server/routes/lp-onboarding.js', 'handleSendInvitation'],
  [/^\/api\/lp\/accept-invite$/, 'server/routes/lp-onboarding.js', 'handleAcceptInvitation'],
  [/^\/api\/lp\/portal/, 'server/routes/lp-portal-access.js', 'LP portal handlers'],
  [/^\/api\/lp\/documents/, 'server/routes/lp-documents.js', 'LP document handlers'],

  // Capital Calls & Distributions
  [/^\/api\/capital-calls/, 'server/routes/capital-calls.js', 'capital call handlers'],
  [/^\/api\/distributions/, 'server/routes/distributions.js', 'distribution handlers'],

  // Underwriting
  [/^\/api\/deals\/[^/]+\/underwriting/, 'server/routes/underwriting.js', 'underwriting handlers'],
  [/^\/api\/deals\/[^/]+\/scenarios/, 'server/routes/underwriting.js', 'scenario handlers'],

  // AI & LLM
  [/^\/api\/deals\/[^/]+\/parse$/, 'server/routes/llm.js', 'handleDealParse'],
  [/^\/api\/ai\//, 'server/routes/ai-assistant.js', 'AI assistant handlers'],
  [/^\/api\/deals\/[^/]+\/chat$/, 'server/routes/ai-assistant.js', 'handleDealChat'],

  // Chat
  [/^\/api\/chat\//, 'server/routes/chat.js', 'chat handlers'],

  // Notifications
  [/^\/api\/notifications/, 'server/routes/notifications.js', 'notification handlers'],
  [/^\/api\/activity-feed/, 'server/routes/notifications.js', 'handleGetActivityFeed'],

  // Documents
  [/^\/api\/deals\/[^/]+\/documents/, 'server/routes/document-generation.js', 'document handlers'],

  // Excel Import
  [/^\/api\/deals\/[^/]+\/excel/, 'server/routes/excel-import.js', 'excel handlers'],

  // Review Requests
  [/^\/api\/review-requests/, 'server/routes/review-requests.js', 'review request handlers'],

  // Magic Links
  [/^\/api\/magic-links/, 'server/routes/magic-links.js', 'magic link handlers'],

  // Debug
  [/^\/api\/debug\//, 'server/routes/debug.js', 'debug handlers'],

  // Home
  [/^\/api\/home$/, 'server/routes/home.js', 'handleHomeData'],
  [/^\/api\/inbox$/, 'server/routes/inbox.js', 'handleInbox'],

  // Buyer
  [/^\/api\/buyer\//, 'server/routes/buyer.js', 'buyer handlers'],

  // Gate (Authorization)
  [/^\/api\/gate\//, 'server/routes/gate.js', 'gate handlers'],

  // Brokerages
  [/^\/api\/brokerages/, 'server/routes/brokerages.js', 'brokerage handlers'],

  // Contacts
  [/^\/api\/contacts/, 'server/routes/contacts.js', 'contact handlers'],

  // Listing Agreements
  [/^\/api\/listing-agreements/, 'server/routes/listing-agreements.js', 'listing agreement handlers'],

  // Kernel proxy (fallback)
  [/^\/api\/kernel\//, 'server/index.js', 'kernelProxy'],
];

/**
 * Find the source file that handles a given API path
 * @param {string} path - API path (e.g., "/api/deals/123/home")
 * @returns {{ file: string, handler: string } | null}
 */
export function findRouteFile(path) {
  for (const [pattern, file, handler] of ROUTE_PATTERNS) {
    if (pattern.test(path)) {
      return { file, handler };
    }
  }

  // Fallback: try to guess from path structure
  const pathParts = path.split('/').filter(Boolean);
  if (pathParts[0] === 'api' && pathParts[1]) {
    const guessedFile = `server/routes/${pathParts[1]}.js`;
    return { file: guessedFile, handler: 'unknown' };
  }

  return null;
}

/**
 * Extract handler function name from stack trace
 * @param {string} stack - Error stack trace
 * @returns {string | null}
 */
export function extractHandlerFromStack(stack) {
  if (!stack) return null;

  // Look for function names in stack that match handler patterns
  const handlerPatterns = [
    /at (handle[A-Z]\w+)/,
    /at (dispatch\w+)/,
    /at (\w+Handler)/,
    /at (require\w+)/,
  ];

  for (const pattern of handlerPatterns) {
    const match = stack.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Extract file path and line number from stack trace
 * @param {string} stack - Error stack trace
 * @returns {{ file: string, line: number, column: number } | null}
 */
export function extractLocationFromStack(stack) {
  if (!stack) return null;

  // Match patterns like:
  // at functionName (C:\path\to\file.js:123:45)
  // at C:\path\to\file.js:123:45
  const locationPattern = /at.*?\(?((?:[A-Za-z]:)?[^:()]+):(\d+):(\d+)\)?/;
  const lines = stack.split('\n');

  for (const line of lines) {
    // Skip node_modules
    if (line.includes('node_modules')) continue;

    const match = line.match(locationPattern);
    if (match) {
      return {
        file: match[1],
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10)
      };
    }
  }

  return null;
}

/**
 * Get all relevant file locations from stack trace
 * @param {string} stack - Error stack trace
 * @returns {Array<{ file: string, line: number, function: string }>}
 */
export function extractAllLocationsFromStack(stack) {
  if (!stack) return [];

  const locations = [];
  const locationPattern = /at\s+(?:(\S+)\s+)?\(?((?:[A-Za-z]:)?[^:()]+):(\d+):(\d+)\)?/g;
  const lines = stack.split('\n');

  for (const line of lines) {
    // Skip node_modules
    if (line.includes('node_modules')) continue;
    // Skip internal node modules
    if (line.includes('node:')) continue;

    const match = locationPattern.exec(line);
    if (match) {
      locations.push({
        function: match[1] || 'anonymous',
        file: match[2],
        line: parseInt(match[3], 10)
      });
    }
    locationPattern.lastIndex = 0; // Reset regex
  }

  return locations;
}

/**
 * Extract Prisma model names from stack trace
 * @param {string} stack - Error stack trace
 * @returns {string[]}
 */
export function extractModelsFromStack(stack) {
  if (!stack) return [];

  const models = new Set();

  // Common Prisma model patterns
  const modelPatterns = [
    /prisma\.(\w+)\./gi,
    /model (\w+)/gi,
    /(\w+)\.findUnique/gi,
    /(\w+)\.findMany/gi,
    /(\w+)\.create/gi,
    /(\w+)\.update/gi,
    /(\w+)\.delete/gi,
  ];

  for (const pattern of modelPatterns) {
    let match;
    while ((match = pattern.exec(stack)) !== null) {
      const model = match[1];
      // Filter out common non-model words
      if (!['async', 'await', 'function', 'const', 'let', 'var'].includes(model.toLowerCase())) {
        models.add(model);
      }
    }
  }

  return Array.from(models);
}
