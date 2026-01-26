const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createMockDeal() {
  // Using Jane GP from Canonical Capital
  const gpUserId = '76e5414b-e22b-4783-bb44-acd54ad9eb3c';
  const orgId = '2bbcc0eb-2a92-47af-8498-bb4300f3f78b';

  // 1. Create the DealDraft - NOT listed, just in portfolio
  const dealDraft = await prisma.dealDraft.create({
    data: {
      organizationId: orgId,
      status: 'DRAFT_INGESTED',  // Not active/listed yet
      ingestSource: 'UPLOAD',
      propertyName: 'Sunset Ridge Apartments',
      propertyAddress: '4521 Sunset Boulevard, Austin, TX 78746',
      assetType: 'Multifamily',
      askingPrice: null,  // No asking price yet - not for sale
      unitCount: 156,
      totalSF: 148500,
      listingType: null,  // Not listed
      isAnonymousSeller: false,
    }
  });

  console.log('Created DealDraft:', dealDraft.id);

  // 2. Create the Seller/Owner record
  const seller = await prisma.dealDraftSeller.create({
    data: {
      dealDraftId: dealDraft.id,
      userId: gpUserId,
      email: 'jane.gp@canonical.com',
      name: 'Jane GP',
      entityName: 'Canonical Capital Holdings LLC',
      hasDirectAccess: true,
      receiveNotifications: true,
      requiresOMApproval: true,
      requiresBuyerApproval: false,
      sellerSeesBuyerIdentity: true,
    }
  });

  console.log('Created Owner/Seller:', seller.id);

  // 3. Create DealClaims for all property data
  const claims = [
    // Property Facts (SELLER_ATTESTED)
    { field: 'propertyName', value: 'Sunset Ridge Apartments', displayValue: 'Sunset Ridge Apartments', badge: 'SELLER_ATTESTED' },
    { field: 'address', value: '4521 Sunset Boulevard', displayValue: '4521 Sunset Boulevard', badge: 'SELLER_ATTESTED' },
    { field: 'city', value: 'Austin', displayValue: 'Austin', badge: 'SELLER_ATTESTED' },
    { field: 'state', value: 'TX', displayValue: 'TX', badge: 'SELLER_ATTESTED' },
    { field: 'zipCode', value: '78746', displayValue: '78746', badge: 'SELLER_ATTESTED' },
    { field: 'county', value: 'Travis', displayValue: 'Travis County', badge: 'THIRD_PARTY' },
    { field: 'yearBuilt', value: '2008', displayValue: '2008', badge: 'DOCUMENT_VERIFIED' },
    { field: 'assetClass', value: 'B', displayValue: 'Class B', badge: 'SELLER_ATTESTED' },
    { field: 'stories', value: '3', displayValue: '3 Stories', badge: 'SELLER_ATTESTED' },

    // Unit Details
    { field: 'unitCount', value: '156', displayValue: '156 Units', badge: 'DOCUMENT_VERIFIED' },
    { field: 'totalSF', value: '148500', displayValue: '148,500 SF', badge: 'DOCUMENT_VERIFIED' },
    { field: 'avgUnitSF', value: '952', displayValue: '952 SF/Unit', badge: 'DOCUMENT_VERIFIED' },
    { field: 'lotSize', value: '8.2', displayValue: '8.2 Acres', badge: 'THIRD_PARTY' },

    // Unit Mix
    { field: 'unitMix1BR', value: JSON.stringify({ type: '1BR/1BA', count: 48, avgSF: 725, currentRent: 1350 }), displayValue: '48 1BR/1BA @ $1,350', badge: 'DOCUMENT_VERIFIED' },
    { field: 'unitMix2BR', value: JSON.stringify({ type: '2BR/2BA', count: 84, avgSF: 1050, currentRent: 1750 }), displayValue: '84 2BR/2BA @ $1,750', badge: 'DOCUMENT_VERIFIED' },
    { field: 'unitMix3BR', value: JSON.stringify({ type: '3BR/2BA', count: 24, avgSF: 1350, currentRent: 2150 }), displayValue: '24 3BR/2BA @ $2,150', badge: 'DOCUMENT_VERIFIED' },

    // Current Financials (from T-12)
    { field: 'currentNOI', value: '1950000', displayValue: '$1,950,000', badge: 'DOCUMENT_VERIFIED' },
    { field: 'grossRevenue', value: '3250000', displayValue: '$3,250,000', badge: 'DOCUMENT_VERIFIED' },
    { field: 'operatingExpenses', value: '1300000', displayValue: '$1,300,000', badge: 'DOCUMENT_VERIFIED' },
    { field: 'occupancy', value: '94.2', displayValue: '94.2%', badge: 'DOCUMENT_VERIFIED' },
    { field: 'avgRent', value: '1650', displayValue: '$1,650/month', badge: 'DOCUMENT_VERIFIED' },
    { field: 'expenseRatio', value: '40', displayValue: '40%', badge: 'DOCUMENT_VERIFIED' },

    // Acquisition Info (Historical)
    { field: 'acquisitionDate', value: '2019-06-15', displayValue: 'June 2019', badge: 'SELLER_ATTESTED' },
    { field: 'acquisitionPrice', value: '24500000', displayValue: '$24,500,000', badge: 'SELLER_ATTESTED' },
    { field: 'acquisitionCapRate', value: '5.8', displayValue: '5.8%', badge: 'SELLER_ATTESTED' },

    // Current Value Estimate
    { field: 'estimatedValue', value: '32500000', displayValue: '$32,500,000', badge: 'BROKER_ASSUMPTION' },
    { field: 'estimatedCapRate', value: '6.0', displayValue: '6.0%', badge: 'BROKER_ASSUMPTION' },
    { field: 'pricePerUnit', value: '208333', displayValue: '$208,333/Unit', badge: 'BROKER_ASSUMPTION' },
    { field: 'pricePerSF', value: '219', displayValue: '$219/SF', badge: 'BROKER_ASSUMPTION' },

    // Debt Info
    { field: 'loanBalance', value: '18200000', displayValue: '$18,200,000', badge: 'SELLER_ATTESTED' },
    { field: 'interestRate', value: '4.25', displayValue: '4.25%', badge: 'SELLER_ATTESTED' },
    { field: 'loanMaturity', value: '2029-06-01', displayValue: 'June 2029', badge: 'SELLER_ATTESTED' },
    { field: 'lender', value: 'Wells Fargo', displayValue: 'Wells Fargo', badge: 'SELLER_ATTESTED' },

    // Market Data (Third Party)
    { field: 'marketVacancy', value: '4.8', displayValue: '4.8%', badge: 'THIRD_PARTY' },
    { field: 'marketRentGrowth', value: '4.2', displayValue: '4.2% YoY', badge: 'THIRD_PARTY' },
    { field: 'submarket', value: 'West Austin', displayValue: 'West Austin', badge: 'THIRD_PARTY' },

    // Amenities
    { field: 'amenities', value: JSON.stringify(['Pool', 'Fitness Center', 'Dog Park', 'Covered Parking', 'Business Center', 'BBQ Area', 'Playground']), displayValue: 'Pool, Fitness Center, Dog Park, +4 more', badge: 'SELLER_ATTESTED' },

    // Recent Improvements
    { field: 'recentCapEx', value: JSON.stringify([
      { year: 2022, item: 'New roof', cost: 185000 },
      { year: 2021, item: 'HVAC upgrades', cost: 95000 },
      { year: 2023, item: 'LED lighting retrofit', cost: 42000 },
      { year: 2023, item: 'Pool renovation', cost: 65000 }
    ]), displayValue: '$387,000 in recent CapEx', badge: 'SELLER_ATTESTED' },
  ];

  for (const claim of claims) {
    await prisma.dealClaim.create({
      data: {
        dealDraftId: dealDraft.id,
        field: claim.field,
        value: claim.value,
        displayValue: claim.displayValue,
        extractionMethod: 'MANUAL',
        confidence: claim.badge === 'BROKER_ASSUMPTION' ? 0.7 : 0.95,
        status: 'BROKER_CONFIRMED',
        verificationBadge: claim.badge,
      }
    });
  }

  console.log('Created', claims.length, 'DealClaims');

  // Return the final deal with relations
  const result = await prisma.dealDraft.findUnique({
    where: { id: dealDraft.id },
    include: {
      seller: true,
      claims: true,
    }
  });

  console.log('\n=== Portfolio Property Created Successfully ===');
  console.log('Deal ID:', result.id);
  console.log('Property:', result.propertyName);
  console.log('Address:', result.propertyAddress);
  console.log('Asset Type:', result.assetType);
  console.log('Units:', result.unitCount);
  console.log('Total SF:', result.totalSF?.toLocaleString());
  console.log('Status:', result.status, '(Portfolio - Not Listed)');
  console.log('Owner:', result.seller?.name);
  console.log('Entity:', result.seller?.entityName);
  console.log('Data Points:', result.claims.length);

  // Summary of financials
  const noiClaim = result.claims.find(c => c.field === 'currentNOI');
  const valueClaim = result.claims.find(c => c.field === 'estimatedValue');
  const loanClaim = result.claims.find(c => c.field === 'loanBalance');

  console.log('\n--- Financial Summary ---');
  console.log('Current NOI:', noiClaim?.displayValue);
  console.log('Estimated Value:', valueClaim?.displayValue);
  console.log('Loan Balance:', loanClaim?.displayValue);
  console.log('Equity:', '$' + ((parseFloat(valueClaim?.value || 0) - parseFloat(loanClaim?.value || 0)) / 1000000).toFixed(1) + 'M');

  return result;
}

createMockDeal()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
