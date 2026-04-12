import { describe, it, expect } from 'vitest';
import {
  isSubscriptionActive,
  getTierDisplayInfo,
  formatCurrency,
  getDaysUntilExpiration,
  getTokenLimitForTier,
  TOKEN_LIMITS,
} from '../utils/subscriptionHelpers';

describe('isSubscriptionActive', () => {
  it('returns true for an active subscription with future end_date', () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);

    const subscription = {
      id: '1',
      user_id: 'user1',
      subscription_tier: 'monthly' as const,
      status: 'active' as const,
      start_date: new Date().toISOString(),
      end_date: futureDate.toISOString(),
      next_billing_date: null,
      stripe_subscription_id: null,
      stripe_customer_id: null,
      payment_method_saved: false,
      auto_renew: false,
      canceled_at: null,
      trial_end_date: null,
      billing_cycle_start: null,
      billing_cycle_end: null,
      tokens_used_current_cycle: 0,
      token_limit: 520000,
    };

    expect(isSubscriptionActive(subscription)).toBe(true);
  });

  it('returns false for null subscription', () => {
    expect(isSubscriptionActive(null)).toBe(false);
  });

  it('returns false for undefined subscription', () => {
    expect(isSubscriptionActive(undefined)).toBe(false);
  });

  it('returns false for expired subscription', () => {
    const pastDate = new Date();
    pastDate.setFullYear(pastDate.getFullYear() - 1);

    const subscription = {
      id: '2',
      user_id: 'user2',
      subscription_tier: 'monthly' as const,
      status: 'active' as const,
      start_date: new Date().toISOString(),
      end_date: pastDate.toISOString(),
      next_billing_date: null,
      stripe_subscription_id: null,
      stripe_customer_id: null,
      payment_method_saved: false,
      auto_renew: false,
      canceled_at: null,
      trial_end_date: null,
      billing_cycle_start: null,
      billing_cycle_end: null,
      tokens_used_current_cycle: 0,
      token_limit: 520000,
    };

    expect(isSubscriptionActive(subscription)).toBe(false);
  });

  it('returns false for canceled status even with future end_date', () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);

    const subscription = {
      id: '3',
      user_id: 'user3',
      subscription_tier: 'monthly' as const,
      status: 'canceled' as const,
      start_date: new Date().toISOString(),
      end_date: futureDate.toISOString(),
      next_billing_date: null,
      stripe_subscription_id: null,
      stripe_customer_id: null,
      payment_method_saved: false,
      auto_renew: false,
      canceled_at: null,
      trial_end_date: null,
      billing_cycle_start: null,
      billing_cycle_end: null,
      tokens_used_current_cycle: 0,
      token_limit: 520000,
    };

    expect(isSubscriptionActive(subscription)).toBe(false);
  });
});

describe('getTierDisplayInfo', () => {
  it('returns correct info for monthly tier', () => {
    const info = getTierDisplayInfo('monthly');
    expect(info.name).toBe('Monthly');
    expect(info.description).toContain('520K tokens');
  });

  it('returns correct info for standard tier', () => {
    const info = getTierDisplayInfo('standard');
    expect(info.name).toBe('Standard');
    expect(info.description).toContain('1500 tool credits');
  });

  it('returns correct info for quarterly tier', () => {
    const info = getTierDisplayInfo('quarterly');
    expect(info.name).toBe('Quarterly');
  });

  it('returns correct info for biannual tier', () => {
    const info = getTierDisplayInfo('biannual');
    expect(info.name).toBe('Biannual');
  });

  it('returns "No Subscription" for unknown tier', () => {
    const info = getTierDisplayInfo('unknown_tier');
    expect(info.name).toBe('No Subscription');
  });

  it('returns correct info for none tier', () => {
    const info = getTierDisplayInfo('none');
    expect(info.name).toBe('No Subscription');
  });
});

describe('formatCurrency', () => {
  it('formats USD correctly', () => {
    const result = formatCurrency(29.99);
    expect(result).toBe('$29.99');
  });

  it('formats zero correctly', () => {
    const result = formatCurrency(0);
    expect(result).toBe('$0.00');
  });

  it('formats large amounts correctly', () => {
    const result = formatCurrency(1234.56);
    expect(result).toBe('$1,234.56');
  });

  it('uses specified currency', () => {
    const result = formatCurrency(10, 'EUR');
    expect(result).toContain('10');
  });
});

describe('getDaysUntilExpiration', () => {
  it('returns positive number for future date', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    const days = getDaysUntilExpiration(futureDate.toISOString());
    expect(days).toBeGreaterThanOrEqual(29);
    expect(days).toBeLessThanOrEqual(31);
  });

  it('returns 0 for past date', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 10);
    const days = getDaysUntilExpiration(pastDate.toISOString());
    expect(days).toBe(0);
  });

  it('returns 0 or 1 for today', () => {
    const today = new Date();
    const days = getDaysUntilExpiration(today.toISOString());
    expect(days).toBeLessThanOrEqual(1);
    expect(days).toBeGreaterThanOrEqual(0);
  });
});

describe('getTokenLimitForTier', () => {
  it('returns correct limit for monthly', () => {
    expect(getTokenLimitForTier('monthly')).toBe(TOKEN_LIMITS.monthly);
  });

  it('returns correct limit for quarterly', () => {
    expect(getTokenLimitForTier('quarterly')).toBe(TOKEN_LIMITS.quarterly);
  });

  it('returns correct limit for trial_7day', () => {
    expect(getTokenLimitForTier('trial_7day')).toBe(TOKEN_LIMITS.trial_7day);
  });

  it('returns correct limit for standard', () => {
    expect(getTokenLimitForTier('standard')).toBe(TOKEN_LIMITS.standard);
  });

  it('returns monthly fallback for none tier (0 is falsy)', () => {
    expect(getTokenLimitForTier('none')).toBe(TOKEN_LIMITS.monthly);
  });

  it('falls back to monthly limit for unknown tier', () => {
    expect(getTokenLimitForTier('unknown')).toBe(TOKEN_LIMITS.monthly);
  });
});
