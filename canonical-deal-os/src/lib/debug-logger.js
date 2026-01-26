/**
 * Debug Logger Utility
 *
 * Centralized logging for UI features with namespace-based filtering.
 *
 * Usage:
 *   import { createLogger } from '@/lib/debug-logger';
 *   const logger = createLogger('ui:command-center');
 *   logger.debug('Feed sorted', { itemCount: 10 });
 *
 * Enable logging in browser console:
 *   localStorage.setItem('debug', 'ui:*')           // All UI logs
 *   localStorage.setItem('debug', 'ui:urgency')    // Specific namespace
 *   localStorage.setItem('debug', 'ui:command-center,ui:notifications') // Multiple
 */

// Debug namespaces for UI features
export const DEBUG_NAMESPACES = {
  COMMAND_CENTER: 'ui:command-center',
  URGENCY: 'ui:urgency',
  NOTIFICATIONS: 'ui:notifications',
  BULK_OPS: 'ui:bulk-ops',
  USER_PICKER: 'ui:user-picker',
  OFFLINE: 'ui:offline',
  COMMAND_PALETTE: 'ui:command-palette',
  KEYBOARD: 'ui:keyboard',
  FORM_FEEDBACK: 'ui:form-feedback',
};

// Color map for different namespaces
const NAMESPACE_COLORS = {
  'ui:command-center': '#3B82F6', // blue
  'ui:urgency': '#EF4444',        // red
  'ui:notifications': '#8B5CF6',  // purple
  'ui:bulk-ops': '#10B981',       // green
  'ui:user-picker': '#F59E0B',    // amber
  'ui:offline': '#6B7280',        // gray
  'ui:command-palette': '#EC4899', // pink
  'ui:keyboard': '#06B6D4',       // cyan
  'ui:form-feedback': '#84CC16',  // lime
};

// Performance timers storage
const timers = new Map();

// State snapshots storage
const stateSnapshots = [];
const MAX_SNAPSHOTS = 50;

/**
 * Check if a namespace is enabled for logging
 */
function isNamespaceEnabled(namespace) {
  if (typeof window === 'undefined') return false;

  const debugPattern = localStorage.getItem('debug') || '';
  if (!debugPattern) return false;

  // Support comma-separated patterns and wildcards
  const patterns = debugPattern.split(',').map(p => p.trim());

  return patterns.some(pattern => {
    if (pattern === '*') return true;
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return namespace.startsWith(prefix);
    }
    return namespace === pattern;
  });
}

/**
 * Format log message with timestamp and namespace
 */
function formatMessage(namespace, message) {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
  return `[${timestamp}] [${namespace}] ${message}`;
}

/**
 * Get console style for namespace
 */
function getStyle(namespace) {
  const color = NAMESPACE_COLORS[namespace] || '#9CA3AF';
  return `color: ${color}; font-weight: bold;`;
}

/**
 * Create a logger instance for a specific namespace
 */
export function createLogger(namespace) {
  const log = (level, message, data) => {
    if (!isNamespaceEnabled(namespace)) return;

    const formattedMsg = formatMessage(namespace, message);
    const style = getStyle(namespace);

    switch (level) {
      case 'debug':
        if (data !== undefined) {
          console.log(`%c${formattedMsg}`, style, data);
        } else {
          console.log(`%c${formattedMsg}`, style);
        }
        break;
      case 'info':
        console.info(`%c${formattedMsg}`, style, data);
        break;
      case 'warn':
        console.warn(`%c${formattedMsg}`, style, data);
        break;
      case 'error':
        console.error(`%c${formattedMsg}`, style, data);
        break;
    }
  };

  return {
    /**
     * Log debug message
     */
    debug: (message, data) => log('debug', message, data),

    /**
     * Log info message
     */
    info: (message, data) => log('info', message, data),

    /**
     * Log warning message
     */
    warn: (message, data) => log('warn', message, data),

    /**
     * Log error message
     */
    error: (message, data) => log('error', message, data),

    /**
     * Start a performance timer
     */
    time: (label) => {
      if (!isNamespaceEnabled(namespace)) return;
      const key = `${namespace}:${label}`;
      timers.set(key, performance.now());
    },

    /**
     * End a performance timer and log duration
     */
    timeEnd: (label) => {
      if (!isNamespaceEnabled(namespace)) return;
      const key = `${namespace}:${label}`;
      const start = timers.get(key);
      if (start) {
        const duration = performance.now() - start;
        timers.delete(key);
        log('debug', `${label}: ${duration.toFixed(2)}ms`);
        return duration;
      }
      return null;
    },

    /**
     * Log a state snapshot for debugging
     */
    snapshot: (label, state) => {
      if (!isNamespaceEnabled(namespace)) return;

      const snapshot = {
        namespace,
        label,
        state: JSON.parse(JSON.stringify(state)),
        timestamp: Date.now(),
      };

      stateSnapshots.push(snapshot);
      if (stateSnapshots.length > MAX_SNAPSHOTS) {
        stateSnapshots.shift();
      }

      log('debug', `Snapshot: ${label}`, state);
    },

    /**
     * Log an action trace (what triggered what)
     */
    trace: (action, trigger, result) => {
      if (!isNamespaceEnabled(namespace)) return;
      log('debug', `Action: ${action}`, { trigger, result });
    },

    /**
     * Group related logs
     */
    group: (label) => {
      if (!isNamespaceEnabled(namespace)) return;
      console.group(`%c[${namespace}] ${label}`, getStyle(namespace));
    },

    /**
     * End log group
     */
    groupEnd: () => {
      if (!isNamespaceEnabled(namespace)) return;
      console.groupEnd();
    },

    /**
     * Check if this namespace is enabled
     */
    isEnabled: () => isNamespaceEnabled(namespace),
  };
}

