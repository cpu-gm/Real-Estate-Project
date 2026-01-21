#!/usr/bin/env node
/**
 * Contract Validation Script
 *
 * Validates fixture files against Zod schemas from contracts.js.
 * Run from repository root: npm run validate:contracts
 *
 * Exit codes:
 *   0 - All fixtures valid
 *   1 - One or more fixtures failed validation (blocks CI)
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Dynamic import of contracts (handles ES modules)
let schemas;
try {
  schemas = await import('../canonical-deal-os/src/lib/contracts.js');
} catch (err) {
  console.error('Failed to import contracts.js:', err.message);
  console.error('Make sure you have installed dependencies: npm --prefix canonical-deal-os install');
  process.exit(1);
}

const {
  createDealRequestSchema,
  dealSchema,
  explainBlockSchema,
  explainAllowedSchema
} = schemas;

// Map fixture filenames to their schemas
const httpSchemaMap = {
  'create-deal-request.json': createDealRequestSchema,
  'create-deal-response.json': dealSchema,
  'explain-blocked-response.json': explainBlockSchema,
  'explain-allowed-response.json': explainAllowedSchema
  // LP invitation schema may not exist yet - skip if not found
};

// Kernel event basic structure validation
const eventRequiredFields = ['type', 'actorId', 'payload', 'authorityContext', 'evidenceRefs'];

/**
 * Strips _comment fields from an object (recursive)
 */
function stripComments(obj) {
  if (Array.isArray(obj)) {
    return obj.map(stripComments);
  }
  if (obj && typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (!key.startsWith('_')) {
        result[key] = stripComments(value);
      }
    }
    return result;
  }
  return obj;
}

/**
 * Validates a fixture file against its schema
 */
function validateFixture(filePath, schema, name) {
  try {
    const content = JSON.parse(readFileSync(filePath, 'utf-8'));
    const cleaned = stripComments(content);

    const result = schema.safeParse(cleaned);

    if (result.success) {
      console.log(`  ✓ ${name}`);
      return true;
    } else {
      console.error(`  ✗ ${name}`);
      const errors = result.error.flatten();
      if (errors.formErrors.length > 0) {
        console.error(`    Form errors: ${errors.formErrors.join(', ')}`);
      }
      for (const [field, messages] of Object.entries(errors.fieldErrors)) {
        console.error(`    ${field}: ${messages.join(', ')}`);
      }
      return false;
    }
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Parse error: ${err.message}`);
    return false;
  }
}

/**
 * Validates kernel event structure (basic check)
 */
function validateEventFixture(filePath, name) {
  try {
    const content = JSON.parse(readFileSync(filePath, 'utf-8'));
    const cleaned = stripComments(content);

    const missing = eventRequiredFields.filter(f => !(f in cleaned));

    if (missing.length === 0) {
      console.log(`  ✓ ${name}`);
      return true;
    } else {
      console.error(`  ✗ ${name}`);
      console.error(`    Missing fields: ${missing.join(', ')}`);
      return false;
    }
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Parse error: ${err.message}`);
    return false;
  }
}

// Main validation
console.log('\n🔍 Validating API Contracts\n');

let allPassed = true;
let totalChecked = 0;
let totalPassed = 0;

// Validate HTTP fixtures
const httpFixturesDir = join(rootDir, 'fixtures', 'http');
if (existsSync(httpFixturesDir)) {
  console.log('HTTP Fixtures (fixtures/http/):');

  const httpFiles = readdirSync(httpFixturesDir).filter(f => f.endsWith('.json'));

  for (const file of httpFiles) {
    totalChecked++;
    const schema = httpSchemaMap[file];

    if (schema) {
      const passed = validateFixture(join(httpFixturesDir, file), schema, file);
      if (passed) totalPassed++;
      else allPassed = false;
    } else {
      console.log(`  ⚠ ${file} (no schema mapped - skipped)`);
    }
  }
} else {
  console.log('⚠ fixtures/http/ directory not found');
}

// Validate Event fixtures
const eventFixturesDir = join(rootDir, 'fixtures', 'events');
if (existsSync(eventFixturesDir)) {
  console.log('\nEvent Fixtures (fixtures/events/):');

  const eventFiles = readdirSync(eventFixturesDir).filter(f => f.endsWith('.json'));

  for (const file of eventFiles) {
    totalChecked++;
    const passed = validateEventFixture(join(eventFixturesDir, file), file);
    if (passed) totalPassed++;
    else allPassed = false;
  }
} else {
  console.log('⚠ fixtures/events/ directory not found');
}

// Summary
console.log('\n' + '─'.repeat(50));
console.log(`\n📊 Results: ${totalPassed}/${totalChecked} fixtures passed\n`);

if (allPassed) {
  console.log('✅ All contract validations passed\n');
  process.exit(0);
} else {
  console.error('❌ Some contract validations failed\n');
  process.exit(1);
}
