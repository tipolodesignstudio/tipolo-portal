// Copy this file to `config.js` and fill in the two values from your Supabase project:
//   Supabase dashboard -> Project Settings -> Data API  (Project URL)
//   Supabase dashboard -> Project Settings -> API Keys  (anon / public key)
//
// The anon key is safe to commit and to ship in the browser — it only grants what the
// Row Level Security policies allow. Do NOT put the `service_role` key here.

export const SUPABASE_URL = "https://YOUR-PROJECT-ref.supabase.co";
export const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";

// Accounts are limited to this email domain (also enforced in the database).
export const ALLOWED_EMAIL_DOMAIN = "tipolo.ca";
