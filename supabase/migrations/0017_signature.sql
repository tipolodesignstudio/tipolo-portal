-- 0017: the signature image that sits between "Sincerely," and the name on a proposal's
-- cover letter. Stored in the same public `branding` bucket as the logo.
alter table public.app_settings add column if not exists signature_url text;
