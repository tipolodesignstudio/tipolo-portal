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

## 4. Create the logo storage bucket

**Storage → New bucket**: name `branding`, **Public bucket: on**. Create.
(Only needed for the logo upload in Settings — skip if you don't use it.)

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

## Adding a staff member
Until a custom SMTP sender is configured (Authentication → Emails → SMTP Settings), the
built-in mailer is rate-limited and self-signup confirmation emails may not arrive. Add
people directly: Supabase → **Authentication → Users → Add user → Create new user**,
enter their `@tipolo.ca` email + a temp password, tick **Auto Confirm User**. They sign
in and can change their password later.

To remove someone: **Authentication → Users → … → Delete user**.
