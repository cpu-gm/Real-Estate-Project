/**
 * Code Analyzer - Proactive Error Detection
 *
 * Performs static analysis on route files to find potential issues
 * BEFORE they cause runtime errors. Results are written to a file
 * that Claude can read and report on.
 *
 * Run with: npm run analyze:errors
 */

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.join(process.cwd(), '..');
const ROUTES_DIR = path.join(process.cwd(), 'server', 'routes');
const POTENTIAL_ERRORS_FILE = path.join(PROJECT_ROOT, '.claude', 'potential-errors.md');

/**
 * Analyze all route files for potential issues
 */
export async function analyzeForPotentialErrors() {
  console.log('[CodeAnalyzer] Starting analysis...');

  const issues = [];

  // Find all route files
  const routeFiles = findRouteFiles(ROUTES_DIR);
  console.log(`[CodeAnalyzer] Found ${routeFiles.length} route files`);

  for (const file of routeFiles) {
    const relativePath = path.relative(process.cwd(), file).replace(/\\/g, '/');
    console.log(`[CodeAnalyzer] Analyzing ${relativePath}...`);

    const content = fs.readFileSync(file, 'utf-8');
    const fileIssues = analyzeFile(relativePath, content);
    issues.push(...fileIssues);
  }

  // Write report
  writePotentialErrorsReport(issues);

  console.log(`[CodeAnalyzer] Found ${issues.length} potential issues`);
  console.log(`[CodeAnalyzer] Report written to ${POTENTIAL_ERRORS_FILE}`);

  return issues;
}

/**
 * Find all .js files in routes directory
 */
function findRouteFiles(dir) {
  const files = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findRouteFiles(fullPath));
    } else if (entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Analyze a single file for potential issues
 */
function analyzeFile(filename, content) {
  const issues = [];
  const lines = content.split('\n');

  // Pattern 1: POST/PUT/PATCH handlers without validateBody
  issues.push(...checkMissingValidation(filename, content, lines));

  // Pattern 2: Handlers without auth check
  issues.push(...checkMissingAuth(filename, content, lines));

  // Pattern 3: Database queries without org isolation
  issues.push(...checkMissingOrgIsolation(filename, content, lines));

  // Pattern 4: Potential null access
  issues.push(...checkPotentialNullAccess(filename, content, lines));

  // Pattern 5: Missing error handling for async operations
  issues.push(...checkMissingErrorHandling(filename, content, lines));

  // Pattern 6: Hardcoded values that should be configurable
  issues.push(...checkHardcodedValues(filename, content, lines));

  return issues;
}

/**
 * Check for routes that read JSON body without validation
 */
function checkMissingValidation(filename, content, lines) {
  const issues = [];

  // Skip if file uses validateBody
  if (content.includes('validateBody')) {
    return issues;
  }

  // Look for readJsonBody usage
  if (content.includes('readJsonBody')) {
    const lineNum = findLineNumber(lines, 'readJsonBody');
    issues.push({
      file: filename,
      line: lineNum,
      severity: 'HIGH',
      type: 'MISSING_VALIDATION',
      message: 'Route reads JSON body but does not use validateBody() for schema validation',
      suggestion: 'Add Zod schema validation:\n```javascript\nconst body = await validateBody(Schema)(req, readJsonBody);\n```',
      impact: 'Invalid input can cause crashes or unexpected behavior'
    });
  }

  return issues;
}

/**
 * Check for handlers without authentication
 */
function checkMissingAuth(filename, content, lines) {
  const issues = [];

  // Find handler function definitions
  const handlerRegex = /async function (handle\w+)\(req,?\s*res\)/g;
  let match;

  while ((match = handlerRegex.exec(content)) !== null) {
    const handlerName = match[1];
    const handlerStart = match.index;

    // Find the end of this function (next function or end of file)
    const nextFunctionMatch = content.slice(handlerStart + 50).match(/\nasync function /);
    const handlerEnd = nextFunctionMatch
      ? handlerStart + 50 + nextFunctionMatch.index
      : content.length;

    const handlerBody = content.slice(handlerStart, handlerEnd);

    // Skip public handlers
    const publicHandlers = ['Login', 'Signup', 'Public', 'Health', 'Webhook', 'Callback'];
    if (publicHandlers.some(p => handlerName.includes(p))) {
      continue;
    }

    // Check for auth
    const hasAuth = handlerBody.includes('requireAuth') ||
                    handlerBody.includes('requireGP') ||
                    handlerBody.includes('requireAdmin') ||
                    handlerBody.includes('requireLP') ||
                    handlerBody.includes('extractAuthUser');

    if (!hasAuth) {
      const lineNum = content.slice(0, handlerStart).split('\n').length;
      issues.push({
        file: filename,
        line: lineNum,
        severity: 'HIGH',
        type: 'MISSING_AUTH',
        message: `Handler '${handlerName}' does not check authentication`,
        suggestion: 'Add auth check:\n```javascript\nconst authUser = await requireAuthOrThrow(req);\n```',
        impact: 'Unauthorized users may access this endpoint'
      });
    }
  }

  return issues;
}

/**
 * Check for database queries without organization isolation
 */
function checkMissingOrgIsolation(filename, content, lines) {
  const issues = [];

  // Look for findMany without organizationId
  const findManyRegex = /prisma\.\w+\.findMany\(\{[^}]*\}\)/gs;
  let match;

  while ((match = findManyRegex.exec(content)) !== null) {
    const query = match[0];

    // Skip if it has org isolation
    if (query.includes('organizationId')) {
      continue;
    }

    // Skip if it's in a function that already checks org
    const beforeMatch = content.slice(Math.max(0, match.index - 500), match.index);
    if (beforeMatch.includes('organizationId') || beforeMatch.includes('fetchWithOrgCheck')) {
      continue;
    }

    const lineNum = content.slice(0, match.index).split('\n').length;
    issues.push({
      file: filename,
      line: lineNum,
      severity: 'MEDIUM',
      type: 'MISSING_ORG_ISOLATION',
      message: 'Database findMany() query may lack organization isolation',
      suggestion: 'Add org filter:\n```javascript\nwhere: { organizationId: authUser.organizationId }\n```',
      impact: 'Users may see data from other organizations'
    });
  }

  return issues;
}

