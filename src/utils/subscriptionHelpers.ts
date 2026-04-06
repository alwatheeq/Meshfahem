import type { Subscription } from '../hooks/useSubscription';

export const SUBSCRIPTION_TIERS = {
  /** @deprecated Legacy DB rows only; do not assign for new signups */
  TRIAL_1DAY: 'trial_1day',
  TRIAL_7DAY: 'trial_7day',
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  BIANNUAL: 'biannual',
  STANDARD: 'standard',
  NONE: 'none'
} as const;

export const SUBSCRIPTION_STATUS = {
  ACTIVE: 'active',
  CANCELED: 'canceled',
  EXPIRED: 'expired',
  PAYMENT_FAILED: 'payment_failed'
} as const;

export const PRICING = {
  monthly: 29.99,
  quarterly: 79.99,
  biannual: 149.99,
  /** Standard plan base price (USD) per month — includes 1500 tool credits, 500 chat credits, 600 Zego credits (10 hr) */
  standard: 3.49,
  /** Zegocloud add-on: USD per extra hour (beyond included 10 hr) */
  zegoPerHour: 0.1,
  /** AI chat add-on: USD per extra 100k tokens (beyond included 500k) */
  chatPer100kTokens: 0.1,
};

export const TOKEN_LIMITS = {
  /** Legacy rows only */
  trial_1day: 10000,
  trial_7day: 121000,
  monthly: 520000,
  quarterly: 520000,
  biannual: 520000,
  standard: 520000,
  none: 0
} as const;

export const getTierDisplayInfo = (tier: string) => {
  const info: Record<string, { name: string; color: string; bgColor: string; description: string }> = {
    trial_1day: {
      name: 'Legacy 1-day trial',
      color: 'text-gray-700 dark:text-gray-300',
      bgColor: 'bg-gray-100 dark:bg-gray-700',
      description: 'Deprecated tier (historical rows only)'
    },
    trial_7day: {
      name: '7-Day Trial',
      color: 'text-blue-700 dark:text-blue-300',
      bgColor: 'bg-blue-100 dark:bg-blue-900',
      description: '121K tokens - 7-day access for new subscribers'
    },
    monthly: {
      name: 'Monthly',
      color: 'text-green-700 dark:text-green-300',
      bgColor: 'bg-green-100 dark:bg-green-900',
      description: '520K tokens per 30-day cycle'
    },
    quarterly: {
      name: 'Quarterly',
      color: 'text-cyan-700 dark:text-cyan-300',
      bgColor: 'bg-cyan-100 dark:bg-cyan-900',
      description: '520K tokens per 30-day cycle'
    },
    biannual: {
      name: 'Biannual',
      color: 'text-yellow-700 dark:text-yellow-300',
      bgColor: 'bg-yellow-100 dark:bg-yellow-900',
      description: '520K tokens per 30-day cycle'
    },
    standard: {
      name: 'Standard',
      color: 'text-sky-700 dark:text-sky-300',
      bgColor: 'bg-sky-100 dark:bg-sky-900',
      description: '1500 tool credits + 500 chat credits + 600 Zego credits (10 hr) included'
    },
    none: {
      name: 'No Subscription',
      color: 'text-gray-500 dark:text-gray-500',
      bgColor: 'bg-gray-50 dark:bg-gray-800',
      description: 'No active subscription'
    }
  };

  return info[tier] || info.none;
};

export const getStatusDisplayInfo = (status: string) => {
  const info: Record<string, { name: string; color: string; bgColor: string }> = {
    active: {
      name: 'Active',
      color: 'text-green-700 dark:text-green-300',
      bgColor: 'bg-green-100 dark:bg-green-900'
    },
    canceled: {
      name: 'Canceled',
      color: 'text-orange-700 dark:text-orange-300',
      bgColor: 'bg-orange-100 dark:bg-orange-900'
    },
    expired: {
      name: 'Expired',
      color: 'text-red-700 dark:text-red-300',
      bgColor: 'bg-red-100 dark:bg-red-900'
    },
    payment_failed: {
      name: 'Payment Failed',
      color: 'text-red-700 dark:text-red-300',
      bgColor: 'bg-red-100 dark:bg-red-900'
    }
  };

  return info[status] || {
    name: status,
    color: 'text-gray-700 dark:text-gray-300',
    bgColor: 'bg-gray-100 dark:bg-gray-700'
  };
};

