/**
 * Test script for cross-org broker invitation flow
 * Tests the full flow: create listing with broker invitation, verify broker can see it
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('\n========================================');
  console.log('BROKER INVITATION CROSS-ORG TEST');
  console.log('========================================\n');

  // Step 1: Check current state of BrokerInvitation table
  console.log('📋 STEP 1: Checking BrokerInvitation table...');
  const allInvitations = await prisma.brokerInvitation.findMany();
  console.log(`   Found ${allInvitations.length} broker invitations in database`);

  if (allInvitations.length > 0) {
    console.log('   Existing invitations:');
    allInvitations.forEach((inv, i) => {
      console.log(`   [${i + 1}] ID: ${inv.id}`);
      console.log(`       dealDraftId: ${inv.dealDraftId}`);
      console.log(`       brokerEmail: ${inv.brokerEmail}`);
      console.log(`       status: ${inv.status}`);
      console.log(`       sentAt: ${inv.sentAt}`);
    });
  }

  // Step 2: Find a GP/Seller user and their organization
  console.log('\n📋 STEP 2: Finding GP/Seller user...');
  const gpUser = await prisma.authUser.findFirst({
    where: {
      OR: [
        { role: 'GP' },
        { role: 'ADMIN' },
        { email: { contains: 'gp' } },
        { email: { contains: 'seller' } }
      ]
    }
  });

  if (!gpUser) {
    console.log('   ❌ No GP/Seller user found. Creating one...');
    // Use existing user or create scenario
  } else {
    console.log(`   ✅ Found GP user: ${gpUser.email} (org: ${gpUser.organizationId})`);
  }

  // Step 3: Find a Broker user in a DIFFERENT organization
  console.log('\n📋 STEP 3: Finding Broker user (different org)...');
  const brokerUser = await prisma.authUser.findFirst({
    where: {
      OR: [
        { email: 'broker@brokers.com' },
        { role: 'BROKER' }
      ]
    }
  });

  if (!brokerUser) {
    console.log('   ❌ No broker user found');
  } else {
    console.log(`   ✅ Found broker: ${brokerUser.email} (org: ${brokerUser.organizationId})`);
    console.log(`   📊 Same org as GP? ${gpUser?.organizationId === brokerUser.organizationId ? 'YES (problem!)' : 'NO (correct)'}`);
  }

  // Step 4: Find deal drafts with LISTED_PENDING_BROKER status
  console.log('\n📋 STEP 4: Finding deals with LISTED_PENDING_BROKER status...');
  const listedDeals = await prisma.dealDraft.findMany({
    where: { status: 'LISTED_PENDING_BROKER' },
    include: {
      brokerInvitations: true
    }
  });

  console.log(`   Found ${listedDeals.length} deals with LISTED_PENDING_BROKER status`);
  listedDeals.forEach((deal, i) => {
    console.log(`   [${i + 1}] Deal: ${deal.propertyName || deal.propertyAddress || deal.id}`);
    console.log(`       Status: ${deal.status}`);
    console.log(`       OrgId: ${deal.organizationId}`);
    console.log(`       BrokerInvitations: ${deal.brokerInvitations?.length || 0}`);
    if (deal.brokerInvitations?.length > 0) {
      deal.brokerInvitations.forEach(inv => {
        console.log(`         - ${inv.brokerEmail} (${inv.status})`);
      });
    }
  });

  // Step 5: Test creating a broker invitation manually
  console.log('\n📋 STEP 5: Testing BrokerInvitation creation...');

  // Find or create a test deal
  let testDeal = listedDeals[0];
  if (!testDeal && gpUser) {
    console.log('   Creating a test deal draft...');
    testDeal = await prisma.dealDraft.create({
      data: {
        id: `test_draft_${Date.now()}`,
        organizationId: gpUser.organizationId,
        propertyName: 'Test Property for Broker Invitation',
        propertyAddress: '123 Test Street',
        status: 'LISTED_PENDING_BROKER',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
    console.log(`   ✅ Created test deal: ${testDeal.id}`);
  }

  if (testDeal && brokerUser) {
    console.log(`   Attempting to create BrokerInvitation for deal ${testDeal.id}...`);
    console.log(`   Broker email: ${brokerUser.email}`);

    try {
      // This is what the fixed code should do
      const invitation = await prisma.brokerInvitation.create({
        data: {
          id: `bi_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          dealDraftId: testDeal.id,
          organizationId: testDeal.organizationId,
          brokerEmail: brokerUser.email.toLowerCase(),
          brokerName: brokerUser.name || null,
          brokerFirmName: null,
          // Note: respondedByUserId is set when broker ACCEPTS, not at creation
          status: 'PENDING',
          token: `inv_test_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
          invitedBy: gpUser?.id || 'test-user',
          invitedByName: gpUser?.name || 'Test GP',
          invitedByEmail: gpUser?.email || 'test@test.com',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          // sentAt is auto-generated by Prisma @default(now())
        }
      });

      console.log('   ✅ Successfully created BrokerInvitation!');
      console.log(`      ID: ${invitation.id}`);
      console.log(`      dealDraftId: ${invitation.dealDraftId}`);
      console.log(`      brokerEmail: ${invitation.brokerEmail}`);
      console.log(`      status: ${invitation.status}`);
      console.log(`      sentAt: ${invitation.sentAt}`);
    } catch (error) {
      console.log('   ❌ Failed to create BrokerInvitation!');
      console.log(`      Error: ${error.message}`);
      console.log(`      Code: ${error.code}`);
      if (error.meta) {
        console.log(`      Meta: ${JSON.stringify(error.meta)}`);
      }
    }
  }

  // Step 6: Test the cross-org query (simulating listDealDrafts)
  console.log('\n📋 STEP 6: Testing cross-org query for broker...');

  if (brokerUser) {
    const brokerEmail = brokerUser.email.toLowerCase();
    const brokerOrgId = brokerUser.organizationId;

    console.log(`   Querying deals visible to broker: ${brokerEmail}`);
    console.log(`   Broker's org: ${brokerOrgId}`);

    // Build the same query as listDealDrafts
    const accessConditions = [];

    // Broker assignments
    accessConditions.push({ brokers: { some: { userId: brokerUser.id } } });

    // Seller (shouldn't match for broker)
    accessConditions.push({ seller: { userId: brokerUser.id } });

    // Broker invitations - THIS IS THE KEY
    accessConditions.push({
      brokerInvitations: {
        some: {
          brokerEmail: brokerEmail,
          status: { in: ['PENDING', 'ACCEPTED'] }
        }
      }
    });

    // Same org
    accessConditions.push({ organizationId: brokerOrgId });

    const where = { OR: accessConditions };

    console.log('   Query WHERE clause:');
    console.log(JSON.stringify(where, null, 2));

    try {
      const visibleDeals = await prisma.dealDraft.findMany({
        where,
        include: {
          brokerInvitations: true,
          brokers: true,
          seller: true
        }
      });

      console.log(`\n   📊 Results: Found ${visibleDeals.length} deals visible to broker`);
      visibleDeals.forEach((deal, i) => {
        console.log(`   [${i + 1}] ${deal.propertyName || deal.propertyAddress || deal.id}`);
        console.log(`       Status: ${deal.status}`);
        console.log(`       OrgId: ${deal.organizationId}`);
        console.log(`       Same org as broker? ${deal.organizationId === brokerOrgId ? 'YES' : 'NO (cross-org!)'}`);
        console.log(`       BrokerInvitations: ${deal.brokerInvitations?.length || 0}`);
        if (deal.brokerInvitations?.length > 0) {
          deal.brokerInvitations.forEach(inv => {
            console.log(`         - ${inv.brokerEmail} (${inv.status})`);
          });
        }
      });

      // Check if any are cross-org
      const crossOrgDeals = visibleDeals.filter(d => d.organizationId !== brokerOrgId);
      if (crossOrgDeals.length > 0) {
        console.log(`\n   ✅ SUCCESS! Broker can see ${crossOrgDeals.length} cross-org deal(s)!`);
      } else if (visibleDeals.length > 0) {
        console.log(`\n   ⚠️ Broker can only see same-org deals. No cross-org visibility yet.`);
      } else {
        console.log(`\n   ❌ Broker cannot see any deals.`);
      }
    } catch (error) {
      console.log(`   ❌ Query failed: ${error.message}`);
    }
  }

  // Step 7: Summary
  console.log('\n========================================');
  console.log('SUMMARY');
  console.log('========================================');

  const finalInvitations = await prisma.brokerInvitation.count();
  const pendingInvitations = await prisma.brokerInvitation.count({
    where: { status: 'PENDING' }
  });

  console.log(`Total BrokerInvitations in DB: ${finalInvitations}`);
  console.log(`Pending invitations: ${pendingInvitations}`);

  if (finalInvitations === 0) {
    console.log('\n❌ PROBLEM: No broker invitations exist!');
    console.log('   This means the listing creation is not saving invitations.');
    console.log('   Check deal-intake.js handleCreateListing for field name errors.');
  } else {
    console.log('\n✅ Broker invitations exist in the database.');
  }

  console.log('\n========================================\n');
}

main()
  .catch(e => {
    console.error('Test failed with error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
