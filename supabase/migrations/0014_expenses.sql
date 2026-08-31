-- 0014_expenses.sql  (Phase 5)
-- Project and business expenses. Billable expenses can be pulled onto a project's
-- invoice (with optional markup), like unbilled time.

create table if not exists public.expense_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

insert into public.expense_categories (name, sort_order) values
  ('Materials', 1), ('Subcontractor', 2), ('Travel / mileage', 3), ('Meals', 4),
  ('Software', 5), ('Equipment', 6), ('Permits & fees', 7), ('Printing', 8), ('Other', 99)
on conflict (name) do nothing;

create table if not exists public.expenses (
  id             uuid primary key default gen_random_uuid(),
  expense_date   date not null default current_date,
  vendor         text,
  category_id    uuid references public.expense_categories(id) on delete set null,
  amount         numeric(12,2) not null default 0,   -- total, tax included
  tax_amount     numeric(12,2) not null default 0,   -- tax portion (for ITC tracking)
  project_id     uuid references public.projects(id) on delete set null,
  billable       boolean not null default false,
  markup_pct     numeric(6,2) not null default 0,    -- applied when billed
  payment_method text,
  notes          text,
  receipt_url    text,
  invoice_id     uuid references public.invoices(id) on delete set null,  -- set when billed
  created_by     uuid references auth.users(id) default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists expenses_project_idx  on public.expenses (project_id);
create index if not exists expenses_date_idx     on public.expenses (expense_date);
create index if not exists expenses_category_idx on public.expenses (category_id);
create index if not exists expenses_invoice_idx  on public.expenses (invoice_id);

drop trigger if exists expenses_set_updated_at on public.expenses;
create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

alter table public.expense_categories enable row level security;
alter table public.expenses           enable row level security;

drop policy if exists expense_categories_all on public.expense_categories;
create policy expense_categories_all on public.expense_categories
  for all to authenticated using (true) with check (true);

drop policy if exists expenses_all on public.expenses;
create policy expenses_all on public.expenses
  for all to authenticated using (true) with check (true);
