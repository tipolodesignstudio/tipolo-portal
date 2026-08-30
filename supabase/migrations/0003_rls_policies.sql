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
