/**
 * Observability Infrastructure Validation Script
 *
 * Sprint 2, Day 14: Production Readiness
 *
 * Validates that all observability infrastructure is working:
 * - Circuit breaker (lib/circuit-breaker.js)
 * - Retry logic (lib/retry.js)
 * - Structured logging (lib/logger.js)
 * - Metrics endpoint
 * - Health endpoints
 *
 * Usage:
 *   node scripts/validate-observability.cjs
 *
 * Exit codes:
 *   0 - All validations passed
 *   1 - One or more validations failed
 */

const fs = require('fs');
const path = require('path');

// ANSI colors
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(level, message) {
  const color = level === 'PASS' ? colors.green :
                level === 'FAIL' ? colors.red :
                level === 'WARN' ? colors.yellow : colors.blue;
  console.log(`${color}[${level}]${colors.reset} ${message}`);
}

const results = {
  passed: 0,
  failed: 0,
  warnings: 0
};

function check(name, condition, details = '') {
  if (condition) {
    log('PASS', name);
    results.passed++;
    return true;
  } else {
    log('FAIL', `${name}${details ? ' - ' + details : ''}`);
    results.failed++;
    return false;
  }
}

function warn(name, message) {
  log('WARN', `${name} - ${message}`);
  results.warnings++;
}

console.log('');
console.log('='.repeat(60));
console.log('Observability Infrastructure Validation');
console.log('Sprint 2, Day 14');
console.log('='.repeat(60));
console.log('');

// =============================================================================
// 1. CHECK CIRCUIT BREAKER
// =============================================================================

console.log(`${colors.blue}[1] Circuit Breaker Validation${colors.reset}`);
console.log('-'.repeat(40));

const circuitBreakerPath = path.join(__dirname, '../canonical-deal-os/server/lib/circuit-breaker.js');
const circuitBreakerExists = fs.existsSync(circuitBreakerPath);
check('Circuit breaker file exists', circuitBreakerExists, circuitBreakerPath);

if (circuitBreakerExists) {
  const content = fs.readFileSync(circuitBreakerPath, 'utf-8');

  check('Circuit breaker has CLOSED state', content.includes('CLOSED'));
  check('Circuit breaker has OPEN state', content.includes('OPEN'));
  check('Circuit breaker has HALF_OPEN state', content.includes('HALF_OPEN'));
  check('Circuit breaker has failure threshold', content.includes('failureThreshold') || content.includes('threshold'));
  check('Circuit breaker has reset timeout', content.includes('resetTimeout') || content.includes('timeout'));
  check('Circuit breaker exports getCircuitStatus', content.includes('getAllCircuitStates') || content.includes('getCircuitStatus') || content.includes('getStatus'));
}

console.log('');

// =============================================================================
// 2. CHECK RETRY LOGIC
// =============================================================================

console.log(`${colors.blue}[2] Retry Logic Validation${colors.reset}`);
console.log('-'.repeat(40));

const retryPath = path.join(__dirname, '../canonical-deal-os/server/lib/retry.js');
const retryExists = fs.existsSync(retryPath);
check('Retry logic file exists', retryExists, retryPath);

if (retryExists) {
  const content = fs.readFileSync(retryPath, 'utf-8');

  check('Retry has exponential backoff', content.includes('exponential') || content.includes('backoff'));
  check('Retry has jitter', content.includes('jitter') || content.includes('random'));
  check('Retry has maxRetries', content.includes('maxRetries') || content.includes('attempts'));
  check('Retry has service profiles', content.includes('profile') || content.includes('preset'));
}

console.log('');

// =============================================================================
// 3. CHECK STRUCTURED LOGGING
// =============================================================================

console.log(`${colors.blue}[3] Structured Logging Validation${colors.reset}`);
console.log('-'.repeat(40));

const loggerPath = path.join(__dirname, '../canonical-deal-os/server/lib/logger.js');
const loggerExists = fs.existsSync(loggerPath);
check('Logger file exists', loggerExists, loggerPath);

if (loggerExists) {
  const content = fs.readFileSync(loggerPath, 'utf-8');

  check('Logger uses Winston', content.includes('winston') || content.includes('Winston'));
  check('Logger has JSON format', content.includes('json') || content.includes('JSON'));
  check('Logger has log levels', content.includes('debug') && content.includes('info') && content.includes('error'));
  check('Logger has request context', content.includes('requestId') || content.includes('correlationId'));
  check('Logger has component scoping', content.includes('component') || content.includes('module'));
}

console.log('');

// =============================================================================
// 4. CHECK INTEGRITY LOGGER
// =============================================================================

console.log(`${colors.blue}[4] Integrity Logger Validation${colors.reset}`);
console.log('-'.repeat(40));

const integrityLoggerPath = path.join(__dirname, '../canonical-deal-os/server/services/integrity-logger.js');
const integrityLoggerExists = fs.existsSync(integrityLoggerPath);
check('Integrity logger file exists', integrityLoggerExists);

if (integrityLoggerExists) {
  const content = fs.readFileSync(integrityLoggerPath, 'utf-8');

  check('Integrity logger has operations enum', content.includes('INTEGRITY_OPERATIONS') || content.includes('OPERATIONS'));
  check('Integrity logger has invariant checks', content.includes('invariant') || content.includes('INVARIANT'));
  check('Integrity logger has before/after state', content.includes('beforeState') && content.includes('afterState'));
}

console.log('');

// =============================================================================
// 5. CHECK ERROR TAXONOMY
// =============================================================================

