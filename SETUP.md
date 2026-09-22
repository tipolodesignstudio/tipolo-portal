# Tipolo Portal — one-time setup

You do these steps once. They need your Supabase and GitHub accounts, so they can't be
automated. Budget ~30 minutes. After this, day-to-day use is just opening
`portal.tipolo.ca` (or double-clicking **Start Dev Server.command** to work locally).

---

## 1. Create the Supabase project

1. Go to <https://supabase.com> → sign in → **New project**.
2. Name: `tipolo-portal`. Region: **Canada (Central) — `ca-central-1`**.
3. Set a strong database password (save it in 1Password; you rarely need it).
4. Wait for the project to finish provisioning (~2 min).

## 2. Run the database schema

In the project: **SQL Editor** → **+ New query**. Open **`supabase/schema.sql`**, paste
the whole thing, click **Run**. It should say *Success*. (It's safe to re-run.)

That one file bundles every migration:

| File | What it does |
|------|--------------|
| `0000_extensions.sql` | Enables required Postgres extensions |
| `0001_core_schema.sql` | Creates `profiles`, `app_settings`, `clients`, `projects` |
| `0002_auth_domain_restriction.sql` | Restricts sign-up to `@tipolo.ca`; mirrors users into `profiles` |
| `0003_rls_policies.sql` | Row-level security (any logged-in user = full access) |
| `0004_functions.sql` | (no-op — numbering moved to `0009`) |
| `0005_seed_settings.sql` | Creates the settings row with BC tax lines (GST 5% + PST 7%) |
| `0006_time_entries.sql` | Timesheet entries table (Phase 2) |
| `0007_clients_contact.sql` | Client = business name; adds `contact_name` + `is_individual` |
| `0008_client_address.sql` | Structured address: street / city / province / postal_code |
| `0009_numbering.sql` | Job numbers `YYNNN` on projects; `next_job_number()` / `next_invoice_number()` |
| `0010_invoices.sql` | Invoices table (Phase 3) — one invoice per project, number `YYNNN-XX` |
| `0011_proposals.sql` | Proposals + templates (Phase 4); a converted proposal becomes a project |
| `0012_contacts_categories.sql` | Multiple contacts per client; managed client categories; project contact override |
| `0013_client_notes_category.sql` | One category per client; notes become a dated timeline (CRM) |
| `0014_expenses.sql` | Expenses + expense categories (Phase 5) |
| `0015_storage_policies.sql` | Storage access — private `receipts`, authenticated writes |
| `0016_proposal_source.sql` | PDF import: keeps the original PDF on the proposal (creates the private `proposal-sources` bucket) |
| `0017_signature.sql` | Cover-letter signature image on Settings |
| `0018_branding_select.sql` | Lets the app delete/replace logo + signature files |
| `0019_day_rate.sql` | Day rate on Settings (defaults to hourly x 8) |
| `0020_invoice_document.sql` | The invoice as a document: progress lines, editable sections, `YYNNN-XXX` numbering |
| `0021_tiers_and_numbering.sql` | Staff rate tiers, hours per day, and the January reset (`YY001` internal, client work from `YY101`) |
| `0022_project_source_pdf.sql` | An imported proposal's PDF follows it into its project |
| `0023_proposal_revisions.sql` | A hand-kept revision log on each proposal |
| `0024_proposal_doc_mode.sql` | A proposal is either built here or is an attached PDF |
| `0025_books.sql` | Income & Expense Tracker: income (paid invoices add themselves), fixed costs, Drive-filed receipts, the tracker's categories and payment methods |

*(If you'd rather run them one at a time, the individual files are in
`supabase/migrations/` — run them in numeric order. When a new phase adds a migration,
just re-run `schema.sql` or the new file.)*

## 3. Configure Auth

**Authentication → Sign In / Providers → Email**:
- **Enable Email provider**: on
- **Confirm email**: **on**  ← important, this is what makes the confirmation link work
- Leave "Allow new users to sign up" **on** (the database still blocks non-`@tipolo.ca`).

**Authentication → URL Configuration**:
- **Site URL**: `https://portal.tipolo.ca`
- **Redirect URLs** — add both:
  - `https://portal.tipolo.ca`
  - `http://localhost:4173`

*(Email sending works out of the box but Supabase's built-in mailer is rate-limited to a
few messages per hour. Fine for a small team. To lift it later: Authentication → Emails →
SMTP Settings, and plug in any SMTP provider.)*

### hCaptcha (bot protection on the sign-in screen)

1. Sign up at <https://www.hcaptcha.com> → **New site** → add `portal.tipolo.ca` and
   `localhost`. You get a **Site Key** (public) and a **Secret Key**.
2. Supabase → **Authentication → Attack Protection → Enable Captcha protection** →
   provider **hCaptcha** → paste the **Secret Key** → Save.
3. Put the **Site Key** in `config.js`:
   ```js
   export const HCAPTCHA_SITE_KEY = "10000000-ffff-ffff-ffff-000000000001"; // your real key
   ```
   Leaving the placeholder disables the widget (and Supabase captcha must then be off).

## 4. Create the storage buckets

**Storage → New bucket** (twice):
- `branding` — **Public: on** — logo upload in Settings.
- `receipts` — **Public: OFF (private)** — expense receipts. The app serves each one
  through a short-lived signed link, so only logged-in users can open them.

Access is granted by `0015_storage_policies.sql` (part of `schema.sql`). If you already
made `receipts` public, flip it to private in the bucket settings.

A third bucket, `proposal-sources` (private — the PDFs behind imported proposals), is
created for you by `0016_proposal_source.sql`. Nothing to click.

## 5. Point the app at your project

1. **Project Settings → API**.
2. Copy **Project URL** and the **anon / public** key.
3. Open `config.js` in this folder and paste them in:
   ```js
   export const SUPABASE_URL = "https://abcdefgh.supabase.co";
   export const SUPABASE_ANON_KEY = "eyJhbGciOi...";
   ```
   The anon key is **safe to commit** — it only allows what the RLS policies allow.
   Never paste the `service_role` key here.

## 6. Test locally

1. In Finder, right-click **Start Dev Server.command** → **Open** → **Open** (clears the
   macOS "unidentified developer" warning — one time only).
2. Chrome opens `http://localhost:4173`.
3. Click **Create an account**, use your `@tipolo.ca` email, pick a password.
4. Check your inbox → click the confirmation link → sign in.
5. Open **Settings**, fill in the business details, **Save**. Reload — it persists.
6. Try signing up with a non-`@tipolo.ca` address → you should be blocked with a clear
   message.

---

## 7. Deploy to portal.tipolo.ca (GitHub Pages)

### a. Put the code on GitHub
```bash
cd "/Users/jimdemaala/Library/CloudStorage/GoogleDrive-jim@tipolo.ca/My Drive/02_Promotional/Tipolo Portal"
git remote add origin https://github.com/<your-username>/tipolo-portal.git
git push -u origin main
```
(Create the empty `tipolo-portal` repo on GitHub first.)

**Public or private?**
- **Public** (recommended, free): the code has no secrets. The Supabase anon key is
  meant to be public and is safe because RLS is on.
- **Private**: GitHub Pages on a private repo needs **GitHub Pro** (~$4/mo).

### b. Turn on Pages
Repo → **Settings → Pages** → **Source: Deploy from a branch** → Branch `main` / `/root`
→ Save. The `CNAME` file in this repo already sets the custom domain to
`portal.tipolo.ca`; it should appear under **Custom domain**.

### c. Add the DNS record
At whatever manages DNS for `tipolo.ca` (same place the marketing site's DNS lives), add:

| Type | Name / Host | Value |
|------|-------------|-------|
| CNAME | `portal` | `<your-username>.github.io` |

Wait for it to propagate (minutes to an hour), then in **Settings → Pages** tick
**Enforce HTTPS**.

### d. Verify
Open `https://portal.tipolo.ca` → the sign-in screen loads over HTTPS → sign in.

---

## 8. Google Drive (receipts + the Excel tracker)

Income & Expenses files receipts into **01_Admin → Accounting → Receipts** and rewrites
**Tipolo Income & Expense Tracker.xlsx** there after every change. The browser talks to
Drive directly, so it needs a Google OAuth client ID. Everything here is free.

### a. Google Cloud project
1. Go to **console.cloud.google.com**, signed in as `jim@tipolo.ca`.
2. Project picker (top bar) → **New project** → name it `Tipolo Portal` → **Create**, then select it.
3. **APIs & Services → Library** → search **Google Drive API** → **Enable**.

### b. Consent screen (internal — no Google review)
1. **APIs & Services → OAuth consent screen** (or **Google Auth Platform → Branding**) → **Get started**.
2. App name `Tipolo Portal`, support email `jim@tipolo.ca`.
3. Audience: **Internal**. This limits sign-in to `@tipolo.ca` Workspace accounts, and
   internal apps don't go through Google's verification.
4. Contact email → `jim@tipolo.ca` → **Create**.
5. **Data access → Add or remove scopes** → add `https://www.googleapis.com/auth/drive` → **Update** → **Save**.

### c. The client ID
1. **APIs & Services → Credentials → + Create credentials → OAuth client ID**.
2. Application type **Web application**, name `Portal`.
3. **Authorized JavaScript origins** → add `https://portal.tipolo.ca` and `http://localhost:4176`
   (and `http://localhost:4173` if you use the dev-server script). No redirect URIs are needed.
4. **Create** → copy the **Client ID** (`….apps.googleusercontent.com`). It's public, so
   it's safe to commit. There's no client secret to handle: this flow doesn't use one.
5. Paste it into `config.js` as `GOOGLE_CLIENT_ID`, commit and push.

### d. Link the folder
1. Portal → **Settings → Google Drive** → **Connect Google Drive** (a Google popup — allow it).
2. Open **01_Admin → Accounting** in Google Drive in the browser and copy the address bar URL.
3. Paste it into the portal → **Link folder**. It finds `Receipts` and the tracker, and the
   first time it saves a copy of the tracker as **“… (before portal).xlsx”**.
4. **Income & Expenses → Import from Excel…** → pick the tracker from your Drive folder, and
   check the counts before you confirm. After that, add entries in the portal: the Excel file
   is rewritten from the portal, so anything typed straight into it gets replaced.

### e. Staff
Each person connects Google once per browser session. They need edit access in Drive to
the **Receipts** folder and to the **tracker file**. Share just those two (right-click →
Share), not the whole Accounting folder, which also holds Tax Documents and Payments.

---

## Adding a staff member
Until a custom SMTP sender is configured (Authentication → Emails → SMTP Settings), the
built-in mailer is rate-limited and self-signup confirmation emails may not arrive. Add
people directly: Supabase → **Authentication → Users → Add user → Create new user**,
enter their `@tipolo.ca` email + a temp password, tick **Auto Confirm User**. They sign
in and can change their password later.

To remove someone: **Authentication → Users → … → Delete user**.
