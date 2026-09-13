-- 0024 — a proposal is either built here or it is a PDF
--
-- A proposal imported from a finished PDF is not a document to rebuild: the PDF is the
-- document. The portal only wants the client and the fee schedule out of it, so those
-- can drive the project, its budget and its invoices.
--
--   'builder'  written in the proposal builder; sections are the document
--   'pdf'      the attached PDF is the document; sections are unused

alter table public.proposals
  add column if not exists doc_mode text not null default 'builder';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'proposals_doc_mode_check') then
    alter table public.proposals
      add constraint proposals_doc_mode_check check (doc_mode in ('builder', 'pdf'));
  end if;
end $$;

-- Proposals already imported from a PDF that were never written in the builder.
update public.proposals
   set doc_mode = 'pdf'
 where source_pdf_path is not null
   and doc_mode = 'builder'
   and coalesce(jsonb_array_length(sections), 0) = 0;
