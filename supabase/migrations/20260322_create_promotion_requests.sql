-- ============================================================
-- LABOUR-APP SYSTEM: Create Promotion Requests Table
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.promotion_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    from_class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    to_class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    requested_by uuid NOT NULL REFERENCES auth.users(id),
    reviewed_by uuid REFERENCES auth.users(id),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reason text,
    review_note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    reviewed_at timestamptz,
    is_deleted boolean NOT NULL DEFAULT false,
    id_local integer,
    
    -- Prevent same-class promotion
    CONSTRAINT check_different_class CHECK (from_class_id != to_class_id)
);

-- Ensure a student only has ONE active pending request at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_pending_promotion 
ON public.promotion_requests (student_id, status) 
WHERE status = 'pending' AND is_deleted = false;

ALTER TABLE public.promotion_requests ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- RLS POLICIES
-- ===========================================

-- 1. Everyone in the school can *View* the requests
DROP POLICY IF EXISTS "Users can view school promotions" ON public.promotion_requests;
CREATE POLICY "Users can view school promotions"
ON public.promotion_requests FOR SELECT TO authenticated
USING (school_id = public.my_school_id());

-- 2. Teachers can INSERT only during "Term 3"
DROP POLICY IF EXISTS "Teachers can insert promotions strictly in Term 3" ON public.promotion_requests;
CREATE POLICY "Teachers can insert promotions strictly in Term 3"
ON public.promotion_requests FOR INSERT TO authenticated
WITH CHECK (
    school_id = public.my_school_id() AND
    requested_by = auth.uid() AND
    -- Cross-check the settings table securely
    EXISTS (
        SELECT 1 FROM public.settings 
        WHERE public.settings.school_id = public.my_school_id() 
        AND key = 'currentTerm' 
        AND value::text = '"Term 3"'
    )
);

-- 3. Headteachers can UPDATE (Approve/Reject)
DROP POLICY IF EXISTS "Headteachers can update promotion requests" ON public.promotion_requests;
CREATE POLICY "Headteachers can update promotion requests"
ON public.promotion_requests FOR UPDATE TO authenticated
USING (
    school_id = public.my_school_id() AND
    EXISTS (
        SELECT 1 FROM public.staff_profiles 
        WHERE id = auth.uid() 
        AND lower(role) IN ('headteacher', 'admin', 'developer')
    )
)
WITH CHECK (
    school_id = public.my_school_id()
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
            WHERE tgname = 'tr_promotion_requests_updated_at'
        ) THEN
            CREATE TRIGGER tr_promotion_requests_updated_at
            BEFORE UPDATE ON public.promotion_requests
            FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
        END IF;
    END IF;
END $$;

COMMIT;
