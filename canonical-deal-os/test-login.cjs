#!/usr/bin/env node
/**
 * Quick test script to verify login works for all test accounts
 */

const fetch = require('node-fetch');

const BFF_URL = 'http://localhost:8787';

const TEST_ACCOUNTS = [
  { email: 'admin@canonical.com', password: 'admin123', name: 'Admin' },
  { email: 'gp@canonical.com', password: 'gp123', name: 'GP' },
  { email: 'analyst@canonical.com', password: 'analyst123', name: 'Analyst (pending)' }
];

async function testLogin(email, password, name) {
  try {
    const response = await fetch(`${BFF_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (response.ok) {
      console.log(`✅ ${name}: Login successful`);
      console.log(`   Token: ${data.token?.substring(0, 20)}...`);
      console.log(`   User: ${data.user?.name} (${data.user?.role})`);
      return { success: true, data };
    } else {
      console.log(`❌ ${name}: Login failed`);
      console.log(`   Status: ${response.status}`);
      console.log(`   Error: ${data.message || data.error || JSON.stringify(data)}`);
      return { success: false, error: data };
    }
  } catch (error) {
    console.log(`❌ ${name}: Request failed`);
    console.log(`   Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('🧪 Testing login for all test accounts...\n');

  for (const account of TEST_ACCOUNTS) {
    await testLogin(account.email, account.password, account.name);
    console.log('');
  }

  console.log('✅ Login testing complete!');
}

main().catch(console.error);
