import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

vi.mock('../../utils/errorHandler', () => ({
  handleSupabaseError: vi.fn(),
  isOffline: vi.fn(() => false),
}));

vi.mock('../../utils/errorLogger', () => ({
  ErrorLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { useCreditStore } from '../creditStore';
import { supabase } from '../../lib/supabase';
import { isOffline } from '../../utils/errorHandler';

describe('creditStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCreditStore.getState().clearBalance();
  });

  afterEach(() => {
    useCreditStore.getState().stopPolling();
  });

  it('should start with null balance and loading true', () => {
    const state = useCreditStore.getState();
    expect(state.balance).toBeNull();
  });

  it('should fetch and store balance successfully', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        success: true,
        credits_remaining: 450000,
        credits_total: 520000,
        cycle_start: '2026-04-01',
        cycle_end: '2026-05-01',
        free_credits_claimed: true,
        zego_credits_remaining: 900,
        zego_credits_total: 1000,
      },
      error: null,
    } as any);

    await useCreditStore.getState().fetchBalance('user-123');

    const { balance, loading } = useCreditStore.getState();
    expect(loading).toBe(false);
    expect(balance).not.toBeNull();
    expect(balance!.credits_remaining).toBe(450000);
    expect(balance!.credits_total).toBe(520000);
    expect(balance!.zego_credits_remaining).toBe(900);
  });

  it('should handle fetch error gracefully', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: new Error('DB connection failed'),
    } as any);

    await useCreditStore.getState().fetchBalance('user-123');

    const { balance, loading } = useCreditStore.getState();
    expect(loading).toBe(false);
    expect(balance).toBeNull();
  });

  it('should skip fetch when offline', async () => {
    vi.mocked(isOffline).mockReturnValue(true);

    await useCreditStore.getState().fetchBalance('user-123');

    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(useCreditStore.getState().loading).toBe(false);
  });

  it('should clear balance and stop polling', () => {
    useCreditStore.setState({ balance: { credits_remaining: 100 } as any, _userId: 'user-123' });

    useCreditStore.getState().clearBalance();

    const state = useCreditStore.getState();
    expect(state.balance).toBeNull();
    expect(state._userId).toBeNull();
  });
});
