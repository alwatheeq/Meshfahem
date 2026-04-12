import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
  isSupabaseConfigured: vi.fn(() => true),
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

describe('supabase auth mock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getSession returns null session by default', async () => {
    const { supabase } = await import('../lib/supabase');
    const { data, error } = await supabase.auth.getSession();
    expect(error).toBeNull();
    expect(data.session).toBeNull();
  });

  it('signInWithPassword can be mocked with success', async () => {
    const { supabase } = await import('../lib/supabase');
    const mockSession = {
      user: { id: 'user-123', email: 'test@example.com' },
      access_token: 'token-abc',
    };
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: { user: mockSession.user, session: mockSession },
      error: null,
    } as any);

    const result = await supabase.auth.signInWithPassword({
      email: 'test@example.com',
      password: 'password123',
    });

    expect(result.error).toBeNull();
    expect(result.data.user?.email).toBe('test@example.com');
  });

  it('signInWithPassword can be mocked with error', async () => {
    const { supabase } = await import('../lib/supabase');
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials', status: 400 },
    } as any);

    const result = await supabase.auth.signInWithPassword({
      email: 'wrong@example.com',
      password: 'wrongpassword',
    });

    expect(result.error).not.toBeNull();
    expect(result.error?.message).toBe('Invalid login credentials');
  });

  it('signOut can be called', async () => {
    const { supabase } = await import('../lib/supabase');
    vi.mocked(supabase.auth.signOut).mockResolvedValueOnce({ error: null });

    const { error } = await supabase.auth.signOut();
    expect(error).toBeNull();
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('onAuthStateChange returns unsubscribe handle', async () => {
    const { supabase } = await import('../lib/supabase');
    const { data } = supabase.auth.onAuthStateChange(vi.fn());
    expect(data.subscription.unsubscribe).toBeDefined();
    expect(typeof data.subscription.unsubscribe).toBe('function');
  });
});

describe('isSupabaseConfigured', () => {
  it('returns true when configured', async () => {
    const { isSupabaseConfigured } = await import('../lib/supabase');
    expect(isSupabaseConfigured()).toBe(true);
  });
});
