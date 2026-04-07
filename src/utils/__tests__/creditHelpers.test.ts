import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock supabase before importing the module
vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

vi.mock('../errorHandler', () => ({
  handleSupabaseError: vi.fn(),
}));

vi.mock('../errorLogger', () => ({
  ErrorLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { triggerCreditUpdate, handleCreditNotifications } from '../creditHelpers';

describe('creditHelpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('triggerCreditUpdate', () => {
    it('should dispatch a creditUpdated custom event', () => {
      const spy = vi.fn();
      window.addEventListener('creditUpdated', spy);

      triggerCreditUpdate();

      expect(spy).toHaveBeenCalledTimes(1);
      window.removeEventListener('creditUpdated', spy);
    });
  });

  describe('handleCreditNotifications', () => {
    let lowCreditSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      lowCreditSpy = vi.fn();
      window.addEventListener('lowCreditWarning', lowCreditSpy);
    });

    afterEach(() => {
      window.removeEventListener('lowCreditWarning', lowCreditSpy);
    });

    it('should dispatch lowCreditWarning for 1000 threshold', async () => {
      // Need to make checkCreditSystemAvailability return true
      const { supabase } = await import('../../lib/supabase');
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: { features: { credits_remaining: true } },
        error: null,
      } as any);

      await handleCreditNotifications(
        { notify_1000: true },
        800,
        '2026-05-01T00:00:00Z'
      );

      expect(lowCreditSpy).toHaveBeenCalledTimes(1);
      const event = lowCreditSpy.mock.calls[0][0] as CustomEvent;
      expect(event.detail.level).toBe(1000);
      expect(event.detail.creditsRemaining).toBe(800);
    });

    it('should dispatch multiple warnings when multiple thresholds are hit', async () => {
      const { supabase } = await import('../../lib/supabase');
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: { features: { credits_remaining: true } },
        error: null,
      } as any);

      await handleCreditNotifications(
        { notify_1000: true, notify_500: true, notify_250: true },
        200,
        '2026-05-01T00:00:00Z'
      );

      expect(lowCreditSpy).toHaveBeenCalledTimes(3);
    });

    it('should not dispatch warnings when no flags are set', async () => {
      const { supabase } = await import('../../lib/supabase');
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: { features: { credits_remaining: true } },
        error: null,
      } as any);

      await handleCreditNotifications({}, 1000, '2026-05-01T00:00:00Z');

      expect(lowCreditSpy).not.toHaveBeenCalled();
    });
  });
});
