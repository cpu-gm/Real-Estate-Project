export default {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js', '**/?(*.)+(spec|test).js'],
  collectCoverageFrom: [
    'server/**/*.js',
    '!server/**/*.test.js',
    '!server/node_modules/**'
  ],
  // Coverage thresholds - Sprint 4
  // Global minimum to catch regressions, critical services at higher thresholds
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    },
    // Critical financial services require higher coverage
    'server/services/money.js': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    'server/services/lp-position-service.js': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    // Circuit breaker and retry are critical for reliability
    'server/lib/circuit-breaker.js': {
      branches: 75,
      functions: 75,
      lines: 75,
      statements: 75
    },
    'server/lib/retry.js': {
      branches: 75,
      functions: 75,
      lines: 75,
      statements: 75
    }
  },
  testTimeout: 30000,
  verbose: true,
  // ESM support - use --experimental-vm-modules flag
  transform: {},
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  // Load environment variables before tests
  setupFilesAfterEnv: ['./jest.setup.js']
};
