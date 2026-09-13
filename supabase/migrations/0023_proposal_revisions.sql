-- 0023 — a proposal's revision history
--
-- Hand-written entries, not automatic snapshots: a date and what changed, the way a
-- revision block on a drawing set reads. Editable and deletable, because a log nobody
-- can correct stops being kept.

create table if not exists public.proposal_revisions (
  id          uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  revised_on  date not null default current_date,
  note        text,
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists proposal_revisions_proposal
  on public.proposal_revisions (proposal_id, revised_on desc, created_at desc);

drop trigger if exists proposal_revisions_set_updated_at on public.proposal_revisions;
create trigger proposal_revisions_set_updated_at
  before update on public.proposal_revisions
  for each row execute function public.set_updated_at();

alter table public.proposal_revisions enable row level security;
drop policy if exists proposal_revisions_all on public.proposal_revisions;
create policy proposal_revisions_all on public.proposal_revisions
  for all to authenticated using (true) with check (true);
