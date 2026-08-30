-- 0000_extensions.sql
-- Run first. Enables the extensions the schema relies on.
-- Supabase projects already have most of these, but `create extension if not exists`
-- is safe to run repeatedly.

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists citext;     -- case-insensitive text (emails)
