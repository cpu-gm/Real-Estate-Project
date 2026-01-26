const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createTestInvitation() {
  try {
    // First check for existing deals
    const deals = await prisma.deal.findMany({ take: 1 });
    if (deals.length === 0) {
      console.log('No deals found. Please seed the database first with: npm run db:seed');
      return;
    }

    const deal = deals[0];
    console.log('Using deal:', deal.id, '-', deal.name);

    // Check for existing invitations
    const existingInvitations = await prisma.lPInvitation.findMany({ take: 5 });
    if (existingInvitations.length > 0) {
      console.log('\nExisting invitations:');
      existingInvitations.forEach(inv => {
        console.log(`  - ${inv.id} (${inv.lpEntityName}, ${inv.status})`);
      });
      console.log('\nUse one of these IDs to test the workflow.');
      return;
    }

    // Create test invitation
    const invitation = await prisma.lPInvitation.create({
      data: {
        dealId: deal.id,
        lpEntityName: 'Test LP Entity',
        lpEmail: 'testlp@example.com',
        commitment: 100000,
        ownershipPct: 5.0,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      }
    });

    console.log('\nCreated test invitation:');
    console.log('  ID:', invitation.id);
    console.log('  LP:', invitation.lpEntityName);
    console.log('  Email:', invitation.lpEmail);
    console.log('  Deal:', deal.name);
    console.log('\nUse this ID to test the n8n workflow.');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

createTestInvitation();
