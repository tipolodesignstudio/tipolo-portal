-- 0012_contacts_categories.sql  (Phase 1 revision)
-- Multiple contacts per client; a managed list of client categories.

-- ---- client categories (managed list, edited in Settings) ----
create table if not exists public.client_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

insert into public.client_categories (name, sort_order) values
  ('Contractor', 1), ('Real Estate', 2), ('Owner', 3),
  ('Architect', 4), ('Designer', 5), ('Municipality', 6), ('Other', 99)
on conflict (name) do nothing;

alter table public.clients add column if not exists category_ids uuid[] not null default '{}';

-- ---- client contacts ----
create table if not exists public.client_contacts (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  name       text not null,
  title      text,
  email      text,
  phone      text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists client_contacts_client_idx on public.client_contacts (client_id);

drop trigger if exists client_contacts_set_updated_at on public.client_contacts;
create trigger client_contacts_set_updated_at
  before update on public.client_contacts
  for each row execute function public.set_updated_at();

-- migrate the old single contact_name (and the person for individual clients) into a
-- primary contact row
do $$
declare c record;
begin
  for c in select id, name, contact_name, is_individual, email, phone
             from public.clients loop
    if not exists (select 1 from public.client_contacts where client_id = c.id) then
      if c.is_individual then
        insert into public.client_contacts (client_id, name, email, phone, is_primary)
        values (c.id, c.name, c.email, c.phone, true);
      elsif c.contact_name is not null and btrim(c.contact_name) <> '' then
        insert into public.client_contacts (client_id, name, email, phone, is_primary)
        values (c.id, c.contact_name, c.email, c.phone, true);
      end if;
    end if;
  end loop;
end $$;

alter table public.clients drop column if exists contact_name;

-- ---- project-level contact override ----
alter table public.projects
  add column if not exists contact_id uuid references public.client_contacts(id) on delete set null;

-- ---- RLS ----
alter table public.client_categories enable row level security;
alter table public.client_contacts   enable row level security;

drop policy if exists client_categories_all on public.client_categories;
create policy client_categories_all on public.client_categories
  for all to authenticated using (true) with check (true);

drop policy if exists client_contacts_all on public.client_contacts;
create policy client_contacts_all on public.client_contacts
  for all to authenticated using (true) with check (true);
