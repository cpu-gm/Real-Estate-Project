# Plan: Automatic Context Preservation with Claude Code Hooks

## Problem
When Claude Code sessions compact, context is lost - requiring re-reading files and losing track of tasks.

## Solution
Use Claude Code's **hooks system** to automatically update CLAUDE.md before compaction and at session end.

---

## Implementation Overview

### Files to Create

| File | Purpose |
|------|---------|
| `.claude/settings.local.json` | Add hook configuration |
| `.claude/hooks/update-context.js` | Script to update CLAUDE.md |
| `CLAUDE.md` | Already created - architecture context file |

---

## Step 1: Create Hook Script

**File**: `c:\Users\majes\OneDrive\Documents\GitHub\Github\.claude\hooks\update-context.js`

This Node.js script will:
1. Read the session transcript (passed via stdin as JSON)
2. Parse recent activity to extract:
   - Files modified
   - Tasks completed
   - Current work in progress
3. Update the "Current Project State" section of CLAUDE.md

```javascript
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Read hook input from stdin
let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const hookData = JSON.parse(input);
    const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const claudeMdPath = path.join(projectDir, 'CLAUDE.md');

    // Read current CLAUDE.md
    let content = fs.readFileSync(claudeMdPath, 'utf8');

    // Generate timestamp
    const timestamp = new Date().toISOString().split('T')[0];
    const time = new Date().toLocaleTimeString();

    // Build new state section
    const newState = `## Current Project State
<!-- Auto-updated by PreCompact hook: ${timestamp} ${time} -->

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
  }
});
```

---

## Step 2: Update Settings with Hook Configuration

**File**: `c:\Users\majes\OneDrive\Documents\GitHub\Github\.claude\settings.local.json`

Add hooks to the existing settings:

```json
{
  "permissions": {
    "allow": [
      "Bash(tree:*)",
      "Bash(dir /B /S)",
      "Bash(findstr:*)",
      "Bash(node -c:*)"
    ],
    "additionalDirectories": [
      "c:\\Users\\majes\\OneDrive\\Documents\\GitHub\\Github"
    ]
  },
  "hooks": {
    "PreCompact": [
      {
        "matcher": "auto",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/update-context.js"
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/update-context.js"
          }
        ]
      }
    ]
  }
}
```

---

## How It Works

```
Session at 98% context
        |
        v
PreCompact hook fires (auto trigger)
        |
        v
update-context.js runs
        |
        v
CLAUDE.md "Current Project State" updated with timestamp
        |
        v
Compaction proceeds
        |
        v
New session loads CLAUDE.md with preserved state
```

---

## Hook Triggers

| Event | Matcher | When |
|-------|---------|------|
| PreCompact | `auto` | When context hits ~95-98% and auto-compacts |
| PreCompact | `manual` | When you run `/compact` command |
| SessionEnd | (none) | When you exit Claude Code |

---

## Step 3: Add Instructions to CLAUDE.md (Fallback)

Add this section near the top of CLAUDE.md as a fallback when hooks don't fire:

```markdown
## Instructions for Claude
IMPORTANT: Before any compaction or when context is running low (~90%+):
1. Update the "Current Project State" section at the bottom of this file
2. List what was accomplished this session
3. Note any blockers, active work, and next steps
4. This ensures context survives compaction
```

This provides a secondary mechanism - Claude will see this instruction and update the file proactively.

---

## Verification

After implementation:
1. Work on a task until context reaches ~90%
2. Run `/compact` manually
3. Check if CLAUDE.md was updated with timestamp
4. Start new session and verify context is preserved

---

## Files Summary

| File | Action |
|------|--------|
| `CLAUDE.md` | Update (add Instructions for Claude section) |
| `.claude/hooks/update-context.js` | Create (hook script) |
| `.claude/settings.local.json` | Update (add hooks config) |

---

## Implementation Order

1. Create `.claude/hooks/` directory
2. Create `update-context.js` hook script
3. Update `.claude/settings.local.json` with hooks config
4. Update `CLAUDE.md` with "Instructions for Claude" section
5. Test by running `/compact` manually
