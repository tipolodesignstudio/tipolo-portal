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
css/app.css                app styles
css/document.css           the printed page — loaded for screen too, so the builder's
                           preview and the printout share one set of rules
css/print.css              print-only: @page size/margins, hide everything but #print-root
vendor/supabase-js.esm.js  vendored Supabase client (+ node-buffer-shim.mjs)
vendor/pdf.min.mjs         vendored pdf.js (+ pdf.worker.min.mjs) — proposal PDF import
js/app.js                  bootstrap: config check → auth gate → shell + router
js/core/       supabase, auth, router, render, format, api, tokens,
               pdf-text + proposal-parse (PDF import),
               proposal-template (the house proposal), invoice-template (the house
               invoice), invoice-calc (the money), gantt (schedule layout)
js/print/      proposal-doc + invoice-doc (the documents), doc-text (body copy ->
               markup, shared), paginate (pages), proposal-print, invoice-print
js/components/  layout (shell), modal, toast
js/views/      login, dashboard, settings, soon (placeholder for later phases)
supabase/migrations/       SQL — run in the Supabase SQL editor, in order
dev/                       local parser check (not used by the app)
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
| — | Proposal PDF import (read a PDF into a draft, or save it as a template) | ✅ built |
| — | Proposal builder: split editor + live print preview, house format, gantt schedule | ✅ built |
| — | Invoice builder: the same split workspace, progress billing against the proposal | ✅ built |

Full plan: `~/.claude/plans/snuggly-beaming-wall.md`.

## The proposal builder

Opening a proposal gives you a two-pane workspace: the form on the left, the page the
client will receive on the right, redrawing as you type. `{{tokens}}` show resolved in
the preview while you keep editing the raw text.

The preview isn't a mock-up of the output — it *is* the output. `js/print/proposal-doc.js`
builds the document markup, and both the preview pane and **Save as PDF** render that
same markup under `css/document.css` — identical, with nothing added for the screen.

The page is set on the Tipolo letterhead (`04_Templates/Letterhead Design/Tipolo
Letterhead.docx`) — cream band, wordmark, dark contact bar, measured off the Word file.
Its three placeholders are wired to real data:

| Letterhead | Filled with |
|---|---|
| `YYNNN` | the proposal number, or `DRAFT` before one is drawn |
| `[Project Name]` | the proposal title |
| `Month DD, YYYY` | the sent date, or the date the proposal was created |

Because the letterhead is a Word header/footer, its band and bar belong on every page.
`js/print/paginate.js` measures the flow and builds the pages itself, so each sheet
carries its own band, bar and page number — and the preview shows the same pages the
printer produces. `@page` margin is zero so the bands can bleed; the 0.75in text margins
are applied inside the document. Invoices are not on the letterhead and carry their own
margins (`.doc:not(.letterhead)`).

- **Real pages** — the preview is the document's actual 8.5x11 sheets, laid out by
  `js/print/paginate.js`; a heading is never left at the foot of a page.
- **Landscape schedule** — a gantt chart wider than the portrait column (over 6 week
  columns, or 10 working-day columns) moves to a landscape page of its own, heading and
  all. Only when it has to; a six-week chart stays in place.
- **Fit / 50 / 75 / 100%** zoom, and a draggable divider. Both are remembered.
- **Text tools** — Bold, Italic, Underline (⌘B / ⌘I / ⌘U, and they toggle), bullets,
  numbering and indent. The stored text stays plain: `**bold**`, `*italic*`,
  `__underline__` are rendered on the page, so nothing can inject markup.
- **Tab indents inside a text box** rather than jumping to the next control. Press
  Escape first to leave the field, so the form is still reachable from the keyboard.
- **Cmd/Ctrl+S** saves; an *Unsaved* badge shows when there's something to save, and
  closing the tab mid-edit warns you.
- Non-draft proposals show the same split, read-only.
- Under 1000px wide the panes become **Edit** / **Preview** tabs.

### Templates

**Tipolo standard proposal** is the built-in default (`js/core/proposal-template.js`) —
every part complete, project specifics in `[brackets]`. **Web Design**
(`js/core/template-web-design.js`) fills the cover letter, work plan and schedule in for
a website job, transcribed from the ConnectLA proposal; it shares the fee structure and
services agreement with the standard one rather than copying them.

A template stores the same blocks a proposal does, so the schedule chart, fee tables and
signature survive the round trip. The template editor shows those as labelled rows — they
are edited on the proposal itself, not in the template.

## The invoice builder

Opening an invoice gives the same two-pane workspace as a proposal: the document on the
left, the page the client will receive on the right. `js/print/invoice-doc.js` builds
the markup, and both the preview and **Save as PDF** render it — the file is offered as
`Invoice_YYNNN-XXX.pdf`.

The page follows `04_Templates/Invoice/Invoice Down Payment Template.docx`: the same
letterhead as the proposal (with "Invoice" and the control number in the band), a
**Bill To** block taken from the client record, the invoice table, and the payment
information underneath — all of which is ordinary text you can edit.

**The table is a progress bill.**

| Column | Where it comes from |
|---|---|
| Description | the fee schedule of the proposal this project came from |
| Budget | that line's agreed fee, snapshotted onto the invoice |
| Previous Invoice | the same line's draws on the project's earlier invoices, summed |
| Current Invoice | **the one thing you type** |
| Balance | budget − previous − current |

Only finalized invoices count towards "previous" — an open draft has billed nothing.
Typing more than a line has left is refused: the figure is capped at the remainder and
the field flashes, so an invoice can never overrun the budget it is drawn against.

Tax is off unless you turn it on. The house invoice shows a subtotal and nothing else;
tick **Add GST + PST** on the Bill To tab (or when creating the invoice) and the rows,
and a TOTAL DUE, appear under the subtotal.

Numbering is `YYNNN-XXX` — the project's job number, then a per-project counter from
`001`, assigned by `next_invoice_number()` when the invoice is finalized.

## Importing a proposal from a PDF

**Proposals → Import PDF.** The PDF is read in the browser (`pdf.js` is vendored, same as
the Supabase client) and `js/core/proposal-parse.js` turns it into a draft: title, client,
scope, sections and fee lines. Nothing is saved until you review it and press
**Create draft proposal** — or **Save as template**, which stores the same sections and
fee lines under Proposals → Templates with the client's name swapped for `{{client.name}}`.

Everything is read in your browser — the PDF is never sent anywhere. A document laid out
unlike your usual proposals, or a scan with no text layer, will come back mostly empty;
fill the review screen in by hand from there.

To check the parser against a real document, drop a PDF in `dev/` and open
`/dev/parser-check.html?pdf=<name>`; it prints every line with its font size and the
parse result. Files named `dev/_local-*` are git-ignored — keep real client documents
out of the public repo.

## Notes

- **Accounts** are gated to `@tipolo.ca` in two places: the sign-up form (friendly
  message) and a database trigger on `auth.users` (the real enforcement).
- **Permissions:** every confirmed, logged-in user currently has full access to all
  business data. RLS is written one-policy-per-table so roles can be added later without
  restructuring.
- **No automated tests** in v1 (vanilla, no toolchain). Each phase has a manual
  walkthrough in the plan.
