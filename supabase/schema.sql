-- Tipolo Portal — full schema (Phases 0–4).
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
  job_seq_year        smallint not null default extract(year from now())::smallint,
  job_seq_next        int not null default 1,
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
  id            uuid primary key default gen_random_uuid(),
  name          text not null,                    -- client / business name (primary identity)
  contact_name  text,                             -- individual to deal with
  is_individual boolean not null default false,   -- true => name mirrors contact_name
  email         text,
  phone         text,
  street        text,
  city          text,
  province      text,
  postal_code   text,
  notes         text,
  default_rate  numeric(10,2),
  tags          text[] not null default '{}',
  status        text not null default 'active',   -- 'active' | 'archived'
  created_by    uuid references auth.users(id) default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
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
  number       text unique,                     -- job number YYNNN (trigger-assigned)
  next_invoice_seq int not null default 1,      -- per-project invoice counter
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
-- (Numbering functions moved to 0009_numbering.sql — job number YYNNN and
--  invoice number YYNNN-XX. This file is intentionally a no-op now; kept so the
--  migration sequence stays stable.)

select 1;

-- ================================================================
-- migrations/0005_seed_settings.sql
-- ================================================================
-- 0005_seed_settings.sql
-- Creates the single app_settings row. Tax lines pre-seeded for British Columbia
-- (5% GST + 7% PST). Business fields are left blank for Jim to fill in Settings.

insert into public.app_settings (id, currency, tax_lines, payment_terms, proposal_terms)
values (
  1,
  'CAD',
  '[{"label":"GST","rate":5,"enabled":true},
    {"label":"PST","rate":7,"enabled":true}]'::jsonb,
  'Payment due within 30 days of the invoice date. Please make cheques payable to '
    || 'Tipolo Design Studio or e-transfer to accounts@tipolo.ca.',
  'This proposal is valid for 30 days from the date above. A 50% deposit is required '
    || 'to reserve project time; the balance is invoiced on completion.'
)
on conflict (id) do nothing;

-- ================================================================
-- migrations/0006_time_entries.sql
-- ================================================================
-- 0006_time_entries.sql  (Phase 2)
-- Timesheet entries. Additive — safe to run on an existing database.

create table if not exists public.time_entries (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  entry_date  date not null default current_date,
  description text,
  minutes     int not null default 0 check (minutes >= 0),
  billable    boolean not null default true,
  rate        numeric(10,2),            -- snapshot of the effective rate when logged
  invoice_id  uuid,                     -- set when billed (FK added in Phase 3)
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists time_entries_project_idx  on public.time_entries (project_id);
create index if not exists time_entries_date_idx     on public.time_entries (entry_date);
create index if not exists time_entries_invoice_idx  on public.time_entries (invoice_id);
create index if not exists time_entries_created_by_idx on public.time_entries (created_by);

drop trigger if exists time_entries_set_updated_at on public.time_entries;
create trigger time_entries_set_updated_at
  before update on public.time_entries
  for each row execute function public.set_updated_at();

alter table public.time_entries enable row level security;

drop policy if exists time_entries_all on public.time_entries;
create policy time_entries_all on public.time_entries
  for all to authenticated using (true) with check (true);

-- ================================================================
-- migrations/0007_clients_contact.sql
-- ================================================================
-- 0007_clients_contact.sql  (Phase 1 revision)
-- Clients are primarily businesses. `name` now holds the CLIENT / business name
-- (what projects link to and what lists show). `contact_name` is the individual to
-- deal with. For an individual client with no business, the UI keeps name = contact_name
-- and sets is_individual = true.
--
-- Safe to run on a fresh database (where 0001 already created the new shape and the
-- old `company` column never existed) or on the earlier schema.

alter table public.clients add column if not exists contact_name text;
alter table public.clients add column if not exists is_individual boolean not null default false;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clients' and column_name = 'company'
  ) then
    -- old shape: name = person, company = business -> flip
    update public.clients
       set contact_name = name,
           name         = company
     where company is not null and btrim(company) <> '';

    update public.clients
       set is_individual = true,
           contact_name  = coalesce(contact_name, name)
     where company is null or btrim(company) = '';

    alter table public.clients drop column company;
  end if;
end $$;

