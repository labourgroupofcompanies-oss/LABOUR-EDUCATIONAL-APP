-- LABOUR-APP SYSTEM: FULL SYSTEM RESET SCRIPT
-- WARNING: This will PERMANENTLY DELETE ALL SCHOOLS, STUDENTS, STAFF, AND PAYMENTS.
-- Run this in your Supabase SQL Editor.

-- 1. Disable triggers temporarily to speed up (Optional)
-- SET session_replication_role = 'replica';

-- 2. Delete all records from all application tables
-- The order is important due to Foreign Key (FK) constraints, though ON DELETE CASCADE is mostly in place.

BEGIN;

DELETE FROM public.attendance;
DELETE FROM public.component_scores;
DELETE FROM public.results;
DELETE FROM public.fee_payments;
DELETE FROM public.fee_structures;
DELETE FROM public.payroll_records;
DELETE FROM public.expenses;
DELETE FROM public.assessment_configs;
DELETE FROM public.settings;
DELETE FROM public.subjects;
DELETE FROM public.classes;
DELETE FROM public.students;
DELETE FROM public.users;
DELETE FROM public.school_subscriptions;
DELETE FROM public.schools;

COMMIT;

-- 3. (Optional) Clear Supabase Auth Users
-- You must do this manually in the Supabase Dashboard under "Authentication" -> "Users"
-- OR run this snippet if you have service_role privileges enabled in the SQL editor:
/*
DO $$
DECLARE
  user_record RECORD;
BEGIN
  FOR user_record IN SELECT id FROM auth.users LOOP
    DELETE FROM auth.users WHERE id = user_record.id;
  END LOOP;
END $$;
*/

-- 4. Verify everything is empty
SELECT 'schools' as table, count(*) FROM public.schools
UNION ALL SELECT 'users', count(*) FROM public.users
UNION ALL SELECT 'students', count(*) FROM public.students;
