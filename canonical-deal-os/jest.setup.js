// Jest setup file - load environment variables and configure test isolation
import 'dotenv/config';
import { jest, beforeEach, afterAll } from '@jest/globals';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET ||
  'test-secret-for-unit-tests-only-must-be-at-least-64-bytes-long-to-pass-validation';

// Global setup for all tests
beforeEach(() => {
  // Clear all mocks between tests
  jest.clearAllMocks();
});

// Clean up after all tests complete
afterAll(async () => {
  // Allow any pending timers to clear
  await new Promise(resolve => setTimeout(resolve, 100));
});
