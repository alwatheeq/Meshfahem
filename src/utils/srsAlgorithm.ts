/**
 * SM-2 Spaced Repetition Algorithm
 * Based on the SuperMemo SM-2 algorithm by Piotr Wozniak.
 * Pure math — no API calls, no database, no tokens.
 *
 * Quality scale:
 *   0 = complete blackout (Again)
 *   1 = incorrect but remembered after seeing answer
 *   2 = incorrect but easy to recall
 *   3 = correct with difficulty (Hard)
 *   4 = correct with some hesitation (Good)
 *   5 = perfect response (Easy)
 */

export interface SrsCardState {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  nextReviewAt: Date;
}

export interface SrsReviewResult {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  nextReviewAt: Date;
}

/**
 * Map user-friendly ratings to SM-2 quality scores.
 */
export function ratingToQuality(rating: 'again' | 'hard' | 'good' | 'easy'): number {
  switch (rating) {
    case 'again': return 0;
    case 'hard': return 3;
    case 'good': return 4;
    case 'easy': return 5;
  }
}

/**
 * Calculate the next review state after a user reviews a card.
 *
 * @param quality - SM-2 quality score (0-5)
 * @param currentEaseFactor - Current ease factor (minimum 1.3)
 * @param currentInterval - Current interval in days
 * @param currentRepetitions - Number of consecutive correct reviews
 * @returns New SRS state with next review date
 */
export function calculateNextReview(
  quality: number,
  currentEaseFactor: number = 2.5,
  currentInterval: number = 0,
  currentRepetitions: number = 0
): SrsReviewResult {
  let easeFactor = currentEaseFactor;
  let intervalDays: number;
  let repetitions: number;

  if (quality < 3) {
    // Failed — reset to beginning
    repetitions = 0;
    intervalDays = 1;
  } else {
    // Passed — advance
    repetitions = currentRepetitions + 1;

    if (repetitions === 1) {
      intervalDays = 1;
    } else if (repetitions === 2) {
      intervalDays = 6;
    } else {
      intervalDays = Math.round(currentInterval * easeFactor);
    }
  }

  // Update ease factor using SM-2 formula
  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

  // Ease factor minimum is 1.3
  if (easeFactor < 1.3) {
    easeFactor = 1.3;
  }

  // Calculate next review date
  const nextReviewAt = new Date();
  nextReviewAt.setDate(nextReviewAt.getDate() + intervalDays);

  return {
    easeFactor: Math.round(easeFactor * 100) / 100,
    intervalDays,
    repetitions,
    nextReviewAt,
  };
}

/**
 * Check if a card is due for review.
 */
export function isCardDue(nextReviewAt: Date | string): boolean {
  const reviewDate = typeof nextReviewAt === 'string' ? new Date(nextReviewAt) : nextReviewAt;
  return reviewDate <= new Date();
}

/**
 * Get a human-readable interval description.
 */
export function formatInterval(intervalDays: number): string {
  if (intervalDays === 0) return 'New';
  if (intervalDays === 1) return '1 day';
  if (intervalDays < 7) return `${intervalDays} days`;
  if (intervalDays < 30) {
    const weeks = Math.round(intervalDays / 7);
    return weeks === 1 ? '1 week' : `${weeks} weeks`;
  }
  if (intervalDays < 365) {
    const months = Math.round(intervalDays / 30);
    return months === 1 ? '1 month' : `${months} months`;
  }
  const years = Math.round(intervalDays / 365);
  return years === 1 ? '1 year' : `${years} years`;
}

/**
 * Calculate mastery percentage based on ease factor and repetitions.
 * Returns 0-100.
 */
export function calculateMastery(easeFactor: number, repetitions: number): number {
  // Base mastery from repetitions (max 70% from reps alone)
  const repScore = Math.min(repetitions / 5, 1) * 70;
  // Bonus from ease factor (max 30% bonus)
  const easeBonus = Math.min((easeFactor - 1.3) / (2.5 - 1.3), 1) * 30;
  return Math.round(Math.min(repScore + easeBonus, 100));
}
