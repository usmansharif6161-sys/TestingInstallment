-- Add CNIC and Alternate Phone columns to customers table
alter table public.customers
  add column if not exists cnic text,
  add column if not exists alternate_phone text;
