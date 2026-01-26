/**
 * Circuit Breaker Pattern
 * Sprint 3: Scalability
 *
 * Provides fault tolerance for external API calls.
 * States: CLOSED (normal), OPEN (failing), HALF_OPEN (testing)
 */

import { createLogger } from './logger.js';

const log = createLogger('circuit-breaker');
const DEBUG = process.env.DEBUG_CIRCUIT_BREAKER === 'true';

const STATES = {
  CLOSED: 'CLOSED',     // Normal operation
  OPEN: 'OPEN',         // Failing, reject requests
  HALF_OPEN: 'HALF_OPEN' // Testing if recovered
};

/**
 * Create a circuit breaker for an external service
 * @param {string} name - Service name for logging
 * @param {Object} options - Configuration options
 * @param {number} options.failureThreshold - Failures before opening (default: 5)
 * @param {number} options.successThreshold - Successes in half-open to close (default: 2)
 * @param {number} options.timeout - Time in OPEN before HALF_OPEN in ms (default: 30000)
 * @param {number} options.resetTimeout - Time to reset failure count in ms (default: 60000)
 */
export function createCircuitBreaker(name, options = {}) {
  const {
    failureThreshold = 5,      // Failures before opening
    successThreshold = 2,       // Successes in half-open to close
    timeout = 30000,            // Time in OPEN before trying HALF_OPEN
    resetTimeout = 60000,       // Time to reset failure count
  } = options;

  let state = STATES.CLOSED;
  let failures = 0;
  let successes = 0;
  let lastFailureTime = 0;
  let nextAttemptTime = 0;
  let lastStateChange = Date.now();

  function setState(newState) {
    if (state !== newState) {
      const oldState = state;
      state = newState;
      lastStateChange = Date.now();

      if (DEBUG) {
        log.info(`Circuit ${name} state change`, {
          from: oldState,
          to: newState,
          failures,
          successes
        });
      }
    }
  }

  function recordSuccess() {
    failures = 0;
    if (state === STATES.HALF_OPEN) {
      successes++;
      if (successes >= successThreshold) {
        setState(STATES.CLOSED);
        successes = 0;
        log.info(`Circuit ${name} recovered`, { successThreshold });
      }
    }
  }

  function recordFailure() {
    failures++;
    lastFailureTime = Date.now();
    successes = 0;

    if (state === STATES.HALF_OPEN) {
      setState(STATES.OPEN);
      nextAttemptTime = Date.now() + timeout;
      log.warn(`Circuit ${name} opened - failed in half-open`, { failures });
    } else if (failures >= failureThreshold) {
      setState(STATES.OPEN);
      nextAttemptTime = Date.now() + timeout;
      log.warn(`Circuit ${name} opened - threshold exceeded`, { failures, failureThreshold });
    }
  }

  function canExecute() {
    const now = Date.now();

    // Reset failures if enough time passed
    if (state === STATES.CLOSED && now - lastFailureTime > resetTimeout) {
      failures = 0;
    }

    if (state === STATES.CLOSED) {
      return true;
    }

    if (state === STATES.OPEN && now >= nextAttemptTime) {
      setState(STATES.HALF_OPEN);
      log.info(`Circuit ${name} half-open - testing recovery`);
      return true;
    }

    if (state === STATES.HALF_OPEN) {
      return true;
    }

    return false;
  }

  function getState() {
    return {
      name,
      state,
      failures,
      successes,
      nextAttemptTime,
      lastFailureTime,
      lastStateChange,
      config: {
        failureThreshold,
        successThreshold,
        timeout,
        resetTimeout
      }
    };
  }

  function reset() {
    setState(STATES.CLOSED);
    failures = 0;
    successes = 0;
    lastFailureTime = 0;
    nextAttemptTime = 0;
    log.info(`Circuit ${name} manually reset`);
  }

  return {
    name,
    recordSuccess,
    recordFailure,
    canExecute,
    getState,
    reset,
    isOpen: () => state === STATES.OPEN,
    isClosed: () => state === STATES.CLOSED,
    isHalfOpen: () => state === STATES.HALF_OPEN
  };
}

// Global circuit breakers for external services
export const circuitBreakers = {
  kernel: createCircuitBreaker('kernel', { failureThreshold: 3, timeout: 10000 }),
  openai: createCircuitBreaker('openai', { failureThreshold: 2, timeout: 30000 }),
  sendgrid: createCircuitBreaker('sendgrid', { failureThreshold: 3, timeout: 20000 }),
  n8n: createCircuitBreaker('n8n', { failureThreshold: 3, timeout: 15000 })
};

/**
 * Execute a function with circuit breaker protection
 * @param {Object} breaker - Circuit breaker instance
 * @param {Function} fn - Async function to execute
 * @param {Function} fallback - Optional fallback function when circuit is open
 * @returns {Promise<any>} Result from fn or fallback
 */
export async function withCircuitBreaker(breaker, fn, fallback = null) {
  if (!breaker.canExecute()) {
    log.warn(`Circuit ${breaker.name} is OPEN - rejecting request`);

    if (fallback) {
      return fallback();
    }

    const error = new Error(`Service ${breaker.name} unavailable (circuit open)`);
    error.code = 'CIRCUIT_OPEN';
    error.service = breaker.name;
    throw error;
  }

  try {
    const result = await fn();
    breaker.recordSuccess();
    return result;
  } catch (error) {
    breaker.recordFailure();

    if (DEBUG) {
      log.error(`Circuit ${breaker.name} recorded failure`, {
        error: error.message,
        failures: breaker.getState().failures
      });
    }

    throw error;
  }
}

/**
 * Get all circuit breaker states (for monitoring)
 * @returns {Array<Object>} Array of circuit breaker states
 */
export function getAllCircuitStates() {
  return Object.values(circuitBreakers).map(cb => cb.getState());
}

/**
 * Reset all circuit breakers (for testing/recovery)
 */
export function resetAllCircuits() {
  Object.values(circuitBreakers).forEach(cb => cb.reset());
  log.info('All circuits reset');
}

export { STATES };
