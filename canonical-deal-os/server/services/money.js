/**
 * Money Service - Cents-Based Calculations
 *
 * All financial calculations use integer cents internally.
 * This eliminates floating-point rounding errors that cause
 * allocation sums to not match totals.
 *
 * Example problem solved:
 *   $100 / 3 = $33.333...
 *   3 × $33.33 = $99.99 (1 cent lost!)
 *
 * With cents allocation:
 *   10000¢ / 3 = 3333¢, 3333¢, 3334¢ (last gets remainder)
 *   Sum = 10000¢ exactly
 *
 * @module services/money
 */

/**
 * Convert dollars to integer cents
 * @param {number} dollars - Dollar amount (e.g., 100.50)
 * @returns {number} Integer cents (e.g., 10050)
 * @throws {Error} If dollars is not a valid number
 *
 * @example
 * dollarsToCents(100.50)  // Returns 10050
 * dollarsToCents(33.33)   // Returns 3333
 */
export function dollarsToCents(dollars) {
  if (typeof dollars !== 'number' || isNaN(dollars)) {
    throw new Error(`Invalid dollar amount: ${dollars}`);
  }
  // Round to avoid floating point issues like 100.10 * 100 = 10009.999999
  return Math.round(dollars * 100);
}

/**
 * Convert integer cents to dollars
 * @param {number} cents - Integer cents (e.g., 10050)
 * @returns {number} Dollar amount (e.g., 100.50)
 * @throws {Error} If cents is not an integer
 *
 * @example
 * centsToDollars(10050)  // Returns 100.50
 * centsToDollars(1)      // Returns 0.01
 */
export function centsToDollars(cents) {
  if (!Number.isInteger(cents)) {
    throw new Error(`Cents must be integer: ${cents}`);
  }
  return cents / 100;
}

/**
 * Allocate cents across recipients with guaranteed exact sum
 * Uses largest remainder method for fair distribution
 *
 * @param {number} totalCents - Total cents to allocate (integer)
 * @param {Array<{id: string, weight: number}>} recipients - Recipients with weights (0-1 or any positive values)
 * @returns {Array<{id: string, cents: number, dollars: number}>} Allocations
 *
 * @example
 * allocateCents(10000, [
 *   { id: 'lp1', weight: 0.6 },
 *   { id: 'lp2', weight: 0.4 }
 * ])
 * // Returns: [{ id: 'lp1', cents: 6000, dollars: 60 }, { id: 'lp2', cents: 4000, dollars: 40 }]
 *
 * @example
 * // Handles thirds correctly (classic floating point problem)
 * allocateCents(10000, [
 *   { id: 'a', weight: 1 },
 *   { id: 'b', weight: 1 },
 *   { id: 'c', weight: 1 }
 * ])
 * // Returns: cents are [3333, 3333, 3334] - sum is exactly 10000
 */
export function allocateCents(totalCents, recipients) {
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new Error(`totalCents must be non-negative integer: ${totalCents}`);
  }

  if (!recipients || recipients.length === 0) {
    return [];
  }

  // Normalize weights to sum to 1
  const totalWeight = recipients.reduce((sum, r) => sum + (r.weight || 0), 0);
  if (totalWeight <= 0) {
    throw new Error('Total weight must be positive');
  }

  // Calculate initial allocation and remainders
  const allocations = recipients.map(r => {
    const normalizedWeight = (r.weight || 0) / totalWeight;
    const exactCents = totalCents * normalizedWeight;
    const baseCents = Math.floor(exactCents);
    const remainder = exactCents - baseCents;

    return {
      id: r.id,
      baseCents,
      remainder,
      finalCents: baseCents
    };
  });

  // Distribute remaining cents using largest remainder method
  const distributedCents = allocations.reduce((sum, a) => sum + a.baseCents, 0);
  let remainingCents = totalCents - distributedCents;

  // Sort by remainder descending, give 1 cent to each until exhausted
  const sortedByRemainder = [...allocations].sort((a, b) => b.remainder - a.remainder);

  for (const alloc of sortedByRemainder) {
    if (remainingCents <= 0) break;
    alloc.finalCents += 1;
    remainingCents -= 1;
  }

  // Build final result
  return allocations.map(a => ({
    id: a.id,
    cents: a.finalCents,
    dollars: centsToDollars(a.finalCents)
  }));
}

