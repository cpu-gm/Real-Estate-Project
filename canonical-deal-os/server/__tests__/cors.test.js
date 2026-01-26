import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  getCorsHeaders,
  isOriginAllowed,
  handleCorsPrelight,
  applyCorsHeaders,
  getDefaultCorsHeaders,
  corsHeaders
} from '../middleware/cors.js';

describe('CORS Middleware', () => {
  const originalEnv = process.env.CORS_ALLOWED_ORIGINS;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CORS_ALLOWED_ORIGINS;
    } else {
      process.env.CORS_ALLOWED_ORIGINS = originalEnv;
    }
  });

  describe('isOriginAllowed', () => {
    test('allows configured localhost origins', () => {
      expect(isOriginAllowed('http://localhost:5173')).toBe(true);
      expect(isOriginAllowed('http://localhost:8787')).toBe(true);
      expect(isOriginAllowed('http://localhost:3000')).toBe(true);
    });

    test('rejects unconfigured origins', () => {
      expect(isOriginAllowed('http://evil.com')).toBe(false);
      expect(isOriginAllowed('http://localhost:9999')).toBe(false);
      expect(isOriginAllowed('https://malicious-site.com')).toBe(false);
    });

    test('allows null origin (same-origin)', () => {
      expect(isOriginAllowed(null)).toBe(true);
    });

    test('allows undefined origin (same-origin)', () => {
      expect(isOriginAllowed(undefined)).toBe(true);
    });

    test('allows empty string origin (same-origin)', () => {
      expect(isOriginAllowed('')).toBe(true);
    });

    test('respects custom CORS_ALLOWED_ORIGINS', () => {
      process.env.CORS_ALLOWED_ORIGINS = 'https://app.example.com,https://admin.example.com';

      expect(isOriginAllowed('https://app.example.com')).toBe(true);
      expect(isOriginAllowed('https://admin.example.com')).toBe(true);
      expect(isOriginAllowed('http://localhost:5173')).toBe(false);
    });

    test('handles whitespace in CORS_ALLOWED_ORIGINS', () => {
      process.env.CORS_ALLOWED_ORIGINS = '  https://app.example.com  ,  https://admin.example.com  ';

      expect(isOriginAllowed('https://app.example.com')).toBe(true);
      expect(isOriginAllowed('https://admin.example.com')).toBe(true);
    });
  });

  describe('getCorsHeaders', () => {
    test('reflects valid origin', () => {
      const headers = getCorsHeaders('http://localhost:5173');
      expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    });

    test('returns first allowed origin for invalid origin', () => {
      const headers = getCorsHeaders('http://evil.com');
      // Should return first allowed origin, not the invalid one
      expect(headers['Access-Control-Allow-Origin']).not.toBe('http://evil.com');
      expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    });

    test('returns first allowed origin for null origin', () => {
      const headers = getCorsHeaders(null);
      expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    });

    test('includes credentials header', () => {
      const headers = getCorsHeaders('http://localhost:5173');
      expect(headers['Access-Control-Allow-Credentials']).toBe('true');
    });

    test('includes allowed methods', () => {
      const headers = getCorsHeaders('http://localhost:5173');
      expect(headers['Access-Control-Allow-Methods']).toContain('GET');
      expect(headers['Access-Control-Allow-Methods']).toContain('POST');
      expect(headers['Access-Control-Allow-Methods']).toContain('PUT');
      expect(headers['Access-Control-Allow-Methods']).toContain('PATCH');
      expect(headers['Access-Control-Allow-Methods']).toContain('DELETE');
      expect(headers['Access-Control-Allow-Methods']).toContain('OPTIONS');
    });

    test('includes safe allowed headers', () => {
      const headers = getCorsHeaders('http://localhost:5173');
      expect(headers['Access-Control-Allow-Headers']).toContain('Content-Type');
      expect(headers['Access-Control-Allow-Headers']).toContain('Authorization');
      expect(headers['Access-Control-Allow-Headers']).toContain('X-Request-Id');
      expect(headers['Access-Control-Allow-Headers']).toContain('X-Idempotency-Key');
    });

    test('does NOT include X-User-Id in allowed headers (security)', () => {
      const headers = getCorsHeaders('http://localhost:5173');
      expect(headers['Access-Control-Allow-Headers']).not.toContain('X-User-Id');
    });

    test('includes preflight cache max age', () => {
      const headers = getCorsHeaders('http://localhost:5173');
      expect(headers['Access-Control-Max-Age']).toBe('86400');
    });
  });

  describe('handleCorsPrelight', () => {
    test('responds with 204 No Content', () => {
      const mockReq = {
        headers: {
          origin: 'http://localhost:5173',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type'
        }
      };
      const mockRes = {
        writeHead: jest.fn(),
        end: jest.fn()
      };

      handleCorsPrelight(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(204, expect.any(Object));
      expect(mockRes.end).toHaveBeenCalled();
    });

    test('includes CORS headers in preflight response', () => {
      const mockReq = {
        headers: {
          origin: 'http://localhost:5173',
          'access-control-request-method': 'POST'
        }
      };
      const mockRes = {
        writeHead: jest.fn(),
        end: jest.fn()
      };

      handleCorsPrelight(mockReq, mockRes);

      const headers = mockRes.writeHead.mock.calls[0][1];
      expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
      expect(headers['Access-Control-Allow-Methods']).toBeDefined();
      expect(headers['Access-Control-Allow-Headers']).toBeDefined();
    });

    test('rejects invalid origin in preflight', () => {
      const mockReq = {
        headers: {
          origin: 'http://evil.com',
          'access-control-request-method': 'POST'
        }
      };
      const mockRes = {
        writeHead: jest.fn(),
        end: jest.fn()
      };

      handleCorsPrelight(mockReq, mockRes);

      const headers = mockRes.writeHead.mock.calls[0][1];
      expect(headers['Access-Control-Allow-Origin']).not.toBe('http://evil.com');
    });
  });

  describe('applyCorsHeaders', () => {
    test('sets all CORS headers on response', () => {
      const mockReq = {
        headers: {
          origin: 'http://localhost:5173'
        }
      };
      const mockRes = {
        setHeader: jest.fn()
      };

      applyCorsHeaders(mockReq, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Access-Control-Allow-Origin',
        'http://localhost:5173'
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Access-Control-Allow-Credentials',
        'true'
      );
    });

    test('handles missing origin header', () => {
      const mockReq = {
        headers: {}
      };
      const mockRes = {
        setHeader: jest.fn()
      };

      applyCorsHeaders(mockReq, mockRes);

      // Should use default origin
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Access-Control-Allow-Origin',
        'http://localhost:5173'
      );
    });
  });

  describe('getDefaultCorsHeaders', () => {
    test('returns headers with first allowed origin', () => {
      const headers = getDefaultCorsHeaders();
      expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    });
  });

  describe('corsHeaders export (backward compatibility)', () => {
    test('is an object with CORS headers', () => {
      expect(corsHeaders).toBeDefined();
      expect(corsHeaders['Access-Control-Allow-Origin']).toBeDefined();
    });
  });

  describe('with custom CORS_ALLOWED_ORIGINS', () => {
    test('uses environment origins for validation', () => {
      process.env.CORS_ALLOWED_ORIGINS = 'https://app.example.com,https://admin.example.com';

      expect(isOriginAllowed('https://app.example.com')).toBe(true);
      expect(isOriginAllowed('http://localhost:5173')).toBe(false);
    });

    test('uses environment origins for headers', () => {
      process.env.CORS_ALLOWED_ORIGINS = 'https://app.example.com';

      const headers = getCorsHeaders('https://app.example.com');
      expect(headers['Access-Control-Allow-Origin']).toBe('https://app.example.com');
    });
  });
});
