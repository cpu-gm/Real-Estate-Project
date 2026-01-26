/**
 * Vendor Management Service
 *
 * Provides vendor CRUD, engagement tracking, performance analytics
 */

import { getPrisma } from '../../db.js';
const prisma = getPrisma();
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('legal:vendor-service');

// ===== VENDOR CRUD =====

export async function createVendor(organizationId, vendorData, createdBy) {
  logger.info('Creating vendor', { organizationId, vendorType: vendorData.vendorType });

  const vendor = await prisma.legalVendor.create({
    data: {
      organizationId,
      vendorType: vendorData.vendorType,
      name: vendorData.name,
      primaryContact: vendorData.primaryContact || null,
      email: vendorData.email || null,
      phone: vendorData.phone || null,
      address: vendorData.address || null,
      defaultRate: vendorData.defaultRate || null,
      rateNotes: vendorData.rateNotes || null,
    },
    include: {
      contacts: true,
      engagements: true
    }
  });

  logger.info('Vendor created successfully', { vendorId: vendor.id, name: vendor.name });
  return vendor;
}

export async function getVendor(vendorId, organizationId) {
  logger.debug('Fetching vendor', { vendorId, organizationId });

  const vendor = await prisma.legalVendor.findFirst({
    where: {
      id: vendorId,
      organizationId
    },
    include: {
      contacts: true,
      engagements: {
        orderBy: { createdAt: 'desc' },
        take: 50
      }
    }
  });

  if (!vendor) {
    logger.warn('Vendor not found', { vendorId, organizationId });
    return null;
  }

  // Calculate derived metrics
  const stats = await calculateVendorStats(vendorId, organizationId);

  return {
    ...vendor,
    stats
  };
}

export async function listVendors(organizationId, filters = {}) {
  logger.debug('Listing vendors', { organizationId, filters });

  const where = {
    organizationId
  };

  if (filters.vendorType) {
    where.vendorType = filters.vendorType;
  }

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { primaryContact: { contains: filters.search, mode: 'insensitive' } }
    ];
  }

  const vendors = await prisma.legalVendor.findMany({
    where,
    include: {
      _count: {
        select: {
          contacts: true,
          engagements: true
        }
      }
    },
    orderBy: { name: 'asc' }
  });

  logger.info('Vendors listed', { count: vendors.length, organizationId });
  return vendors;
}

// ===== ENGAGEMENT TRACKING =====

export async function createEngagement(vendorId, engagementData, organizationId) {
  logger.info('Creating vendor engagement', { vendorId, matterId: engagementData.matterId });

  // Verify vendor belongs to org
  const vendor = await prisma.legalVendor.findFirst({
    where: { id: vendorId, organizationId }
  });

  if (!vendor) {
    throw new Error('Vendor not found or does not belong to organization');
  }

  const engagement = await prisma.legalVendorEngagement.create({
    data: {
      vendorId,
      matterId: engagementData.matterId || null,
      dealId: engagementData.dealId || null,
      scope: engagementData.scope || null,
      estimatedCost: engagementData.estimatedCost || null,
      actualCost: engagementData.actualCost || null,
      status: engagementData.status || 'ACTIVE',
      startDate: engagementData.startDate ? new Date(engagementData.startDate) : null,
      endDate: engagementData.endDate ? new Date(engagementData.endDate) : null
    }
  });

  logger.info('Engagement created', { engagementId: engagement.id, vendorId });
  return engagement;
}

// ===== ANALYTICS =====

async function calculateVendorStats(vendorId, organizationId) {
  logger.debug('Calculating vendor stats', { vendorId });

  // Total engagements
  const totalEngagements = await prisma.legalVendorEngagement.count({
    where: { vendorId }
  });

  // Total spend
  const engagements = await prisma.legalVendorEngagement.findMany({
    where: { vendorId },
    select: { actualCost: true }
  });

  const totalSpend = engagements.reduce((sum, e) => sum + (e.actualCost || 0), 0);

  // Average review rating
  const reviews = await prisma.vendorReview.findMany({
    where: { vendorId, organizationId },
    select: { overallRating: true }
  });

  const averageRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + r.overallRating, 0) / reviews.length
    : null;

  // Active engagements
  const activeEngagements = await prisma.legalVendorEngagement.count({
    where: {
      vendorId,
      status: 'ACTIVE'
    }
  });

  return {
    totalEngagements,
    totalSpend,
    averageRating,
    activeEngagements,
    reviewCount: reviews.length
  };
}

export async function compareVendors(organizationId, vendorIds) {
  logger.info('Comparing vendors', { organizationId, vendorIds });

  const vendors = await Promise.all(
    vendorIds.map(id => getVendor(id, organizationId))
  );

  // Filter out nulls (vendors not found or not in org)
  const validVendors = vendors.filter(v => v !== null);

  logger.info('Vendor comparison complete', { count: validVendors.length });
  return validVendors;
}

// ===== PERFORMANCE REVIEWS =====

export async function addVendorReview(vendorId, reviewData, organizationId, reviewedBy, reviewedByName) {
  logger.info('Adding vendor review', { vendorId, reviewedBy });

  const review = await prisma.vendorReview.create({
    data: {
      vendorId,
      organizationId,
      reviewedBy,
      reviewedByName,
      engagementId: reviewData.engagementId || null,
      qualityRating: reviewData.qualityRating || null,
      timelinessRating: reviewData.timelinessRating || null,
      communicationRating: reviewData.communicationRating || null,
      valueRating: reviewData.valueRating || null,
      overallRating: reviewData.overallRating,
      strengths: reviewData.strengths || null,
      weaknesses: reviewData.weaknesses || null,
      notes: reviewData.notes || null,
      wouldUseAgain: reviewData.wouldUseAgain || null
    }
  });

  // Update vendor's average rating
  await updateVendorRating(vendorId);

  logger.info('Vendor review added', { reviewId: review.id, vendorId });
  return review;
}

async function updateVendorRating(vendorId) {
  const reviews = await prisma.vendorReview.findMany({
    where: { vendorId },
    select: { overallRating: true }
  });

  if (reviews.length === 0) return;

  const averageRating = reviews.reduce((sum, r) => sum + r.overallRating, 0) / reviews.length;

  await prisma.legalVendor.update({
    where: { id: vendorId },
    data: { rating: averageRating }
  });

  logger.debug('Vendor rating updated', { vendorId, averageRating });
}
