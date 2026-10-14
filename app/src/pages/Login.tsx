import * as React from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

function Frame({ children, subtitle }: { children: React.ReactNode; subtitle: string }) {
  return (
    <div className="grid min-h-full place-items-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 shadow-sm">
        <div className="mb-6">
          <div className="font-heading text-2xl text-accent">tipolo</div>
          <div className="mt-1 text-sm text-ink-soft">{subtitle}</div>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Login() {
  const [mode, setMode] = React.useState<"signin" | "forgot" | "sent">("signin");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(/invalid/i.test(error.message) ? "That email and password don't match." : error.message);
  }

  async function sendReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + "/" });
    setBusy(false);
    if (error) setError(error.message); else setMode("sent");
  }

  if (mode === "sent") {
    return (
      <Frame subtitle="Check your email">
        <p className="text-sm text-ink-soft">If <strong>{email}</strong> has an account, a link to choose a new password is on its way. It opens the portal and asks for the new password.</p>
        <Button variant="ghost" className="mt-4 w-full" onClick={() => setMode("signin")}>Back to sign in</Button>
      </Frame>
    );
  }

  return (
    <Frame subtitle={mode === "forgot" ? "Reset your password" : "Studio portal"}>
      <form onSubmit={mode === "forgot" ? sendReset : signIn} className="space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="username" value={email}
                 onChange={(e) => setEmail(e.target.value)} placeholder="you@tipolo.ca" required />
        </div>
        {mode === "signin" && (
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" value={password}
                   onChange={(e) => setPassword(e.target.value)} required />
          </div>
        )}
        {error && <div className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad">{error}</div>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "One moment…" : mode === "forgot" ? "Email me a reset link" : "Sign in"}
        </Button>
        <button type="button" onClick={() => { setMode(mode === "forgot" ? "signin" : "forgot"); setError(""); }}
                className="block w-full text-center text-[13px] text-ink-faint hover:text-ink">
          {mode === "forgot" ? "Back to sign in" : "Forgot your password?"}
        </button>
      </form>
    </Frame>
  );
}

/* Arrived from a reset email: signed in, but a new password comes first. */
export function SetPassword() {
  const { doneRecovering } = useAuth();
  const [password, setPassword] = React.useState("");
  const [again, setAgain] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== again) return setError("The two passwords don't match.");
    setBusy(true); setError("");
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    history.replaceState(null, "", location.pathname);    // drop the token from the address bar
    doneRecovering();
  }

  return (
    <Frame subtitle="Choose a new password">
      <form onSubmit={save} className="space-y-4">
        <div>
          <Label htmlFor="pw">New password</Label>
          <Input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="pw2">Again</Label>
          <Input id="pw2" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required />
        </div>
        {error && <div className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad">{error}</div>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : "Save password"}</Button>
      </form>
    </Frame>
  );
}
