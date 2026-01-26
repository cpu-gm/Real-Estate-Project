import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  calculateUrgencyLevel,
  getDaysUntilDue,
  formatCountdown,
} from '../UrgencyBadge';

describe('UrgencyBadge Utility Functions', () => {
  describe('calculateUrgencyLevel', () => {
    // Mock Date for consistent testing
    const MOCK_DATE = new Date('2024-06-15T12:00:00.000Z');

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(MOCK_DATE);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns "normal" for null/undefined dates', () => {
      expect(calculateUrgencyLevel(null)).toBe('normal');
      expect(calculateUrgencyLevel(undefined)).toBe('normal');
    });

    it('returns "overdue" for past dates', () => {
      const yesterday = new Date('2024-06-14');
      expect(calculateUrgencyLevel(yesterday)).toBe('overdue');

      const lastWeek = new Date('2024-06-08');
      expect(calculateUrgencyLevel(lastWeek)).toBe('overdue');

      const lastMonth = new Date('2024-05-15');
      expect(calculateUrgencyLevel(lastMonth)).toBe('overdue');
    });

    it('returns "critical" for today', () => {
      const today = new Date('2024-06-15');
      expect(calculateUrgencyLevel(today)).toBe('critical');
    });

    it('returns "warning" for 1-3 days away', () => {
      const tomorrow = new Date('2024-06-16');
      expect(calculateUrgencyLevel(tomorrow)).toBe('warning');

      const in2Days = new Date('2024-06-17');
      expect(calculateUrgencyLevel(in2Days)).toBe('warning');

      const in3Days = new Date('2024-06-18');
      expect(calculateUrgencyLevel(in3Days)).toBe('warning');
    });

    it('returns "soon" for 4-7 days away', () => {
      const in4Days = new Date('2024-06-19');
      expect(calculateUrgencyLevel(in4Days)).toBe('soon');

      const in5Days = new Date('2024-06-20');
      expect(calculateUrgencyLevel(in5Days)).toBe('soon');

      const in7Days = new Date('2024-06-22');
      expect(calculateUrgencyLevel(in7Days)).toBe('soon');
    });

    it('returns "normal" for 8+ days away', () => {
      const in8Days = new Date('2024-06-23');
      expect(calculateUrgencyLevel(in8Days)).toBe('normal');

      const in30Days = new Date('2024-07-15');
      expect(calculateUrgencyLevel(in30Days)).toBe('normal');
    });

    it('handles string date inputs', () => {
      expect(calculateUrgencyLevel('2024-06-14')).toBe('overdue');
      expect(calculateUrgencyLevel('2024-06-15')).toBe('critical');
      expect(calculateUrgencyLevel('2024-06-16')).toBe('warning');
    });

    it('handles ISO string date inputs', () => {
      expect(calculateUrgencyLevel('2024-06-14T00:00:00.000Z')).toBe('overdue');
      expect(calculateUrgencyLevel('2024-06-15T23:59:59.000Z')).toBe('critical');
    });
  });

  describe('getDaysUntilDue', () => {
    const MOCK_DATE = new Date('2024-06-15T12:00:00.000Z');

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(MOCK_DATE);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns null for null/undefined dates', () => {
      expect(getDaysUntilDue(null)).toBeNull();
      expect(getDaysUntilDue(undefined)).toBeNull();
    });

    it('returns negative numbers for past dates', () => {
      const yesterday = new Date('2024-06-14');
      expect(getDaysUntilDue(yesterday)).toBe(-1);

      const lastWeek = new Date('2024-06-08');
      expect(getDaysUntilDue(lastWeek)).toBe(-7);
    });

    it('returns 0 for today', () => {
      const today = new Date('2024-06-15');
      expect(getDaysUntilDue(today)).toBe(0);
    });

    it('returns positive numbers for future dates', () => {
      const tomorrow = new Date('2024-06-16');
      expect(getDaysUntilDue(tomorrow)).toBe(1);

      const nextWeek = new Date('2024-06-22');
      expect(getDaysUntilDue(nextWeek)).toBe(7);
    });

    it('handles time portions correctly (compares days only)', () => {
      // Same day but different times should return 0
      const todayMorning = new Date('2024-06-15T06:00:00.000Z');
      const todayEvening = new Date('2024-06-15T22:00:00.000Z');
      expect(getDaysUntilDue(todayMorning)).toBe(0);
      expect(getDaysUntilDue(todayEvening)).toBe(0);
    });
  });

  describe('formatCountdown', () => {
    it('returns empty string for null/undefined', () => {
      expect(formatCountdown(null)).toBe('');
      expect(formatCountdown(undefined)).toBe('');
    });

    it('formats overdue days correctly', () => {
      expect(formatCountdown(-1)).toBe('1 day overdue');
      expect(formatCountdown(-2)).toBe('2 days overdue');
      expect(formatCountdown(-7)).toBe('7 days overdue');
      expect(formatCountdown(-30)).toBe('30 days overdue');
    });

    it('formats "Due today" for 0 days', () => {
      expect(formatCountdown(0)).toBe('Due today');
    });

    it('formats "Due tomorrow" for 1 day', () => {
      expect(formatCountdown(1)).toBe('Due tomorrow');
    });

    it('formats future days correctly', () => {
      expect(formatCountdown(2)).toBe('2 days');
      expect(formatCountdown(7)).toBe('7 days');
      expect(formatCountdown(30)).toBe('30 days');
    });

    it('uses singular "day" for 1 day overdue', () => {
      const result = formatCountdown(-1);
      expect(result).toContain('day overdue');
      expect(result).not.toContain('days overdue');
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('handles midnight boundary correctly', () => {
      // Set time to just before midnight
      vi.setSystemTime(new Date('2024-06-15T23:59:59.000Z'));

      const tomorrow = new Date('2024-06-16T00:00:00.000Z');
      expect(getDaysUntilDue(tomorrow)).toBe(1);
    });

    it('handles New Year transition', () => {
      vi.setSystemTime(new Date('2024-12-31T12:00:00.000Z'));

      const nextYear = new Date('2025-01-01');
      expect(getDaysUntilDue(nextYear)).toBe(1);
      expect(calculateUrgencyLevel(nextYear)).toBe('warning');
    });

    it('handles leap year', () => {
      vi.setSystemTime(new Date('2024-02-28T12:00:00.000Z'));

      const leapDay = new Date('2024-02-29');
      expect(getDaysUntilDue(leapDay)).toBe(1);
    });

    it('handles very old dates', () => {
      vi.setSystemTime(new Date('2024-06-15T12:00:00.000Z'));

      const veryOld = new Date('2020-01-01');
      const days = getDaysUntilDue(veryOld);
      expect(days).toBeLessThan(-1000);
      expect(calculateUrgencyLevel(veryOld)).toBe('overdue');
    });

    it('handles far future dates', () => {
      vi.setSystemTime(new Date('2024-06-15T12:00:00.000Z'));

      const farFuture = new Date('2030-01-01');
      const days = getDaysUntilDue(farFuture);
      expect(days).toBeGreaterThan(1000);
      expect(calculateUrgencyLevel(farFuture)).toBe('normal');
    });
  });

  describe('Timezone Handling', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('compares dates in local timezone (day boundaries)', () => {
      // This test ensures we're comparing calendar days, not UTC times
      vi.setSystemTime(new Date('2024-06-15T12:00:00.000Z'));

      // Date without time should be treated as midnight local
      const today = new Date('2024-06-15');
      expect(getDaysUntilDue(today)).toBe(0);
    });
  });
});
