-- 0030_invoice_paid_date.sql
-- A paid invoice's date and method can be corrected after the fact; its income entry
-- follows, so Income & Expenses shows the payment on the day it actually came in.
--
-- And no double counting: when an invoice is marked paid and the payment was already
-- entered by hand (or came in from the Excel tracker) — an income row on the same project
-- for the same amount that isn't tied to an invoice — that row is linked to the invoice
-- instead of a second one being added. The closest date wins if there are several.

create or replace function public.invoice_income()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    update public.income
       set invoice_id     = new.id,
           income_date    = coalesce(new.paid_date, income_date),
           payment_method = coalesce(new.payment_method, payment_method)
     where id = (
       select i.id from public.income i
        where i.project_id = new.project_id and i.invoice_id is null and i.amount = new.total
        order by abs(i.income_date - coalesce(new.paid_date, current_date)), i.created_at
        limit 1);
    if found then return new; end if;
    insert into public.income (income_date, client_id, project_id, description, amount,
                               payment_method, invoice_id, created_by)
    select coalesce(new.paid_date, current_date), p.client_id, new.project_id,
           p.title, new.total, new.payment_method, new.id, auth.uid()
      from public.projects p where p.id = new.project_id
    on conflict (invoice_id) do nothing;
  elsif tg_op = 'UPDATE' and old.status = 'paid' and new.status is distinct from 'paid' then
    delete from public.income where invoice_id = new.id;
  elsif tg_op = 'UPDATE' and new.status = 'paid'
        and (old.paid_date is distinct from new.paid_date or old.payment_method is distinct from new.payment_method) then
    update public.income
       set income_date    = coalesce(new.paid_date, income_date),
           payment_method = new.payment_method
     where invoice_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists invoices_income on public.invoices;
create trigger invoices_income
  after insert or update of status, paid_date, payment_method on public.invoices
  for each row execute function public.invoice_income();
