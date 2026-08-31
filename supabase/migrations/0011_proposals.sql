-- 0011_proposals.sql  (Phase 4)
-- Proposals are the entry point for all work: a project only exists as a converted
-- proposal, and inherits the proposal's job number (YYNNN).

create table if not exists public.proposal_templates (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  sections           jsonb not null default '[]'::jsonb,  -- [{heading, body}] with {{tokens}}
  default_line_items jsonb not null default '[]'::jsonb,   -- [{description, qty, unit_price}]
  created_by         uuid references auth.users(id) default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

drop trigger if exists proposal_templates_set_updated_at on public.proposal_templates;
create trigger proposal_templates_set_updated_at
  before update on public.proposal_templates
  for each row execute function public.set_updated_at();

create table if not exists public.proposals (
  id                   uuid primary key default gen_random_uuid(),
  number               text unique,                       -- YYNNN (trigger-assigned)
  template_id          uuid references public.proposal_templates(id) on delete set null,
  client_id            uuid not null references public.clients(id) on delete restrict,
  title                text not null,
  project_scope        text not null default 'other',     -- landscape | multimedia | other
  sections             jsonb not null default '[]'::jsonb, -- resolved + editable [{heading, body}]
  line_items           jsonb not null default '[]'::jsonb, -- [{description, qty, unit_price}]
  subtotal             numeric(12,2) not null default 0,
  valid_until          date,
  status               text not null default 'draft',      -- draft | sent | accepted | declined
  sent_date            date,
  decided_date         date,
  converted_project_id uuid references public.projects(id) on delete set null,
  created_by           uuid references auth.users(id) default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists proposals_client_idx on public.proposals (client_id);
create index if not exists proposals_status_idx on public.proposals (status);

drop trigger if exists proposals_set_updated_at on public.proposals;
create trigger proposals_set_updated_at
  before update on public.proposals
  for each row execute function public.set_updated_at();

-- job number on insert (same rule as projects; a proposal reserves the number when created)
create or replace function public.proposals_set_number()
returns trigger
language plpgsql
as $$
begin
  if new.number is null or btrim(new.number) = '' then
    new.number := public.next_job_number();
  end if;
  return new;
end;
$$;

drop trigger if exists proposals_set_number on public.proposals;
create trigger proposals_set_number
  before insert on public.proposals
  for each row execute function public.proposals_set_number();

alter table public.proposal_templates enable row level security;
alter table public.proposals          enable row level security;

drop policy if exists proposal_templates_all on public.proposal_templates;
create policy proposal_templates_all on public.proposal_templates
  for all to authenticated using (true) with check (true);

drop policy if exists proposals_all on public.proposals;
create policy proposals_all on public.proposals
  for all to authenticated using (true) with check (true);
