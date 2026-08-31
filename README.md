# Tipolo Portal

Private practice-management portal for Tipolo Design Studio — clients, projects,
timesheets, invoices, and proposal templates. Internal use, `@tipolo.ca` accounts only.

## Stack

- **Frontend:** vanilla HTML/CSS/JS (ES modules). No build step, no framework, no npm.
- **Backend:** [Supabase](https://supabase.com) — Postgres, email/password auth, row-level
  security. The client library is vendored at `vendor/supabase-js.esm.js`.
- **Hosting:** GitHub Pages at `portal.tipolo.ca`.
- **PDFs:** the browser's "Save as PDF" via `css/print.css`.

## First-time setup

See **[SETUP.md](SETUP.md)** — create the Supabase project, run the migrations, fill in
`config.js`, deploy. ~30 minutes, once.

## Running locally

Double-click **`Start Dev Server.command`** (first time: right-click → Open to clear the
macOS warning). It serves this folder at <http://localhost:4173> and opens Chrome.

Or from a terminal:
```bash
cd "path/to/Tipolo Portal"
python3 -m http.server 4173
```
Then open <http://localhost:4173>. It talks to the same cloud Supabase project as the
deployed site — no separate local database.

> Must be served over `http://` (not opened as a `file://` path) because it uses ES
> modules. Chrome recommended.

## Deploying changes

```bash
git add -A && git commit -m "…" && git push
```
GitHub Pages redeploys automatically in ~1 minute.

## Project layout

```
config.js                  Supabase URL + anon key (safe to commit)
index.html                 app shell
css/app.css                app styles     css/print.css   invoice/proposal print layout
vendor/supabase-js.esm.js  vendored Supabase client (+ node-buffer-shim.mjs)
js/app.js                  bootstrap: config check → auth gate → shell + router
js/core/       supabase, auth, router, render, format, api
js/components/  layout (shell), modal, toast
js/views/      login, dashboard, settings, soon (placeholder for later phases)
supabase/migrations/       SQL — run in the Supabase SQL editor, in order
```

## Build phases

| Phase | Scope | Status |
|-------|-------|--------|
| 0 | Auth, app shell, Settings, deploy | ✅ built |
| 1 | Clients + Projects (projects now come from proposals) | ✅ built |
| 2 | Timesheets + timer | ✅ built |
| 3 | Invoices + tax + numbering | ✅ built |
| 4 | Proposals + templates + conversion | ✅ built |
| 5 | Expenses (project & business, re-billable) | ✅ built |

Full plan: `~/.claude/plans/snuggly-beaming-wall.md`.

## Notes

- **Accounts** are gated to `@tipolo.ca` in two places: the sign-up form (friendly
  message) and a database trigger on `auth.users` (the real enforcement).
- **Permissions:** every confirmed, logged-in user currently has full access to all
  business data. RLS is written one-policy-per-table so roles can be added later without
  restructuring.
- **No automated tests** in v1 (vanilla, no toolchain). Each phase has a manual
  walkthrough in the plan.
