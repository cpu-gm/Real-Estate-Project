/**
 * Operations Documentation Validation Script
 *
 * Sprint 2, Day 16: Production Readiness
 *
 * Validates that all operations documentation is complete and current:
 * - DEPLOYMENT_GUIDE.md
 * - DEPLOYMENT_CHECKLIST.md
 * - SECURITY_GUIDELINES.md
 * - Health check endpoints
 * - Debug endpoints
 *
 * Usage:
 *   node scripts/validate-operations.cjs
 */

const fs = require('fs');
const path = require('path');

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(level, message) {
  const color = level === 'PASS' ? colors.green :
                level === 'FAIL' ? colors.red :
                level === 'WARN' ? colors.yellow :
                level === 'INFO' ? colors.cyan : colors.blue;
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

function info(message) {
  log('INFO', message);
}

console.log('');
console.log('='.repeat(60));
console.log('Operations Documentation Validation');
console.log('Sprint 2, Day 16');
console.log('='.repeat(60));
console.log('');

// =============================================================================
// 1. DEPLOYMENT GUIDE VALIDATION
// =============================================================================

console.log(`${colors.blue}[1] Deployment Guide Validation${colors.reset}`);
console.log('-'.repeat(40));

const deployGuide = path.join(__dirname, '../canonical-deal-os/DEPLOYMENT_GUIDE.md');
if (fs.existsSync(deployGuide)) {
  const content = fs.readFileSync(deployGuide, 'utf-8');
  const lines = content.split('\n').length;

  check('Deployment Guide exists', true);
  info(`Lines: ${lines}`);

  // Check for required sections
  check('Has staging deployment section', content.includes('staging') || content.includes('Staging'));
  check('Has production deployment section', content.includes('production') || content.includes('Production'));
  check('Has environment variables section', content.includes('environment') || content.includes('ENV'));
  check('Has health check section', content.includes('health') || content.includes('Health'));
  check('Has rollback procedure', content.includes('rollback') || content.includes('Rollback'));
  check('Has database migration section', content.includes('migration') || content.includes('prisma'));

  if (lines < 200) {
    warn('Deployment Guide', `Only ${lines} lines - may be incomplete`);
  }
} else {
  check('Deployment Guide exists', false, 'File not found');
}

console.log('');

// =============================================================================
// 2. DEPLOYMENT CHECKLIST VALIDATION
// =============================================================================

console.log(`${colors.blue}[2] Deployment Checklist Validation${colors.reset}`);
console.log('-'.repeat(40));

const deployChecklist = path.join(__dirname, '../canonical-deal-os/DEPLOYMENT_CHECKLIST.md');
if (fs.existsSync(deployChecklist)) {
  const content = fs.readFileSync(deployChecklist, 'utf-8');

  check('Deployment Checklist exists', true);

  // Count checklist items
  const checkboxes = (content.match(/- \[ \]/g) || []).length;
  const completed = (content.match(/- \[x\]/gi) || []).length;

  info(`Checklist items: ${checkboxes + completed} (${completed} pre-checked)`);

  check('Has pre-deployment section', content.includes('Pre-') || content.includes('Before'));
  check('Has deployment section', content.includes('Deploy') || content.includes('deploy'));
  check('Has post-deployment section', content.includes('Post-') || content.includes('After') || content.includes('Verif'));
  check('Has GO/NO-GO criteria', content.includes('GO') || content.includes('criteria'));

  if (checkboxes + completed < 10) {
    warn('Deployment Checklist', `Only ${checkboxes + completed} items - may be incomplete`);
  }
} else {
  check('Deployment Checklist exists', false, 'File not found');
}

console.log('');

// =============================================================================
// 3. SECURITY GUIDELINES VALIDATION
// =============================================================================

console.log(`${colors.blue}[3] Security Guidelines Validation${colors.reset}`);
console.log('-'.repeat(40));

const securityGuide = path.join(__dirname, '../canonical-deal-os/SECURITY_GUIDELINES.md');
if (fs.existsSync(securityGuide)) {
  const content = fs.readFileSync(securityGuide, 'utf-8');

  check('Security Guidelines exists', true);

  check('Has authentication section', content.includes('auth') || content.includes('Auth'));
  check('Has authorization/RBAC section', content.includes('RBAC') || content.includes('role') || content.includes('permission'));
  check('Has organization isolation', content.includes('organization') || content.includes('tenant'));
  check('Has audit logging', content.includes('audit') || content.includes('log'));
  check('Has input validation', content.includes('validation') || content.includes('sanitiz'));
  check('Has rate limiting', content.includes('rate') || content.includes('limit'));
} else {
  check('Security Guidelines exists', false, 'File not found');
}

console.log('');

// =============================================================================
// 4. SECURITY INVARIANTS VALIDATION
// =============================================================================

console.log(`${colors.blue}[4] Security Invariants Validation${colors.reset}`);
console.log('-'.repeat(40));

const securityInvariants = path.join(__dirname, '../docs/SECURITY_INVARIANTS.md');
if (fs.existsSync(securityInvariants)) {
  const content = fs.readFileSync(securityInvariants, 'utf-8');

  check('Security Invariants exists', true);

  check('Has tenancy isolation', content.includes('Tenancy') || content.includes('tenancy'));
  check('Has authority enforcement', content.includes('Authority') || content.includes('authority'));
  check('Has data integrity', content.includes('integrity') || content.includes('hash'));
  check('Has audit completeness', content.includes('Audit') || content.includes('audit'));
  check('Has AI boundary control', content.includes('AI') || content.includes('boundary'));
  check('Has threat model', content.includes('threat') || content.includes('STRIDE'));
} else {
  check('Security Invariants exists', false, 'File not found');
}

console.log('');

// =============================================================================
// 5. HEALTH SCRIPT VALIDATION
// =============================================================================

console.log(`${colors.blue}[5] Health Check Infrastructure${colors.reset}`);
console.log('-'.repeat(40));

const healthScript = path.join(__dirname, '../canonical-deal-os/scripts/health.js');
if (fs.existsSync(healthScript)) {
  const content = fs.readFileSync(healthScript, 'utf-8');

  check('Health script exists', true);

  check('Checks BFF service', content.includes('8787') || content.includes('bff'));
  check('Checks Kernel service', content.includes('3001') || content.includes('kernel'));
  check('Has timeout handling', content.includes('timeout') || content.includes('Timeout'));
} else {
  check('Health script exists', false);
}

console.log('');

// =============================================================================
// 6. STATE MACHINE MAPPING
// =============================================================================

console.log(`${colors.blue}[6] State Machine Mapping${colors.reset}`);
console.log('-'.repeat(40));

const stateMachine = path.join(__dirname, '../docs/STATE_MACHINE_MAPPING.md');
if (fs.existsSync(stateMachine)) {
  const content = fs.readFileSync(stateMachine, 'utf-8');

  check('State Machine Mapping exists', true);

  check('Has Kernel states', content.includes('Kernel') || content.includes('kernel'));
  check('Has BFF states', content.includes('BFF') || content.includes('bff'));
  check('Has state transitions', content.includes('transition') || content.includes('->'));
  check('Has validation rules', content.includes('validation') || content.includes('Validation'));
} else {
  check('State Machine Mapping exists', false);
}

console.log('');

// =============================================================================
// 7. SPRINT EXECUTION PLANS
// =============================================================================

console.log(`${colors.blue}[7] Sprint Execution Plans${colors.reset}`);
console.log('-'.repeat(40));

const sprint1 = path.join(__dirname, '../docs/SPRINT_1_WEEKS_1_2.md');
const sprint2 = path.join(__dirname, '../docs/SPRINT_2_WEEKS_3_4.md');

check('Sprint 1 plan exists', fs.existsSync(sprint1));
check('Sprint 2 plan exists', fs.existsSync(sprint2));

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
  console.log(`${colors.green}All operations documentation validated!${colors.reset}`);
  process.exit(0);
} else {
  console.log(`${colors.red}${results.failed} check(s) failed. Please review.${colors.reset}`);
  process.exit(1);
}
