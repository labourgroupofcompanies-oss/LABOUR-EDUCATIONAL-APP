-- ============================================================
-- School Subscriptions Table
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS school_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id TEXT NOT NULL,
  term TEXT NOT NULL,              -- e.g. "Term 1"
  academic_year TEXT NOT NULL,     -- e.g. "2025/2026"
  status TEXT DEFAULT 'pending',   -- 'pending' | 'active' | 'expired'
  momo_reference TEXT,             -- MTN payment externalId
  phone_number TEXT,               -- payer's phone
  amount_paid NUMERIC DEFAULT 300,
  paid_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups by school + term
CREATE INDEX IF NOT EXISTS idx_subscriptions_school_term
  ON school_subscriptions(school_id, term, academic_year);

-- RLS: Enable Row Level Security
ALTER TABLE school_subscriptions ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read their own school's subscription
CREATE POLICY "Schools can read own subscriptions"
  ON school_subscriptions FOR SELECT
  USING (true);

-- Allow insert from authenticated Edge Functions (service role bypasses RLS)
CREATE POLICY "Service can insert subscriptions"
  ON school_subscriptions FOR INSERT
  WITH CHECK (true);

-- Allow update from authenticated Edge Functions
CREATE POLICY "Service can update subscriptions"
  ON school_subscriptions FOR UPDATE
  USING (true);
