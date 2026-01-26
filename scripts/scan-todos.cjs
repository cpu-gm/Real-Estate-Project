#!/usr/bin/env node
/**
 * Technical Debt Scanner
 * Finds TODO, FIXME, HACK, XXX comments across the codebase
 *
 * Usage:
 *   npm run scan:todos           # Human-readable output
 *   npm run scan:todos -- --json # JSON output for tooling
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const colors = {
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

// Priority mapping
const PRIORITIES = {
  FIXME: { level: 'HIGH', color: colors.red },
  HACK: { level: 'HIGH', color: colors.red },
  XXX: { level: 'MEDIUM', color: colors.yellow },
  TODO: { level: 'MEDIUM', color: colors.yellow },
};

function scanTodos(projectDir) {
  const results = [];
  const patterns = ['TODO:', 'FIXME:', 'HACK:', 'XXX:'];

  for (const pattern of patterns) {
    try {
      // Use git grep for speed (respects .gitignore)
      const output = execSync(
        `git grep -n "${pattern}" -- "*.js" "*.jsx" "*.ts" "*.tsx" "*.cjs" "*.mjs" 2>/dev/null || echo ""`,
        { cwd: projectDir, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
      );

      const lines = output.trim().split('\n').filter(l => l);
      for (const line of lines) {
        // Parse: filename:lineNumber:content
        const match = line.match(/^([^:]+):(\d+):(.*)$/);
        if (match) {
          const [, file, lineNum, content] = match;
          const type = pattern.replace(':', '');
          const text = content.trim();

          // Extract just the comment part
          const commentMatch = text.match(new RegExp(`${type}:\\s*(.*)$`, 'i'));
          const comment = commentMatch ? commentMatch[1].trim() : text;

          results.push({
            file,
            line: parseInt(lineNum, 10),
            type,
            comment,
            priority: PRIORITIES[type]?.level || 'LOW',
          });
        }
      }
    } catch {
      // Ignore errors (no matches)
    }
  }

  return results;
}

function printHumanReadable(results) {
  console.log(`\n${colors.bold}=== Technical Debt Scanner ===${colors.reset}\n`);

  if (results.length === 0) {
    console.log(`${colors.cyan}No TODOs found! Codebase is clean.${colors.reset}\n`);
    return;
  }

  // Group by priority
  const byPriority = { HIGH: [], MEDIUM: [], LOW: [] };
  for (const item of results) {
    byPriority[item.priority].push(item);
  }

  // Count by type
  const byType = {};
  for (const item of results) {
    byType[item.type] = (byType[item.type] || 0) + 1;
  }

  // Count by file
  const fileCount = new Set(results.map(r => r.file)).size;

  console.log(`Found ${colors.bold}${results.length}${colors.reset} items across ${colors.bold}${fileCount}${colors.reset} files\n`);

  // Print HIGH priority first
  if (byPriority.HIGH.length > 0) {
    console.log(`${colors.red}${colors.bold}[HIGH PRIORITY - FIXME/HACK]${colors.reset}`);
    for (const item of byPriority.HIGH.slice(0, 10)) {
      console.log(`  ${colors.dim}${item.file}:${item.line}${colors.reset}`);
      console.log(`    ${item.type}: ${item.comment.substring(0, 80)}${item.comment.length > 80 ? '...' : ''}`);
    }
    if (byPriority.HIGH.length > 10) {
      console.log(`  ${colors.dim}... and ${byPriority.HIGH.length - 10} more${colors.reset}`);
    }
    console.log('');
  }

  // Print MEDIUM priority
  if (byPriority.MEDIUM.length > 0) {
    console.log(`${colors.yellow}${colors.bold}[MEDIUM - TODO/XXX]${colors.reset}`);
    for (const item of byPriority.MEDIUM.slice(0, 15)) {
      console.log(`  ${colors.dim}${item.file}:${item.line}${colors.reset}`);
      console.log(`    ${item.type}: ${item.comment.substring(0, 80)}${item.comment.length > 80 ? '...' : ''}`);
    }
    if (byPriority.MEDIUM.length > 15) {
      console.log(`  ${colors.dim}... and ${byPriority.MEDIUM.length - 15} more${colors.reset}`);
    }
    console.log('');
  }

  // Summary
  console.log(`${colors.bold}Summary:${colors.reset}`);
  for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    const priority = PRIORITIES[type];
    console.log(`  ${priority?.color || ''}${type}: ${count}${colors.reset}`);
  }
  console.log('');

  console.log(`${colors.dim}Run 'npm run scan:todos -- --json' for machine-readable output${colors.reset}\n`);
}

function printJson(results) {
  const output = {
    timestamp: new Date().toISOString(),
    total: results.length,
    files: new Set(results.map(r => r.file)).size,
    byType: {},
    byPriority: { HIGH: 0, MEDIUM: 0, LOW: 0 },
    items: results,
  };

  for (const item of results) {
    output.byType[item.type] = (output.byType[item.type] || 0) + 1;
    output.byPriority[item.priority]++;
  }

  console.log(JSON.stringify(output, null, 2));
}

// Main
const projectDir = process.cwd();
const jsonMode = process.argv.includes('--json');

const results = scanTodos(projectDir);

if (jsonMode) {
  printJson(results);
} else {
  printHumanReadable(results);
}

// Exit with code 1 if there are HIGH priority items (useful for CI)
if (results.some(r => r.priority === 'HIGH')) {
  process.exit(1);
}
