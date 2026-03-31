-- Migration: Add First-Login Password Force Columns
-- Table: staff_profiles

-- 1. Add columns
ALTER TABLE staff_profiles 
ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

-- 2. Update existing users to FALSE (so they aren't locked out)
UPDATE staff_profiles 
SET must_change_password = FALSE 
WHERE must_change_password = TRUE; 

-- 3. Note: New users created after this migration will default to TRUE 
-- via the column level DEFAULT constraint.

-- 4. (Optional) Audit log for registration
-- You can check auth.users.created_at for the initial registration time.
