import { describe, it, expect, vi } from 'vitest';
import {
  determineProcessingMode,
  estimateProcessingTime,
} from '../utils/queueProcessor';

vi.mock('../utils/haikuClient', () => ({
  haikuClient: {
    generateSummary: vi.fn(),
    generateFlashcards: vi.fn(),
  },
  calculateBatches: (total: number, size: number) => Math.ceil(total / size),
  getBatchItems: vi.fn(),
}));

vi.mock('../utils/deduplication', () => ({
  deduplicateFlashcards: vi.fn((cards: any[]) => cards),
}));

vi.mock('../utils/errorLogger', () => ({
  ErrorLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
  },
}));

vi.mock('../utils/config', () => ({
  CONFIG: {
    CHARS_PER_PAGE: 2500,
    CHARS_PER_CHUNK: 14000,
    FAST_MODE_MAX_SLIDES: 100,
    FAST_MODE_MAX_FLASHCARDS: 20,
    BATCH_SIZE: 25,
  },
}));

describe('determineProcessingMode', () => {
  it('returns fast mode for small documents with few flashcards', () => {
    const smallText = 'a'.repeat(5000);
    const result = determineProcessingMode(smallText, 10);
    expect(result.mode).toBe('fast');
    expect(result.batches).toBe(1);
  });

  it('returns staged mode for large documents', () => {
    const largeText = 'a'.repeat(300000);
    const result = determineProcessingMode(largeText, 10);
    expect(result.mode).toBe('staged');
    expect(result.batches).toBeGreaterThan(1);
  });

  it('returns staged mode for many flashcards', () => {
    const text = 'a'.repeat(5000);
    const result = determineProcessingMode(text, 50);
    expect(result.mode).toBe('staged');
  });

  it('returns fast mode with reason for empty text', () => {
    const result = determineProcessingMode('', 10);
    expect(result.mode).toBe('fast');
    expect(result.reason).toBe('No content');
  });

  it('includes estimated pages for non-empty text', () => {
    const text = 'a'.repeat(10000);
    const result = determineProcessingMode(text, 5);
    expect(result.estimatedPages).toBeDefined();
    expect(result.estimatedPages).toBeGreaterThan(0);
  });
});

describe('estimateProcessingTime', () => {
  it('returns a TimeEstimate object', () => {
    const text = 'a'.repeat(5000);
    const result = estimateProcessingTime(text, 10);

    expect(result).toHaveProperty('mode');
    expect(result).toHaveProperty('estimatedPages');
    expect(result).toHaveProperty('summaryTime');
    expect(result).toHaveProperty('flashcardTime');
    expect(result).toHaveProperty('totalTime');
    expect(result).toHaveProperty('formattedTime');
  });

  it('returns reasonable time for small documents', () => {
    const text = 'a'.repeat(5000);
    const result = estimateProcessingTime(text, 10);
    expect(result.totalTime).toBeGreaterThan(0);
    expect(result.totalTime).toBeLessThan(120);
  });

  it('returns longer time for large documents', () => {
    const smallText = 'a'.repeat(5000);
    const largeText = 'a'.repeat(300000);

    const smallResult = estimateProcessingTime(smallText, 10);
    const largeResult = estimateProcessingTime(largeText, 40);

    expect(largeResult.totalTime).toBeGreaterThan(smallResult.totalTime);
  });

  it('formatted time shows seconds for short durations', () => {
    const text = 'a'.repeat(2500);
    const result = estimateProcessingTime(text, 5);
    if (result.totalTime < 60) {
      expect(result.formattedTime).toContain('seconds');
    }
  });

  it('formatted time shows minutes for longer durations', () => {
    const text = 'a'.repeat(300000);
    const result = estimateProcessingTime(text, 50);
    if (result.totalTime >= 120) {
      expect(result.formattedTime).toContain('minutes');
    } else if (result.totalTime >= 60) {
      expect(result.formattedTime).toContain('minute');
    }
  });
});
