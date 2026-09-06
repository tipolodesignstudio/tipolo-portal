-- 0016_proposal_source.sql  (PDF import)
-- Keeps the originating PDF alongside a proposal that was imported from one.
-- `source_pdf_path` stores the object PATH inside the private `proposal-sources`
-- bucket; the app opens it through a short-lived signed URL.

alter table public.proposals
  add column if not exists source_pdf_path text;

-- Private bucket for the uploaded originals (created here so there's no dashboard step).
insert into storage.buckets (id, name, public)
values ('proposal-sources', 'proposal-sources', false)
on conflict (id) do nothing;

drop policy if exists "proposal sources read"   on storage.objects;
drop policy if exists "proposal sources insert" on storage.objects;
drop policy if exists "proposal sources update" on storage.objects;
drop policy if exists "proposal sources delete" on storage.objects;

create policy "proposal sources read"   on storage.objects for select to authenticated
  using (bucket_id = 'proposal-sources');
create policy "proposal sources insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'proposal-sources');
create policy "proposal sources update" on storage.objects for update to authenticated
  using (bucket_id = 'proposal-sources');
create policy "proposal sources delete" on storage.objects for delete to authenticated
  using (bucket_id = 'proposal-sources');
