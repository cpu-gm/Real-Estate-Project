/**
 * P1 Data Integrity Sprint - Money Service Tests
 *
 * Tests for Task 7: Cents-Based Money Calculations
 * - dollarsToCents/centsToDollars conversions
 * - allocateCents with largest remainder method
 * - validateAllocationSum
 * - proRataAllocation
 */

import { jest } from '@jest/globals';

import {
  dollarsToCents,
  centsToDollars,
  allocateCents,
  validateAllocationSum,
  roundDollars,
  formatCentsAsDollars,
  allocateDollars,
  proRataAllocation,
  commitmentBasedAllocation
} from '../services/money.js';

describe('Task 7: Money Service', () => {
  describe('dollarsToCents', () => {
    it('converts whole dollars', () => {
      expect(dollarsToCents(100)).toBe(10000);
      expect(dollarsToCents(1)).toBe(100);
      expect(dollarsToCents(0)).toBe(0);
    });

    it('converts dollars with cents', () => {
      expect(dollarsToCents(100.50)).toBe(10050);
      expect(dollarsToCents(99.99)).toBe(9999);
      expect(dollarsToCents(0.01)).toBe(1);
    });

    it('handles floating point edge cases', () => {
      // 100.10 * 100 = 10009.999999... in floating point
      expect(dollarsToCents(100.10)).toBe(10010);
      expect(dollarsToCents(33.33)).toBe(3333);
    });

    it('throws for invalid input', () => {
      expect(() => dollarsToCents('100')).toThrow();
      expect(() => dollarsToCents(NaN)).toThrow();
      expect(() => dollarsToCents(undefined)).toThrow();
    });
  });

  describe('centsToDollars', () => {
    it('converts cents to dollars', () => {
      expect(centsToDollars(10000)).toBe(100);
      expect(centsToDollars(10050)).toBe(100.50);
      expect(centsToDollars(1)).toBe(0.01);
      expect(centsToDollars(0)).toBe(0);
    });

    it('throws for non-integer input', () => {
      expect(() => centsToDollars(100.5)).toThrow();
      expect(() => centsToDollars(99.99)).toThrow();
    });
  });

  describe('allocateCents', () => {
    it('allocates evenly when divisible', () => {
      const result = allocateCents(10000, [
        { id: 'a', weight: 0.5 },
        { id: 'b', weight: 0.5 }
      ]);

      expect(result).toHaveLength(2);
      expect(result[0].cents).toBe(5000);
      expect(result[1].cents).toBe(5000);
      expect(result[0].dollars).toBe(50);
      expect(result[1].dollars).toBe(50);
    });

    it('handles uneven division with largest remainder method', () => {
      // $100 between 60/40 split
      const result = allocateCents(10000, [
        { id: 'a', weight: 0.6 },
        { id: 'b', weight: 0.4 }
      ]);

      expect(result[0].cents).toBe(6000);
      expect(result[1].cents).toBe(4000);

      // Sum must equal total
      const sum = result.reduce((s, r) => s + r.cents, 0);
      expect(sum).toBe(10000);
    });

    it('handles thirds correctly (classic floating point problem)', () => {
      // $100 / 3 = $33.33... each
      const result = allocateCents(10000, [
        { id: 'a', weight: 1 },
        { id: 'b', weight: 1 },
        { id: 'c', weight: 1 }
      ]);

      // Sum MUST equal 10000 cents exactly
      const sum = result.reduce((s, r) => s + r.cents, 0);
      expect(sum).toBe(10000);

      // Two get 3333, one gets 3334 (largest remainder)
      const cents = result.map(r => r.cents).sort((a, b) => a - b);
      expect(cents).toEqual([3333, 3333, 3334]);
    });

    it('handles small amounts correctly', () => {
      // $1 between 3 people
      const result = allocateCents(100, [
        { id: 'a', weight: 1 },
        { id: 'b', weight: 1 },
        { id: 'c', weight: 1 }
      ]);

      const sum = result.reduce((s, r) => s + r.cents, 0);
      expect(sum).toBe(100);

      // 33 + 33 + 34 = 100
      const cents = result.map(r => r.cents).sort((a, b) => a - b);
      expect(cents).toEqual([33, 33, 34]);
    });

    it('handles single recipient', () => {
      const result = allocateCents(10000, [{ id: 'a', weight: 1 }]);

      expect(result).toHaveLength(1);
      expect(result[0].cents).toBe(10000);
    });

    it('returns empty array for empty recipients', () => {
      const result = allocateCents(10000, []);
      expect(result).toEqual([]);
    });

    it('throws for negative total', () => {
      expect(() => allocateCents(-100, [{ id: 'a', weight: 1 }])).toThrow();
    });

    it('throws for zero total weight', () => {
      expect(() => allocateCents(100, [{ id: 'a', weight: 0 }])).toThrow();
    });

    it('normalizes weights that do not sum to 1', () => {
      // Weights 60 and 40 (not 0.6 and 0.4) should still work
      const result = allocateCents(10000, [
        { id: 'a', weight: 60 },
        { id: 'b', weight: 40 }
      ]);

      expect(result[0].cents).toBe(6000);
      expect(result[1].cents).toBe(4000);
    });

    it('handles 5-way split correctly', () => {
      // $100 / 5 = $20 each exactly
      const result = allocateCents(10000, [
        { id: 'a', weight: 1 },
        { id: 'b', weight: 1 },
        { id: 'c', weight: 1 },
        { id: 'd', weight: 1 },
        { id: 'e', weight: 1 }
      ]);

      const sum = result.reduce((s, r) => s + r.cents, 0);
      expect(sum).toBe(10000);
      expect(result.every(r => r.cents === 2000)).toBe(true);
    });

    it('handles 7-way split correctly (indivisible)', () => {
      // $100 / 7 = 14.285714...
      const result = allocateCents(10000, [
        { id: 'a', weight: 1 },
        { id: 'b', weight: 1 },
        { id: 'c', weight: 1 },
        { id: 'd', weight: 1 },
        { id: 'e', weight: 1 },
        { id: 'f', weight: 1 },
        { id: 'g', weight: 1 }
      ]);

      const sum = result.reduce((s, r) => s + r.cents, 0);
      expect(sum).toBe(10000);  // Must be exact

      // Base is 1428, remainder is 10000 - 7*1428 = 4
      // So 4 recipients get 1429, 3 get 1428
      const cents = result.map(r => r.cents).sort((a, b) => a - b);
      expect(cents.filter(c => c === 1428).length).toBe(3);
      expect(cents.filter(c => c === 1429).length).toBe(4);
    });
  });

  describe('validateAllocationSum', () => {
    it('returns valid:true when sum matches', () => {
      const allocations = [
        { cents: 6000 },
        { cents: 4000 }
      ];
      const result = validateAllocationSum(allocations, 10000);

      expect(result.valid).toBe(true);
      expect(result.sum).toBe(10000);
      expect(result.diff).toBe(0);
    });

    it('returns valid:false when sum does not match', () => {
      const allocations = [
        { cents: 6000 },
        { cents: 3999 }  // 1 cent short
      ];
      const result = validateAllocationSum(allocations, 10000);

      expect(result.valid).toBe(false);
      expect(result.sum).toBe(9999);
      expect(result.diff).toBe(-1);
    });
  });

  describe('roundDollars', () => {
    it('rounds to 2 decimal places', () => {
      expect(roundDollars(33.333333)).toBe(33.33);
      expect(roundDollars(33.335)).toBe(33.34);
      expect(roundDollars(100)).toBe(100);
    });
  });

  describe('formatCentsAsDollars', () => {
    it('formats cents as currency string', () => {
      expect(formatCentsAsDollars(10000)).toBe('$100.00');
      expect(formatCentsAsDollars(123456)).toBe('$1,234.56');
      expect(formatCentsAsDollars(1)).toBe('$0.01');
    });
  });

  describe('allocateDollars', () => {
    it('allocates dollars with exact sum guarantee', () => {
      const result = allocateDollars(100, [
        { id: 'a', weight: 60 },
        { id: 'b', weight: 40 }
      ]);

      expect(result[0].dollars).toBe(60);
      expect(result[1].dollars).toBe(40);

      const sumCents = result.reduce((s, r) => s + r.cents, 0);
      expect(sumCents).toBe(10000);
    });
  });

  describe('proRataAllocation', () => {
    it('allocates based on ownership percentages', () => {
      const result = proRataAllocation(100000, [
        { id: 'lp1', ownershipPct: 60 },
        { id: 'lp2', ownershipPct: 40 }
      ]);

      expect(result[0].dollars).toBe(60000);
      expect(result[1].dollars).toBe(40000);
    });

    it('handles odd percentages with exact sum', () => {
      const result = proRataAllocation(100000, [
        { id: 'lp1', ownershipPct: 33.33 },
        { id: 'lp2', ownershipPct: 33.33 },
        { id: 'lp3', ownershipPct: 33.34 }
      ]);

      const sumCents = result.reduce((s, r) => s + r.cents, 0);
      expect(sumCents).toBe(10000000);  // $100,000 in cents
    });
  });

  describe('commitmentBasedAllocation', () => {
    it('allocates based on commitment amounts', () => {
      const result = commitmentBasedAllocation(50000, [
        { id: 'lp1', commitment: 60000 },
        { id: 'lp2', commitment: 40000 }
      ]);

      // 60000 / 100000 = 60%
      // 40000 / 100000 = 40%
      expect(result[0].dollars).toBe(30000);
      expect(result[1].dollars).toBe(20000);
    });
  });
});