/**
 * Validate that allocation sum equals expected total
 * @param {Array<{cents: number}>} allocations - Allocations to validate
 * @param {number} expectedTotalCents - Expected total in cents
 * @returns {{valid: boolean, sum: number, diff: number}} Validation result
 *
 * @example
 * validateAllocationSum([{ cents: 6000 }, { cents: 4000 }], 10000)
 * // Returns: { valid: true, sum: 10000, expectedTotalCents: 10000, diff: 0 }
 */
export function validateAllocationSum(allocations, expectedTotalCents) {
  const sum = allocations.reduce((s, a) => s + a.cents, 0);
  const diff = sum - expectedTotalCents;

  return {
    valid: diff === 0,
    sum,
    expectedTotalCents,
    diff
  };
}

/**
 * Round dollars to 2 decimal places (for display only)
 * @param {number} dollars - Dollar amount
 * @returns {number} Rounded dollar amount
 *
 * @example
 * roundDollars(33.333333)  // Returns 33.33
 */
export function roundDollars(dollars) {
  return Math.round(dollars * 100) / 100;
}

/**
 * Format cents as dollar string for display
 * @param {number} cents - Integer cents
 * @returns {string} Formatted string (e.g., "$1,234.56")
 *
 * @example
 * formatCentsAsDollars(123456)  // Returns "$1,234.56"
 */
export function formatCentsAsDollars(cents) {
  const dollars = centsToDollars(cents);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(dollars);
}

/**
 * Allocate dollars across recipients with exact sum guarantee
 * Convenience wrapper that handles dollar-to-cents conversion
 *
 * @param {number} totalDollars - Total dollars to allocate
 * @param {Array<{id: string, weight: number}>} recipients - Recipients with weights
 * @returns {Array<{id: string, cents: number, dollars: number}>} Allocations
 *
 * @example
 * allocateDollars(100, [
 *   { id: 'lp1', weight: 60 },
 *   { id: 'lp2', weight: 40 }
 * ])
 * // Returns: [{ id: 'lp1', cents: 6000, dollars: 60 }, { id: 'lp2', cents: 4000, dollars: 40 }]
 */
export function allocateDollars(totalDollars, recipients) {
  const totalCents = dollarsToCents(totalDollars);
  return allocateCents(totalCents, recipients);
}

/**
 * Calculate pro-rata allocation based on ownership percentages
 *
 * @param {number} totalDollars - Total dollars to allocate
 * @param {Array<{id: string, ownershipPct: number}>} lpActors - LPs with ownership percentages
 * @returns {Array<{id: string, cents: number, dollars: number}>} Allocations
 *
 * @example
 * proRataAllocation(100000, [
 *   { id: 'lp1', ownershipPct: 60 },
 *   { id: 'lp2', ownershipPct: 40 }
 * ])
 * // Returns exact allocations that sum to 100000
 */
export function proRataAllocation(totalDollars, lpActors) {
  const recipients = lpActors.map(lp => ({
    id: lp.id,
    weight: lp.ownershipPct || 0
  }));
  return allocateDollars(totalDollars, recipients);
}

/**
 * Calculate allocation based on commitment amounts
 *
 * @param {number} totalDollars - Total dollars to allocate
 * @param {Array<{id: string, commitment: number}>} lpActors - LPs with commitment amounts
 * @returns {Array<{id: string, cents: number, dollars: number}>} Allocations
 */
export function commitmentBasedAllocation(totalDollars, lpActors) {
  const recipients = lpActors.map(lp => ({
    id: lp.id,
    weight: lp.commitment || 0
  }));
  return allocateDollars(totalDollars, recipients);
}
