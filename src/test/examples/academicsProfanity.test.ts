import { describe, it, expect } from 'vitest';
import { hasBasicProfanity } from '../../utils/academicsProfanity';

describe('academics profanity guard', () => {
  it('detects blocked words', () => {
    expect(hasBasicProfanity('This is shit')).toBe(true);
    expect(hasBasicProfanity('No BAD words')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(hasBasicProfanity('FUCK')).toBe(true);
  });

  it('handles empty input', () => {
    expect(hasBasicProfanity('')).toBe(false);
  });
});

