# Tipolo Portal: rebuild plan

The portal moves from hand-written HTML strings to a modern component stack, then gains
Monograph-style project budgeting. The database stays exactly as it is.

## Cost: $0 added

| Piece | Cost | Notes |
|---|---|---|
| React, TypeScript, Vite, Tailwind, shadcn/ui, TanStack, Recharts | Free | Open-source (MIT) |
| Node.js | Free | Already installed |
| Hosting: GitHub Pages | Free | Public repo, as now |
| Build: GitHub Actions | Free | Unlimited minutes for public repos |
| Supabase | Free tier, as now | Same database, same usage |
| Google Drive API | Free | Unchanged |

**Avoid Vercel's free plan.** Its terms limit it to non-commercial use, so a business
portal would need its $20/month plan. GitHub Pages has no such restriction, so the portal
stays there.

## How it runs while being rebuilt

- The new app lives in `app/` in this same repository. The current portal is untouched.
- GitHub Actions builds both and publishes the new one at **portal.tipolo.ca/beta/**.
  It's the same website, so your sign-in and your Google Drive connection carry over and
  nothing new needs setting up.
- You use the beta whenever you like. Anything missing from it is still in the current
  portal, which keeps working throughout.
- **Cutover:** once the beta matches the current portal, it moves to portal.tipolo.ca and
  the old version moves to `/legacy/` for a few weeks as a fallback.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | React 19 + TypeScript | Components and type checking. Most of the ecosystem targets it |
| Build | Vite | Fast; produces static files, which suit GitHub Pages |
| Styling | Tailwind CSS + shadcn/ui | Clean, dense components; Tipolo's palette and fonts as the theme |
| Routing | TanStack Router | Typed routes |
| Data | TanStack Query + supabase-js | Caching, background refresh, instant updates after edits |
| Tables | TanStack Table | Sort, filter, inline edit, fast with large lists |
| Charts | Recharts | Budget burn, cash flow, utilisation |
| Forms | React Hook Form + Zod | Validation in one place |

## What carries over as-is

Much of the current code has no UI in it and moves across unchanged, apart from adding types:

- Invoice maths, numbering, tax: `invoice-calc.js`, `invoice-template.js`
- Proposal templates and tokens: `proposal-template.js`, `tokens.js`
- PDF reading and proposal parsing: `pdf-text.js`, `proposal-parse.js`
- Excel tracker read/write, zip, Google Drive client: `tracker-xlsx.js`, `zip.js`, `gdrive.js`, `books.js`, `drive-scan.js`
- The printed documents (letterhead, proposals, invoices): `print/*.js`, `document.css`

Only the screens are rewritten. Your printed proposals and invoices stay pixel-identical.

## Phases

### Phase 0: Foundation
- Scaffold `app/`, theme Tailwind with Tipolo colours and fonts (Fredoka / Roboto).
- App shell: sidebar, top bar, **Cmd+K search** to jump to any client, project or proposal.
- Sign-in using the same Supabase accounts.
- GitHub Actions pipeline that publishes `/beta/`.
- Database types generated from the live schema with Supabase's CLI (free), so code that
  asks for a column that doesn't exist fails to build instead of failing in front of you.
- **Two steps for you:**
  1. In Terminal: `npx supabase login`. It opens a browser to sign in to Supabase,
     once, and the login stays on your Mac.
  2. GitHub repo → Settings → Pages → Source: **GitHub Actions**.

### Phase 1: Daily screens
- **Dashboard** with charts: income vs expenses by month, unbilled time, outstanding invoices, cash collected.
- **Projects**: list and detail (overview, time, expenses, invoices, proposals).
- **Timesheets**: week grid with inline entry, plus the timer.
- **Clients**: list and detail (CRM: contacts, notes timeline).

### Phase 2: Money
- **Invoices**: list and the split builder with live print preview.
- **Income & Expenses**: all four tabs, receipts to Drive, Excel sync.

### Phase 3: Proposals and settings
- Proposal builder, templates, PDF import, From Drive.
- Settings (all tabs).
- **Cutover:** the new app becomes portal.tipolo.ca.

### Phase 4: Monograph-style features
- **Phases on projects.** Each project's phases come from its proposal's fee lines (they
  already exist), and time and expenses are logged against a phase. Needs one migration.
- **Phase budget timeline** (Monograph calls it MoneyGantt): every phase as a bar over its
  dates, filled by fee earned vs time and expenses spent, so a phase running over budget
  shows up early.
- **Budget burn** per project and across the studio.
- **Resourcing:** who is booked on which project, week by week, against their capacity.
- **Utilisation:** billable vs non-billable hours per person.

## Testing

As now: each screen is checked locally against a stubbed database, then against the live
database with the `portaltest@tipolo.ca` account, cleaning up afterwards.
Types generated from the live database also catch the kind of mistake behind the recent
`clients.company` error before it ships.
