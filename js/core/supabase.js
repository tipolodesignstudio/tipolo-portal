// Single shared Supabase client, initialised from config.js.
import { createClient } from "../../vendor/supabase-js.esm.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../../config.js";

const looksUnset =
  !SUPABASE_URL ||
  SUPABASE_URL.includes("YOUR-PROJECT") ||
  !SUPABASE_ANON_KEY ||
  SUPABASE_ANON_KEY.includes("YOUR-ANON");

export const CONFIG_OK = !looksUnset;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "tipolo-portal-auth",
  },
});
