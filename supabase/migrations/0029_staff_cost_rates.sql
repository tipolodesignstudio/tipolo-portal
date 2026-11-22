-- 0029_staff_cost_rates.sql
-- Each person has an internal base rate: what an hour of their time costs the studio,
-- separate from the charge-out rate a client pays (which carries overhead and profit).
-- Every hour logged is a labour cost to the studio at that rate, billable or not.
--
-- The rate is copied onto each time entry when it's logged, so changing someone's rate
-- later doesn't rewrite the cost of work already done. Setting a rate for the first time
-- fills in the hours that person logged before it had one.

alter table public.profiles     add column if not exists cost_rate numeric(10,2);
alter table public.time_entries add column if not exists cost_rate numeric(10,2);

-- Staff rates are set from Settings for everyone, not only for yourself.
drop policy if exists profiles_update_team on public.profiles;
create policy profiles_update_team on public.profiles
  for update to authenticated using (true) with check (true);

create or replace function public.time_entry_cost_rate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.cost_rate is null then
    select p.cost_rate into new.cost_rate
      from public.profiles p where p.id = coalesce(new.created_by, auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists time_entries_cost_rate on public.time_entries;
create trigger time_entries_cost_rate
  before insert on public.time_entries
  for each row execute function public.time_entry_cost_rate();

create or replace function public.profile_cost_rate_backfill()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.cost_rate is not null then
    update public.time_entries set cost_rate = new.cost_rate
     where created_by = new.id and cost_rate is null;
  end if;
  return new;
end $$;

drop trigger if exists profiles_cost_rate_backfill on public.profiles;
create trigger profiles_cost_rate_backfill
  after update of cost_rate on public.profiles
  for each row execute function public.profile_cost_rate_backfill();
