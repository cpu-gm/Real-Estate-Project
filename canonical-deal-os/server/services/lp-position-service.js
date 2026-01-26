/**
 * LP Position Service - Single Source of Truth
 *
 * Computes LP financial position by aggregating ACTUAL data from:
 * - LPActor (base commitment)
 * - CapitalCallAllocation (funded amounts)
 * - DistributionAllocation (received amounts)
 * - LPTransfer (in/out transfers)
 *
 * This replaces the broken pattern of reading non-existent fields
 * like `lp.capitalContributed` which always returned undefined/0.
 *
 * @module services/lp-position-service
 */

import { getPrisma } from '../db.js';
import { createIntegrityLogger, INTEGRITY_OPERATIONS, INVARIANTS } from './integrity-logger.js';

/**
 * Compute LP financial position from actual funded allocations
 *
 * @param {string} lpActorId - The LP actor ID
 * @param {string} dealId - The deal ID
 * @param {Object} [options] - Options
 * @param {Object} [options.logger] - Existing logger to use
 * @param {string} [options.requestId] - Request ID for correlation
 * @param {boolean} [options.skipFlush] - Skip flushing logs (for batch operations)
 * @returns {Promise<Object|null>} LP position or null if not found
 *
 * @example
 * const position = await computeLPPosition('lp-123', 'deal-456');
 * // Returns:
 * // {
 * //   lpActorId: 'lp-123',
 * //   dealId: 'deal-456',
 * //   commitment: 100000,
 * //   capitalContributed: 60000,  // Sum of FUNDED allocations
 * //   capitalRemaining: 40000,     // commitment - capitalContributed
 * //   totalDistributed: 5000,      // Sum of PAID distributions
 * //   netTransfers: 0,             // Transfers in - transfers out
 * //   netPosition: 55000,          // capitalContributed - totalDistributed
 * //   ...
 * // }
 */
export async function computeLPPosition(lpActorId, dealId, options = {}) {
  const prisma = getPrisma();
  const logger = options.logger || createIntegrityLogger({
    operation: INTEGRITY_OPERATIONS.LP_POSITION_COMPUTE,
    dealId,
    requestId: options.requestId
  });

  logger.info('Computing LP position', { lpActorId, dealId });

  // 1. Get base LP data with share class
  const lpActor = await prisma.lPActor.findUnique({
    where: { id: lpActorId },
    include: { shareClass: true }
  });

  if (!lpActor) {
    logger.warn('LP actor not found', { lpActorId });
    if (!options.skipFlush) await logger.flush();
    return null;
  }

  if (lpActor.dealId !== dealId) {
    logger.error('LP actor dealId mismatch', {
      lpActorId,
      expectedDealId: dealId,
      actualDealId: lpActor.dealId
    });
    if (!options.skipFlush) await logger.flush();
    return null;
  }

  logger.beforeState('lpActor', {
    id: lpActor.id,
    commitment: lpActor.commitment,
    ownershipPct: lpActor.ownershipPct,
    status: lpActor.status
  });

  // 2. Sum FUNDED capital call allocations (ONLY FUNDED status)
  const capitalCalls = await prisma.capitalCallAllocation.findMany({
    where: {
      lpActorId,
      status: 'FUNDED'
    }
  });

  const capitalContributed = capitalCalls.reduce(
    (sum, cc) => sum + (cc.fundedAmount || 0),
    0
  );

  logger.computedValue('capitalContributed', capitalContributed, {
    fundedAllocations: capitalCalls.length,
    allocations: capitalCalls.map(cc => ({ id: cc.id, fundedAmount: cc.fundedAmount }))
  });

  // 3. Sum PAID distribution allocations
  const distributions = await prisma.distributionAllocation.findMany({
    where: {
      lpActorId,
      status: 'PAID'
    }
  });

  const totalDistributed = distributions.reduce(
    (sum, d) => sum + (d.netAmount || 0),
    0
  );

  logger.computedValue('totalDistributed', totalDistributed, {
    paidDistributions: distributions.length
  });

  // 4. Calculate completed transfers (net in - out)
  const [transfersOut, transfersIn] = await Promise.all([
    prisma.lPTransfer.findMany({
      where: { fromLpActorId: lpActorId, status: 'COMPLETED' }
    }),
    prisma.lPTransfer.findMany({
      where: { toLpActorId: lpActorId, status: 'COMPLETED' }
    })
  ]);

  const transferredIn = transfersIn.reduce((sum, t) => sum + (t.transferAmount || 0), 0);
  const transferredOut = transfersOut.reduce((sum, t) => sum + (t.transferAmount || 0), 0);
  const netTransfers = transferredIn - transferredOut;

  logger.computedValue('netTransfers', netTransfers, {
    transferredIn,
    transferredOut,
    transfersInCount: transfersIn.length,
    transfersOutCount: transfersOut.length
  });

  // 5. Build position object
  const position = {
    lpActorId,
    dealId,
    entityName: lpActor.entityName,
    email: lpActor.email,
    commitment: lpActor.commitment,
    ownershipPct: lpActor.ownershipPct,
    capitalContributed,                           // DERIVED - not from lpActor field
    capitalRemaining: lpActor.commitment - capitalContributed,
    totalDistributed,
    netTransfers,
    netPosition: capitalContributed - totalDistributed,
    shareClass: lpActor.shareClass,
    status: lpActor.status,
    computedAt: new Date().toISOString(),
    source: 'computed'  // vs 'rollup' in future
  };

  // 6. Invariant checks
  logger.invariantCheck(
    INVARIANTS.CAPITAL_CONTRIBUTED_NON_NEGATIVE,
    capitalContributed >= 0,
    { capitalContributed }
  );

  logger.invariantCheck(
    INVARIANTS.CAPITAL_CONTRIBUTED_LTE_COMMITMENT,
    capitalContributed <= lpActor.commitment * 1.001,  // 0.1% tolerance for rounding
    { capitalContributed, commitment: lpActor.commitment }
  );

  logger.afterState('position', position);

  if (!options.skipFlush) {
    await logger.flush();
  }

  return position;
}

