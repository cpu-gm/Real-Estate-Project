#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

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

    // Build new state section
    const newState = `## Current Project State
<!-- Auto-updated by ${hookData.hook_event_name || 'hook'}: ${timestamp} ${time} -->

### Session Info
- Last compaction/session end: ${timestamp} ${time}
- Hook trigger: ${hookData.hook_event_name || 'unknown'}

### Active Work
- [Review and update manually after resuming]

### Known Issues
- [Update as needed]

### Recent Changes
- Session ended/compacted on ${timestamp}

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
    console.log(JSON.stringify({ status: 'success', message: 'CLAUDE.md updated' }));
  } catch (err) {
    console.error(JSON.stringify({ status: 'error', message: err.message }));
    process.exit(1);
  }
});
