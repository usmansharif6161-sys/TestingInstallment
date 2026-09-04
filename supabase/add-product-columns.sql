-- Add detailed mobile product fields to products table
alter table public.products
  add column if not exists brand text,
  add column if not exists model text,
  add column if not exists ram text,
  add column if not exists storage text,
  add column if not exists color text,
  add column if not exists imei text;
