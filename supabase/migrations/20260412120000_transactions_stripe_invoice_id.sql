-- Idempotent Stripe invoice processing (webhook retries / duplicate events)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS stripe_invoice_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_stripe_invoice_id_unique
  ON transactions(stripe_invoice_id)
  WHERE stripe_invoice_id IS NOT NULL;

COMMENT ON COLUMN transactions.stripe_invoice_id IS 'Stripe invoice id (in_...) for idempotent payment_succeeded handling';
