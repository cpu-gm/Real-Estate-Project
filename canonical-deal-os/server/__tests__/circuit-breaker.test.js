import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import {
  createCircuitBreaker,
  withCircuitBreaker,
  circuitBreakers,
  getAllCircuitStates,
  resetAllCircuits,
  STATES
} from '../lib/circuit-breaker.js';

describe('Circuit Breaker', () => {
  describe('createCircuitBreaker', () => {
    test('starts in CLOSED state', () => {
      const breaker = createCircuitBreaker('test');
      expect(breaker.isClosed()).toBe(true);
      expect(breaker.isOpen()).toBe(false);
      expect(breaker.isHalfOpen()).toBe(false);
    });

    test('has correct name', () => {
      const breaker = createCircuitBreaker('my-service');
      expect(breaker.name).toBe('my-service');
    });

    test('opens after failure threshold', () => {
      const breaker = createCircuitBreaker('test', { failureThreshold: 2 });

      breaker.recordFailure();
      expect(breaker.isClosed()).toBe(true);

      breaker.recordFailure();
      expect(breaker.isOpen()).toBe(true);
    });

    test('resets failures on success', () => {
      const breaker = createCircuitBreaker('test', { failureThreshold: 3 });

      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordSuccess();

      expect(breaker.getState().failures).toBe(0);
    });

    test('blocks execution when open', () => {
      const breaker = createCircuitBreaker('test', { failureThreshold: 1 });
      breaker.recordFailure();

      expect(breaker.canExecute()).toBe(false);
    });

    test('allows execution when closed', () => {
      const breaker = createCircuitBreaker('test');
      expect(breaker.canExecute()).toBe(true);
    });

    test('transitions to half-open after timeout', async () => {
      const breaker = createCircuitBreaker('test', { failureThreshold: 1, timeout: 50 });
      breaker.recordFailure();

      expect(breaker.isOpen()).toBe(true);

      // Wait for timeout
      await new Promise(r => setTimeout(r, 60));

      expect(breaker.canExecute()).toBe(true);
      expect(breaker.isHalfOpen()).toBe(true);
    });

    test('closes after success threshold in half-open', async () => {
      const breaker = createCircuitBreaker('test', {
        failureThreshold: 1,
        successThreshold: 2,
        timeout: 10
      });

      breaker.recordFailure(); // Open
      await new Promise(r => setTimeout(r, 20)); // Wait for half-open

      breaker.canExecute(); // Trigger half-open
      breaker.recordSuccess();
      expect(breaker.isHalfOpen()).toBe(true);

      breaker.recordSuccess();
      expect(breaker.isClosed()).toBe(true);
    });

    test('reopens on failure in half-open', async () => {
      const breaker = createCircuitBreaker('test', { failureThreshold: 1, timeout: 10 });

      breaker.recordFailure(); // Open
      await new Promise(r => setTimeout(r, 20)); // Wait for half-open

      breaker.canExecute(); // Trigger half-open
      breaker.recordFailure(); // Should reopen

      expect(breaker.isOpen()).toBe(true);
    });

    test('getState returns correct info', () => {
      const breaker = createCircuitBreaker('test', { failureThreshold: 5 });
      breaker.recordFailure();

      const state = breaker.getState();

      expect(state.name).toBe('test');
      expect(state.state).toBe(STATES.CLOSED);
      expect(state.failures).toBe(1);
      expect(state.config.failureThreshold).toBe(5);
    });

    test('reset clears all state', () => {
      const breaker = createCircuitBreaker('test', { failureThreshold: 1 });
      breaker.recordFailure();

      expect(breaker.isOpen()).toBe(true);

      breaker.reset();

      expect(breaker.isClosed()).toBe(true);
      expect(breaker.getState().failures).toBe(0);
    });
  });

  describe('withCircuitBreaker', () => {
    test('executes function when circuit closed', async () => {
      const breaker = createCircuitBreaker('test');
      const fn = jest.fn().mockResolvedValue('success');

      const result = await withCircuitBreaker(breaker, fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalled();
    });

    test('records success on successful execution', async () => {
      const breaker = createCircuitBreaker('test');
      breaker.recordFailure(); // Add a failure first

      await withCircuitBreaker(breaker, async () => 'ok');

      expect(breaker.getState().failures).toBe(0);
    });

    test('records failure on error', async () => {
      const breaker = createCircuitBreaker('test');
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      await expect(withCircuitBreaker(breaker, fn)).rejects.toThrow('fail');
      expect(breaker.getState().failures).toBe(1);
    });

    test('calls fallback when circuit open', async () => {
      const breaker = createCircuitBreaker('test', { failureThreshold: 1 });
      breaker.recordFailure();

      const fn = jest.fn();
      const fallback = jest.fn().mockReturnValue('fallback-value');

      const result = await withCircuitBreaker(breaker, fn, fallback);

      expect(result).toBe('fallback-value');
      expect(fn).not.toHaveBeenCalled();
      expect(fallback).toHaveBeenCalled();
    });

    test('throws when circuit open and no fallback', async () => {
      const breaker = createCircuitBreaker('test', { failureThreshold: 1 });
      breaker.recordFailure();

      await expect(withCircuitBreaker(breaker, jest.fn()))
        .rejects.toThrow('circuit open');
    });

    test('error includes service name', async () => {
      const breaker = createCircuitBreaker('my-service', { failureThreshold: 1 });
      breaker.recordFailure();

      try {
        await withCircuitBreaker(breaker, jest.fn());
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.code).toBe('CIRCUIT_OPEN');
        expect(error.service).toBe('my-service');
      }
    });
  });

  describe('global circuit breakers', () => {
    beforeEach(() => {
      resetAllCircuits();
    });

    test('has kernel circuit breaker', () => {
      expect(circuitBreakers.kernel).toBeDefined();
      expect(circuitBreakers.kernel.name).toBe('kernel');
    });

    test('has openai circuit breaker', () => {
      expect(circuitBreakers.openai).toBeDefined();
      expect(circuitBreakers.openai.name).toBe('openai');
    });

    test('has sendgrid circuit breaker', () => {
      expect(circuitBreakers.sendgrid).toBeDefined();
      expect(circuitBreakers.sendgrid.name).toBe('sendgrid');
    });

    test('has n8n circuit breaker', () => {
      expect(circuitBreakers.n8n).toBeDefined();
      expect(circuitBreakers.n8n.name).toBe('n8n');
    });
  });

  describe('getAllCircuitStates', () => {
    beforeEach(() => {
      resetAllCircuits();
    });

    test('returns array of all circuit states', () => {
      const states = getAllCircuitStates();

      expect(Array.isArray(states)).toBe(true);
      expect(states.length).toBe(4); // kernel, openai, sendgrid, n8n
    });

    test('each state has required fields', () => {
      const states = getAllCircuitStates();

      states.forEach(state => {
        expect(state.name).toBeDefined();
        expect(state.state).toBeDefined();
        expect(state.failures).toBeDefined();
        expect(state.config).toBeDefined();
      });
    });
  });

  describe('resetAllCircuits', () => {
    test('resets all global circuits', () => {
      // Open some circuits
      circuitBreakers.kernel.recordFailure();
      circuitBreakers.kernel.recordFailure();
      circuitBreakers.kernel.recordFailure();

      circuitBreakers.openai.recordFailure();
      circuitBreakers.openai.recordFailure();

      resetAllCircuits();

      expect(circuitBreakers.kernel.isClosed()).toBe(true);
      expect(circuitBreakers.openai.isClosed()).toBe(true);
      expect(circuitBreakers.kernel.getState().failures).toBe(0);
    });
  });

  describe('STATES constant', () => {
    test('exports state constants', () => {
      expect(STATES.CLOSED).toBe('CLOSED');
      expect(STATES.OPEN).toBe('OPEN');
      expect(STATES.HALF_OPEN).toBe('HALF_OPEN');
    });
  });
});
