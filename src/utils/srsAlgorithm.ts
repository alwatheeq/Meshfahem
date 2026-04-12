export type SRSRating = 'again' | 'hard' | 'good' | 'easy';

export interface SRSState {
  easinessFactor: number;
  interval: number;
  repetitions: number;
}

export interface SRSResult extends SRSState {
  nextReviewAt: Date;
}

// Map rating strings to SM-2 quality values (0-5)
function ratingToQuality(rating: SRSRating): number {
  switch (rating) {
    case 'again': return 0;
    case 'hard': return 2;
    case 'good': return 4;
    case 'easy': return 5;
  }
}

export function calculateSRS(rating: SRSRating, current: SRSState): SRSResult {
  const quality = ratingToQuality(rating);
  const { easinessFactor, interval, repetitions } = current;

  // SM-2 easiness factor update
  const newEF = Math.max(1.3, easinessFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));

  if (quality < 3) {
    // Failed — reset
    return {
      easinessFactor: newEF,
      interval: 0,
      repetitions: 0,
      nextReviewAt: new Date(), // review again immediately (today)
    };
  }

  // Passed
  let newInterval: number;
  if (repetitions === 0) {
    newInterval = 1;
  } else if (repetitions === 1) {
    newInterval = 6;
  } else {
    newInterval = Math.round(interval * newEF);
  }

  const nextReviewAt = new Date();
  nextReviewAt.setDate(nextReviewAt.getDate() + newInterval);

  return {
    easinessFactor: newEF,
    interval: newInterval,
    repetitions: repetitions + 1,
    nextReviewAt,
  };
}

export function getDueCount(states: Array<{ next_review_at: string }>): number {
  const now = new Date();
  return states.filter(s => new Date(s.next_review_at) <= now).length;
}
