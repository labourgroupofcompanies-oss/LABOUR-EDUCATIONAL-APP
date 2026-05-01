-- Add is_read column to customer_inquiries
ALTER TABLE public.customer_inquiries 
ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false;
