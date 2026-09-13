-- 0022 — the original PDF follows a proposal into its project
--
-- A proposal imported for its phases and fees only leaves its wording in the PDF, so
-- the PDF has to stay reachable once the proposal becomes a project.

alter table public.projects
  add column if not exists source_pdf_path text;

-- Projects already converted from an imported proposal: carry the PDF across.
update public.projects p
   set source_pdf_path = pr.source_pdf_path
  from public.proposals pr
 where pr.converted_project_id = p.id
   and pr.source_pdf_path is not null
   and p.source_pdf_path is null;