-- ================================================================
-- migrations/0008_client_address.sql
-- ================================================================
-- 0008_client_address.sql  (Phase 1 revision)
-- Structured address on clients: street / city / province / postal_code, replacing the
-- old single-line `address` text. Safe to run on a fresh DB or the earlier schema.

alter table public.clients add column if not exists street       text;
alter table public.clients add column if not exists city         text;
alter table public.clients add column if not exists province     text;
alter table public.clients add column if not exists postal_code  text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clients' and column_name = 'address'
  ) then
    update public.clients
       set street = address
     where address is not null and btrim(address) <> '' and street is null;
    alter table public.clients drop column address;
  end if;
end $$;

-- ================================================================
-- migrations/0009_numbering.sql
-- ================================================================
-- 0009_numbering.sql  (Phase 3 — job / invoice numbering)
--
-- Job number   YYNNN     e.g. 25001  (2-digit year + 3-digit sequence, resets each year)
--   - assigned to a project on creation, or to a proposal on creation (Phase 4)
--   - a proposal that converts to a project hands its number to the project
-- Invoice number  YYNNN-XX   e.g. 25001-01  (parent project's number + 2-digit
--   per-project sequence, starting at 01)

-- ---- app_settings: swap the old prefix/seq columns for the job sequence ----
alter table public.app_settings add column if not exists job_seq_year smallint
  not null default extract(year from now())::smallint;
alter table public.app_settings add column if not exists job_seq_next int
  not null default 1;

alter table public.app_settings drop column if exists invoice_prefix;
alter table public.app_settings drop column if exists invoice_year_reset;
alter table public.app_settings drop column if exists invoice_next_seq;

-- ---- projects: job number + per-project invoice counter ----
alter table public.projects add column if not exists number text;
alter table public.projects add column if not exists next_invoice_seq int not null default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'projects_number_key') then
    alter table public.projects add constraint projects_number_key unique (number);
  end if;
end $$;

-- ---- next_job_number(): YYNNN, resets when the calendar year rolls over ----
create or replace function public.next_job_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  s   public.app_settings%rowtype;
  yr  smallint := extract(year from now())::smallint;
  seq int;
begin
  select * into s from public.app_settings where id = 1 for update;
  if not found then raise exception 'app_settings row is missing'; end if;

  if s.job_seq_year <> yr then
    update public.app_settings set job_seq_year = yr, job_seq_next = 2 where id = 1;
    seq := 1;
  else
    seq := s.job_seq_next;
    update public.app_settings set job_seq_next = seq + 1 where id = 1;
  end if;

  return to_char(now(), 'YY') || lpad(seq::text, 3, '0');
end;
$$;
grant execute on function public.next_job_number() to authenticated;

-- ---- assign a job number to every project that lacks one ----
create or replace function public.projects_set_number()
returns trigger
language plpgsql
as $$
begin
  if new.number is null or btrim(new.number) = '' then
    new.number := public.next_job_number();
  end if;
  return new;
end;
$$;

drop trigger if exists projects_set_number on public.projects;
create trigger projects_set_number
  before insert on public.projects
  for each row execute function public.projects_set_number();

-- backfill existing rows (deterministic order by creation)
do $$
declare r record;
begin
  for r in select id from public.projects where number is null order by created_at loop
    update public.projects set number = public.next_job_number() where id = r.id;
  end loop;
end $$;

