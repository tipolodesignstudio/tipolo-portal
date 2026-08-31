-- 0013_client_notes_category.sql  (Phase 1 revision — CRM)
-- One category per client (was a multi-value array). Notes become a dated timeline:
-- each edit is a new entry, older entries are the client's history/archive.

-- ---- single category ----
alter table public.clients add column if not exists category_id uuid;

-- ensure the FK exists (the column may have been created without it in 0001)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_category_id_fkey') then
    alter table public.clients
      add constraint clients_category_id_fkey
      foreign key (category_id) references public.client_categories(id) on delete set null;
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='clients' and column_name='category_ids') then
    update public.clients
       set category_id = category_ids[1]
     where category_id is null and array_length(category_ids, 1) >= 1;
    alter table public.clients drop column category_ids;
  end if;
end $$;

-- ---- notes timeline ----
create table if not exists public.client_notes (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  body       text not null,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists client_notes_client_idx on public.client_notes (client_id, created_at desc);

alter table public.clients add column if not exists latest_note    text;
alter table public.clients add column if not exists latest_note_at timestamptz;

-- keep the denormalised "latest note" on clients current (fast list rendering)
create or replace function public.client_notes_touch()
returns trigger language plpgsql as $$
begin
  update public.clients
     set latest_note = new.body, latest_note_at = new.created_at
   where id = new.client_id;
  return new;
end;
$$;
drop trigger if exists client_notes_touch on public.client_notes;
create trigger client_notes_touch
  after insert on public.client_notes
  for each row execute function public.client_notes_touch();

-- migrate any existing free-text notes into the timeline
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='clients' and column_name='notes') then
    insert into public.client_notes (client_id, body, created_at)
    select id, notes, coalesce(updated_at, now())
      from public.clients
     where notes is not null and btrim(notes) <> '';
    alter table public.clients drop column notes;
  end if;
end $$;

alter table public.client_notes enable row level security;
drop policy if exists client_notes_all on public.client_notes;
create policy client_notes_all on public.client_notes
  for all to authenticated using (true) with check (true);