/**
 * Check for potential null/undefined access
 */
function checkPotentialNullAccess(filename, content, lines) {
  const issues = [];

  // Look for nested property access without optional chaining
  const nestedAccessRegex = /(\w+)\.(\w+)\.(\w+)/g;
  let match;

  // Track what we've already warned about
  const warned = new Set();

  while ((match = nestedAccessRegex.exec(content)) !== null) {
    const fullMatch = match[0];
    const baseVar = match[1];

    // Skip common safe patterns
    const safePatterns = [
      'process.env',
      'req.headers',
      'req.params',
      'res.statusCode',
      'console.log',
      'console.error',
      'path.join',
      'fs.readFileSync',
      'JSON.stringify',
      'JSON.parse',
      'Math.',
      'Date.',
      'Array.',
      'Object.',
      'String.',
      'Number.',
      'prisma.', // Prisma handles nulls
      'zod.', // Zod validation
      'z.', // Zod
    ];

    if (safePatterns.some(p => fullMatch.startsWith(p) || fullMatch.includes(`.${p}`))) {
      continue;
    }

    // Skip if already warned about this variable in this file
    const warnKey = `${filename}:${baseVar}`;
    if (warned.has(warnKey)) {
      continue;
    }

    // Check for null check before access
    const beforeMatch = content.slice(Math.max(0, match.index - 200), match.index);
    const hasNullCheck = beforeMatch.includes(`${baseVar}?`) ||
                        beforeMatch.includes(`if (${baseVar}`) ||
                        beforeMatch.includes(`if (!${baseVar}`) ||
                        beforeMatch.includes(`${baseVar} &&`) ||
                        beforeMatch.includes(`${baseVar} ||`);

    if (!hasNullCheck) {
      const lineNum = content.slice(0, match.index).split('\n').length;

      // Only warn if it looks like a variable access (not a method chain)
      if (/^[a-z]/.test(baseVar) && !beforeMatch.includes(`const ${baseVar}`) && !beforeMatch.includes(`let ${baseVar}`)) {
        warned.add(warnKey);
        issues.push({
          file: filename,
          line: lineNum,
          severity: 'LOW',
          type: 'POTENTIAL_NULL_ACCESS',
          message: `Nested property access '${fullMatch}' may throw if '${baseVar}' is null`,
          suggestion: `Use optional chaining:\n\`\`\`javascript\n${baseVar}?.${match[2]}?.${match[3]}\n\`\`\``,
          impact: 'May cause "Cannot read property of undefined" error'
        });
      }
    }
  }

  return issues;
}

/**
 * Check for async operations without error handling
 */