/**
 * Global debug utilities exposed on window for console access
 */
if (typeof window !== 'undefined') {
  window.__DEBUG__ = {
    /**
     * Enable all UI logging
     */
    enableAll: () => {
      localStorage.setItem('debug', 'ui:*');
      console.log('%cDebug logging enabled for all UI features', 'color: #10B981; font-weight: bold;');
    },

    /**
     * Enable logging for a specific feature
     */
    enableFeature: (name) => {
      const namespace = `ui:${name}`;
      const current = localStorage.getItem('debug') || '';
      const patterns = current ? current.split(',') : [];
      if (!patterns.includes(namespace)) {
        patterns.push(namespace);
        localStorage.setItem('debug', patterns.join(','));
      }
      console.log(`%cDebug logging enabled for ${namespace}`, 'color: #10B981; font-weight: bold;');
    },

    /**
     * Disable all logging
     */
    disableAll: () => {
      localStorage.removeItem('debug');
      console.log('%cDebug logging disabled', 'color: #EF4444; font-weight: bold;');
    },

    /**
     * Show available namespaces
     */
    showNamespaces: () => {
      console.log('%cAvailable debug namespaces:', 'font-weight: bold;');
      Object.entries(DEBUG_NAMESPACES).forEach(([key, value]) => {
        const color = NAMESPACE_COLORS[value] || '#9CA3AF';
        console.log(`  %c${value}`, `color: ${color};`, `(${key})`);
      });
    },

    /**
     * Show current debug settings
     */
    showStatus: () => {
      const current = localStorage.getItem('debug') || 'none';
      console.log('%cCurrent debug pattern:', 'font-weight: bold;', current);
    },

    /**
     * Get all state snapshots
     */
    getSnapshots: () => {
      console.log(`%c${stateSnapshots.length} snapshots available`, 'font-weight: bold;');
      return stateSnapshots;
    },

    /**
     * Clear state snapshots
     */
    clearSnapshots: () => {
      stateSnapshots.length = 0;
      console.log('%cSnapshots cleared', 'color: #F59E0B;');
    },

    /**
     * Simulate offline mode for testing
     */
    simulateOffline: () => {
      if (window.__OFFLINE_SIMULATE__) {
        window.__OFFLINE_SIMULATE__ = false;
        console.log('%cOffline simulation disabled', 'color: #10B981;');
      } else {
        window.__OFFLINE_SIMULATE__ = true;
        console.log('%cOffline simulation enabled', 'color: #EF4444;');
      }
    },

    /**
     * Trigger a test notification (for testing notification center)
     */
    triggerNotification: (type = 'info') => {
      const event = new CustomEvent('__debug_notification__', {
        detail: { type, message: `Test ${type} notification`, timestamp: Date.now() }
      });
      window.dispatchEvent(event);
      console.log(`%cTest notification triggered: ${type}`, 'color: #8B5CF6;');
    },

    /**
     * Show help
     */
    help: () => {
      console.log(`
%c__DEBUG__ Commands:

  enableAll()           - Enable all UI debug logging
  enableFeature(name)   - Enable specific feature (e.g., 'urgency')
  disableAll()          - Disable all logging
  showNamespaces()      - Show available namespaces
  showStatus()          - Show current debug settings
  getSnapshots()        - Get state snapshots
  clearSnapshots()      - Clear state snapshots
  simulateOffline()     - Toggle offline simulation
  triggerNotification() - Trigger test notification
  help()                - Show this help
`, 'color: #3B82F6;');
    }
  };
}

export default createLogger;
