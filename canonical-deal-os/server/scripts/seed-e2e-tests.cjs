/**
 * E2E Test Seed Script
 *
 * Creates realistic test data for E2E testing including:
 * - Organization and users (GP, Admin, Analyst, Broker)
 * - Multiple deals with various urgency states
 * - Capital calls with different due dates (overdue, soon, later)
 * - Pending review requests
 * - Buyer access requests
 * - Store file population (for home page data)
 *
 * Run with: node server/scripts/seed-e2e-tests.cjs
 *
 * After running, you can run E2E tests with realistic data.
 */

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// Store file path (matches store.js)
const STORE_DIR = path.resolve(process.cwd(), 'server', '.data');
const STORE_PATH = path.resolve(STORE_DIR, 'store.json');

const SALT_ROUNDS = 10;

// Date helpers
function daysFromNow(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

// Test data configuration
const TEST_ORG = {
  name: 'E2E Test Capital',
  slug: 'e2e-test-capital',
  domain: 'e2etest.com',
};

const TEST_USERS = [
  {
    email: 'gp@canonical.com',
    password: 'gp123',
    name: 'Jane GP',
    role: 'GP',
    status: 'ACTIVE',
  },
  {
    email: 'admin@canonical.com',
    password: 'admin123',
    name: 'System Admin',
    role: 'Admin',
    status: 'ACTIVE',
  },
  {
    email: 'analyst@canonical.com',
    password: 'analyst123',
    name: 'John Analyst',
    role: 'GP Analyst',
    status: 'ACTIVE', // Make active for testing
  },
  {
    email: 'broker@canonical.com',
    password: 'broker123',
    name: 'Bob Broker',
    role: 'Broker',
    status: 'ACTIVE',
  },
  {
    email: 'analyst2@canonical.com',
    password: 'analyst123',
    name: 'Sarah Analyst',
    role: 'GP Analyst',
    status: 'PENDING', // For testing admin approval
  },
];

// Test deals with various urgency states
const TEST_DEALS = [
  {
    id: 'e2e-deal-blocked-001',
    name: 'Oak Tower Acquisition',
    summary: 'Lender approval missing - deal blocked pending bank review',
    urgency: 'blocked',
    dueDate: daysAgo(2), // Overdue
    propertyType: 'OFFICE',
    propertyAddress: '100 Oak Street',
    propertyCity: 'San Francisco',
    propertyState: 'CA',
    purchasePrice: 45000000,
    noi: 2700000,
    state: 'UNDERWRITING',
  },
  {
    id: 'e2e-deal-urgent-001',
    name: 'Maple Grove Apartments',
    summary: 'IC presentation due tomorrow - materials need final review',
    urgency: 'urgent',
    dueDate: daysFromNow(1),
    propertyType: 'MULTIFAMILY',
    propertyAddress: '250 Maple Ave',
    propertyCity: 'Austin',
    propertyState: 'TX',
    purchasePrice: 28000000,
    noi: 1680000,
    state: 'IC_REVIEW',
  },
  {
    id: 'e2e-deal-warning-001',
    name: 'Pine Street Retail',
    summary: 'Due diligence documents awaiting review',
    urgency: 'warning',
    dueDate: daysFromNow(3),
    propertyType: 'RETAIL',
    propertyAddress: '500 Pine Street',
    propertyCity: 'Denver',
    propertyState: 'CO',
    purchasePrice: 12000000,
    noi: 960000,
    state: 'DUE_DILIGENCE',
  },
  {
    id: 'e2e-deal-attention-001',
    name: 'Cedar Park Industrial',
    summary: 'Awaiting environmental report',
    urgency: 'attention',
    dueDate: daysFromNow(5),
    propertyType: 'INDUSTRIAL',
    propertyAddress: '800 Cedar Park Blvd',
    propertyCity: 'Dallas',
    propertyState: 'TX',
    purchasePrice: 18500000,
    noi: 1200000,
    state: 'DUE_DILIGENCE',
  },
  {
    id: 'e2e-deal-ready-001',
    name: 'Birch Lane Medical',
    summary: 'Ready for closing - all approvals received',
    urgency: 'ready',
    dueDate: daysFromNow(14),
    propertyType: 'MEDICAL_OFFICE',
    propertyAddress: '150 Birch Lane',
    propertyCity: 'Boston',
    propertyState: 'MA',
    purchasePrice: 22000000,
    noi: 1540000,
    state: 'CLOSING',
  },
];

// Capital calls with different urgencies
const TEST_CAPITAL_CALLS = [
  {
    dealId: 'e2e-deal-urgent-001',
    dealName: 'Maple Grove Apartments',
    amount: 2800000,
    dueDate: daysAgo(1), // Overdue
    status: 'PENDING',
  },
  {
    dealId: 'e2e-deal-warning-001',
    dealName: 'Pine Street Retail',
    amount: 1200000,
    dueDate: daysFromNow(2), // Due soon
    status: 'PENDING',
  },
  {
    dealId: 'e2e-deal-ready-001',
    dealName: 'Birch Lane Medical',
    amount: 2200000,
    dueDate: daysFromNow(10), // Due later
    status: 'PENDING',
  },
];

async function main() {
  console.log('🌱 Seeding E2E test data...\n');
  console.log('=====================================');

  // 1. Create or get organization
  let organization = await prisma.organization.findUnique({
    where: { slug: 'canonical-capital' }
  });

  if (!organization) {
    organization = await prisma.organization.create({
      data: {
        name: 'Canonical Capital',
        slug: 'canonical-capital',
        domain: 'canonical.com',
        status: 'ACTIVE',
      }
    });
    console.log('✅ Created organization:', organization.name);
  } else {
    console.log('ℹ️  Organization exists:', organization.name);
  }

  // 2. Create test users
  console.log('\n📝 Creating/updating test users...');
  const userMap = {};

  for (const userData of TEST_USERS) {
    let user = await prisma.authUser.findFirst({
      where: { email: userData.email }
    });

    if (!user) {
      const passwordHash = await bcrypt.hash(userData.password, SALT_ROUNDS);
      user = await prisma.authUser.create({
        data: {
          email: userData.email,
          passwordHash,
          name: userData.name,
          organizationId: organization.id,
          role: userData.role,
          status: userData.status,
          verifiedAt: userData.status === 'ACTIVE' ? new Date() : null,
        }
      });
      console.log(`   ✅ Created: ${user.email} (${user.role})`);
    } else {
      // Update to ensure status is correct
      user = await prisma.authUser.update({
        where: { id: user.id },
        data: {
          role: userData.role,
          status: userData.status,
          verifiedAt: userData.status === 'ACTIVE' ? user.verifiedAt || new Date() : null,
        }
      });
      console.log(`   ℹ️  Updated: ${user.email} (${user.role})`);
    }

    userMap[userData.email] = user;

    // Create pending verification request for pending users
    if (userData.status === 'PENDING') {
      const existingRequest = await prisma.userVerificationRequest.findFirst({
        where: { userId: user.id, status: 'PENDING' }
      });

      if (!existingRequest) {
        await prisma.userVerificationRequest.create({
          data: {
            userId: user.id,
            requestedRole: userData.role,
            status: 'PENDING',
          }
        });
        console.log(`   ✅ Created verification request for: ${user.email}`);
      }
    }
  }

  // 3. Create test deals with profiles and states
  console.log('\n🏢 Creating/updating test deals...');

  for (const dealData of TEST_DEALS) {
    // Create deal profile
    const profileData = {
      propertyType: dealData.propertyType,
      propertyAddress: dealData.propertyAddress,
      propertyCity: dealData.propertyCity,
      propertyState: dealData.propertyState,
      name: dealData.name,
      purchasePrice: dealData.purchasePrice,
      noi: dealData.noi,
      // Add urgency info for frontend
      _urgency: dealData.urgency,
      _summary: dealData.summary,
      _dueDate: dealData.dueDate.toISOString(),
    };

    await prisma.dealProfile.upsert({
      where: { dealId: dealData.id },
      update: { profile: JSON.stringify(profileData) },
      create: {
        dealId: dealData.id,
        profile: JSON.stringify(profileData),
      }
    });

    // Create deal state
    await prisma.dealState.upsert({
      where: { dealId: dealData.id },
      update: {
        currentState: dealData.state,
        enteredStateAt: new Date(),
      },
      create: {
        dealId: dealData.id,
        currentState: dealData.state,
        enteredStateAt: new Date(),
        createdAt: new Date(),
      }
    });

    // Create initial deal event
    const existingEvent = await prisma.dealEvent.findFirst({
      where: { dealId: dealData.id, eventType: 'DealCreated' }
    });

    if (!existingEvent) {
      await prisma.dealEvent.create({
        data: {
          id: `event-${dealData.id}-${Date.now()}`,
          dealId: dealData.id,
          eventType: 'DealCreated',
          eventData: JSON.stringify({
            name: dealData.name,
            propertyType: dealData.propertyType,
            askingPrice: dealData.purchasePrice,
          }),
          actorId: userMap['gp@canonical.com'].id,
          actorName: 'Jane GP',
          actorRole: 'GP',
          authorityContext: JSON.stringify({ source: 'e2e-seed' }),
          sequenceNumber: 1,
          occurredAt: daysAgo(30),
          fromState: null,
          toState: dealData.state,
          previousEventHash: null,
          eventHash: crypto.createHash('sha256')
            .update(`DealCreated-${dealData.id}-${Date.now()}`)
            .digest('hex'),
        }
      });
    }

    console.log(`   ✅ Deal: ${dealData.name} [${dealData.urgency}]`);
  }

  // 4. Create capital calls
  console.log('\n💰 Creating capital calls...');

  for (const callData of TEST_CAPITAL_CALLS) {
    const existingCall = await prisma.capitalCall.findFirst({
      where: {
        dealId: callData.dealId,
        totalAmount: callData.amount,
      }
    });

    if (!existingCall) {
      await prisma.capitalCall.create({
        data: {
          dealId: callData.dealId,
          title: `Capital Call - ${callData.dealName}`,
          totalAmount: callData.amount,
          dueDate: callData.dueDate,
          status: callData.status,
          purpose: 'INITIAL_FUNDING',
          description: `Capital call for ${callData.dealName}`,
          createdBy: userMap['gp@canonical.com'].id,
          createdByName: 'Jane GP',
        }
      });
      console.log(`   ✅ Capital call: $${(callData.amount / 1000000).toFixed(1)}M - ${callData.dealName}`);
    } else {
      console.log(`   ℹ️  Capital call exists: $${(callData.amount / 1000000).toFixed(1)}M - ${callData.dealName}`);
    }
  }

  // 5. Create pending review requests from analyst
  console.log('\n📋 Creating review requests...');

  const analystUser = userMap['analyst@canonical.com'];
  const gpUser = userMap['gp@canonical.com'];

  // Clear existing review requests for clean state
  await prisma.reviewRequest.deleteMany({
    where: { requestedBy: analystUser.id }
  });

  const reviewRequests = [
    {
      dealId: 'e2e-deal-warning-001',
      dealName: 'Pine Street Retail',
      message: 'Underwriting model updated - please review NOI assumptions',
    },
    {
      dealId: 'e2e-deal-attention-001',
      dealName: 'Cedar Park Industrial',
      message: 'Due diligence checklist complete - ready for your sign-off',
    },
  ];

  for (const request of reviewRequests) {
    await prisma.reviewRequest.create({
      data: {
        dealId: request.dealId,
        requestedBy: analystUser.id,
        requestedByName: analystUser.name,
        message: request.message,
        status: 'pending',
        requestedAt: daysAgo(1),
      }
    });
    console.log(`   ✅ Review request: ${request.dealName}`);
  }

  // 6. Populate store.json for home page data
  console.log('\n📦 Populating store.json...');

  // Ensure store directory exists
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
  }

  // Build store data
  const storeData = {
    dealIndex: TEST_DEALS.map(deal => ({
      id: deal.id,
      name: deal.name,
      organizationId: organization.id,
      createdAt: daysAgo(30).toISOString(),
    })),
    dealProfiles: TEST_DEALS.map(deal => ({
      dealId: deal.id,
      profile: {
        propertyType: deal.propertyType,
        propertyAddress: deal.propertyAddress,
        propertyCity: deal.propertyCity,
        propertyState: deal.propertyState,
        name: deal.name,
        purchasePrice: deal.purchasePrice,
        noi: deal.noi,
        state: deal.state,
        // Custom fields for urgency display
        _urgency: deal.urgency,
        _summary: deal.summary,
        _dueDate: deal.dueDate.toISOString(),
      },
      provenance: { source: 'e2e-seed', asOf: new Date().toISOString() },
      updatedAt: new Date().toISOString(),
    })),
    userActors: [
      {
        userId: userMap['gp@canonical.com'].id,
        dealId: 'e2e-deal-blocked-001',
        actorId: `actor-${userMap['gp@canonical.com'].id}`,
        role: 'GP',
        updatedAt: new Date().toISOString(),
      },
      {
        userId: userMap['analyst@canonical.com'].id,
        dealId: 'e2e-deal-warning-001',
        actorId: `actor-${userMap['analyst@canonical.com'].id}`,
        role: 'GP Analyst',
        updatedAt: new Date().toISOString(),
      },
    ],
    idempotency: [],
  };

  fs.writeFileSync(STORE_PATH, JSON.stringify(storeData, null, 2), 'utf8');
  console.log(`   ✅ Store populated with ${storeData.dealIndex.length} deals`);

  // Summary
  console.log('\n=====================================');
  console.log('🎉 E2E Test Seeding Complete!\n');

  console.log('Test Users:');
  console.log('  GP:       gp@canonical.com / gp123');
  console.log('  Admin:    admin@canonical.com / admin123');
  console.log('  Analyst:  analyst@canonical.com / analyst123');
  console.log('  Broker:   broker@canonical.com / broker123');
  console.log('  Buyers:   buyer1@test.com / buyer123 (etc.)\n');

  console.log('Test Deals (for Command Center):');
  for (const deal of TEST_DEALS) {
    const urgencyEmoji = {
      blocked: '🔴',
      urgent: '🟠',
      warning: '🟡',
      attention: '🔵',
      ready: '🟢',
    }[deal.urgency];
    console.log(`  ${urgencyEmoji} ${deal.name} [${deal.urgency}]`);
  }

  console.log('\nCapital Calls:');
  for (const call of TEST_CAPITAL_CALLS) {
    const daysUntil = Math.round((call.dueDate - new Date()) / (1000 * 60 * 60 * 24));
    console.log(`  $${(call.amount / 1000000).toFixed(1)}M - ${call.dealName} (${daysUntil > 0 ? `due in ${daysUntil} days` : 'OVERDUE'})`);
  }

  console.log('\nPending Review Requests: 2');
  console.log('Pending User Approvals: 1');

  console.log('\n=====================================');
  console.log('Run E2E tests with: npm run e2e');
  console.log('=====================================\n');
}

main()
  .catch((e) => {
    console.error('❌ E2E seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
