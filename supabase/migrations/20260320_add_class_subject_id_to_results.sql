-- Add class_subject_id to results
ALTER TABLE public.results 
ADD COLUMN IF NOT EXISTS class_subject_id UUID REFERENCES public.class_subjects(id) ON DELETE CASCADE;

-- Add class_subject_id to component_scores
ALTER TABLE public.component_scores 
ADD COLUMN IF NOT EXISTS class_subject_id UUID REFERENCES public.class_subjects(id) ON DELETE CASCADE;

-- Because sync engine needs to upsert based on this, we need unique constraints
-- We will safely drop any existing constraints related to upserts on these tables first
DO $$ 
DECLARE
  constraint_name text;
BEGIN
  -- Find and drop existing unique constraints on results involving student_id, term, year
  FOR constraint_name IN 
    SELECT conname 
    FROM pg_constraint 
    WHERE conrelid = 'public.results'::regclass AND contype = 'u'
  LOOP
    EXECUTE 'ALTER TABLE public.results DROP CONSTRAINT IF EXISTS ' || constraint_name;
  END LOOP;

  -- Find and drop existing unique constraints on component_scores
  FOR constraint_name IN 
    SELECT conname 
    FROM pg_constraint 
    WHERE conrelid = 'public.component_scores'::regclass AND contype = 'u'
  LOOP
    EXECUTE 'ALTER TABLE public.component_scores DROP CONSTRAINT IF EXISTS ' || constraint_name;
  END LOOP;
END $$;

-- Create the required unique constraints for the syncService upserts
ALTER TABLE public.results
ADD CONSTRAINT results_student_class_subject_term_year_key 
UNIQUE (student_id, class_subject_id, term, year);

ALTER TABLE public.component_scores
ADD CONSTRAINT component_scores_student_class_subject_year_term_comp_key 
UNIQUE (student_id, class_subject_id, year, term, component_type, component_number);
