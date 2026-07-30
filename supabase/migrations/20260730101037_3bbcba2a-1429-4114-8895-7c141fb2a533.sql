ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS sales_contact_name text,
  ADD COLUMN IF NOT EXISTS sales_contact_email text,
  ADD COLUMN IF NOT EXISTS sales_contact_booking_link text;