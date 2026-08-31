-- 0010_invoices.sql  (Phase 3)
-- One invoice belongs to one project. Number YYNNN-XX assigned on finalize.

create table if not exists public.invoices (
  id             uuid primary key default gen_random_uuid(),
  number         text unique,                       -- null while draft
  project_id     uuid not null references public.projects(id) on delete restrict,
  issue_date     date not null default current_date,
  due_date       date,
  line_items     jsonb not null default '[]'::jsonb,
    -- [{ description, qty, unit_price, kind:'time'|'fixed', source_time_entry_ids:[uuid] }]
  tax_lines      jsonb not null default '[]'::jsonb, -- [{ label, rate, amount }] snapshot
  subtotal       numeric(12,2) not null default 0,
  tax_total      numeric(12,2) not null default 0,
  total          numeric(12,2) not null default 0,
  notes          text,
  status         text not null default 'draft',     -- 'draft' | 'sent' | 'paid'
  sent_date      date,
  paid_date      date,
  payment_method text,
  created_by     uuid references auth.users(id) default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists invoices_project_idx on public.invoices (project_id);
create index if not exists invoices_status_idx  on public.invoices (status);

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

alter table public.invoices enable row level security;
drop policy if exists invoices_all on public.invoices;
create policy invoices_all on public.invoices
  for all to authenticated using (true) with check (true);

-- deferred FK from 0006: releasing time entries when an invoice is deleted
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'time_entries_invoice_fk') then
    alter table public.time_entries
      add constraint time_entries_invoice_fk
      foreign key (invoice_id) references public.invoices(id) on delete set null;
  end if;
end $$;
