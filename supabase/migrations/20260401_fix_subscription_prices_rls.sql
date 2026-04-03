-- ============================================================
-- Fix Subscription Prices Table RLS & Data
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================

-- Ensure the INSERT policy exists so that the frontend can insert the first row if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = 'subscription_prices' 
          AND policyname = 'Developers can insert subscription prices'
    ) THEN
        CREATE POLICY "Developers can insert subscription prices"
          ON public.subscription_prices FOR INSERT
          WITH CHECK (true);
    END IF;
END
$$;

-- Just in case, insert a default row if the table is still empty
INSERT INTO public.subscription_prices (plan_1_term, plan_2_terms, plan_annual)
SELECT 300, 600, 750
WHERE NOT EXISTS (SELECT 1 FROM public.subscription_prices);
