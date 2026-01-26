/**
 * Error Watcher - Live Monitoring
 *
 * Watches for new API errors and writes alerts to a file for Claude to review.
 * Runs in the background, checking the error log periodically.
 */

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.join(process.cwd(), '..');
const ALERT_FILE = path.join(PROJECT_ROOT, '.claude', 'error-alerts.md');
const ERROR_LOG = path.join(PROJECT_ROOT, '.claude', 'api-errors.log');

let lastLineCount = 0;
let alertCount = 0;
let watcherInterval = null;

/**
 * Start watching for new errors
 * @param {number} intervalMs - How often to check (default 5000ms)
 */
export function startErrorWatcher(intervalMs = 5000) {
  if (watcherInterval) {
    console.log('[ErrorWatcher] Already running');
    return;
  }

  console.log('[ErrorWatcher] Started monitoring for errors...');

  // Initialize alert file if it doesn't exist
  initializeAlertFile();

  // Get initial line count
  lastLineCount = countLines(ERROR_LOG);

  // Load existing alert count
  alertCount = loadAlertCount();

  // Start periodic check
  watcherInterval = setInterval(() => {
    checkForNewErrors();
  }, intervalMs);
}

/**
 * Stop the error watcher
 */
export function stopErrorWatcher() {
  if (watcherInterval) {
    clearInterval(watcherInterval);
    watcherInterval = null;
    console.log('[ErrorWatcher] Stopped');
  }
}

/**
 * Check if watcher is running
 */
export function isWatcherRunning() {
  return watcherInterval !== null;
}

/**
 * Initialize the alert file with header
 */
function initializeAlertFile() {
  const dir = path.dirname(ALERT_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(ALERT_FILE)) {
    const header = `# Error Alerts

This file is automatically updated when new API errors occur.
Check this file to see recent errors without digging through logs.

**Commands for Claude:**
- "any errors?" - Claude reads this file and summarizes
- "debug" - Claude reads detailed error log and offers fixes

---

`;
    fs.writeFileSync(ALERT_FILE, header);
  }
}

/**
 * Load existing alert count from file
 */
function loadAlertCount() {
  try {
    if (!fs.existsSync(ALERT_FILE)) return 0;
    const content = fs.readFileSync(ALERT_FILE, 'utf-8');
    const matches = content.match(/## Alert #(\d+)/g);
    if (!matches || matches.length === 0) return 0;
    // Get the highest alert number
    const numbers = matches.map(m => parseInt(m.replace('## Alert #', '')));
    return Math.max(...numbers);
  } catch {
    return 0;
  }
}

/**
 * Check for new errors since last check
 */
function checkForNewErrors() {
  try {
    const currentCount = countLines(ERROR_LOG);

    if (currentCount > lastLineCount) {
      const newErrorCount = currentCount - lastLineCount;
      console.log(`[ErrorWatcher] Detected ${newErrorCount} new error(s)`);

      // Read the new errors
      const errors = readLastNLines(ERROR_LOG, newErrorCount);

      // Write alert
      writeAlert(errors);

      lastLineCount = currentCount;
    }
  } catch (err) {
    // Silent fail - don't crash the server
    console.error('[ErrorWatcher] Error checking for new errors:', err.message);
  }
}

/**
 * Write a new alert to the alert file
 */
function writeAlert(errorLines) {
  alertCount++;
  const timestamp = new Date().toISOString();

  // Parse error lines
  const parsedErrors = errorLines.map(line => {
    try {
      return JSON.parse(line);
    } catch {
      return { method: '?', path: '?', code: 'UNKNOWN', message: line };
    }
  });

  // Build alert markdown
  const errorList = parsedErrors.map(e => {
    const severity = getSeverityEmoji(e.code);
    return `- ${severity} \`${e.method} ${e.path}\` **${e.code}**: ${e.message}`;
  }).join('\n');

  const newAlert = `## Alert #${alertCount} - ${timestamp}

**${parsedErrors.length} new error(s) detected!**

${errorList}

${parsedErrors[0]?.suggestion ? `**Suggestion**: ${parsedErrors[0].suggestion}` : ''}

---

`;

  // Read existing content
  let existingContent = '';
  if (fs.existsSync(ALERT_FILE)) {
    existingContent = fs.readFileSync(ALERT_FILE, 'utf-8');
  }

  // Find where the alerts start (after header)
  const headerEnd = existingContent.indexOf('---\n\n');
  let header = '';
  let alerts = '';

  if (headerEnd !== -1) {
    header = existingContent.slice(0, headerEnd + 5);
    alerts = existingContent.slice(headerEnd + 5);
  } else {
    header = `# Error Alerts

This file is automatically updated when new API errors occur.

---

`;
    alerts = existingContent;
  }

  // Prepend new alert
  alerts = newAlert + alerts;

  // Keep only last 20 alerts
  const alertSections = alerts.split(/(?=## Alert #)/);
  if (alertSections.length > 20) {
    alerts = alertSections.slice(0, 20).join('');
  }

  // Write back
  fs.writeFileSync(ALERT_FILE, header + alerts);

  console.log(`[ErrorWatcher] Alert #${alertCount} written to ${ALERT_FILE}`);
}

/**
 * Get emoji indicator for error severity
 */
function getSeverityEmoji(code) {
  const high = ['INTERNAL_ERROR', 'KERNEL_UNAVAILABLE'];
  const medium = ['AUTH_REQUIRED', 'FORBIDDEN_ROLE', 'FORBIDDEN_ORG'];
  const low = ['VALIDATION_FAILED', 'NOT_FOUND', 'CONFLICT'];

  if (high.includes(code)) return '🔴';
  if (medium.includes(code)) return '🟡';
  if (low.includes(code)) return '🟢';
  return '⚪';
}

/**
 * Count non-empty lines in a file
 */
function countLines(filePath) {
  try {
    if (!fs.existsSync(filePath)) return 0;
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n').filter(line => line.trim().length > 0).length;
  } catch {
    return 0;
  }
}

/**
 * Read the last N lines from a file
 */
function readLastNLines(filePath, n) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    return lines.slice(-n);
  } catch {
    return [];
  }
}

/**
 * Get current alert count
 */
export function getAlertCount() {
  return alertCount;
}

/**
 * Clear all alerts (for testing)
 */
export function clearAlerts() {
  alertCount = 0;
  initializeAlertFile();
  console.log('[ErrorWatcher] Alerts cleared');
}