function checkMissingErrorHandling(filename, content, lines) {
  const issues = [];

  // Look for await outside try-catch
  const awaitRegex = /await\s+\w+/g;
  let match;

  // Find all try blocks
  const tryBlocks = [];
  const tryRegex = /try\s*\{/g;
  let tryMatch;
  while ((tryMatch = tryRegex.exec(content)) !== null) {
    // Find matching closing brace (simplified - doesn't handle nested)
    const afterTry = content.slice(tryMatch.index);
    let braceCount = 0;
    let endIndex = 0;
    for (let i = 0; i < afterTry.length; i++) {
      if (afterTry[i] === '{') braceCount++;
      if (afterTry[i] === '}') braceCount--;
      if (braceCount === 0) {
        endIndex = i;
        break;
      }
    }
    tryBlocks.push({
      start: tryMatch.index,
      end: tryMatch.index + endIndex
    });
  }

  // Check external API calls without try-catch
  const externalCallPatterns = [
    /fetch\(/g,
    /axios\./g,
    /sendEmail/g,
    /kernelClient/g,
  ];

  for (const pattern of externalCallPatterns) {
    let callMatch;
    while ((callMatch = pattern.exec(content)) !== null) {
      const isInTryBlock = tryBlocks.some(
        block => callMatch.index > block.start && callMatch.index < block.end
      );

      if (!isInTryBlock) {
        const lineNum = content.slice(0, callMatch.index).split('\n').length;
        const callType = callMatch[0].replace(/[(.]/g, '');
        issues.push({
          file: filename,
          line: lineNum,
          severity: 'MEDIUM',
          type: 'MISSING_ERROR_HANDLING',
          message: `External call '${callType}' is not wrapped in try-catch`,
          suggestion: 'Wrap in try-catch:\n```javascript\ntry {\n  const result = await ' + callType + '(...);\n} catch (err) {\n  throw ApiError.internal("' + callType + ' failed");\n}\n```',
          impact: 'Network errors may crash the request'
        });
      }
    }
  }

  return issues;
}

/**
 * Check for hardcoded values that should be configurable
 */
function checkHardcodedValues(filename, content, lines) {
  const issues = [];

  // Look for hardcoded URLs
  const urlRegex = /['"]https?:\/\/[^'"]+['"]/g;
  let match;

  while ((match = urlRegex.exec(content)) !== null) {
    const url = match[0];

    // Skip test URLs and localhost
    if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('example.com')) {
      continue;
    }

    const lineNum = content.slice(0, match.index).split('\n').length;
    issues.push({
      file: filename,
      line: lineNum,
      severity: 'LOW',
      type: 'HARDCODED_URL',
      message: `Hardcoded URL ${url} should be in environment config`,
      suggestion: 'Move to environment variable:\n```javascript\nprocess.env.EXTERNAL_API_URL\n```',
      impact: 'Cannot change URL without code changes'
    });
  }

  return issues;
}

/**
 * Find line number of first occurrence
 */
function findLineNumber(lines, searchText) {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(searchText)) {
      return i + 1;
    }
  }
  return 1;
}

/**
 * Write the potential errors report
 */
function writePotentialErrorsReport(issues) {
  const timestamp = new Date().toISOString();

  // Group by severity
  const grouped = {
    HIGH: issues.filter(i => i.severity === 'HIGH'),
    MEDIUM: issues.filter(i => i.severity === 'MEDIUM'),
    LOW: issues.filter(i => i.severity === 'LOW')
  };

  // Ensure directory exists
  const dir = path.dirname(POTENTIAL_ERRORS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let content = `# Potential Errors Report

**Generated**: ${timestamp}
**Total Issues**: ${issues.length}

This file contains potential issues found by static analysis.
Review these before they become runtime errors.

**Commands for Claude:**
- "find potential bugs" - Claude reads this file and offers fixes
- "fix potential errors" - Claude fixes issues one by one

---

## Summary

| Severity | Count | Description |
|----------|-------|-------------|
| HIGH | ${grouped.HIGH.length} | Security/crash risks |
| MEDIUM | ${grouped.MEDIUM.length} | Data integrity risks |
| LOW | ${grouped.LOW.length} | Code quality issues |

---

`;

  // Write issues by severity
  for (const severity of ['HIGH', 'MEDIUM', 'LOW']) {
    const severityIssues = grouped[severity];
    if (severityIssues.length === 0) continue;

    const emoji = severity === 'HIGH' ? '🔴' : severity === 'MEDIUM' ? '🟡' : '🟢';
    content += `## ${emoji} ${severity} Severity Issues (${severityIssues.length})\n\n`;

    for (const issue of severityIssues) {
      content += `### ${issue.type}\n\n`;
      content += `**File**: \`${issue.file}:${issue.line}\`\n\n`;
      content += `**Problem**: ${issue.message}\n\n`;
      content += `**Impact**: ${issue.impact}\n\n`;
      content += `**Fix**: ${issue.suggestion}\n\n`;
      content += `---\n\n`;
    }
  }

  // Add footer with run instructions
  content += `
## How to Use This Report

1. **Review HIGH severity issues first** - these can cause security issues or crashes
2. **Ask Claude to fix**: "fix the MISSING_AUTH issue in server/routes/deals.js"
3. **Re-run analysis**: \`npm run analyze:errors\` to verify fixes

## Running Analysis

\`\`\`bash
npm run analyze:errors
\`\`\`

This will scan all route files and update this report.
`;

  fs.writeFileSync(POTENTIAL_ERRORS_FILE, content);
}

// Allow running directly
if (process.argv[1]?.endsWith('code-analyzer.js')) {
  analyzeForPotentialErrors().catch(console.error);
}
