-- 0021 — staff rate tiers, day length, and the yearly numbering rule
--
-- Rates: one default hourly rate becomes a managed list of staff tiers, one of which is
-- the default. A day is a number of hours (8 unless changed), so the day rate is always
-- the hourly rate times that — there is no separate figure to keep in step.
--
-- Numbering: the sequence year follows the calendar and is no longer typed. On the
-- first job number drawn in a new year the count restarts at the client-work floor
-- (101), leaving YY001-YY100 for the studio's own work, and YY001 is created as the
-- year's internal project.

/* ---------------- staff rate tiers ---------------- */

create table if not exists public.staff_tiers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  hourly_rate numeric(10,2),
  is_default  boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Exactly one tier can be the default; it is the rate a proposal quotes and the one a
-- project falls back to.
create unique index if not exists staff_tiers_one_default
  on public.staff_tiers (is_default) where is_default;

drop trigger if exists staff_tiers_set_updated_at on public.staff_tiers;
create trigger staff_tiers_set_updated_at
  before update on public.staff_tiers
  for each row execute function public.set_updated_at();

alter table public.staff_tiers enable row level security;
drop policy if exists staff_tiers_all on public.staff_tiers;
create policy staff_tiers_all on public.staff_tiers
  for all to authenticated using (true) with check (true);

-- Carry the single rate over as the first tier, so nothing changes on the page.
insert into public.staff_tiers (name, hourly_rate, is_default, sort_order)
select 'Principal Designer', s.default_hourly_rate, true, 0
  from public.app_settings s
 where s.id = 1
   and not exists (select 1 from public.staff_tiers);

/* ---------------- settings ---------------- */

alter table public.app_settings
  -- A day's length, so the day rate is the hourly rate times this.
  add column if not exists hours_per_day numeric(4,2) not null default 8,
  -- Where client numbering starts each year; below it is the studio's own work.
  add column if not exists job_seq_start int not null default 101;

-- Superseded: the rate lives on the tiers, the day rate is worked out from hours_per_day.
alter table public.app_settings drop column if exists default_hourly_rate;
alter table public.app_settings drop column if exists default_day_rate;

-- Never below the floor, whatever the counter was left at.
update public.app_settings
   set job_seq_next = greatest(job_seq_next, job_seq_start)
 where id = 1;

/* ---------------- the studio's own client ---------------- */

alter table public.clients
  add column if not exists is_internal boolean not null default false;

/* ---------------- numbering ---------------- */

-- YYNNN. The year follows the calendar; a rollover restarts the count at the client
-- floor, and YY001..YY100 stay with the studio.
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
    update public.app_settings
       set job_seq_year = yr, job_seq_next = s.job_seq_start + 1
     where id = 1;
    seq := s.job_seq_start;
  else
    seq := greatest(s.job_seq_next, s.job_seq_start);
    update public.app_settings set job_seq_next = seq + 1 where id = 1;
  end if;

  return to_char(now(), 'YY') || lpad(seq::text, 3, '0');
end;
$$;
grant execute on function public.next_job_number() to authenticated;

-- The year's internal project, YY001. Idempotent: calling it twice in a year is a
-- no-op, so the app can call it on every sign-in and the rollover needs no scheduler.
create or replace function public.ensure_internal_project()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  num text := to_char(now(), 'YY') || '001';
  pid uuid;
  cid uuid;
  biz text;
begin
  select id into pid from public.projects where number = num;
  if pid is not null then return pid; end if;

  select coalesce(nullif(btrim(business_name), ''), 'Tipolo Design Studio')
    into biz from public.app_settings where id = 1;

  select id into cid from public.clients where is_internal order by created_at limit 1;
  if cid is null then
    insert into public.clients (name, is_internal, status)
         values (coalesce(biz, 'Tipolo Design Studio'), true, 'active')
      returning id into cid;
  end if;

  insert into public.projects (number, client_id, title, scope, status, start_date)
       values (num, cid, 'Studio Internal ' || to_char(now(), 'YYYY'), 'other', 'active',
               date_trunc('year', now())::date)
    returning id into pid;
  return pid;
end;
$$;
grant execute on function public.ensure_internal_project() to authenticated;

-- This year's, now.
select public.ensure_internal_project();
