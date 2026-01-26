/**
 * Error Log for Claude Code
 *
 * Writes API errors to a structured log file that Claude Code can read
 * to automatically analyze and diagnose issues.
 *
 * Location: .claude/api-errors.log (in project root)
 * Format: One JSON object per line (JSONL)
 */

import fs from 'fs';
import path from 'path';

// Log file in the .claude directory at project root
const ERROR_LOG_PATH = path.join(process.cwd(), '..', '.claude', 'api-errors.log');
const MAX_ERRORS = 50;
const MAX_FILE_SIZE = 100 * 1024; // 100KB max

/**
 * Log an error for Claude Code to analyze
 *
 * @param {Object} error - Error details
 * @param {string} error.requestId - Request ID for tracing
 * @param {string} error.method - HTTP method
 * @param {string} error.path - Request path
 * @param {number} error.status - HTTP status code
 * @param {string} error.code - Error code (e.g., VALIDATION_FAILED)
 * @param {string} error.message - Error message
 * @param {string} [error.suggestion] - Suggested fix
 * @param {*} [error.details] - Additional details
 * @param {string} [error.stack] - Stack trace for 500 errors
 * @param {number} [error.latency] - Request latency in ms
 */
export function logErrorForClaude(error) {
  try {
    const entry = {
      timestamp: new Date().toISOString(),
      requestId: error.requestId || null,
      method: error.method || 'UNKNOWN',
      path: error.path || 'UNKNOWN',
      status: error.status || 500,
      code: error.code || 'INTERNAL_ERROR',
      message: error.message || 'Unknown error',
      suggestion: error.suggestion || null,
      details: error.details || null,
      stack: error.stack || null,
      latency: error.latency || null
    };

    // Ensure .claude directory exists
    const logDir = path.dirname(ERROR_LOG_PATH);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Read existing errors
    let existingErrors = [];
    if (fs.existsSync(ERROR_LOG_PATH)) {
      try {
        const content = fs.readFileSync(ERROR_LOG_PATH, 'utf-8');
        existingErrors = content
          .split('\n')
          .filter(line => line.trim())
          .map(line => {
            try {
              return JSON.parse(line);
            } catch {
              return null;
            }
          })
          .filter(Boolean);
      } catch {
        existingErrors = [];
      }
    }

    // Add new error and keep only last MAX_ERRORS
    existingErrors.push(entry);
    if (existingErrors.length > MAX_ERRORS) {
      existingErrors = existingErrors.slice(-MAX_ERRORS);
    }

    // Write back as JSONL
    const content = existingErrors.map(e => JSON.stringify(e)).join('\n') + '\n';

    // Check file size limit
    if (Buffer.byteLength(content, 'utf-8') > MAX_FILE_SIZE) {
      // Keep only the most recent errors that fit
      while (existingErrors.length > 10 && Buffer.byteLength(
        existingErrors.map(e => JSON.stringify(e)).join('\n'), 'utf-8'
      ) > MAX_FILE_SIZE) {
        existingErrors.shift();
      }
    }

    fs.writeFileSync(ERROR_LOG_PATH, existingErrors.map(e => JSON.stringify(e)).join('\n') + '\n');
  } catch (err) {
    // Don't crash the server if logging fails
    console.error('[error-log] Failed to write error log:', err.message);
  }
}

/**
 * Get all logged errors (for debugging)
 */
export function getLoggedErrors() {
  try {
    if (!fs.existsSync(ERROR_LOG_PATH)) {
      return [];
    }
    const content = fs.readFileSync(ERROR_LOG_PATH, 'utf-8');
    return content
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Clear the error log
 */
export function clearErrorLog() {
  try {
    if (fs.existsSync(ERROR_LOG_PATH)) {
      fs.unlinkSync(ERROR_LOG_PATH);
    }
  } catch (err) {
    console.error('[error-log] Failed to clear error log:', err.message);
  }
}

/**
 * Get the error log file path (for documentation)
 */
export function getErrorLogPath() {
  return ERROR_LOG_PATH;
}
