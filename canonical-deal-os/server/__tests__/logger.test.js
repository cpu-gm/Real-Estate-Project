import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  createLogger,
  logRequest,
  logError,
  logSecurityEvent,
  logAuditEvent,
  logDbOperation,
  logExternalCall,
  startTimer,
  getLogLevel,
  setLogLevel,
  logger
} from '../lib/logger.js';

// Helper to strip ANSI color codes from log level
function stripAnsi(str) {
  if (!str) return str;
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('Structured Logger', () => {
  let transportSpy;
  let originalLevel;

  beforeEach(() => {
    // Store original level
    originalLevel = logger.level;

    // Spy on transport write
    transportSpy = jest.spyOn(logger.transports[0], 'log').mockImplementation((info, callback) => {
      if (callback) callback();
    });
  });

  afterEach(() => {
    transportSpy.mockRestore();
    logger.level = originalLevel;
  });

  describe('createLogger', () => {
    test('creates component logger with all methods', () => {
      const log = createLogger('test-component');

      expect(log.debug).toBeDefined();
      expect(log.info).toBeDefined();
      expect(log.warn).toBeDefined();
      expect(log.error).toBeDefined();
      expect(log.withRequestId).toBeDefined();
      expect(log.withUser).toBeDefined();
    });

    test('logs with component context', () => {
      const log = createLogger('my-component');
      log.info('Test message');

      expect(transportSpy).toHaveBeenCalled();
      const logCall = transportSpy.mock.calls[0][0];
      expect(logCall.component).toBe('my-component');
      expect(logCall.message).toBe('Test message');
    });

    test('logs with additional metadata', () => {
      const log = createLogger('test');
      log.info('Test', { userId: '123', action: 'test' });

      const logCall = transportSpy.mock.calls[0][0];
      expect(logCall.userId).toBe('123');
      expect(logCall.action).toBe('test');
    });

    test('withRequestId adds request context', () => {
      const log = createLogger('test').withRequestId('req-456');
      log.info('Request log');

      const logCall = transportSpy.mock.calls[0][0];
      expect(logCall.requestId).toBe('req-456');
      expect(logCall.component).toBe('test');
    });

    test('withUser adds user context', () => {
      const user = { id: 'user-1', email: 'test@example.com', organizationId: 'org-1' };
      const log = createLogger('test').withUser(user);
      log.info('User action');

      const logCall = transportSpy.mock.calls[0][0];
      expect(logCall.userId).toBe('user-1');
      expect(logCall.userEmail).toBe('test@example.com');
      expect(logCall.organizationId).toBe('org-1');
    });

    test('withUser handles null user', () => {
      const log = createLogger('test').withUser(null);
      log.info('Anonymous action');

      const logCall = transportSpy.mock.calls[0][0];
      expect(logCall.userId).toBeUndefined();
    });
  });

  describe('logRequest', () => {
    test('logs HTTP request with context', () => {
      const mockReq = {
        method: 'GET',
        url: '/api/deals',
        headers: {
          'x-request-id': 'req-123',
          'user-agent': 'Mozilla/5.0'
        },
        socket: { remoteAddress: '127.0.0.1' }
      };
      const mockRes = {
        statusCode: 200,
        getHeader: jest.fn().mockReturnValue('1234')
      };

      logRequest(mockReq, mockRes, 150);

      expect(transportSpy).toHaveBeenCalled();
      const logCall = transportSpy.mock.calls[0][0];
      expect(logCall.method).toBe('GET');
      expect(logCall.path).toBe('/api/deals');
      expect(logCall.statusCode).toBe(200);
      expect(logCall.durationMs).toBe(150);
      expect(logCall.requestId).toBe('req-123');
    });

    test('logs error level for 5xx', () => {
      const mockReq = { method: 'GET', url: '/api/test', headers: {} };
      const mockRes = { statusCode: 500, getHeader: jest.fn() };

      logRequest(mockReq, mockRes, 100);

      const logCall = transportSpy.mock.calls[0][0];
      expect(stripAnsi(logCall.level)).toBe('error');
    });

    test('logs warn level for 4xx', () => {
      const mockReq = { method: 'GET', url: '/api/test', headers: {} };
      const mockRes = { statusCode: 404, getHeader: jest.fn() };

      logRequest(mockReq, mockRes, 50);

      const logCall = transportSpy.mock.calls[0][0];
      expect(stripAnsi(logCall.level)).toBe('warn');
    });

    test('logs info level for 2xx', () => {
      const mockReq = { method: 'POST', url: '/api/deals', headers: {} };
      const mockRes = { statusCode: 201, getHeader: jest.fn() };

      logRequest(mockReq, mockRes, 200);

      const logCall = transportSpy.mock.calls[0][0];
      expect(stripAnsi(logCall.level)).toBe('info');
    });
  });

  describe('logError', () => {
    test('logs error with context', () => {
      const error = new Error('Test error');
      error.code = 'TEST_ERROR';

      logError(error, {
        component: 'test',
        requestId: 'req-456',
        userId: 'user-123'
      });

      expect(transportSpy).toHaveBeenCalled();
      const logCall = transportSpy.mock.calls[0][0];
      expect(logCall.message).toBe('Test error');
      expect(logCall.errorCode).toBe('TEST_ERROR');
      expect(logCall.component).toBe('test');
      expect(logCall.stack).toBeDefined();
    });

    test('handles error without code', () => {
      const error = new Error('Simple error');

      logError(error, { path: '/api/test' });

      const logCall = transportSpy.mock.calls[0][0];
      expect(logCall.message).toBe('Simple error');
      expect(logCall.path).toBe('/api/test');
    });
  });

  describe('logSecurityEvent', () => {
    test('logs security event', () => {
      logSecurityEvent('INVALID_TOKEN', {
        userId: 'user-1',
        ip: '192.168.1.1'
      });

      expect(transportSpy).toHaveBeenCalled();
      const logCall = transportSpy.mock.calls[0][0];
      expect(logCall.message).toContain('Security: INVALID_TOKEN');
      expect(logCall.component).toBe('security');
      expect(logCall.event).toBe('INVALID_TOKEN');
      expect(stripAnsi(logCall.level)).toBe('warn');
    });
  });

  describe('logAuditEvent', () => {
    test('logs audit event', () => {
      logAuditEvent('CREATE_DEAL', {
        userId: 'user-1',
        dealId: 'deal-123',
        organizationId: 'org-1'
      });

      expect(transportSpy).toHaveBeenCalled();
      const logCall = transportSpy.mock.calls[0][0];
      expect(logCall.message).toContain('Audit: CREATE_DEAL');
      expect(logCall.component).toBe('audit');
      expect(logCall.action).toBe('CREATE_DEAL');
      expect(logCall.timestamp).toBeDefined();
    });
  });

  describe('logDbOperation', () => {
    test('logs database operation', () => {
      logDbOperation('SELECT', 'deals', 25, { rowCount: 10 });

      expect(transportSpy).toHaveBeenCalled();
      const logCall = transportSpy.mock.calls[0][0];
      expect(logCall.message).toBe('DB SELECT');
      expect(logCall.component).toBe('database');
      expect(logCall.table).toBe('deals');
      expect(logCall.durationMs).toBe(25);
    });

    test('logs slow queries as warn', () => {
      logDbOperation('SELECT', 'large_table', 1500, {});

      const logCall = transportSpy.mock.calls[0][0];
      expect(stripAnsi(logCall.level)).toBe('warn');
      expect(logCall.slow).toBe(true);
    });
  });

  describe('logExternalCall', () => {
    test('logs external API call', () => {
      logExternalCall('kernel', '/api/deals', 250, 200, { method: 'GET' });

      expect(transportSpy).toHaveBeenCalled();
      const logCall = transportSpy.mock.calls[0][0];
      expect(logCall.message).toBe('External call: kernel');
      expect(logCall.service).toBe('kernel');
      expect(logCall.endpoint).toBe('/api/deals');
      expect(logCall.statusCode).toBe(200);
    });

    test('logs error level for 5xx responses', () => {
      logExternalCall('openai', '/v1/chat', 5000, 503, {});

      const logCall = transportSpy.mock.calls[0][0];
      expect(stripAnsi(logCall.level)).toBe('error');
    });

    test('logs warn level for 4xx responses', () => {
      logExternalCall('sendgrid', '/v3/mail', 100, 400, {});

      const logCall = transportSpy.mock.calls[0][0];
      expect(stripAnsi(logCall.level)).toBe('warn');
    });
  });

  describe('startTimer', () => {
    test('returns end function', () => {
      const endTimer = startTimer('test-operation');
      expect(typeof endTimer).toBe('function');
    });

    test('logs duration when ended', async () => {
      const endTimer = startTimer('slow-operation', { component: 'test' });

      // Wait a bit
      await new Promise(r => setTimeout(r, 50));

      const duration = endTimer({ result: 'success' });

      expect(duration).toBeGreaterThanOrEqual(50);
      expect(transportSpy).toHaveBeenCalled();
      const logCall = transportSpy.mock.calls[0][0];
      expect(logCall.operation).toBe('slow-operation');
      expect(logCall.durationMs).toBeGreaterThanOrEqual(50);
    });
  });

  describe('getLogLevel / setLogLevel', () => {
    test('gets current log level', () => {
      const level = getLogLevel();
      expect(['debug', 'info', 'warn', 'error']).toContain(level);
    });

    test('sets log level dynamically', () => {
      const originalLevel = getLogLevel();

      setLogLevel('error');
      expect(getLogLevel()).toBe('error');

      setLogLevel('debug');
      expect(getLogLevel()).toBe('debug');

      // Restore
      setLogLevel(originalLevel);
    });
  });

  describe('Log Levels', () => {
    test('debug logs at debug level', () => {
      setLogLevel('debug');
      const log = createLogger('test');
      log.debug('Debug message');

      const logCall = transportSpy.mock.calls[0][0];
      expect(stripAnsi(logCall.level)).toBe('debug');
    });

    test('info logs at info level', () => {
      const log = createLogger('test');
      log.info('Info message');

      const logCall = transportSpy.mock.calls[0][0];
      expect(stripAnsi(logCall.level)).toBe('info');
    });

    test('warn logs at warn level', () => {
      const log = createLogger('test');
      log.warn('Warning message');

      const logCall = transportSpy.mock.calls[0][0];
      expect(stripAnsi(logCall.level)).toBe('warn');
    });

    test('error logs at error level', () => {
      const log = createLogger('test');
      log.error('Error message');

      const logCall = transportSpy.mock.calls[0][0];
      expect(stripAnsi(logCall.level)).toBe('error');
    });
  });
});
