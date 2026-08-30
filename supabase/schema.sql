-- Tipolo Portal — full schema (Phase 0 + 1).
-- Paste into the Supabase SQL editor and Run. Safe to re-run.

-- ================================================================
-- migrations/0000_extensions.sql
-- ================================================================
-- 0000_extensions.sql
-- Run first. Enables the extensions the schema relies on.
-- Supabase projects already have most of these, but `create extension if not exists`
-- is safe to run repeatedly.

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists citext;     -- case-insensitive text (emails)

-- ================================================================
-- migrations/0001_core_schema.sql
-- ================================================================
-- 0001_core_schema.sql
-- Core tables for Phase 0 (settings + profiles) and Phase 1 (clients + projects).
-- Later phases add time_entries / invoices / proposals in their own migration files.

-- ---------------------------------------------------------------------------
-- shared trigger: keep updated_at current
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles  (one row per auth user, populated by trigger in 0002)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text,
  role       text not null default 'member',   -- 'admin' | 'member' (unused in v1)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- app_settings  (single row, id = 1)
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  id                  int primary key default 1,
  business_name       text,
  address             text,
  email               text,
  phone               text,
  gst_number          text,
  pst_number          text,
  logo_url            text,
  tax_lines           jsonb not null default
                        '[{"label":"GST","rate":5,"enabled":true},
                          {"label":"PST","rate":7,"enabled":true}]'::jsonb,
  currency            text not null default 'CAD',
  default_hourly_rate numeric(10,2),
  invoice_prefix      text not null default 'TIP',
  invoice_year_reset  boolean not null default true,
  invoice_next_seq    int not null default 1,
  payment_terms       text,
  proposal_terms      text,
  updated_at          timestamptz not null default now(),
  constraint app_settings_singleton check (id = 1)
);

drop trigger if exists app_settings_set_updated_at on public.app_settings;
create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
create table if not exists public.clients (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  company      text,
  email        text,
  phone        text,
  address      text,
  notes        text,
  default_rate numeric(10,2),
  tags         text[] not null default '{}',
  status       text not null default 'active',   -- 'active' | 'archived'
  created_by   uuid references auth.users(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists clients_status_idx on public.clients (status);

drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id) on delete restrict,
  title        text not null,
  description  text,
  scope        text not null default 'other',    -- 'landscape' | 'multimedia' | 'other'
  status       text not null default 'lead',
                 -- 'lead' | 'proposal' | 'active' | 'on_hold' | 'complete' | 'archived'
  start_date   date,
  due_date     date,
  budget       numeric(12,2),
  hourly_rate  numeric(10,2),                    -- null => inherit client / default
  deliverables jsonb not null default '[]'::jsonb,   -- [{label, done}]
  created_by   uuid references auth.users(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists projects_client_id_idx on public.projects (client_id);
create index if not exists projects_status_idx    on public.projects (status);

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- ================================================================
-- migrations/0002_auth_domain_restriction.sql
-- ================================================================
-- 0002_auth_domain_restriction.sql
-- Enforce that only @tipolo.ca email addresses can create accounts, and mirror every
-- new auth user into public.profiles.
--
-- Client-side signup also checks the domain for a friendly message; this trigger is
-- the real gate (defense in depth) and cannot be bypassed.

-- ---------------------------------------------------------------------------
-- domain gate
-- ---------------------------------------------------------------------------
create or replace function public.enforce_email_domain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(coalesce(new.email, '')) not like '%@tipolo.ca' then
    raise exception 'TIPOLO_DOMAIN_ONLY: only @tipolo.ca email addresses may sign up'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_email_domain on auth.users;
create trigger enforce_email_domain
  before insert on auth.users
  for each row execute function public.enforce_email_domain();

-- ---------------------------------------------------------------------------
-- mirror auth.users -> public.profiles
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ================================================================
-- migrations/0003_rls_policies.sql
-- ================================================================
-- 0003_rls_policies.sql
-- Row-level security. v1 policy: any confirmed, logged-in user has full access to
-- business data. Structured as one policy per table so tightening to roles later is
-- a localized change.
--
-- profiles is slightly stricter: everyone can read, but a user can only update their
-- own row.

alter table public.profiles     enable row level security;
alter table public.app_settings enable row level security;
alter table public.clients      enable row level security;
alter table public.projects     enable row level security;

-- ---- profiles -------------------------------------------------------------
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---- app_settings -------------------------------------------------------------
drop policy if exists app_settings_all on public.app_settings;
create policy app_settings_all on public.app_settings
  for all to authenticated using (true) with check (true);

-- ---- clients -------------------------------------------------------------
drop policy if exists clients_all on public.clients;
create policy clients_all on public.clients
  for all to authenticated using (true) with check (true);

-- ---- projects -------------------------------------------------------------
drop policy if exists projects_all on public.projects;
create policy projects_all on public.projects
  for all to authenticated using (true) with check (true);

-- ================================================================
-- migrations/0004_functions.sql
-- ================================================================
-- 0004_functions.sql
-- RPC helpers callable from the frontend via supabase.rpc(...).

-- ---------------------------------------------------------------------------
-- next_invoice_number()
-- Atomically consumes one number from app_settings and returns it formatted,
-- e.g.  TIP-2026-0007   (year segment only when invoice_year_reset = true).
-- security definer so it is the single writer of invoice_next_seq regardless of
-- the caller's table policies; safe because it takes no user input.
-- ---------------------------------------------------------------------------
create or replace function public.next_invoice_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  s          public.app_settings%rowtype;
  seq_to_use int;
  year_txt   text := to_char(now(), 'YYYY');
begin
  -- lock the settings row for the duration of the transaction
  select * into s from public.app_settings where id = 1 for update;
  if not found then
    raise exception 'app_settings row is missing (run 0005_seed_settings.sql)';
  end if;

  seq_to_use := s.invoice_next_seq;
  update public.app_settings
     set invoice_next_seq = seq_to_use + 1
   where id = 1;

  if s.invoice_year_reset then
    return format('%s-%s-%s', s.invoice_prefix, year_txt, lpad(seq_to_use::text, 4, '0'));
  else
    return format('%s-%s', s.invoice_prefix, lpad(seq_to_use::text, 5, '0'));
  end if;
end;
$$;

grant execute on function public.next_invoice_number() to authenticated;

-- ================================================================
-- migrations/0005_seed_settings.sql
-- ================================================================
-- 0005_seed_settings.sql
-- Creates the single app_settings row. Tax lines pre-seeded for British Columbia
-- (5% GST + 7% PST). Business fields are left blank for Jim to fill in Settings.

insert into public.app_settings (id, currency, invoice_prefix, invoice_year_reset,
                                 invoice_next_seq, tax_lines, payment_terms, proposal_terms)
values (
  1,
  'CAD',
  'TIP',
  true,
  1,
  '[{"label":"GST","rate":5,"enabled":true},
    {"label":"PST","rate":7,"enabled":true}]'::jsonb,
  'Payment due within 30 days of the invoice date. Please make cheques payable to '
    || 'Tipolo Design Studio or e-transfer to accounts@tipolo.ca.',
  'This proposal is valid for 30 days from the date above. A 50% deposit is required '
    || 'to reserve project time; the balance is invoiced on completion.'
)
on conflict (id) do nothing;

