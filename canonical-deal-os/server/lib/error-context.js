/**
 * Error Context Collector
 *
 * Collects rich debugging context when an API error occurs.
 * This context helps Claude Code diagnose issues without asking follow-up questions.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import {
  findRouteFile,
  extractHandlerFromStack,
  extractLocationFromStack,
  extractAllLocationsFromStack,
  extractModelsFromStack
} from './route-map.js';

const PROJECT_ROOT = path.join(process.cwd(), '..');
const DETAILED_LOG_PATH = path.join(PROJECT_ROOT, '.claude', 'api-errors-detailed.json');
const MAX_CODE_LINES = 15;
const MAX_RECENT_ERRORS = 10;

/**
 * Collect comprehensive error context for debugging
 */
export async function collectErrorContext(error, req = null) {
  const context = {
    timestamp: new Date().toISOString(),

    // Core error info
    error: {
      requestId: error.requestId || null,
      method: error.method || req?.method || 'UNKNOWN',
      path: error.path || req?.url?.split('?')[0] || 'UNKNOWN',
      status: error.status || 500,
      code: error.code || 'INTERNAL_ERROR',
      message: error.message || 'Unknown error',
      suggestion: error.suggestion || generateSuggestion(error),
      stack: error.stack || null
    },

    // Source code context
    sourceContext: await getSourceContext(error),

    // Request context (sanitized)
    request: getRequestContext(error, req),

    // Git context
    gitContext: getGitContext(error),

    // Database models involved
    dbContext: {
      affectedModels: extractModelsFromStack(error.stack)
    },

    // Suggested fix based on error code
    suggestedFix: generateFixSuggestion(error),

    // Request replay data (for testing after fix)
    replay: generateReplayData(error, req)
  };

  return context;
}

/**
 * Get source code context around the error
 */
async function getSourceContext(error) {
  const context = {
    routeFile: null,
    handlerFunction: null,
    errorLocation: null,
    relevantCode: null,
    stackLocations: []
  };

  // Find route file from path
  const routeInfo = findRouteFile(error.path);
  if (routeInfo) {
    context.routeFile = routeInfo.file;
    context.handlerFunction = routeInfo.handler;
  }

  // Extract handler from stack trace
  const stackHandler = extractHandlerFromStack(error.stack);
  if (stackHandler) {
    context.handlerFunction = stackHandler;
  }

  // Get error location from stack
  const location = extractLocationFromStack(error.stack);
  if (location) {
    context.errorLocation = location;

    // Try to read relevant code lines
    try {
      const code = readCodeAroundLine(location.file, location.line, MAX_CODE_LINES);
      if (code) {
        context.relevantCode = code;
      }
    } catch {
      // File might not be accessible
    }
  }

  // Get all stack locations (for context)
  context.stackLocations = extractAllLocationsFromStack(error.stack).slice(0, 5);

  return context;
}

/**
 * Read code lines around a specific line number
 */
function readCodeAroundLine(filePath, lineNumber, contextLines = 10) {
  try {
    // Normalize path
    const normalizedPath = filePath.replace(/\\/g, '/');
    let fullPath = normalizedPath;

    // If not absolute, try relative to project
    if (!path.isAbsolute(normalizedPath)) {
      fullPath = path.join(PROJECT_ROOT, normalizedPath);
    }

    if (!fs.existsSync(fullPath)) {
      return null;
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');

    const startLine = Math.max(0, lineNumber - Math.floor(contextLines / 2) - 1);
    const endLine = Math.min(lines.length, lineNumber + Math.ceil(contextLines / 2));

    const codeLines = [];
    for (let i = startLine; i < endLine; i++) {
      const lineNum = i + 1;
      const marker = lineNum === lineNumber ? '>>>' : '   ';
      codeLines.push(`${marker} ${lineNum}: ${lines[i]}`);
    }

    return codeLines.join('\n');
  } catch {
    return null;
  }
}

/**
 * Get sanitized request context
 */
function getRequestContext(error, req) {
  const context = {
    authUser: null,
    params: null,
    query: null,
    body: null
  };

  // Auth user (if available)
  if (error.authUser) {
    context.authUser = {
      id: error.authUser.id,
      email: error.authUser.email,
      role: error.authUser.role,
      organizationId: error.authUser.organizationId
    };
  }

  // URL params (if available)
  if (error.params) {
    context.params = error.params;
  }

  // Query params (if available)
  if (req?.url) {
    try {
      const url = new URL(req.url, 'http://localhost');
      const query = {};
      url.searchParams.forEach((value, key) => {
        query[key] = value;
      });
      if (Object.keys(query).length > 0) {
        context.query = query;
      }
    } catch {
      // Invalid URL
    }
  }

  // Request body (sanitized - remove passwords, tokens)
  if (error.body) {
    context.body = sanitizeBody(error.body);
  }

  return context;
}

/**
 * Sanitize request body - remove sensitive fields
 */
function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return body;

  const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'api_key', 'authorization'];
  const sanitized = { ...body };

  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
    // Also check lowercase/uppercase variants
    const lowerField = field.toLowerCase();
    for (const key of Object.keys(sanitized)) {
      if (key.toLowerCase() === lowerField || key.toLowerCase().includes('password') || key.toLowerCase().includes('secret')) {
        sanitized[key] = '[REDACTED]';
      }
    }
  }

  return sanitized;
}