-- ---- next_invoice_number(project): YYNNN-XX ----
drop function if exists public.next_invoice_number();
create or replace function public.next_invoice_number(p_project_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  p   public.projects%rowtype;
  seq int;
begin
  select * into p from public.projects where id = p_project_id for update;
  if not found then raise exception 'project not found'; end if;
  if p.number is null then raise exception 'project has no job number'; end if;

  seq := p.next_invoice_seq;
  update public.projects set next_invoice_seq = seq + 1 where id = p_project_id;

  return p.number || '-' || lpad(seq::text, 2, '0');
end;
$$;
grant execute on function public.next_invoice_number(uuid) to authenticated;

-- ================================================================
-- migrations/0010_invoices.sql
-- ================================================================
-- 0010_invoices.sql  (Phase 3)
-- One invoice belongs to one project. Number YYNNN-XX assigned on finalize.

create table if not exists public.invoices (
  id             uuid primary key default gen_random_uuid(),
  number         text unique,                       -- null while draft
  project_id     uuid not null references public.projects(id) on delete restrict,
  issue_date     date not null default current_date,
  due_date       date,
  line_items     jsonb not null default '[]'::jsonb,
    -- [{ description, qty, unit_price, kind:'time'|'fixed', source_time_entry_ids:[uuid] }]
  tax_lines      jsonb not null default '[]'::jsonb, -- [{ label, rate, amount }] snapshot
  subtotal       numeric(12,2) not null default 0,
  tax_total      numeric(12,2) not null default 0,
  total          numeric(12,2) not null default 0,
  notes          text,
  status         text not null default 'draft',     -- 'draft' | 'sent' | 'paid'
  sent_date      date,
  paid_date      date,
  payment_method text,
  created_by     uuid references auth.users(id) default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists invoices_project_idx on public.invoices (project_id);
create index if not exists invoices_status_idx  on public.invoices (status);

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

alter table public.invoices enable row level security;
drop policy if exists invoices_all on public.invoices;
create policy invoices_all on public.invoices
  for all to authenticated using (true) with check (true);

-- deferred FK from 0006: releasing time entries when an invoice is deleted
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'time_entries_invoice_fk') then
    alter table public.time_entries
      add constraint time_entries_invoice_fk
      foreign key (invoice_id) references public.invoices(id) on delete set null;
  end if;
end $$;

-- ================================================================
-- migrations/0011_proposals.sql
-- ================================================================
-- 0011_proposals.sql  (Phase 4)
-- Proposals are the entry point for all work: a project only exists as a converted
-- proposal, and inherits the proposal's job number (YYNNN).

create table if not exists public.proposal_templates (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  sections           jsonb not null default '[]'::jsonb,  -- [{heading, body}] with {{tokens}}
  default_line_items jsonb not null default '[]'::jsonb,   -- [{description, qty, unit_price}]
  created_by         uuid references auth.users(id) default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

drop trigger if exists proposal_templates_set_updated_at on public.proposal_templates;
create trigger proposal_templates_set_updated_at
  before update on public.proposal_templates
  for each row execute function public.set_updated_at();

create table if not exists public.proposals (
  id                   uuid primary key default gen_random_uuid(),
  number               text unique,                       -- YYNNN (trigger-assigned)
  template_id          uuid references public.proposal_templates(id) on delete set null,
  client_id            uuid not null references public.clients(id) on delete restrict,
  title                text not null,
  project_scope        text not null default 'other',     -- landscape | multimedia | other
  sections             jsonb not null default '[]'::jsonb, -- resolved + editable [{heading, body}]
  line_items           jsonb not null default '[]'::jsonb, -- [{description, qty, unit_price}]
  subtotal             numeric(12,2) not null default 0,
  valid_until          date,
  status               text not null default 'draft',      -- draft | sent | accepted | declined
  sent_date            date,
  decided_date         date,
  converted_project_id uuid references public.projects(id) on delete set null,
  created_by           uuid references auth.users(id) default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists proposals_client_idx on public.proposals (client_id);
create index if not exists proposals_status_idx on public.proposals (status);

drop trigger if exists proposals_set_updated_at on public.proposals;
create trigger proposals_set_updated_at
  before update on public.proposals
  for each row execute function public.set_updated_at();

-- job number on insert (same rule as projects; a proposal reserves the number when created)
create or replace function public.proposals_set_number()
returns trigger
language plpgsql
as $$
begin
  if new.number is null or btrim(new.number) = '' then
    new.number := public.next_job_number();
  end if;
  return new;
end;
$$;

drop trigger if exists proposals_set_number on public.proposals;
create trigger proposals_set_number
  before insert on public.proposals
  for each row execute function public.proposals_set_number();

alter table public.proposal_templates enable row level security;
alter table public.proposals          enable row level security;

drop policy if exists proposal_templates_all on public.proposal_templates;
create policy proposal_templates_all on public.proposal_templates
  for all to authenticated using (true) with check (true);

drop policy if exists proposals_all on public.proposals;
create policy proposals_all on public.proposals
  for all to authenticated using (true) with check (true);

