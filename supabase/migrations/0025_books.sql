-- 0025_books.sql
-- The Income & Expense Tracker, in the portal. Expenses gain a description and a
-- receipt that lives in Google Drive; income is a new table that paid invoices fill in
-- on their own; fixed costs are a small yearly list. Every change stamps
-- app_settings.books_changed_at so the page can tell when the Excel copy in Drive is
-- behind.

/* ---- expense categories: the tracker's list ---- */
insert into public.expense_categories (name, sort_order) values
  ('Permits & Licenses', 1), ('Payroll', 2), ('Employee Benefit', 3),
  ('Equipment & Tools', 4), ('Software & Subscription', 5), ('Marketing', 6),
  ('Vehicle & Travel', 7), ('Office Supplies', 8), ('Client Entertainment', 9),
  ('Membership & Professional Fees', 10), ('Rent & Utilities', 11), ('Insurance', 12),
  ('Other', 99)
on conflict (name) do update set sort_order = excluded.sort_order;

-- the portal's original starter list goes, unless something already uses it
delete from public.expense_categories c
 where c.name in ('Materials', 'Subcontractor', 'Travel / mileage', 'Meals', 'Software',
                  'Equipment', 'Permits & fees', 'Printing')
   and not exists (select 1 from public.expenses e where e.category_id = c.id);

/* ---- expenses ---- */
alter table public.expenses
  add column if not exists description      text,
  add column if not exists receipt_drive_id  text,
  add column if not exists receipt_drive_url text,
  add column if not exists receipt_name      text;

update public.expenses set description = vendor
 where description is null and vendor is not null;

/* ---- income ---- */
create table if not exists public.income (
  id             uuid primary key default gen_random_uuid(),
  income_date    date not null default current_date,
  client_id      uuid references public.clients(id) on delete set null,
  project_id     uuid references public.projects(id) on delete set null,
  description    text,
  amount         numeric(12,2) not null default 0,
  payment_method text,
  invoice_id     uuid unique references public.invoices(id) on delete set null,
  created_by     uuid references auth.users(id) default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists income_date_idx on public.income (income_date);

drop trigger if exists income_set_updated_at on public.income;
create trigger income_set_updated_at
  before update on public.income
  for each row execute function public.set_updated_at();

alter table public.income enable row level security;
drop policy if exists income_all on public.income;
create policy income_all on public.income
  for all to authenticated using (true) with check (true);

/* ---- fixed costs ---- */
create table if not exists public.fixed_costs (
  id          uuid primary key default gen_random_uuid(),
  item        text not null default '',
  category_id uuid references public.expense_categories(id) on delete set null,
  annual_cost numeric(12,2) not null default 0,
  notes       text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists fixed_costs_set_updated_at on public.fixed_costs;
create trigger fixed_costs_set_updated_at
  before update on public.fixed_costs
  for each row execute function public.set_updated_at();

alter table public.fixed_costs enable row level security;
drop policy if exists fixed_costs_all on public.fixed_costs;
create policy fixed_costs_all on public.fixed_costs
  for all to authenticated using (true) with check (true);

/* ---- settings: payment methods, Drive locations, sync stamps ---- */
alter table public.app_settings
  add column if not exists expense_payment_methods jsonb not null default
    '["Tipolo Credit Card","Personal Credit Card","Cash","E-transfer","Cheque"]'::jsonb,
  add column if not exists income_payment_methods jsonb not null default
    '["Business card","Personal card","Cash","E-transfer","Cheque"]'::jsonb,
  add column if not exists drive_folder_id          text,   -- Accounting
  add column if not exists drive_receipts_folder_id text,   -- Accounting/Receipts
  add column if not exists drive_tracker_file_id    text,   -- the .xlsx
  add column if not exists books_changed_at  timestamptz not null default now(),
  add column if not exists tracker_synced_at timestamptz;

/* ---- a paid invoice is income ----
   Marking an invoice paid adds its income row; taking it back to unpaid removes it.
   Only the transition writes, so a description edited on the Income tab stays edited. */
create or replace function public.invoice_income()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    insert into public.income (income_date, client_id, project_id, description, amount,
                               payment_method, invoice_id, created_by)
    select coalesce(new.paid_date, current_date), p.client_id, new.project_id,
           p.title, new.total, new.payment_method, new.id, auth.uid()
      from public.projects p where p.id = new.project_id
    on conflict (invoice_id) do nothing;
  elsif tg_op = 'UPDATE' and old.status = 'paid' and new.status is distinct from 'paid' then
    delete from public.income where invoice_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists invoices_income on public.invoices;
create trigger invoices_income
  after insert or update of status on public.invoices
  for each row execute function public.invoice_income();

-- invoices already paid before this migration
insert into public.income (income_date, client_id, project_id, description, amount,
                           payment_method, invoice_id, created_by)
select coalesce(i.paid_date, i.issue_date), p.client_id, i.project_id, p.title, i.total,
       i.payment_method, i.id, i.created_by
  from public.invoices i join public.projects p on p.id = i.project_id
 where i.status = 'paid'
on conflict (invoice_id) do nothing;

/* ---- anything in the books changed → the Excel copy is behind ---- */
create or replace function public.touch_books()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.app_settings set books_changed_at = now() where id = 1;
  return null;
end $$;

drop trigger if exists expenses_touch_books on public.expenses;
create trigger expenses_touch_books after insert or update or delete on public.expenses
  for each statement execute function public.touch_books();
drop trigger if exists income_touch_books on public.income;
create trigger income_touch_books after insert or update or delete on public.income
  for each statement execute function public.touch_books();
drop trigger if exists fixed_costs_touch_books on public.fixed_costs;
create trigger fixed_costs_touch_books after insert or update or delete on public.fixed_costs
  for each statement execute function public.touch_books();
drop trigger if exists expense_categories_touch_books on public.expense_categories;
create trigger expense_categories_touch_books after insert or update or delete on public.expense_categories
  for each statement execute function public.touch_books();
