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

async function check() {
  const claims = await prisma.dealClaim.findMany({
    where: { dealDraftId: 'c4d46c8f-2786-438a-95b5-6cc93ccf9af2' }
  });

  console.log('Total claims:', claims.length);
  console.log('\nClaims with invalid JSON values:');

  const invalidClaims = claims.filter(c => !isValidJson(c.value));
  invalidClaims.forEach(c => {
    console.log(`- ${c.field}: "${c.value}"`);
  });

  console.log('\nInvalid count:', invalidClaims.length);

  await prisma.$disconnect();
}

check();
