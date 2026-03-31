-- ============================================================
-- LABOUR-APP SYSTEM: CREATE school_subscriptions TABLE
-- Date: 2026-03-10
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.school_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    term text NOT NULL,
    academic_year text NOT NULL,
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'expired', 'trial')),

    momo_reference text,
    phone_number text,
    amount_paid numeric(10,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
    paid_at timestamptz,
    activated_at timestamptz,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_school_subscription_term UNIQUE (school_id, term, academic_year)
);

-- RLS
ALTER TABLE public.school_subscriptions ENABLE ROW LEVEL SECURITY;

-- Drop old policies if re-running
DROP POLICY IF EXISTS "Users can view school_subscriptions in their school" ON public.school_subscriptions;
DROP POLICY IF EXISTS "Headteachers can insert subscriptions" ON public.school_subscriptions;
DROP POLICY IF EXISTS "Headteachers can update subscriptions" ON public.school_subscriptions;

-- Policy: Select
CREATE POLICY "Users can view school_subscriptions in their school"
ON public.school_subscriptions
FOR SELECT
TO authenticated
USING (school_id = public.my_school_id());

-- Policy: Insert
CREATE POLICY "Headteachers can insert subscriptions"
ON public.school_subscriptions
FOR INSERT
TO authenticated
WITH CHECK (
    school_id = public.my_school_id()
    AND public.my_role() = 'headteacher'
);

-- Policy: Update
CREATE POLICY "Headteachers can update subscriptions"
ON public.school_subscriptions
FOR UPDATE
TO authenticated
USING (
    school_id = public.my_school_id()
    AND public.my_role() = 'headteacher'
)
WITH CHECK (
    school_id = public.my_school_id()
    AND public.my_role() = 'headteacher'
);

-- Trigger to auto-update updated_at
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_proc
        WHERE proname = 'set_updated_at'
          AND pronamespace = 'public'::regnamespace
    ) THEN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_trigger
            WHERE tgname = 'tr_school_subscriptions_updated_at'
        ) THEN
            CREATE TRIGGER tr_school_subscriptions_updated_at
            BEFORE UPDATE ON public.school_subscriptions
            FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
        END IF;
    END IF;
END $$;

COMMIT;
