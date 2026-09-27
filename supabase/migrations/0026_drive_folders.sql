-- 0026_drive_folders.sql
-- Where the studio's own filing lives in Google Drive, so the portal can read
-- 05_Proposals and 06_Projects and offer to bring what's there into the portal.
-- Nothing is written to Drive by this: the importer only reads those folders.

alter table public.app_settings
  add column if not exists drive_proposals_folder_id text,   -- 05_Proposals
  add column if not exists drive_projects_folder_id  text;   -- 06_Projects
