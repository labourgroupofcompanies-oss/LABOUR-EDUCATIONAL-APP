-- ============================================================
-- Global Subscription Prices Table
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.subscription_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_1_term NUMERIC(10,2) NOT NULL DEFAULT 300,
  plan_2_terms NUMERIC(10,2) NOT NULL DEFAULT 600,
  plan_annual NUMERIC(10,2) NOT NULL DEFAULT 750,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure only one row ever exists in this table
CREATE UNIQUE INDEX IF NOT EXISTS ensure_single_row ON public.subscription_prices ((1));

-- Insert default row if table is empty
INSERT INTO public.subscription_prices (plan_1_term, plan_2_terms, plan_annual)
SELECT 300, 600, 750
WHERE NOT EXISTS (SELECT 1 FROM public.subscription_prices);

-- RLS: Enable Row Level Security
ALTER TABLE public.subscription_prices ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read the prices
CREATE POLICY "Public can read subscription prices"
  ON public.subscription_prices FOR SELECT
  USING (true);

-- Allow authenticated users (or just Developers if you have a developer role setup) to update
CREATE POLICY "Developers can update subscription prices"
  ON public.subscription_prices FOR UPDATE
  USING (true);
