-- 1. Create a more robust helper function to get the current user's school_id
CREATE OR REPLACE FUNCTION public.get_school_id() 
RETURNS TEXT AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'school_id')::TEXT,
    (auth.jwt() -> 'app_metadata' ->> 'school_id')::TEXT
  );
$$ LANGUAGE sql STABLE;

-- 2. Ensure school_subscriptions has the standard isolation policy
ALTER TABLE public.school_subscriptions ENABLE ROW LEVEL SECURITY;

-- 3. Drop all potentially conflicting policies
DROP POLICY IF EXISTS "School subscription isolation" ON public.school_subscriptions;
DROP POLICY IF EXISTS "Authorized users can insert subscriptions" ON public.school_subscriptions;
DROP POLICY IF EXISTS "Users can view their school's subscriptions" ON public.school_subscriptions;
DROP POLICY IF EXISTS "Schools can read own subscriptions" ON public.school_subscriptions;
DROP POLICY IF EXISTS "Service can insert subscriptions" ON public.school_subscriptions;
DROP POLICY IF EXISTS "Service can update subscriptions" ON public.school_subscriptions;

-- 4. Add the clean isolation policy (Same as other tables)
CREATE POLICY "School subscription isolation" ON public.school_subscriptions
FOR ALL
USING (school_id = public.get_school_id())
WITH CHECK (school_id = public.get_school_id());

-- 4. Allow Developers to see everything (for the portal)
CREATE POLICY "Developers can manage subscriptions" ON public.school_subscriptions
FOR ALL
USING (auth.jwt() -> 'user_metadata' ->> 'role' = 'DEVELOPER')
WITH CHECK (auth.jwt() -> 'user_metadata' ->> 'role' = 'DEVELOPER');
