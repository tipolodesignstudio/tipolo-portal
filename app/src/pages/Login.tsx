import * as React from "react";
import { supabase } from "@/lib/supabase";
import { legacy } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function Login() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(/invalid/i.test(error.message) ? "That email and password don't match." : error.message);
  }

  return (
    <div className="grid min-h-full place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg border border-border bg-card p-8 shadow-sm">
        <div className="mb-6">
          <div className="font-heading text-2xl text-accent">tipolo</div>
          <div className="mt-1 text-sm text-ink-soft">Studio portal · beta</div>
        </div>
        <div className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="username" value={email}
                   onChange={(e) => setEmail(e.target.value)} placeholder="you@tipolo.ca" required />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" value={password}
                   onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <div className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad">{error}</div>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
          <a href={legacy("/")} className="block text-center text-[13px] text-ink-faint hover:text-ink">
            Forgot your password? Reset it in the current portal
          </a>
        </div>
      </form>
    </div>
  );
}