/**
 * Batch compute all LP positions for a deal
 * Used by waterfall calculator and distribution creation
 *
 * @param {string} dealId - Deal ID
 * @param {Object} [options] - Options
 * @param {Object} [options.logger] - Existing logger
 * @param {string} [options.requestId] - Request ID
 * @param {boolean} [options.includeInactive] - Include inactive LPs (default: false)
 * @returns {Promise<Array<Object>>} Array of LP positions
 */
export async function computeAllLPPositions(dealId, options = {}) {
  const prisma = getPrisma();
  const logger = options.logger || createIntegrityLogger({
    operation: INTEGRITY_OPERATIONS.LP_POSITION_COMPUTE,
    dealId,
    requestId: options.requestId
  });

  logger.info('Computing all LP positions for deal', { dealId });

  // Get all LPs for the deal
  const whereClause = {
    dealId,
    ...(options.includeInactive ? {} : { status: 'ACTIVE' })
  };

  const lpActors = await prisma.lPActor.findMany({
    where: whereClause,
    select: { id: true }
  });

  logger.info('Found LP actors', { count: lpActors.length });

  // Compute each position
  const positions = [];
  for (const lp of lpActors) {
    const position = await computeLPPosition(lp.id, dealId, {
      ...options,
      logger,
      skipFlush: true
    });
    if (position) {
      positions.push(position);
    }
  }

  // Invariant: total ownership should be ~100% (for active LPs only)
  if (!options.includeInactive) {
    const totalOwnership = positions.reduce((sum, p) => sum + (p.ownershipPct || 0), 0);
    logger.invariantCheck(
      INVARIANTS.TOTAL_OWNERSHIP_APPROXIMATELY_100,
      Math.abs(totalOwnership - 100) < 1,  // 1% tolerance
      { totalOwnership, lpCount: positions.length }
    );
  }

  // Invariant: total capital contributed should be <= total commitments
  const totalCommitment = positions.reduce((sum, p) => sum + (p.commitment || 0), 0);
  const totalCapitalContributed = positions.reduce((sum, p) => sum + (p.capitalContributed || 0), 0);
  logger.invariantCheck(
    'TOTAL_CAPITAL_LTE_COMMITMENT',
    totalCapitalContributed <= totalCommitment * 1.001,
    { totalCapitalContributed, totalCommitment }
  );

  logger.afterState('positions', {
    count: positions.length,
    totalCommitment,
    totalCapitalContributed,
    totalOwnership: positions.reduce((sum, p) => sum + (p.ownershipPct || 0), 0)
  });

  if (!options.skipFlush) {
    await logger.flush();
  }

  return positions;
}

/**
 * Validate that a position matches what we'd compute from facts
 * Used by reconciliation job
 *
 * @param {string} lpActorId - LP actor ID
 * @param {string} dealId - Deal ID
 * @param {Object} expectedPosition - Expected position values
 * @returns {Promise<Object>} Validation result
 */
export async function validatePosition(lpActorId, dealId, expectedPosition) {
  const computed = await computeLPPosition(lpActorId, dealId, { skipFlush: true });

  if (!computed) {
    return { valid: false, reason: 'LP not found' };
  }

  const toleranceCents = 1;  // $0.01 tolerance

  const checks = [
    {
      field: 'capitalContributed',
      expected: expectedPosition.capitalContributed,
      actual: computed.capitalContributed
    },
    {
      field: 'totalDistributed',
      expected: expectedPosition.totalDistributed,
      actual: computed.totalDistributed
    },
    {
      field: 'capitalRemaining',
      expected: expectedPosition.capitalRemaining,
      actual: computed.capitalRemaining
    }
  ];

  const mismatches = checks.filter(c =>
    Math.abs((c.expected || 0) - (c.actual || 0)) > toleranceCents / 100
  );

  return {
    valid: mismatches.length === 0,
    mismatches,
    computed,
    expected: expectedPosition
  };
}

/**
 * Get LP positions formatted for waterfall input
 * This is the direct replacement for the broken code that read undefined fields
 *
 * @param {string} dealId - Deal ID
 * @param {Object} [options] - Options
 * @returns {Promise<Array<Object>>} Positions formatted for waterfall
 */
export async function getLPPositionsForWaterfall(dealId, options = {}) {
  const positions = await computeAllLPPositions(dealId, options);

  // Format for waterfall calculator compatibility
  return positions.map(pos => ({
    lpActorId: pos.lpActorId,
    entityName: pos.entityName,
    ownershipPct: pos.ownershipPct || 0,
    commitment: pos.commitment || 0,
    capitalContributed: pos.capitalContributed,  // Now correct! (not undefined)
    capitalRemaining: pos.capitalRemaining,       // Now correct! (not undefined)
    shareClass: pos.shareClass
  }));
}
