const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  // Check the deal draft
  const draft = await prisma.dealDraft.findFirst({
    where: { propertyName: 'Sunset Ridge Apartments' },
    include: { seller: true, brokers: true }
  });

  console.log('=== Deal Draft ===');
  console.log('ID:', draft?.id);
  console.log('OrgId:', draft?.organizationId);
  console.log('Status:', draft?.status);
  console.log('Seller userId:', draft?.seller?.userId);
  console.log('Brokers:', draft?.brokers?.length || 0);

  // Check Jane GP's user record
  const jane = await prisma.authUser.findFirst({
    where: { email: 'jane.gp@canonical.com' }
  });

  console.log('\n=== Jane GP ===');
  console.log('ID:', jane?.id);
  console.log('OrgId:', jane?.organizationId);
  console.log('Role:', jane?.role);

  // Check if IDs match
  console.log('\n=== Match Check ===');
  console.log('Seller userId matches Jane ID:', draft?.seller?.userId === jane?.id);
  console.log('Org IDs match:', draft?.organizationId === jane?.organizationId);

  // List all deal drafts for this org
  console.log('\n=== All Drafts in Org ===');
  const allDrafts = await prisma.dealDraft.findMany({
    where: { organizationId: jane?.organizationId },
    include: { seller: true }
  });
  console.log('Total drafts:', allDrafts.length);
  allDrafts.forEach(d => {
    console.log(`- ${d.propertyName} (seller: ${d.seller?.userId})`);
  });

  await prisma.$disconnect();
}
check();
