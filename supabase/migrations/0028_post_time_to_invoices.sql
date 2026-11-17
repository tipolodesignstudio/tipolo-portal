-- 0028_post_time_to_invoices.sql
-- Time is posted to the invoice that follows it. When an invoice goes out (finalized,
-- or brought in from Drive already sent or paid), every billable hour on its project
-- that isn't on an invoice yet and was logged on or before the invoice's date is
-- posted to it: billed as an hourly line, or settled by the fee it bills. Hours logged
-- after the date wait for the next invoice.

create or replace function public.post_time_to_invoice()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'draft' and new.issue_date is not null
     and (tg_op = 'INSERT' or old.status = 'draft' or old.issue_date is distinct from new.issue_date) then
    update public.time_entries
       set invoice_id = new.id
     where project_id = new.project_id
       and invoice_id is null
       and billable
       and entry_date <= new.issue_date;
  end if;
  return new;
end $$;

drop trigger if exists invoices_post_time on public.invoices;
create trigger invoices_post_time
  after insert or update of status, issue_date on public.invoices
  for each row execute function public.post_time_to_invoice();

-- Catch up: each unbilled hour goes to the first invoice issued on or after the day it
-- was logged. Hours after a project's latest invoice stay unbilled.
update public.time_entries t
   set invoice_id = (
     select i.id from public.invoices i
      where i.project_id = t.project_id and i.status <> 'draft' and i.issue_date >= t.entry_date
      order by i.issue_date, i.created_at
      limit 1)
 where t.invoice_id is null
   and t.billable
   and exists (
     select 1 from public.invoices i
      where i.project_id = t.project_id and i.status <> 'draft' and i.issue_date >= t.entry_date);
