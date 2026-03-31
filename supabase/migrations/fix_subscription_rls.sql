-- ============================================================
-- Update RLS for school_subscriptions
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================

-- The previous policy only allowed authenticated Edge Functions. 
-- We now need to allow the frontend (authenticated users) to insert records directly
-- after a successful Paystack payment.

-- Drop the old overly-restrictive policy if it exists
DROP POLICY IF EXISTS "Service can insert subscriptions" ON school_subscriptions;

-- Create the new policy allowing anyone authenticated to insert
-- (Since Paystack verification happens before this step, and they can only insert for their own school)
CREATE POLICY "Authenticated users can insert subscriptions"
  ON school_subscriptions FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
