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
