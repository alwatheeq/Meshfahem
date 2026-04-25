/**
 * Ambient modules for `npm:` specifiers used by Edge Functions when Stripe is not installed
 * in the repo root (runtime resolves via Deno). Satisfies workspace TypeScript only.
 */
declare module 'npm:stripe@14.21.0' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Stripe: any;
  export default Stripe;
}

/** Namespace used by stripe-webhook / create-checkout-session for event typing */
declare namespace Stripe {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Event = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Subscription = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Invoice = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Customer = any;
  namespace Price {
    namespace Recurring {
      type Interval = 'day' | 'week' | 'month' | 'year';
    }
  }
  namespace Checkout {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type Session = any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type SessionCreateParams = any;
  }
}
