-- 0018: let the app list and delete files in the `branding` bucket.
--
-- 0015 gave `branding` insert / update / delete policies but no select. Storage resolves
-- a row before it deletes or lists it, so without select both silently match nothing:
-- .remove() returns success with an empty array and the file stays. Public *reads* work
-- regardless (the bucket is public) — this policy is only for the signed-in app.
drop policy if exists "branding select" on storage.objects;

create policy "branding select" on storage.objects for select to authenticated
  using (bucket_id = 'branding');
