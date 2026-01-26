const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  // Find user by seller ID
  const sellerUser = await prisma.authUser.findUnique({
    where: { id: '76e5414b-e22b-4783-bb44-acd54ad9eb3c' }
  });

  console.log('=== Seller User (from DealDraftSeller) ===');
  console.log(JSON.stringify(sellerUser, null, 2));

  // List all users in the org
  console.log('\n=== All Users in Canonical Capital ===');
  const allUsers = await prisma.authUser.findMany({
    where: { organizationId: '2bbcc0eb-2a92-47af-8498-bb4300f3f78b' }
  });
  allUsers.forEach(u => {
    console.log(`- ${u.email} (${u.name}) - Role: ${u.role} - ID: ${u.id}`);
  });

  // Check what user Jane is logged in as
  console.log('\n=== Users with "Jane" in name ===');
  const janes = await prisma.authUser.findMany({
    where: { name: { contains: 'Jane' } }
  });
  janes.forEach(u => {
    console.log(`- ${u.email} (${u.name}) - Org: ${u.organizationId} - ID: ${u.id}`);
  });

  await prisma.$disconnect();
}
check();
