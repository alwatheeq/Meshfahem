import { describe, it, expect } from 'vitest';
import {
  calculateNextReview,
  ratingToQuality,
  isCardDue,
  formatInterval,
  calculateMastery,
} from '../srsAlgorithm';

describe('srsAlgorithm', () => {
  describe('ratingToQuality', () => {
    it('maps again to 0', () => expect(ratingToQuality('again')).toBe(0));
    it('maps hard to 3', () => expect(ratingToQuality('hard')).toBe(3));
    it('maps good to 4', () => expect(ratingToQuality('good')).toBe(4));
    it('maps easy to 5', () => expect(ratingToQuality('easy')).toBe(5));
  });

  describe('calculateNextReview', () => {
    it('should reset on failure (quality < 3)', () => {
      const result = calculateNextReview(0, 2.5, 10, 5);
      expect(result.repetitions).toBe(0);
      expect(result.intervalDays).toBe(1);
    });

    it('should set interval to 1 day on first success', () => {
      const result = calculateNextReview(4, 2.5, 0, 0);
      expect(result.repetitions).toBe(1);
      expect(result.intervalDays).toBe(1);
    });

    it('should set interval to 6 days on second success', () => {
      const result = calculateNextReview(4, 2.5, 1, 1);
      expect(result.repetitions).toBe(2);
      expect(result.intervalDays).toBe(6);
    });

    it('should multiply interval by ease factor on subsequent successes', () => {
      const result = calculateNextReview(4, 2.5, 6, 2);
      expect(result.repetitions).toBe(3);
      expect(result.intervalDays).toBe(15); // 6 * 2.5 = 15
    });

    it('should decrease ease factor on hard answers', () => {
      const result = calculateNextReview(3, 2.5, 6, 2);
      expect(result.easeFactor).toBeLessThan(2.5);
    });

    it('should increase ease factor on easy answers', () => {
      const result = calculateNextReview(5, 2.5, 6, 2);
      expect(result.easeFactor).toBeGreaterThan(2.5);
    });

    it('should never let ease factor go below 1.3', () => {
      const result = calculateNextReview(0, 1.3, 1, 0);
      expect(result.easeFactor).toBeGreaterThanOrEqual(1.3);
    });

    it('should return a future date for nextReviewAt', () => {
      const result = calculateNextReview(4, 2.5, 0, 0);
      expect(result.nextReviewAt.getTime()).toBeGreaterThan(Date.now() - 1000);
    });
  });

  describe('isCardDue', () => {
    it('returns true for past dates', () => {
      const past = new Date();
      past.setDate(past.getDate() - 1);
      expect(isCardDue(past)).toBe(true);
    });

    it('returns true for current date', () => {
      expect(isCardDue(new Date())).toBe(true);
    });

    it('returns false for future dates', () => {
      const future = new Date();
      future.setDate(future.getDate() + 1);
      expect(isCardDue(future)).toBe(false);
    });

    it('accepts string dates', () => {
      const past = new Date();
      past.setDate(past.getDate() - 1);
      expect(isCardDue(past.toISOString())).toBe(true);
    });
  });

  describe('formatInterval', () => {
    it('formats 0 as New', () => expect(formatInterval(0)).toBe('New'));
    it('formats 1 as 1 day', () => expect(formatInterval(1)).toBe('1 day'));
    it('formats 3 as 3 days', () => expect(formatInterval(3)).toBe('3 days'));
    it('formats 7 as 1 week', () => expect(formatInterval(7)).toBe('1 week'));
    it('formats 14 as 2 weeks', () => expect(formatInterval(14)).toBe('2 weeks'));
    it('formats 30 as 1 month', () => expect(formatInterval(30)).toBe('1 month'));
    it('formats 365 as 1 year', () => expect(formatInterval(365)).toBe('1 year'));
  });

  describe('calculateMastery', () => {
    it('returns low value for new card with default ease', () => {
      // 0 repetitions = 0 rep score, but ease factor 2.5 gives 30% bonus
      expect(calculateMastery(2.5, 0)).toBe(30);
    });

    it('returns 0 for new card with minimum ease', () => {
      expect(calculateMastery(1.3, 0)).toBe(0);
    });

    it('increases with repetitions', () => {
      const m1 = calculateMastery(2.5, 1);
      const m3 = calculateMastery(2.5, 3);
      expect(m3).toBeGreaterThan(m1);
    });

    it('caps at 100', () => {
      expect(calculateMastery(2.5, 10)).toBeLessThanOrEqual(100);
    });

    it('accounts for ease factor', () => {
      const low = calculateMastery(1.3, 3);
      const high = calculateMastery(2.5, 3);
      expect(high).toBeGreaterThan(low);
    });
  });
});
