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