/**
 * Get git context - recent commits and changes
 */
function getGitContext(error) {
  const context = {
    recentCommits: [],
    uncommittedChanges: null,
    routeFileChanged: false
  };

  try {
    // Get recent commits
    const commits = execSync('git log --oneline -3 2>/dev/null || echo "git not available"', {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      timeout: 5000
    }).trim();

    if (commits && !commits.includes('git not available')) {
      context.recentCommits = commits.split('\n').filter(Boolean);
    }

    // Check if route file has uncommitted changes
    const routeInfo = findRouteFile(error.path);
    if (routeInfo) {
      const status = execSync(`git status --porcelain "${routeInfo.file}" 2>/dev/null || echo ""`, {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
        timeout: 5000
      }).trim();

      context.routeFileChanged = status.length > 0;

      // If changed, get the diff
      if (context.routeFileChanged) {
        try {
          const diff = execSync(`git diff "${routeInfo.file}" 2>/dev/null | head -50`, {
            cwd: PROJECT_ROOT,
            encoding: 'utf-8',
            timeout: 5000
          }).trim();

          if (diff) {
            context.uncommittedChanges = diff;
          }
        } catch {
          // Diff failed
        }
      }
    }
  } catch {
    // Git commands failed - that's OK
  }

  return context;
}

/**
 * Generate a suggestion based on error code
 */
function generateSuggestion(error) {
  const suggestions = {
    'AUTH_REQUIRED': 'Check that the request includes a valid Authorization header with Bearer token',
    'AUTH_TOKEN_EXPIRED': 'The session has expired. User needs to log in again',
    'AUTH_INVALID_TOKEN': 'The token is malformed or invalid. Check token generation',
    'FORBIDDEN_ROLE': `User does not have the required role. Check role requirements`,
    'FORBIDDEN_ORG': 'User is trying to access a resource from a different organization. Check org isolation',
    'FORBIDDEN_DEAL_ACCESS': 'User does not have access to this deal. Check deal permissions',
    'VALIDATION_FAILED': 'Request body is missing required fields or has invalid data. Check the schema',
    'NOT_FOUND': 'The requested resource does not exist. Verify the ID is correct',
    'CONFLICT': 'A resource with this identifier already exists',
    'KERNEL_UNAVAILABLE': 'The Kernel API is not responding. Check if it is running on port 3001',
    'INTERNAL_ERROR': 'An unexpected error occurred. Check the stack trace for details'
  };

  return error.suggestion || suggestions[error.code] || 'Check the error details and stack trace';
}

/**
 * Generate fix suggestion based on error code and context
 */
