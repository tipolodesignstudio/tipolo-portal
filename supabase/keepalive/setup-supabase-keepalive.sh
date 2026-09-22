#!/usr/bin/env bash
# Creates the tipolodesignstudio/supabase-keepalive repository, writes the
# workflow, sets the secrets, pushes, and kicks off a first run.
# Requires the GitHub CLI (https://cli.github.com) -- run `gh auth login` first.
set -euo pipefail

REPO_NAME="${REPO_NAME:-supabase-keepalive}"
DIR="${DIR:-$HOME/$REPO_NAME}"

command -v gh  >/dev/null || { echo "gh (GitHub CLI) is not installed."; exit 1; }
command -v git >/dev/null || { echo "git is not installed."; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Run 'gh auth login' first."; exit 1; }
[ -e "$DIR" ] && { echo "$DIR already exists. Remove it or set DIR=..."; exit 1; }

echo "Supabase project URL (https://<project-ref>.supabase.co):"
read -r SUPABASE_URL
echo "Supabase anon / publishable key (input hidden):"
read -rs SUPABASE_KEY
echo

[ -n "$SUPABASE_URL" ] || { echo "URL is required."; exit 1; }
[ -n "$SUPABASE_KEY" ] || { echo "Key is required."; exit 1; }

mkdir -p "$DIR"
cd "$DIR"
mkdir -p ".github/workflows"
cat > '.github/workflows/keepalive.yml' <<'EOF__GITHUB_WORKFLOWS_KEEPALIVE_YML'
name: Supabase keepalive

on:
  schedule:
    # 07:23 UTC, daily. Supabase pauses free projects after ~7 days of no
    # activity. Daily leaves plenty of margin, because GitHub's scheduler
    # delays or drops runs when it is under load.
    - cron: '23 7 * * *'
  workflow_dispatch:

concurrency:
  group: supabase-keepalive
  cancel-in-progress: false

permissions:
  contents: write

jobs:
  ping:
    runs-on: ubuntu-latest
    timeout-minutes: 5

    steps:
      - uses: actions/checkout@v4

      - name: Touch the keepalive row
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}
        run: |
          set -euo pipefail

          if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_KEY:-}" ]; then
            echo "::error::Repository secrets SUPABASE_URL and SUPABASE_KEY must both be set."
            exit 1
          fi

          now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
          body="$(printf '{"last_seen":"%s"}' "$now")"
          code=""

          for attempt in 1 2 3; do
            : > /tmp/resp.json
            code="$(curl -sS -o /tmp/resp.json -w '%{http_code}' \
              -X PATCH "${SUPABASE_URL%/}/rest/v1/keepalive?id=eq.1" \
              -H "apikey: ${SUPABASE_KEY}" \
              -H "Authorization: Bearer ${SUPABASE_KEY}" \
              -H "Content-Type: application/json" \
              -H "Prefer: return=representation" \
              --data "$body")" || code="000"

            if [ "$code" = "200" ]; then
              if grep -q '"last_seen"' /tmp/resp.json; then
                echo "Supabase acknowledged the write at ${now}."
                cat /tmp/resp.json
                exit 0
              fi
              echo "::error::HTTP 200 but no row was updated. Check that sql/keepalive.sql has been run: the table needs a row with id = 1, and the RLS update policy must allow this key."
              cat /tmp/resp.json || true
              exit 1
            fi

            echo "Attempt ${attempt} failed with HTTP ${code}:"
            cat /tmp/resp.json || true

            if [ "$attempt" -lt 3 ]; then
              sleep $((attempt * 10))
            fi
          done

          echo "::error::Could not reach Supabase after 3 attempts (last HTTP ${code}). If the project is already paused, restore it from the dashboard first - this workflow prevents pausing, it cannot undo it."
          exit 1

      - name: Keep this repository active
        # Runs even when the ping fails. GitHub disables scheduled workflows
        # in a repository with no activity for 60 days, which would silently
        # stop the keepalive; a commit per run resets that clock. Pushes made
        # with GITHUB_TOKEN do not trigger workflows, so this cannot loop.
        if: always()
        run: |
          set -euo pipefail

          date -u +%Y-%m-%dT%H:%M:%SZ > last-run.txt

          if [ -z "$(git status --porcelain last-run.txt)" ]; then
            echo "Nothing to commit."
            exit 0
          fi

          git config user.name  "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add last-run.txt
          git commit -m "chore: keepalive run $(cat last-run.txt)"
          git push
EOF__GITHUB_WORKFLOWS_KEEPALIVE_YML

cat > 'README.md' <<'EOF_README_MD'
# supabase-keepalive

