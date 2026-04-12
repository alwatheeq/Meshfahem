import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCreditStore } from '../stores/useCreditStore';

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

vi.mock('../utils/errorHandler', () => ({
  handleSupabaseError: vi.fn(),
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

describe('useCreditStore', () => {
  beforeEach(() => {
    useCreditStore.setState({ balance: null, loading: true });
  });

  it('has null balance initially', () => {
    const state = useCreditStore.getState();
    expect(state.balance).toBeNull();
  });

  it('has loading true initially', () => {
    const state = useCreditStore.getState();
    expect(state.loading).toBe(true);
  });

  it('setBalance updates the balance', () => {
    const balance = {
      credits_remaining: 100,
      credits_total: 500,
      cycle_start: '2025-01-01',
      cycle_end: '2025-02-01',
      free_credits_claimed: false,
    };
    useCreditStore.getState().setBalance(balance);
    expect(useCreditStore.getState().balance).toEqual(balance);
  });

  it('setBalance can set balance to null', () => {
    useCreditStore.getState().setBalance({
      credits_remaining: 50,
      credits_total: 200,
      cycle_start: null,
      cycle_end: null,
      free_credits_claimed: true,
    });
    useCreditStore.getState().setBalance(null);
    expect(useCreditStore.getState().balance).toBeNull();
  });

  it('setLoading updates loading state', () => {
    useCreditStore.getState().setLoading(false);
    expect(useCreditStore.getState().loading).toBe(false);

    useCreditStore.getState().setLoading(true);
    expect(useCreditStore.getState().loading).toBe(true);
  });
});

describe('triggerCreditUpdate', () => {
  it('dispatches a creditUpdated window event', async () => {
    const listener = vi.fn();
    window.addEventListener('creditUpdated', listener);

    const { triggerCreditUpdate } = await import('../utils/creditHelpers');
    triggerCreditUpdate();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toBeInstanceOf(CustomEvent);

    window.removeEventListener('creditUpdated', listener);
  });
});
