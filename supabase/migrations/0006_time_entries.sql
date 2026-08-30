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
