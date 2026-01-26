/**
 * Test script for broker invitation API endpoints
 * Tests: /api/intake/invitations, /api/intake/draft/:id/access, accept/decline
 */

const http = require('http');

const BFF_HOST = 'localhost';
const BFF_PORT = 8787;

// Simple HTTP request helper
function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BFF_HOST,
      port: BFF_PORT,
      path: `/api${path}`,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Login and get auth token
async function login(email, password) {
  const res = await request('POST', '/auth/login', { email, password });
  if (res.status !== 200) {
    throw new Error(`Login failed: ${JSON.stringify(res.data)}`);
  }
  return res.data.token;
}

async function main() {
  console.log('\n========================================');
  console.log('BROKER API ENDPOINTS TEST');
  console.log('========================================\n');

  // Step 1: Login as broker
  console.log('📋 STEP 1: Logging in as broker...');
  let brokerToken;
  try {
    brokerToken = await login('broker@brokers.com', 'broker123');
    console.log('   ✅ Broker login successful');
  } catch (error) {
    console.log(`   ❌ Broker login failed: ${error.message}`);
    console.log('   Trying without auth...');
  }

  // Step 2: Test /api/intake/invitations endpoint
  console.log('\n📋 STEP 2: Testing GET /api/intake/invitations...');
  try {
    const res = await request('GET', '/intake/invitations', null, brokerToken);
    console.log(`   Status: ${res.status}`);
    if (res.status === 200) {
      console.log(`   ✅ Found ${res.data.invitations?.length || 0} invitations`);
      if (res.data.invitations?.length > 0) {
        res.data.invitations.forEach((inv, i) => {
          console.log(`   [${i + 1}] ${inv.dealDraft?.propertyName || 'Property'} - ${inv.status}`);
          console.log(`       Invited by: ${inv.invitedByName}`);
        });
      }
    } else {
      console.log(`   ❌ Error: ${JSON.stringify(res.data)}`);
    }
  } catch (error) {
    console.log(`   ❌ Request failed: ${error.message}`);
  }

  // Step 3: Test /api/intake/draft/:id/access endpoint
  console.log('\n📋 STEP 3: Testing GET /api/intake/draft/:id/access...');
  const testDealId = 'c4d46c8f-2786-438a-95b5-6cc93ccf9af2'; // From previous test
  try {
    const res = await request('GET', `/intake/draft/${testDealId}/access`, null, brokerToken);
    console.log(`   Status: ${res.status}`);
    if (res.status === 200) {
      console.log(`   ✅ Access check successful`);
      console.log(`       Relation: ${res.data.relation}`);
      console.log(`       Permissions: ${res.data.permissions?.join(', ')}`);
      if (res.data.invitation) {
        console.log(`       Invitation ID: ${res.data.invitation.id}`);
        console.log(`       Invitation Status: ${res.data.invitation.status}`);
      }
    } else {
      console.log(`   ❌ Error: ${JSON.stringify(res.data)}`);
    }
  } catch (error) {
    console.log(`   ❌ Request failed: ${error.message}`);
  }

  // Step 4: Test accept endpoint (but don't actually accept - just test 401 without auth)
  console.log('\n📋 STEP 4: Testing POST /api/intake/invitation/:id/accept...');
  const testInvitationId = 'bi_test_1769051581224_0nsosg'; // From previous test
  try {
    const res = await request('POST', `/intake/invitation/${testInvitationId}/accept`, {}, brokerToken);
    console.log(`   Status: ${res.status}`);
    if (res.status === 200) {
      console.log(`   ✅ Accept successful: ${res.data.message}`);
    } else if (res.status === 400) {
      console.log(`   ⚠️ Already responded or validation error: ${res.data.error}`);
    } else {
      console.log(`   ❌ Error: ${JSON.stringify(res.data)}`);
    }
  } catch (error) {
    console.log(`   ❌ Request failed: ${error.message}`);
  }

  console.log('\n========================================');
  console.log('API TEST COMPLETE');
  console.log('========================================\n');
}

main().catch(console.error);
