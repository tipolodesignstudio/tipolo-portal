-- 0020 — the invoice as a document
--
-- Invoices are progress bills against a project's budget: each line carries the budget
-- agreed in the proposal, what earlier invoices already drew against it, and what this
-- one draws. Only the current column is typed; the rest is arithmetic.
--
-- Also widens the invoice sequence to three digits — YYNNN-XXX, from 001 — and pads
-- the numbers already issued so old and new sort together.

alter table public.invoices
  add column if not exists progress_lines jsonb not null default '[]'::jsonb,
    -- [{ id, description, budget, amount, source_time_entry_ids[], source_expense_ids[] }]
    --   budget  agreed fee for the line, snapshotted when the invoice is drafted
    --   amount  this invoice's draw ("Current Invoice"); previous draws are summed
    --           from the project's earlier invoices at render time
  add column if not exists sections jsonb not null default '[]'::jsonb,
    -- the editable document blocks: Invoice Details heading, Payment Information, …
  add column if not exists prepared_by text,
  add column if not exists apply_taxes boolean not null default true;

-- ---- invoice numbers: YYNNN-XXX ----
create or replace function public.next_invoice_number(p_project_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  p   public.projects%rowtype;
  seq int;
begin
  select * into p from public.projects where id = p_project_id for update;
  if not found then raise exception 'project not found'; end if;
  if p.number is null then raise exception 'project has no job number'; end if;

  seq := p.next_invoice_seq;
  update public.projects set next_invoice_seq = seq + 1 where id = p_project_id;

  return p.number || '-' || lpad(seq::text, 3, '0');
end;
$$;
grant execute on function public.next_invoice_number(uuid) to authenticated;

-- Numbers issued under the two-digit scheme: 26102-01 -> 26102-001.
update public.invoices
   set number = regexp_replace(number, '-([0-9]{2})$', '-0\1')
 where number ~ '-[0-9]{2}$';
