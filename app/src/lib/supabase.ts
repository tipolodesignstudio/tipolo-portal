import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@portal-config";

// The same storage key as the current portal: both apps sit on portal.tipolo.ca, so
// signing in to one signs you in to the other.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "tipolo-portal-auth",
  },
});
