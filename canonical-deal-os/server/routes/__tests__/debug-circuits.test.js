import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import {
  getAllCircuitStates,
  resetAllCircuits,
  circuitBreakers
} from '../../lib/circuit-breaker.js';

describe('Debug Circuits Endpoint', () => {
  beforeEach(() => {
    resetAllCircuits();
  });

  describe('getAllCircuitStates', () => {
    test('returns all circuit breaker states', () => {
      const states = getAllCircuitStates();

      expect(states).toHaveLength(4);
      expect(states.map(s => s.name)).toEqual(['kernel', 'openai', 'sendgrid', 'n8n']);
    });

    test('each state has required fields', () => {
      const states = getAllCircuitStates();

      states.forEach(state => {
        expect(state.name).toBeDefined();
        expect(state.state).toBeDefined();
        expect(state.failures).toBeDefined();
        expect(state.successes).toBeDefined();
        expect(state.config).toBeDefined();
      });
    });

    test('reflects circuit state changes', () => {
      // Open the kernel circuit
      circuitBreakers.kernel.recordFailure();
      circuitBreakers.kernel.recordFailure();
      circuitBreakers.kernel.recordFailure();

      const states = getAllCircuitStates();
      const kernelState = states.find(s => s.name === 'kernel');

      expect(kernelState.state).toBe('OPEN');
      expect(kernelState.failures).toBe(3);
    });
  });

  describe('resetAllCircuits', () => {
    test('resets all circuits to CLOSED', () => {
      // Open multiple circuits
      circuitBreakers.kernel.recordFailure();
      circuitBreakers.kernel.recordFailure();
      circuitBreakers.kernel.recordFailure();

      circuitBreakers.openai.recordFailure();
      circuitBreakers.openai.recordFailure();

      // Verify they are open
      expect(circuitBreakers.kernel.isOpen()).toBe(true);
      expect(circuitBreakers.openai.isOpen()).toBe(true);

      // Reset all
      resetAllCircuits();

      // Verify all closed
      const states = getAllCircuitStates();
      states.forEach(state => {
        expect(state.state).toBe('CLOSED');
        expect(state.failures).toBe(0);
      });
    });
  });

  describe('Circuit summary calculation', () => {
    test('correctly counts circuits by state', () => {
      // Open one circuit
      circuitBreakers.kernel.recordFailure();
      circuitBreakers.kernel.recordFailure();
      circuitBreakers.kernel.recordFailure();

      const states = getAllCircuitStates();
      const summary = {
        total: states.length,
        closed: states.filter(c => c.state === 'CLOSED').length,
        open: states.filter(c => c.state === 'OPEN').length,
        halfOpen: states.filter(c => c.state === 'HALF_OPEN').length,
      };

      expect(summary.total).toBe(4);
      expect(summary.open).toBe(1);
      expect(summary.closed).toBe(3);
      expect(summary.halfOpen).toBe(0);
    });
  });
});