function generateFixSuggestion(error) {
  const fixes = {
    'VALIDATION_FAILED': {
      type: 'validation',
      description: 'Add or fix input validation',
      steps: [
        '1. Check the Zod schema for the endpoint',
        '2. Verify required fields in the request body',
        '3. Use validateBody() helper for consistent validation'
      ],
      codeExample: `// Add validation at the start of the handler
const body = await validateBody(YourSchema)(req, readJsonBody);`
    },
    'AUTH_REQUIRED': {
      type: 'auth',
      description: 'Authentication is missing or invalid',
      steps: [
        '1. Ensure the client sends Authorization header',
        '2. Check token format: "Bearer <token>"',
        '3. Verify token is not expired'
      ],
      codeExample: `// Client-side: include auth header
fetch('/api/endpoint', {
  headers: { 'Authorization': \`Bearer \${token}\` }
})`
    },
    'FORBIDDEN_ROLE': {
      type: 'authorization',
      description: 'User role is insufficient',
      steps: [
        '1. Check which role is required (GP, Admin, etc.)',
        '2. Verify user has been assigned the correct role',
        '3. Use correct auth middleware (requireGP, requireAdmin)'
      ],
      codeExample: `// Use appropriate auth check
const authUser = await requireGPOrThrow(req);`
    },
    'FORBIDDEN_ORG': {
      type: 'authorization',
      description: 'Cross-organization access violation',
      steps: [
        '1. Verify the resource belongs to user organization',
        '2. Check org isolation in the query',
        '3. Use fetchWithOrgCheckOrThrow for safety'
      ],
      codeExample: `// Always include org check
const resource = await fetchWithOrgCheckOrThrow({
  prisma, model: 'Deal', id: dealId, authUser
});`
    },
    'NOT_FOUND': {
      type: 'resource',
      description: 'Resource does not exist',
      steps: [
        '1. Verify the ID format (should be UUID)',
        '2. Check if resource was deleted',
        '3. Verify database has the record'
      ],
      codeExample: `// Check resource exists before operations
if (!resource) {
  throw ApiError.notFound('Deal');
}`
    },
    'INTERNAL_ERROR': {
      type: 'bug',
      description: 'Uncaught exception - likely a bug',
      steps: [
        '1. Check the stack trace for the error location',
        '2. Look for null/undefined access',
        '3. Add try/catch for external operations'
      ],
      codeExample: `// Wrap risky operations
try {
  const result = await riskyOperation();
} catch (err) {
  throw ApiError.internal('Operation failed', err.message);
}`
    }
  };

  return fixes[error.code] || {
    type: 'unknown',
    description: 'Unknown error type',
    steps: ['1. Check the stack trace', '2. Review recent code changes'],
    codeExample: null
  };
}

/**
 * Write detailed error context to file for Claude
 */
export async function writeDetailedErrorLog(error, req = null) {
  try {
    const context = await collectErrorContext(error, req);

    // Read existing log
    let existingData = { recentErrors: [] };
    if (fs.existsSync(DETAILED_LOG_PATH)) {
      try {
        existingData = JSON.parse(fs.readFileSync(DETAILED_LOG_PATH, 'utf-8'));
      } catch {
        existingData = { recentErrors: [] };
      }
    }

    // Ensure directory exists
    const logDir = path.dirname(DETAILED_LOG_PATH);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Add to recent errors (keep last N)
    const recentErrors = existingData.recentErrors || [];
    recentErrors.unshift({
      timestamp: context.timestamp,
      requestId: context.error.requestId,
      method: context.error.method,
      path: context.error.path,
      status: context.error.status,
      code: context.error.code,
      message: context.error.message
    });

    // Write updated log
    const logData = {
      lastUpdated: context.timestamp,
      latestError: context,
      recentErrors: recentErrors.slice(0, MAX_RECENT_ERRORS)
    };

    fs.writeFileSync(DETAILED_LOG_PATH, JSON.stringify(logData, null, 2));
  } catch (err) {
    console.error('[error-context] Failed to write detailed error log:', err.message);
  }
}

/**
 * Get the path to the detailed error log
 */
export function getDetailedLogPath() {
  return DETAILED_LOG_PATH;
}

/**
 * Generate request replay data for testing after fix
 */
function generateReplayData(error, req) {
  const method = error.method || req?.method || 'GET';
  const apiPath = error.path || req?.url?.split('?')[0] || '/';
  const url = `http://localhost:8787${apiPath}`;
  const body = error.body ? sanitizeBody(error.body) : null;

  // Generate curl command
  let curlCmd = `curl -X ${method} "${url}"`;
  curlCmd += ` \\\n  -H "Content-Type: application/json"`;
  curlCmd += ` \\\n  -H "Authorization: Bearer <YOUR_TOKEN>"`;
  if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
    curlCmd += ` \\\n  -d '${JSON.stringify(body)}'`;
  }

  // Generate fetch code for browser console
  const fetchCode = generateFetchCode(url, method, body);

  return {
    url,
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <YOUR_TOKEN>'
    },
    body,
    curlCommand: curlCmd,
    fetchCode,
    instructions: [
      '1. Copy the curlCommand or fetchCode',
      '2. Replace <YOUR_TOKEN> with a valid auth token',
      '3. Run the command to verify the fix works'
    ]
  };
}

/**
 * Generate fetch code for browser console testing
 */
function generateFetchCode(url, method, body) {
  let code = `// Replay this request in browser console
const token = localStorage.getItem('token'); // or paste your token
const response = await fetch("${url}", {
  method: "${method}",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + token
  }`;

  if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
    code += `,
  body: JSON.stringify(${JSON.stringify(body, null, 4).split('\n').join('\n    ')})`;
  }

  code += `
});
const data = await response.json();
console.log(response.status, data);`;

  return code;
}
