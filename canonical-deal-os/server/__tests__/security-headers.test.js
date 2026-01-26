import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  getSecurityHeaders,
  getCspHeader,
  getAllSecurityHeaders,
  applySecurityHeaders
} from '../middleware/security-headers.js';

describe('Security Headers Middleware', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('getSecurityHeaders', () => {
    test('includes X-Content-Type-Options: nosniff', () => {
      const headers = getSecurityHeaders();
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
    });

    test('includes X-Frame-Options: DENY', () => {
      const headers = getSecurityHeaders();
      expect(headers['X-Frame-Options']).toBe('DENY');
    });

    test('includes X-XSS-Protection', () => {
      const headers = getSecurityHeaders();
      expect(headers['X-XSS-Protection']).toBe('1; mode=block');
    });

    test('includes Referrer-Policy', () => {
      const headers = getSecurityHeaders();
      expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    });

    test('includes HSTS in production', () => {
      process.env.NODE_ENV = 'production';

      const headers = getSecurityHeaders();
      expect(headers['Strict-Transport-Security']).toContain('max-age=');
      expect(headers['Strict-Transport-Security']).toContain('includeSubDomains');
    });

    test('excludes HSTS in development', () => {
      process.env.NODE_ENV = 'development';

      const headers = getSecurityHeaders();
      expect(headers['Strict-Transport-Security']).toBeUndefined();
    });

    test('excludes HSTS when NODE_ENV not set', () => {
      delete process.env.NODE_ENV;

      const headers = getSecurityHeaders();
      expect(headers['Strict-Transport-Security']).toBeUndefined();
    });
  });

  describe('getCspHeader', () => {
    test('includes default-src self', () => {
      const csp = getCspHeader();
      expect(csp).toContain("default-src 'self'");
    });

    test('blocks script execution', () => {
      const csp = getCspHeader();
      expect(csp).toContain("script-src 'none'");
    });

    test('blocks style loading', () => {
      const csp = getCspHeader();
      expect(csp).toContain("style-src 'none'");
    });

    test('blocks image loading', () => {
      const csp = getCspHeader();
      expect(csp).toContain("img-src 'none'");
    });

    test('prevents framing', () => {
      const csp = getCspHeader();
      expect(csp).toContain("frame-ancestors 'none'");
    });

    test('blocks form submissions', () => {
      const csp = getCspHeader();
      expect(csp).toContain("form-action 'none'");
    });

    test('restricts base-uri', () => {
      const csp = getCspHeader();
      expect(csp).toContain("base-uri 'self'");
    });

    test('allows connect-src self for API calls', () => {
      const csp = getCspHeader();
      expect(csp).toContain("connect-src 'self'");
    });

    test('returns semicolon-separated directives', () => {
      const csp = getCspHeader();
      expect(csp).toMatch(/; /);
    });
  });

  describe('getAllSecurityHeaders', () => {
    test('includes both security headers and CSP', () => {
      const headers = getAllSecurityHeaders();
      expect(headers['X-Frame-Options']).toBe('DENY');
      expect(headers['Content-Security-Policy']).toContain('default-src');
    });

    test('includes all standard security headers', () => {
      const headers = getAllSecurityHeaders();

      expect(headers['X-Content-Type-Options']).toBeDefined();
      expect(headers['X-Frame-Options']).toBeDefined();
      expect(headers['X-XSS-Protection']).toBeDefined();
      expect(headers['Referrer-Policy']).toBeDefined();
      expect(headers['Content-Security-Policy']).toBeDefined();
    });
  });

  describe('applySecurityHeaders', () => {
    test('sets all headers on response object', () => {
      const mockRes = {
        setHeader: jest.fn()
      };

      applySecurityHeaders(mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin-when-cross-origin');
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Security-Policy',
        expect.stringContaining("default-src 'self'")
      );
    });

    test('includes HSTS in production', () => {
      process.env.NODE_ENV = 'production';
      const mockRes = {
        setHeader: jest.fn()
      };

      applySecurityHeaders(mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Strict-Transport-Security',
        expect.stringContaining('max-age=')
      );
    });

    test('excludes HSTS in development', () => {
      process.env.NODE_ENV = 'development';
      const mockRes = {
        setHeader: jest.fn()
      };

      applySecurityHeaders(mockRes);

      const hstsCall = mockRes.setHeader.mock.calls.find(
        call => call[0] === 'Strict-Transport-Security'
      );
      expect(hstsCall).toBeUndefined();
    });
  });
});
