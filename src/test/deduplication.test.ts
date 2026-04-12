import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeText,
  generateTextHash,
  createCacheKey,
  deduplicateFlashcards,
  checkCache,
  storeInCache,
} from '../utils/deduplication';

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
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

describe('normalizeText', () => {
  it('removes slide numbers', () => {
    const result = normalizeText('Slide 1 Introduction to Biology');
    expect(result).not.toMatch(/slide \d+/i);
  });

  it('removes page numbers', () => {
    const result = normalizeText('Page 1 of 10 Some content here');
    expect(result).not.toMatch(/page \d+ of \d+/i);
  });

  it('collapses whitespace', () => {
    const result = normalizeText('hello    world   test');
    expect(result).not.toContain('  ');
  });

  it('returns empty string for null/undefined', () => {
    expect(normalizeText(null as unknown as string)).toBe('');
    expect(normalizeText(undefined as unknown as string)).toBe('');
    expect(normalizeText('')).toBe('');
  });

  it('converts to lowercase', () => {
    const result = normalizeText('HELLO WORLD');
    expect(result).toBe('hello world');
  });
});

describe('generateTextHash', () => {
  it('returns a hex string', async () => {
    const hash = await generateTextHash('test content');
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('produces same hash for same input', async () => {
    const hash1 = await generateTextHash('identical text');
    const hash2 = await generateTextHash('identical text');
    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different input', async () => {
    const hash1 = await generateTextHash('text one');
    const hash2 = await generateTextHash('text two');
    expect(hash1).not.toBe(hash2);
  });

  it('throws for empty input', async () => {
    await expect(generateTextHash('')).rejects.toThrow('Text is required for hashing');
  });
});

describe('createCacheKey', () => {
  it('creates composite key with expected format', () => {
    const key = createCacheKey('abc123', 10, 'full');
    expect(key).toBe('abc123_10_full');
  });

  it('uses default mode when not specified', () => {
    const key = createCacheKey('hash', 5);
    expect(key).toBe('hash_5_full');
  });
});

describe('deduplicateFlashcards', () => {
  it('removes duplicate flashcards by similarity', () => {
    const cards = [
      { front: 'What is biology?', back: 'The study of life' },
      { front: 'What is biology?', back: 'Science of living things' },
      { front: 'What is chemistry?', back: 'The study of matter' },
    ];
    const result = deduplicateFlashcards(cards);
    expect(result.length).toBe(2);
  });

  it('preserves unique cards', () => {
    const cards = [
      { front: 'What is photosynthesis?', back: 'Converting light to energy' },
      { front: 'Define mitochondria', back: 'The powerhouse of the cell' },
      { front: 'Explain gravitational force', back: 'Attraction between masses' },
    ];
    const result = deduplicateFlashcards(cards);
    expect(result.length).toBe(3);
  });

  it('handles empty array', () => {
    expect(deduplicateFlashcards([])).toEqual([]);
  });

  it('handles null/invalid input', () => {
    expect(deduplicateFlashcards(null as any)).toEqual([]);
    expect(deduplicateFlashcards(undefined as any)).toEqual([]);
  });

  it('skips cards with missing front or back', () => {
    const cards = [
      { front: 'Valid', back: 'Card' },
      { front: '', back: 'Missing front' },
      { front: 'Missing back', back: '' },
    ];
    const result = deduplicateFlashcards(cards);
    expect(result.length).toBe(1);
    expect(result[0].front).toBe('Valid');
  });
});

describe('checkCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no cached content is found', async () => {
    const { supabase } = await import('../lib/supabase');
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    vi.mocked(supabase.from).mockReturnValue(mockChain as any);

    const result = await checkCache('nonexistent_key');
    expect(result).toBeNull();
  });

  it('returns cached data when found', async () => {
    const { supabase } = await import('../lib/supabase');
    const cachedData = {
      summary: 'Cached summary',
      flashcards: [{ front: 'Q', back: 'A' }],
      created_at: '2025-01-01T00:00:00Z',
    };
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: cachedData, error: null }),
    };
    vi.mocked(supabase.from).mockReturnValue(mockChain as any);

    const result = await checkCache('existing_key');
    expect(result).toEqual({
      summary: 'Cached summary',
      flashcards: [{ front: 'Q', back: 'A' }],
      cachedAt: '2025-01-01T00:00:00Z',
    });
  });

  it('returns null on supabase error', async () => {
    const { supabase } = await import('../lib/supabase');
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
    };
    vi.mocked(supabase.from).mockReturnValue(mockChain as any);

    const result = await checkCache('error_key');
    expect(result).toBeNull();
  });
});

describe('storeInCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls supabase insert with correct data', async () => {
    const { supabase } = await import('../lib/supabase');
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const mockChain = {
      insert: insertMock,
    };
    vi.mocked(supabase.from).mockReturnValue(mockChain as any);

    await storeInCache('key_123', 'My summary', [{ front: 'Q', back: 'A' }]);

    expect(supabase.from).toHaveBeenCalledWith('cached_content');
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content_hash: 'key_123',
        summary: 'My summary',
        flashcards: [{ front: 'Q', back: 'A' }],
      })
    );
  });

  it('does not throw on supabase error', async () => {
    const { supabase } = await import('../lib/supabase');
    const mockChain = {
      insert: vi.fn().mockResolvedValue({ error: new Error('Insert failed') }),
    };
    vi.mocked(supabase.from).mockReturnValue(mockChain as any);

    await expect(storeInCache('key', 'summary', [])).resolves.not.toThrow();
  });
});
