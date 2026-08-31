-- 0015_storage_policies.sql  (Phase 5)
-- Storage access for the app's buckets. Uploads/edits/deletes are limited to
-- authenticated (@tipolo.ca) users. `receipts` should be a PRIVATE bucket — the app
-- serves each receipt through a short-lived signed URL, so reads are gated too.
-- `branding` (the logo) is a public bucket, so its reads stay open.

-- receipts: authenticated-only for everything
drop policy if exists "receipts read"   on storage.objects;
drop policy if exists "receipts insert" on storage.objects;
drop policy if exists "receipts update" on storage.objects;
drop policy if exists "receipts delete" on storage.objects;

create policy "receipts read"   on storage.objects for select to authenticated
  using (bucket_id = 'receipts');
create policy "receipts insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts');
create policy "receipts update" on storage.objects for update to authenticated
  using (bucket_id = 'receipts');
create policy "receipts delete" on storage.objects for delete to authenticated
  using (bucket_id = 'receipts');

-- branding: authenticated write, public read (bucket is public)
drop policy if exists "branding insert" on storage.objects;
drop policy if exists "branding update" on storage.objects;
drop policy if exists "branding delete" on storage.objects;

create policy "branding insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'branding');
create policy "branding update" on storage.objects for update to authenticated
  using (bucket_id = 'branding');
create policy "branding delete" on storage.objects for delete to authenticated
  using (bucket_id = 'branding');
