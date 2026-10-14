import * as React from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/* `recovering` is set when someone arrives from a password-reset email: they're signed
   in, but must choose a new password before anything else. */
type AuthState = { session: Session | null; loading: boolean; recovering: boolean; doneRecovering: () => void };
const AuthContext = React.createContext<AuthState>({ session: null, loading: true, recovering: false, doneRecovering: () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<{ session: Session | null; loading: boolean }>({ session: null, loading: true });
  const [recovering, setRecovering] = React.useState(() => /type=recovery/.test(location.hash));

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setState({ session: data.session, loading: false });
      // The year's internal project (YY001). Idempotent, so it runs on every sign-in;
      // that's what makes the January rollover happen without a scheduler.
      if (data.session) supabase.rpc("ensure_internal_project").then(() => {}, () => {});
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setState({ session, loading: false });
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (event === "SIGNED_IN") supabase.rpc("ensure_internal_project").then(() => {}, () => {});
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value = React.useMemo(() => ({ ...state, recovering, doneRecovering: () => setRecovering(false) }), [state, recovering]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => React.useContext(AuthContext);
