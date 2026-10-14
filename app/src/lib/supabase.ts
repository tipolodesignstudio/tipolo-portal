import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@portal-config";
import type { Database } from "./database.types";

// The same storage key as the current portal: both apps sit on portal.tipolo.ca, so
// signing in to one signs you in to the other.
// Typed from the live schema (npm run types). Asking for a column the database doesn't
// have is a build error, not a runtime one.
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "tipolo-portal-auth",
  },
});
