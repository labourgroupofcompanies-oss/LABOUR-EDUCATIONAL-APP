-- Fix Schema and RLS for subscription_prices
-- This script adds the missing columns required by the Developer Portal and sets up RLS.

-- 1. Add missing columns to subscription_prices
ALTER TABLE public.subscription_prices ADD COLUMN IF NOT EXISTS plan_1_term NUMERIC DEFAULT 300;
ALTER TABLE public.subscription_prices ADD COLUMN IF NOT EXISTS plan_2_terms NUMERIC DEFAULT 600;
ALTER TABLE public.subscription_prices ADD COLUMN IF NOT EXISTS plan_annual NUMERIC DEFAULT 750;

-- 2. Ensure at least one row exists for the Developer Portal to manage
INSERT INTO public.subscription_prices (name, price, description, features, plan_1_term, plan_2_terms, plan_annual)
SELECT 'Global Pricing', '0', 'System-wide pricing configuration', ARRAY['Global Access'], 300, 600, 750
WHERE NOT EXISTS (SELECT 1 FROM public.subscription_prices LIMIT 1);

-- 3. Enable RLS
ALTER TABLE public.subscription_prices ENABLE ROW LEVEL SECURITY;

-- 4. Policy: Only developers can manage pricing
DROP POLICY IF EXISTS "Only developers can manage pricing" ON public.subscription_prices;

CREATE POLICY "Only developers can manage pricing"
    ON public.subscription_prices FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.staff_profiles
            WHERE id = auth.uid() AND role = 'developer'
        )
    );

-- 5. Policy: Public can view pricing (for marketing site)
DROP POLICY IF EXISTS "Public can view pricing" ON public.subscription_prices;

CREATE POLICY "Public can view pricing"
    ON public.subscription_prices FOR SELECT
    TO anon, authenticated
    USING (true);