export const calculateTrialEndDate = (tier: string): Date => {
  const now = new Date();

  if (tier === SUBSCRIPTION_TIERS.TRIAL_1DAY) {
    return new Date(now.getTime() + 24 * 60 * 60 * 1000); // 1 day
  }

  if (tier === SUBSCRIPTION_TIERS.TRIAL_7DAY) {
    return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
  }

  return now;
};

export const calculateSubscriptionEndDate = (tier: string, startDate: Date = new Date()): Date => {
  const start = new Date(startDate);

  switch (tier) {
    case SUBSCRIPTION_TIERS.MONTHLY:
    case SUBSCRIPTION_TIERS.STANDARD:
      return new Date(start.setMonth(start.getMonth() + 1));
    case SUBSCRIPTION_TIERS.QUARTERLY:
      return new Date(start.setMonth(start.getMonth() + 3));
    case SUBSCRIPTION_TIERS.BIANNUAL:
      return new Date(start.setMonth(start.getMonth() + 6));
    case SUBSCRIPTION_TIERS.TRIAL_1DAY:
      return new Date(start.getTime() + 24 * 60 * 60 * 1000);
    case SUBSCRIPTION_TIERS.TRIAL_7DAY:
      return new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    default:
      return start;
  }
};

export const formatCurrency = (amount: number, currency: string = 'USD'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency
  }).format(amount);
};

// Shared helper for calculating days between dates
const calculateDaysDifference = (endDate: string | null): number => {
  if (!endDate) return 0;
  const end = new Date(endDate);
  const now = new Date();
  const diffTime = end.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
};

export const getDaysUntilExpiration = (endDate: string): number => {
  return calculateDaysDifference(endDate);
};

export const isSubscriptionActive = (subscription: Subscription | null | undefined): boolean => {
  if (!subscription) return false;
  return (
    subscription.status === SUBSCRIPTION_STATUS.ACTIVE &&
    new Date(subscription.end_date) > new Date()
  );
};

export const needsPaymentMethod = (subscription: Subscription | null | undefined): boolean => {
  if (!subscription) return false;
  return (
    subscription.auto_renew &&
    !subscription.payment_method_saved &&
    [SUBSCRIPTION_TIERS.MONTHLY, SUBSCRIPTION_TIERS.QUARTERLY, SUBSCRIPTION_TIERS.BIANNUAL].includes(subscription.subscription_tier)
  );
};

export const isStripeEnabled = (): boolean => {
  return import.meta.env.VITE_STRIPE_ENABLED === 'true';
};

export const getCheckoutMode = (): 'stripe' | 'free' => {
  return isStripeEnabled() ? 'stripe' : 'free';
};

export const getTokenLimitForTier = (tier: string): number => {
  return TOKEN_LIMITS[tier as keyof typeof TOKEN_LIMITS] || TOKEN_LIMITS.monthly;
};

export const formatTokenUsage = (tokens: number): string => {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
};

export const calculateTokensRemaining = (tokensUsed: number, tokenLimit: number): number => {
  return Math.max(0, tokenLimit - tokensUsed);
};

export const calculateUsagePercentage = (tokensUsed: number, tokenLimit: number): number => {
  if (tokenLimit === 0) return 0;
  return Math.min(100, Math.round((tokensUsed / tokenLimit) * 100));
};

export const getDaysRemainingInCycle = (cycleEndDate: string | null): number => {
  return calculateDaysDifference(cycleEndDate);
};

/** Standard (basic) plan: tools & services credits shown as remaining / this cap (overage allowed, e.g. 2700/1500). */
export const STANDARD_TOOLS_CREDITS_PLAN_CAP = 1500;

/** @deprecated Legacy UI cap; product now uses 1500 for all tiers in the app. */
export const LEGACY_NON_STANDARD_TOOLS_CAP = 2000;

/** Standard prepay base amounts (USD) for 1 / 3 / 6 month billing. Includes 1500 tool + 500 chat + 600 Zego credits. */
export const STANDARD_BASE_USD_BY_MONTHS: Record<1 | 3 | 6, number> = {
  1: 3.49,
  3: 9.99,
  6: 18.99,
};

export function normalizeStandardBillingMonths(n: number): 1 | 3 | 6 {
  if (n === 3 || n === 6) return n;
  return 1;
}

/**
 * Denominator for "Tools & services" credits (remaining / cap). Standard product uses 1500 for all active tiers.
 */
export function getToolsCreditsPlanCap(_subscription?: Subscription | null): number {
  return STANDARD_TOOLS_CREDITS_PLAN_CAP;
}
