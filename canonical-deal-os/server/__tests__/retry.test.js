import { describe, test, expect, jest } from '@jest/globals';
import {
  withRetry,
  isRetryableError,
  isClientError,
  makeRetryable,
  retryProfiles,
  withRetryProfile
} from '../lib/retry.js';

describe('Retry Utility', () => {
  describe('withRetry', () => {
    test('returns result on first success', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await withRetry(fn, { maxAttempts: 3 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test('retries on failure', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const result = await withRetry(fn, {
        maxAttempts: 3,
        baseDelayMs: 10  // Fast for tests
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    test('throws after max attempts', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('always fails'));

      await expect(withRetry(fn, {
        maxAttempts: 2,
        baseDelayMs: 10
      })).rejects.toThrow('always fails');

      expect(fn).toHaveBeenCalledTimes(2);
    });

    test('calls onRetry callback', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');
      const onRetry = jest.fn();

      await withRetry(fn, {
        maxAttempts: 3,
        baseDelayMs: 10,
        onRetry
      });

      expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1);
    });

    test('respects retryOn predicate - not retryable', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('not retryable'));

      await expect(withRetry(fn, {
        maxAttempts: 3,
        retryOn: () => false
      })).rejects.toThrow('not retryable');

      expect(fn).toHaveBeenCalledTimes(1);
    });

    test('respects retryOn predicate - retryable', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('retryable'))
        .mockResolvedValue('ok');

      const result = await withRetry(fn, {
        maxAttempts: 3,
        baseDelayMs: 10,
        retryOn: () => true
      });

      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    test('exponential backoff increases delay', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('1'))
        .mockRejectedValueOnce(new Error('2'))
        .mockResolvedValue('ok');

      const startTime = Date.now();
      await withRetry(fn, {
        maxAttempts: 3,
        baseDelayMs: 50,
        factor: 2,
        jitter: false  // Disable for predictable timing
      });
      const elapsed = Date.now() - startTime;

      // First retry: 50ms, second retry: 100ms = ~150ms total
      expect(elapsed).toBeGreaterThanOrEqual(140);
      expect(elapsed).toBeLessThan(300);
    });

    test('maxDelayMs caps the delay', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('1'))
        .mockRejectedValueOnce(new Error('2'))
        .mockResolvedValue('ok');

      const startTime = Date.now();
      await withRetry(fn, {
        maxAttempts: 3,
        baseDelayMs: 100,
        maxDelayMs: 50,  // Cap lower than base
        factor: 2,
        jitter: false
      });
      const elapsed = Date.now() - startTime;

      // Both retries capped at 50ms = ~100ms total
      expect(elapsed).toBeLessThan(200);
    });
  });

  describe('isRetryableError', () => {
    test('returns true for network errors', () => {
      const errors = [
        { code: 'ECONNREFUSED' },
        { code: 'ETIMEDOUT' },
        { code: 'ENOTFOUND' },
        { code: 'ECONNRESET' },
        { code: 'EAI_AGAIN' },
        { code: 'EPIPE' }
      ];

      errors.forEach(error => {
        expect(isRetryableError(error)).toBe(true);
      });
    });

    test('returns true for 5xx errors', () => {
      const errors = [
        { status: 500 },
        { status: 502 },
        { status: 503 },
        { status: 504 }
      ];

      errors.forEach(error => {
        expect(isRetryableError(error)).toBe(true);
      });
    });

    test('returns true for rate limiting (429)', () => {
      const error = { status: 429 };
      expect(isRetryableError(error)).toBe(true);
    });

    test('returns true for kernel unavailable', () => {
      expect(isRetryableError({ type: 'KERNEL_UNAVAILABLE' })).toBe(true);
      expect(isRetryableError({ code: 'KERNEL_UNAVAILABLE' })).toBe(true);
    });

    test('returns false for 4xx client errors (except 429)', () => {
      const errors = [
        { status: 400 },
        { status: 401 },
        { status: 403 },
        { status: 404 }
      ];

      errors.forEach(error => {
        expect(isRetryableError(error)).toBe(false);
      });
    });

    test('returns false for unknown errors', () => {
      expect(isRetryableError(new Error('unknown'))).toBe(false);
      expect(isRetryableError({})).toBe(false);
    });
  });

  describe('isClientError', () => {
    test('returns true for 4xx errors', () => {
      const errors = [
        { status: 400 },
        { status: 401 },
        { status: 403 },
        { status: 404 }
      ];

      errors.forEach(error => {
        expect(isClientError(error)).toBe(true);
      });
    });

    test('returns false for 429 (rate limiting)', () => {
      expect(isClientError({ status: 429 })).toBe(false);
    });

    test('returns true for validation errors', () => {
      expect(isClientError({ code: 'VALIDATION_FAILED' })).toBe(true);
      expect(isClientError({ code: 'INVALID_REQUEST' })).toBe(true);
      expect(isClientError({ code: 'BAD_REQUEST' })).toBe(true);
    });

    test('returns true for auth errors', () => {
      expect(isClientError({ code: 'AUTH_REQUIRED' })).toBe(true);
      expect(isClientError({ code: 'FORBIDDEN' })).toBe(true);
    });

    test('returns false for 5xx errors', () => {
      expect(isClientError({ status: 500 })).toBe(false);
      expect(isClientError({ status: 503 })).toBe(false);
    });
  });

  describe('makeRetryable', () => {
    test('wraps function with retry', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const retryableFn = makeRetryable(fn, {
        maxAttempts: 3,
        baseDelayMs: 10
      });

      const result = await retryableFn('arg1', 'arg2');

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    test('preserves function arguments', async () => {
      const fn = jest.fn().mockResolvedValue('ok');
      const retryableFn = makeRetryable(fn);

      await retryableFn('a', 'b', 'c');

      expect(fn).toHaveBeenCalledWith('a', 'b', 'c');
    });
  });

  describe('retryProfiles', () => {
    test('has kernel profile', () => {
      expect(retryProfiles.kernel).toBeDefined();
      expect(retryProfiles.kernel.maxAttempts).toBe(3);
    });

    test('has openai profile', () => {
      expect(retryProfiles.openai).toBeDefined();
      expect(retryProfiles.openai.baseDelayMs).toBeGreaterThan(retryProfiles.kernel.baseDelayMs);
    });

    test('has sendgrid profile', () => {
      expect(retryProfiles.sendgrid).toBeDefined();
    });

    test('has n8n profile', () => {
      expect(retryProfiles.n8n).toBeDefined();
    });

    test('has database profile', () => {
      expect(retryProfiles.database).toBeDefined();
      expect(retryProfiles.database.jitter).toBe(false);
    });

    test('all profiles have retryOn function', () => {
      Object.values(retryProfiles).forEach(profile => {
        expect(typeof profile.retryOn).toBe('function');
      });
    });
  });

  describe('withRetryProfile', () => {
    test('uses profile options', async () => {
      const fn = jest.fn().mockResolvedValue('ok');

      await withRetryProfile('kernel', fn);

      expect(fn).toHaveBeenCalled();
    });

    test('allows overriding profile options', async () => {
      // Create a retryable error (network error)
      const networkError = new Error('fail');
      networkError.code = 'ECONNREFUSED';

      const fn = jest.fn()
        .mockRejectedValueOnce(networkError)
        .mockResolvedValue('ok');

      await withRetryProfile('kernel', fn, { baseDelayMs: 10 });

      expect(fn).toHaveBeenCalledTimes(2);
    });

    test('throws for unknown profile', () => {
      expect(() => withRetryProfile('unknown', jest.fn()))
        .toThrow('Unknown retry profile');
    });
  });
});
