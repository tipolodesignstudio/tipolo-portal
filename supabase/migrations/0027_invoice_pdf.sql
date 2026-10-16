-- 0027_invoice_pdf.sql
-- Invoices already filed in Google Drive (06_Projects/<job>/00_Administrative/Invoice/…)
-- can be brought into the portal like proposals: an invoice can be one built here, or a
-- PDF that is the invoice. Either kind can point at its PDF in Drive. The file stays in
-- Drive; the portal keeps only its id and link, so nothing is stored twice.

alter table public.invoices
  add column if not exists doc_mode text not null default 'builder',
  add column if not exists source_drive_id  text,
  add column if not exists source_drive_url text,
  add column if not exists source_name      text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_doc_mode_check') then
    alter table public.invoices add constraint invoices_doc_mode_check check (doc_mode in ('builder', 'pdf'));
  end if;
end $$;
