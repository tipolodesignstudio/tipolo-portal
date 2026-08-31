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
