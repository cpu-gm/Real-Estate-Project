#!/usr/bin/env node
/**
 * Contract Validation Script (STRICT MODE)
 *
 * Validates ALL fixture files against Zod schemas.
 * Uses /contracts/manifest.json as the authoritative mapping.
 *
 * Run from repository root: npm run validate:contracts
 *
 * Exit codes:
 *   0 - All fixtures valid and mapped
 *   1 - Validation failed OR unmapped fixture found (blocks CI)
 *
 * STRICT: No skips allowed. Every fixture MUST have a schema mapping.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Load manifest (authoritative fixture→schema mapping)
const manifestPath = join(rootDir, 'contracts', 'manifest.json');
if (!existsSync(manifestPath)) {
  console.error('❌ FATAL: /contracts/manifest.json not found');
  console.error('   Every fixture must be mapped in the manifest.');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

// Dynamic import of schemas from /contracts/schemas.js
let schemas;
try {
  schemas = await import('../contracts/schemas.js');
} catch (err) {
  console.error('❌ FATAL: Failed to import /contracts/schemas.js:', err.message);
  console.error('   Make sure dependencies are installed: npm --prefix canonical-deal-os install');
  process.exit(1);
}

// Build schema lookup from manifest
function getSchemaByName(name) {
  const schema = schemas[name];
  if (!schema) {
    console.error(`❌ FATAL: Schema "${name}" not found in /contracts/schemas.js`);
    console.error('   Add the schema export to /contracts/schemas.js');
    process.exit(1);
  }
  return schema;
}

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

// Main validation
console.log('\n🔍 Validating API Contracts (STRICT MODE)\n');

let allPassed = true;
let totalChecked = 0;
let totalPassed = 0;
let unmappedFixtures = [];

// Validate HTTP fixtures
const httpFixturesDir = join(rootDir, 'fixtures', 'http');
if (existsSync(httpFixturesDir)) {
  console.log('HTTP Fixtures (fixtures/http/):');

  const httpFiles = readdirSync(httpFixturesDir).filter(f => f.endsWith('.json'));

  for (const file of httpFiles) {
    totalChecked++;
    const mapping = manifest.http[file];

    if (!mapping) {
      console.error(`  ✗ ${file} (UNMAPPED - add to /contracts/manifest.json)`);
      unmappedFixtures.push(`fixtures/http/${file}`);
      allPassed = false;
      continue;
    }

    const schema = getSchemaByName(mapping.schema);
    const passed = validateFixture(join(httpFixturesDir, file), schema, file);
    if (passed) totalPassed++;
    else allPassed = false;
  }
} else {
  console.error('❌ fixtures/http/ directory not found');
  allPassed = false;
}

// Validate Event fixtures
const eventFixturesDir = join(rootDir, 'fixtures', 'events');
if (existsSync(eventFixturesDir)) {
  console.log('\nEvent Fixtures (fixtures/events/):');

  const eventFiles = readdirSync(eventFixturesDir).filter(f => f.endsWith('.json'));

  for (const file of eventFiles) {
    totalChecked++;
    const mapping = manifest.events[file];

    if (!mapping) {
      console.error(`  ✗ ${file} (UNMAPPED - add to /contracts/manifest.json)`);
      unmappedFixtures.push(`fixtures/events/${file}`);
      allPassed = false;
      continue;
    }

    const schema = getSchemaByName(mapping.schema);
    const passed = validateFixture(join(eventFixturesDir, file), schema, file);
    if (passed) totalPassed++;
    else allPassed = false;
  }
} else {
  console.error('❌ fixtures/events/ directory not found');
  allPassed = false;
}

// Summary
console.log('\n' + '─'.repeat(50));
console.log(`\n📊 Results: ${totalPassed}/${totalChecked} fixtures passed\n`);

if (unmappedFixtures.length > 0) {
  console.error('❌ UNMAPPED FIXTURES (must be added to /contracts/manifest.json):');
  for (const f of unmappedFixtures) {
    console.error(`   - ${f}`);
  }
  console.error('');
}

if (allPassed) {
  console.log('✅ All contract validations passed (strict mode)\n');
  process.exit(0);
} else {
  console.error('❌ Contract validation FAILED\n');
  console.error('   Fix validation errors or add missing mappings to /contracts/manifest.json');
  console.error('   CI will block merge until all fixtures are mapped and valid.\n');
  process.exit(1);
}
