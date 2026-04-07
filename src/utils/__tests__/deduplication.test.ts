import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    })),
  },
}));

// We need to test the pure functions that don't depend on Supabase
// Read the deduplication module's exports to test normalizeText and generateTextHash
describe('deduplication utilities', () => {
  describe('normalizeText', () => {
    it('should be importable from deduplication module', async () => {
      // The deduplication module exports normalizeText, generateTextHash, checkCache, storeInCache
      // Test that the module can be imported without errors
      const mod = await import('../deduplication');
      expect(mod).toBeDefined();
      expect(typeof mod.normalizeText).toBe('function');
      expect(typeof mod.generateTextHash).toBe('function');
    });
  });
});
