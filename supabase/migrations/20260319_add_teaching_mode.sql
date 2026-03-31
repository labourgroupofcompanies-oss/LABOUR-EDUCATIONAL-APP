-- Migration: Add teaching_mode to classes
-- Allows each class to operate as either:
--   'class_teacher'   → one teacher teaches all subjects (default)
--   'subject_teacher' → individual teachers assigned per subject

ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS teaching_mode TEXT NOT NULL DEFAULT 'class_teacher'
  CHECK (teaching_mode IN ('class_teacher', 'subject_teacher'));

COMMENT ON COLUMN classes.teaching_mode
  IS 'class_teacher = one teacher teaches every subject; subject_teacher = subjects assigned individually';