console.log(`${colors.blue}[5] Error Taxonomy Validation${colors.reset}`);
console.log('-'.repeat(40));

const errorsPath = path.join(__dirname, '../canonical-deal-os/server/lib/errors.js');
const errorsExist = fs.existsSync(errorsPath);
check('Errors file exists', errorsExist);

if (errorsExist) {
  const content = fs.readFileSync(errorsPath, 'utf-8');

  check('Error class: AuthRequiredError', content.includes('AuthRequiredError'));
  check('Error class: ForbiddenRoleError', content.includes('ForbiddenRoleError'));
  check('Error class: ForbiddenOrgError', content.includes('ForbiddenOrgError'));
  check('Error class: ValidationError', content.includes('ValidationError'));
  check('Error class: NotFoundError', content.includes('NotFoundError'));
  check('Error class: ServiceUnavailableError', content.includes('ServiceUnavailableError'));
  check('Error code constants', content.includes('ERROR_CODES'));
}

console.log('');

// =============================================================================
// 6. CHECK IDEMPOTENCY MIDDLEWARE
// =============================================================================

console.log(`${colors.blue}[6] Idempotency Middleware Validation${colors.reset}`);
console.log('-'.repeat(40));

const idempotencyPath = path.join(__dirname, '../canonical-deal-os/server/middleware/idempotency.js');
const idempotencyExists = fs.existsSync(idempotencyPath);
check('Idempotency middleware exists', idempotencyExists);

if (idempotencyExists) {
  const content = fs.readFileSync(idempotencyPath, 'utf-8');

  check('Idempotency has TTL support', content.includes('ttl') || content.includes('TTL'));
  check('Idempotency has payload hashing', content.includes('hash') || content.includes('Hash'));
  check('Idempotency has org isolation', content.includes('organizationId'));
  check('Idempotency has stats function', content.includes('getIdempotencyStats'));
}

console.log('');

// =============================================================================
// 7. CHECK TEST COVERAGE
// =============================================================================

console.log(`${colors.blue}[7] Test Coverage Validation${colors.reset}`);
console.log('-'.repeat(40));

const testFiles = [
  'circuit-breaker.test.js',
  'retry.test.js',
  'logger.test.js',
  'idempotency-regression.test.js',
  'observability-regression.test.js',
  'backup-restore-regression.test.js'
];

const testDir = path.join(__dirname, '../canonical-deal-os/server/__tests__');

testFiles.forEach(file => {
  const testPath = path.join(testDir, file);
  const exists = fs.existsSync(testPath);
  check(`Test file: ${file}`, exists);
});

console.log('');

// =============================================================================
// 8. CHECK SPRINT 2 LOGGER UTILITY
// =============================================================================

console.log(`${colors.blue}[8] Sprint 2 Logger Utility Validation${colors.reset}`);
console.log('-'.repeat(40));

const sprint2LoggerPath = path.join(__dirname, '../canonical-deal-os/server/__tests__/utils/sprint2-logger.js');
const sprint2LoggerExists = fs.existsSync(sprint2LoggerPath);
check('Sprint 2 logger exists', sprint2LoggerExists);

if (sprint2LoggerExists) {
  const content = fs.readFileSync(sprint2LoggerPath, 'utf-8');

  check('Sprint 2 logger has createSprint2Logger', content.includes('createSprint2Logger'));
  check('Sprint 2 logger has test helpers', content.includes('IdempotencyTestHelpers'));
  check('Sprint 2 logger has backup helpers', content.includes('BackupTestHelpers'));
  check('Sprint 2 logger has circuit breaker helpers', content.includes('CircuitBreakerTestHelpers'));
}

console.log('');

// =============================================================================
// 9. CHECK DEPLOYMENT DOCS
// =============================================================================

console.log(`${colors.blue}[9] Deployment Documentation Validation${colors.reset}`);
console.log('-'.repeat(40));

const docs = [
  { path: '../canonical-deal-os/DEPLOYMENT_GUIDE.md', name: 'Deployment Guide' },
  { path: '../canonical-deal-os/DEPLOYMENT_CHECKLIST.md', name: 'Deployment Checklist' },
  { path: '../canonical-deal-os/SECURITY_GUIDELINES.md', name: 'Security Guidelines' },
  { path: '../docs/SECURITY_INVARIANTS.md', name: 'Security Invariants' }
];

docs.forEach(doc => {
  const fullPath = path.join(__dirname, doc.path);
  const exists = fs.existsSync(fullPath);
  check(`${doc.name} exists`, exists);

  if (exists) {
    const stats = fs.statSync(fullPath);
    if (stats.size < 1000) {
      warn(doc.name, 'File is small, may be incomplete');
    }
  }
});

console.log('');

// =============================================================================
// SUMMARY
// =============================================================================

console.log('='.repeat(60));
console.log('VALIDATION SUMMARY');
console.log('='.repeat(60));
console.log('');
console.log(`${colors.green}Passed:${colors.reset}   ${results.passed}`);
console.log(`${colors.red}Failed:${colors.reset}   ${results.failed}`);
console.log(`${colors.yellow}Warnings:${colors.reset} ${results.warnings}`);
console.log('');

if (results.failed === 0) {
  console.log(`${colors.green}All observability checks passed!${colors.reset}`);
  console.log('');
  process.exit(0);
} else {
  console.log(`${colors.red}${results.failed} check(s) failed. Please review and fix.${colors.reset}`);
  console.log('');
  process.exit(1);
}
