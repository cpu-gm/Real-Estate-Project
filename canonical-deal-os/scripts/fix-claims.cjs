const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function isValidJson(str) {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

async function fix() {
  const claims = await prisma.dealClaim.findMany({
    where: { dealDraftId: 'c4d46c8f-2786-438a-95b5-6cc93ccf9af2' }
  });

  console.log('Total claims:', claims.length);

  let fixedCount = 0;
  for (const claim of claims) {
    if (!isValidJson(claim.value)) {
      // Wrap the string value in JSON
      const jsonValue = JSON.stringify(claim.value);
      await prisma.dealClaim.update({
        where: { id: claim.id },
        data: { value: jsonValue }
      });
      console.log(`Fixed: ${claim.field} - "${claim.value}" -> ${jsonValue}`);
      fixedCount++;
    }
  }

  console.log('\nFixed', fixedCount, 'claims');

  await prisma.$disconnect();
}

fix();
