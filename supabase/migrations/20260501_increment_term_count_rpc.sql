-- ============================================================
-- RPC: Safely increment a school's term_count
-- ============================================================
CREATE OR REPLACE FUNCTION public.increment_school_term_count(school_uuid UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.schools
  SET term_count = COALESCE(term_count, 0) + 1
  WHERE id = school_uuid;
$$;

GRANT EXECUTE ON FUNCTION public.increment_school_term_count(UUID) TO authenticated;
