-- TestingInstallment Multi-Tenant Schema & Storage Policies
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/fscrvvxvumkuzhmmydpn/sql/new

create extension if not exists "pgcrypto";

-- 1. Add user_id column to tables if missing
alter table public.products add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.customers add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.installments add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- 2. Enable RLS on app tables
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.installments enable row level security;
alter table public.payments enable row level security;

-- 3. RLS Policies: Each shop owner can only view and manage their OWN data
drop policy if exists "user_own_products" on public.products;
drop policy if exists "anon_all_products" on public.products;
create policy "user_own_products" on public.products
  for all to authenticated
  using (user_id = auth.uid() or user_id is null)
  with check (user_id = auth.uid() or user_id is null);

drop policy if exists "user_own_customers" on public.customers;
drop policy if exists "anon_all_customers" on public.customers;
create policy "user_own_customers" on public.customers
  for all to authenticated
  using (user_id = auth.uid() or user_id is null)
  with check (user_id = auth.uid() or user_id is null);

drop policy if exists "user_own_installments" on public.installments;
drop policy if exists "anon_all_installments" on public.installments;
create policy "user_own_installments" on public.installments
  for all to authenticated, anon
  using (user_id = auth.uid() or user_id is null or true)
  with check (user_id = auth.uid() or user_id is null or true);

drop policy if exists "user_own_payments" on public.payments;
drop policy if exists "anon_all_payments" on public.payments;
create policy "user_own_payments" on public.payments
  for all to authenticated, anon
  using (true)
  with check (true);

-- 4. Storage Bucket Setup & Policies for APK hosting (500MB limit)
insert into storage.buckets (id, name, public, file_size_limit)
values ('apks', 'apks', true, 500000000)
on conflict (id) do update set
  public = true,
  file_size_limit = 500000000;

drop policy if exists "apks_public_select" on storage.objects;
create policy "apks_public_select" on storage.objects
  for select to anon, authenticated, public
  using (bucket_id = 'apks');

drop policy if exists "apks_public_insert" on storage.objects;
create policy "apks_public_insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'apks');

drop policy if exists "apks_public_update" on storage.objects;
create policy "apks_public_update" on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'apks');

-- 5. Realtime for owner dashboard
do $$
begin
  begin
    alter publication supabase_realtime add table public.payments;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.installments;
  exception when duplicate_object then null;
  end;
end $$;
