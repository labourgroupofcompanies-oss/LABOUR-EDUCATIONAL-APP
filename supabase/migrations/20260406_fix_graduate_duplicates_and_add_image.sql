-- ============================================================
-- Migration: 20260406_fix_graduate_duplicates_and_add_image
-- 1. Cleans up duplicate graduate_records rows (keeps newest)
-- 2. Adds UNIQUE constraint on (school_id, student_id) to
--    prevent the same student being graduated twice
-- 3. Adds graduate_image_url column to store the student's
--    photo at time of graduation
-- ============================================================

-- ── Step 1: Clean up existing duplicate rows ─────────────────
-- For each (school_id, student_id) pair that has more than one
-- NON-deleted row, keep only the row with the newest updated_at
-- and soft-delete (mark is_deleted = true) on the rest.
DO $$
DECLARE
    _dup   RECORD;
    _keep  UUID;
BEGIN
    FOR _dup IN
        SELECT school_id, student_id, COUNT(*) AS cnt
        FROM   public.graduate_records
        WHERE  student_id IS NOT NULL
          AND  is_deleted = FALSE
        GROUP  BY school_id, student_id
        HAVING COUNT(*) > 1
    LOOP
        -- Pick the newest record to keep
        SELECT id INTO _keep
        FROM   public.graduate_records
        WHERE  school_id  = _dup.school_id
          AND  student_id = _dup.student_id
          AND  is_deleted = FALSE
        ORDER  BY updated_at DESC NULLS LAST,
                  created_at DESC NULLS LAST
        LIMIT  1;

        -- Soft-delete all others
        UPDATE public.graduate_records
        SET    is_deleted  = TRUE,
               updated_at  = NOW()
        WHERE  school_id  = _dup.school_id
          AND  student_id = _dup.student_id
          AND  id         <> _keep
          AND  is_deleted = FALSE;

        RAISE NOTICE 'Cleaned duplicate graduate_records for school=%, student=% — kept id=%',
                     _dup.school_id, _dup.student_id, _keep;
    END LOOP;
END $$;

-- Hard-delete the soft-deleted duplicates so the unique index can be applied cleanly
DELETE FROM public.graduate_records
WHERE is_deleted = TRUE;


-- ── Step 2: Add unique constraint ────────────────────────────
-- Partial unique index: only one active (non-deleted) graduate
-- record per student per school.
CREATE UNIQUE INDEX IF NOT EXISTS uq_graduate_records_school_student
    ON public.graduate_records (school_id, student_id)
    WHERE student_id IS NOT NULL;


-- ── Step 3: Add graduate_image_url column ────────────────────
-- Stores the public URL (or base64) of the student's photo
-- captured at the time of graduation.
ALTER TABLE public.graduate_records
    ADD COLUMN IF NOT EXISTS graduate_image_url TEXT;

COMMENT ON COLUMN public.graduate_records.graduate_image_url
    IS 'Photo URL or base64 of the student at graduation time';
