/**
 * Entity Management Service
 *
 * Provides entity CRUD, ownership tracking, filing reminders
 */

import { getPrisma } from '../../db.js';
const prisma = getPrisma();
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('legal:entity-service');

// ===== ENTITY CRUD =====

export async function createEntity(organizationId, entityData, createdBy) {
  logger.info('Creating legal entity', { organizationId, entityType: entityData.entityType });

  const entity = await prisma.legalEntity.create({
    data: {
      organizationId,
      name: entityData.name,
      entityType: entityData.entityType,
      jurisdiction: entityData.jurisdiction || null,
      einNumber: entityData.einNumber || null,
      status: entityData.status || 'ACTIVE',
      formationDate: entityData.formationDate ? new Date(entityData.formationDate) : null,
      registeredAgent: entityData.registeredAgent || null,
      registeredAddress: entityData.registeredAddress || null,
      ownershipStructure: entityData.ownershipStructure ? JSON.stringify(entityData.ownershipStructure) : null,
      parentEntityId: entityData.parentEntityId || null,
      nextAnnualFiling: entityData.nextAnnualFiling ? new Date(entityData.nextAnnualFiling) : null
    },
    include: {
      documents: true
    }
  });

  logger.info('Entity created', { entityId: entity.id, name: entity.name });
  return entity;
}

export async function getEntity(entityId, organizationId) {
  logger.debug('Fetching entity', { entityId, organizationId });

  const entity = await prisma.legalEntity.findFirst({
    where: {
      id: entityId,
      organizationId
    },
    include: {
      documents: {
        orderBy: { addedAt: 'desc' }
      }
    }
  });

  if (!entity) {
    logger.warn('Entity not found', { entityId, organizationId });
    return null;
  }

  // Parse ownership structure
  if (entity.ownershipStructure) {
    try {
      entity.ownershipStructure = JSON.parse(entity.ownershipStructure);
    } catch (err) {
      logger.error('Failed to parse ownership structure', { entityId, error: err.message });
      entity.ownershipStructure = null;
    }
  }

  return entity;
}

export async function listEntities(organizationId, filters = {}) {
  logger.debug('Listing entities', { organizationId, filters });

  const where = {
    organizationId
  };

  if (filters.entityType) {
    where.entityType = filters.entityType;
  }

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { einNumber: { contains: filters.search, mode: 'insensitive' } }
    ];
  }

  const entities = await prisma.legalEntity.findMany({
    where,
    include: {
      _count: {
        select: {
          documents: true
        }
      }
    },
    orderBy: { name: 'asc' }
  });

  logger.info('Entities listed', { count: entities.length, organizationId });
  return entities;
}

// ===== OWNERSHIP STRUCTURE =====

export async function getOrgChart(entityId, organizationId) {
  logger.debug('Building org chart', { entityId, organizationId });

  const entity = await getEntity(entityId, organizationId);
  if (!entity) return null;

  // Build tree structure
  const tree = {
    entity: {
      id: entity.id,
      name: entity.name,
      entityType: entity.entityType,
      ownership: entity.ownershipStructure || []
    },
    children: []
  };

  // Find child entities (where parentEntityId = entityId)
  const children = await prisma.legalEntity.findMany({
    where: {
      parentEntityId: entityId,
      organizationId
    }
  });

  // Recursively build subtrees
  for (const child of children) {
    const subtree = await getOrgChart(child.id, organizationId);
    if (subtree) {
      tree.children.push(subtree);
    }
  }

  logger.debug('Org chart built', { entityId, childCount: tree.children.length });
  return tree;
}

// ===== FILING REMINDERS =====

export async function getFilingReminders(organizationId, daysAhead = 90) {
  logger.debug('Fetching filing reminders', { organizationId, daysAhead });

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() + daysAhead);

  const entities = await prisma.legalEntity.findMany({
    where: {
      organizationId,
      status: 'ACTIVE',
      nextAnnualFiling: {
        lte: cutoffDate,
        gte: new Date()
      }
    },
    orderBy: {
      nextAnnualFiling: 'asc'
    }
  });

  logger.info('Filing reminders fetched', { count: entities.length, organizationId });
  return entities;
}

// ===== RELATED DEALS =====

export async function getRelatedDeals(entityId, organizationId) {
  logger.debug('Fetching related deals', { entityId, organizationId });

  // Find legal matters linked to this entity
  const matters = await prisma.legalMatter.findMany({
    where: {
      entityId,
      organizationId
    },
    select: {
      dealId: true
    }
  });

  const dealIds = [...new Set(matters.map(m => m.dealId).filter(Boolean))];

  logger.info('Related deals found', { entityId, dealCount: dealIds.length });
  return { dealIds };
}
