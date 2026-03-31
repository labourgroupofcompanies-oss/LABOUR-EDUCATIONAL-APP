-- ============================================================
-- LABOUR-APP SYSTEM: CREATE settings TABLE
-- Date: 2026-03-10
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    key text NOT NULL,
    value jsonb,
    id_local integer,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_settings_key UNIQUE (school_id, key)
);

-- RLS
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Policy: Select
DROP POLICY IF EXISTS "Users can view settings in their school" ON public.settings;
CREATE POLICY "Users can view settings in their school"
ON public.settings
FOR SELECT
TO authenticated
USING (school_id = public.my_school_id());

-- Policy: Insert
DROP POLICY IF EXISTS "Users can insert settings in their school" ON public.settings;
CREATE POLICY "Users can insert settings in their school"
ON public.settings
FOR INSERT
TO authenticated
WITH CHECK (school_id = public.my_school_id());

-- Policy: Update
DROP POLICY IF EXISTS "Users can update settings in their school" ON public.settings;
CREATE POLICY "Users can update settings in their school"
ON public.settings
FOR UPDATE
TO authenticated
USING (school_id = public.my_school_id())
WITH CHECK (school_id = public.my_school_id());

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
            WHERE tgname = 'tr_settings_updated_at'
        ) THEN
            CREATE TRIGGER tr_settings_updated_at
            BEFORE UPDATE ON public.settings
            FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
        END IF;
    END IF;
END $$;

COMMIT;
