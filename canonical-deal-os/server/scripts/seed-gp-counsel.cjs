/**
 * Seed GP Counsel test users for development and E2E testing
 *
 * Creates:
 * - GP Counsel user (gpcounsel@test.com)
 * - General Counsel user (gc@test.com)
 * - Sample legal matters for testing
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

// Simple password hashing (matches auth.js pattern)
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function main() {
  console.log('Seeding GP Counsel users and test data...');

  // Get or create an organization
  let org = await prisma.organization.findFirst({
    where: { name: 'Test Organization' }
  });

  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: 'Test Organization',
        slug: 'test-org'
      }
    });
    console.log('Created organization:', org.id);
  }

  // Create GP Counsel user
  let gpCounselUser = await prisma.authUser.findFirst({
    where: { email: 'gpcounsel@test.com' }
  });
  if (!gpCounselUser) {
    gpCounselUser = await prisma.authUser.create({
      data: {
        email: 'gpcounsel@test.com',
        name: 'Alex Counsel',
        passwordHash: hashPassword('test123'),
        role: 'GP Counsel',
        status: 'ACTIVE',
        organizationId: org.id
      }
    });
    console.log('Created GP Counsel user:', gpCounselUser.email);
  } else {
    console.log('GP Counsel user already exists:', gpCounselUser.email);
  }

  // Create General Counsel user
  let gcUser = await prisma.authUser.findFirst({
    where: { email: 'gc@test.com' }
  });
  if (!gcUser) {
    gcUser = await prisma.authUser.create({
      data: {
        email: 'gc@test.com',
        name: 'Jordan GeneralCounsel',
        passwordHash: hashPassword('test123'),
        role: 'General Counsel',
        status: 'ACTIVE',
        organizationId: org.id
      }
    });
    console.log('Created General Counsel user:', gcUser.email);
  } else {
    console.log('General Counsel user already exists:', gcUser.email);
  }

  // Create sample legal matters
  const sampleMatters = [
    {
      title: 'PSA Review - Oak Tower Acquisition',
      matterType: 'DEAL_SPECIFIC',
      subType: 'psa_review',
      stage: 'NEW',
      priority: 'HIGH',
      description: 'Review purchase and sale agreement for Oak Tower property acquisition.',
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
      dealName: 'Oak Tower'
    },
    {
      title: 'Title Due Diligence - Pine Complex',
      matterType: 'DEAL_SPECIFIC',
      subType: 'due_diligence',
      stage: 'IN_PROGRESS',
      priority: 'NORMAL',
      description: 'Complete title examination and resolve any issues.',
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
      assignedTo: gpCounselUser.id,
      assignedToName: gpCounselUser.name,
      dealName: 'Pine Complex'
    },
    {
      title: 'LLC Formation - SPV for Maple Investment',
      matterType: 'ENTITY_CORPORATE',
      subType: 'llc_formation',
      stage: 'IN_PROGRESS',
      priority: 'NORMAL',
      description: 'Form new LLC to hold Maple Street investment property.',
      dueDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000) // 12 days from now
    },
    {
      title: 'LP Side Letter Review',
      matterType: 'INVESTOR_RELATIONS',
      subType: 'side_letter',
      stage: 'NEW',
      priority: 'LOW',
      description: 'Review proposed side letter terms for new LP investor.',
      targetDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days from now
    },
    {
      title: 'Annual Compliance Filings',
      matterType: 'ONGOING_RECURRING',
      subType: 'compliance',
      stage: 'NEW',
      priority: 'NORMAL',
      description: 'Complete annual state filings for all portfolio entities.',
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
    },
    {
      title: 'LOI Review - Elm Center',
      matterType: 'DEAL_SPECIFIC',
      subType: 'loi_review',
      stage: 'COMPLETE',
      priority: 'NORMAL',
      description: 'Letter of Intent review completed.',
      closedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
      dealName: 'Elm Center'
    }
  ];

  const year = new Date().getFullYear();
  let seq = 1;

  for (const matterData of sampleMatters) {
    const matterNumber = `TES-${year}-${String(seq).padStart(4, '0')}`;
    seq++;

    const matter = await prisma.legalMatter.create({
      data: {
        organizationId: org.id,
        matterNumber,
        title: matterData.title,
        description: matterData.description,
        matterType: matterData.matterType,
        subType: matterData.subType,
        stage: matterData.stage,
        priority: matterData.priority,
        dueDate: matterData.dueDate || null,
        targetDate: matterData.targetDate || null,
        closedAt: matterData.closedAt || null,
        assignedTo: matterData.assignedTo || null,
        assignedToName: matterData.assignedToName || null,
        dealName: matterData.dealName || null,
        createdBy: gpCounselUser.id,
        createdByName: gpCounselUser.name,
        stageEnteredAt: new Date()
      }
    });

    // Add initial activity
    await prisma.legalMatterActivity.create({
      data: {
        matterId: matter.id,
        activityType: 'STATUS_CHANGE',
        content: 'Matter created',
        newValue: matterData.stage,
        createdBy: gpCounselUser.id,
        createdByName: gpCounselUser.name
      }
    });

    console.log(`Created matter: ${matterNumber} - ${matterData.title}`);
  }

  console.log('\nSeed completed successfully!');
  console.log('\nTest accounts:');
  console.log('  GP Counsel: gpcounsel@test.com / test123');
  console.log('  General Counsel: gc@test.com / test123');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
