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
  id             uuid primary key default gen_random_uuid(),
  name           text not null,                   -- client / business name (primary identity)
  is_individual  boolean not null default false,  -- true => single contact = the person
  category_id    uuid,                            -- -> client_categories (FK added in 0012/0013)
  email          text,
  phone          text,
  street         text,
  city           text,
  province       text,
  postal_code    text,
  latest_note    text,                            -- denormalised newest client_notes entry
  latest_note_at timestamptz,
  default_rate   numeric(10,2),
  tags           text[] not null default '{}',
  status         text not null default 'active',  -- 'active' | 'archived'
  created_by     uuid references auth.users(id) default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
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
