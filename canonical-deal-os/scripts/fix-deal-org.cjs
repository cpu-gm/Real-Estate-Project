const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fix() {
  // Jane's correct org ID
  const janeOrgId = '9146c89c-2b3e-48a4-9363-c1f464850eb5';

  // Update the deal draft to use Jane's org
  const updated = await prisma.dealDraft.update({
    where: { id: 'c4d46c8f-2786-438a-95b5-6cc93ccf9af2' },
    data: { organizationId: janeOrgId }
  });

  console.log('Updated DealDraft organizationId to:', updated.organizationId);

  // Verify the fix
  const draft = await prisma.dealDraft.findUnique({
    where: { id: 'c4d46c8f-2786-438a-95b5-6cc93ccf9af2' },
    include: { seller: true }
  });

  const jane = await prisma.authUser.findUnique({
    where: { id: '76e5414b-e22b-4783-bb44-acd54ad9eb3c' }
  });

  console.log('\n=== Verification ===');
  console.log('Deal OrgId:', draft.organizationId);
  console.log('Jane OrgId:', jane.organizationId);
  console.log('Orgs match:', draft.organizationId === jane.organizationId);
  console.log('Seller userId:', draft.seller?.userId);
  console.log('Jane ID:', jane.id);
  console.log('Seller matches Jane:', draft.seller?.userId === jane.id);

  await prisma.$disconnect();
}
fix();