A scheduled GitHub Action that writes a heartbeat row to a Supabase project
once a day, so the free tier never pauses it for inactivity.

Supabase pauses free projects after about **7 days** with no activity. A daily
run leaves a wide margin, because GitHub's scheduler delays or drops runs when
it is busy.

> This prevents pausing. It cannot un-pause. If your project is currently
> paused, restore it from the Supabase dashboard first, then set this up.

## Setup

### 1. Create the heartbeat table

In the Supabase dashboard: **SQL Editor -> New query**, paste
[`sql/keepalive.sql`](sql/keepalive.sql), and run it.

It creates a one-row `public.keepalive` table, enables row level security, and
adds two policies that let the `anon` role read and update that single row —
and nothing else.

### 2. Add the repository secrets

**Settings -> Secrets and variables -> Actions -> New repository secret**

| Secret | Value | Where to find it |
| --- | --- | --- |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` | Project Settings -> Data API |
| `SUPABASE_KEY` | the **anon** / **publishable** key | Project Settings -> API Keys |

Use the anon/publishable key, not the service role key. The anon key is the one
already shipped in browser clients, and step 1 limits what it can touch here.

### 3. Run it once by hand

**Actions -> Supabase keepalive -> Run workflow.** A green run means you are
done; the daily schedule takes over from there.

## How it works

`.github/workflows/keepalive.yml` runs daily at 07:23 UTC and:

1. `PATCH`es `public.keepalive` where `id = 1`, setting `last_seen` to now.
   That is a real database write, so it counts as activity. It retries three
   times with backoff and fails loudly with the HTTP status if Supabase does
   not answer.
2. Commits a `last-run.txt` timestamp back to this repository. GitHub disables
   scheduled workflows in a repository with no activity for 60 days, which
   would silently stop the keepalive; a commit per run resets that clock.
   Pushes made with `GITHUB_TOKEN` do not trigger workflows, so this cannot
   loop.

A failed run sends you GitHub's usual workflow-failure email, which is your
early warning that the project is about to pause.

## Changing the schedule

Edit the `cron` line in the workflow. It is UTC, and any interval under ~5 days
is safe:

```yaml
- cron: '23 7 * * *'     # daily (default)
- cron: '23 7 */2 * *'   # every other day
- cron: '23 7 * * 1,4'   # Mondays and Thursdays
```

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `HTTP 200 but no row was updated` | `sql/keepalive.sql` has not been run, or the row with `id = 1` is missing. |
| `HTTP 401` | Wrong or rotated `SUPABASE_KEY`. |
| `HTTP 404` | Wrong `SUPABASE_URL`, or the table is not in the `public` schema. |
| `HTTP 000` | Network failure, or the project is already paused — restore it from the dashboard. |
| Runs stopped appearing | The repository was inactive for 60 days and GitHub disabled the schedule. Re-enable it under **Actions**. |
EOF_README_MD

mkdir -p "sql"
cat > 'sql/keepalive.sql' <<'EOF_SQL_KEEPALIVE_SQL'
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> Run.
-- It is idempotent, so re-running it is harmless.

create table if not exists public.keepalive (
  id        smallint    primary key,
  last_seen timestamptz not null default now(),
  constraint keepalive_singleton check (id = 1)
);

insert into public.keepalive (id, last_seen)
values (1, now())
on conflict (id) do nothing;

alter table public.keepalive enable row level security;

-- The workflow sends the project's anon / publishable key, so it acts as the
-- `anon` role. These policies grant that role exactly enough access to touch
-- the single heartbeat row, and nothing else in the database.
drop policy if exists "keepalive read"   on public.keepalive;
drop policy if exists "keepalive update" on public.keepalive;

create policy "keepalive read"
  on public.keepalive
  for select
  to anon, authenticated
  using (id = 1);

create policy "keepalive update"
  on public.keepalive
  for update
  to anon, authenticated
  using (id = 1)
  with check (id = 1);
EOF_SQL_KEEPALIVE_SQL

git init -q -b main
git add -A
git commit -q -m "Add daily Supabase keepalive workflow"

gh repo create "$REPO_NAME" --private --source=. --remote=origin --push

gh secret set SUPABASE_URL --body "$SUPABASE_URL"
gh secret set SUPABASE_KEY --body "$SUPABASE_KEY"

echo
echo "Repository created at $DIR and pushed."
echo "Reminder: run sql/keepalive.sql in the Supabase SQL editor if you have not yet."
echo
echo "Triggering a first run..."
gh workflow run keepalive.yml
sleep 5
gh run list --workflow=keepalive.yml --limit 1
echo "Watch it with: gh run watch"
