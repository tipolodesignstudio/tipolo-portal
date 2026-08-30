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
