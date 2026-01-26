#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Smart CLAUDE.md context preservation hook
 * Captures git status, recent commits, and TODO count on compaction/session end
 */

// Helper to run git commands safely
function runGit(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

// Count TODOs in codebase
function countTodos(projectDir) {
  try {
    const result = execSync(
      'git grep -c -E "(TODO|FIXME|HACK|XXX):" -- "*.js" "*.jsx" "*.ts" "*.tsx" 2>/dev/null || echo ""',
      { cwd: projectDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const lines = result.trim().split('\n').filter(l => l);
    let total = 0;
    for (const line of lines) {
      const match = line.match(/:(\d+)$/);
      if (match) total += parseInt(match[1], 10);
    }
    return total;
  } catch {
    return 0;
  }
}

// Read hook input from stdin
let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const hookData = JSON.parse(input || '{}');
    const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const claudeMdPath = path.join(projectDir, 'CLAUDE.md');

    // Check if CLAUDE.md exists
    if (!fs.existsSync(claudeMdPath)) {
      console.log(JSON.stringify({ status: 'skipped', message: 'CLAUDE.md not found' }));
      return;
    }

    // Read current CLAUDE.md
    let content = fs.readFileSync(claudeMdPath, 'utf8');

    // Generate timestamp
    const timestamp = new Date().toISOString().split('T')[0];
    const time = new Date().toLocaleTimeString();

    // Gather git info
    const branch = runGit('git rev-parse --abbrev-ref HEAD', projectDir) || 'unknown';
    const statusOutput = runGit('git status --porcelain', projectDir) || '';
    const statusLines = statusOutput.split('\n').filter(l => l.trim());
    const modified = statusLines.filter(l => l.startsWith(' M') || l.startsWith('M ')).length;
    const untracked = statusLines.filter(l => l.startsWith('??')).length;
    const staged = statusLines.filter(l => /^[MADRC]/.test(l)).length;

    // Get recent commits (last 3)
    const commitsRaw = runGit('git log --oneline -3', projectDir) || '';
    const commits = commitsRaw.split('\n').filter(l => l.trim()).map(l => `- ${l}`).join('\n');

    // Count TODOs
    const todoCount = countTodos(projectDir);

    // Build new state section
    const newState = `## Current Project State
<!-- Auto-updated by ${hookData.hook_event_name || 'hook'}: ${timestamp} ${time} -->

### Session Info
- Branch: \`${branch}\`
- Last update: ${timestamp} ${time}
- Hook trigger: ${hookData.hook_event_name || 'unknown'}

### Git Status
- Modified: ${modified} files
- Staged: ${staged} files
- Untracked: ${untracked} files

### Recent Commits
${commits || '- No commits yet'}

### Technical Debt
- TODOs in codebase: ${todoCount}

### Next Steps
- [Continue from where you left off]
`;

    // Replace the Current Project State section
    const stateRegex = /## Current Project State[\s\S]*?(?=\n---|\n## [^C]|$)/;
    if (stateRegex.test(content)) {
      content = content.replace(stateRegex, newState);
    } else {
      content += '\n---\n\n' + newState;
    }

    fs.writeFileSync(claudeMdPath, content);
    console.log(JSON.stringify({
      status: 'success',
      message: 'CLAUDE.md updated',
      branch,
      modified,
      untracked,
      todoCount
    }));
  } catch (err) {
    console.error(JSON.stringify({ status: 'error', message: err.message }));
    process.exit(1);
  }
});
