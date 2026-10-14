import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { FolderKanban, FileText, Receipt, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { NAV } from "@/lib/nav";
import { legacy } from "@/lib/utils";
import { money } from "@/lib/format";
import { Card, CardTitle } from "@/components/ui/card";

/* Phase 0's front page: proof the new app reads the live portal, and a map of what has
   moved across. The full dashboard with charts is Phase 1. */
async function loadSnapshot() {
  const [projects, proposals, invoices] = await Promise.all([
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("proposals").select("id", { count: "exact", head: true }).in("status", ["draft", "sent"]),
    supabase.from("invoices").select("total").eq("status", "sent"),
  ]);
  for (const r of [projects, proposals, invoices]) {
    if (r.error) {
      throw new Error(r.status === 401
        ? "your sign-in has expired. Sign out and back in."
        : r.error.message || `the database said ${r.status}.`);
    }
  }
  return {
    activeProjects: projects.count ?? 0,
    openProposals: proposals.count ?? 0,
    outstanding: (invoices.data ?? []).reduce((s, i) => s + Number(i.total || 0), 0),
    unpaidCount: invoices.data?.length ?? 0,
  };
}

export function Home() {
  const { session } = useAuth();
  const { data, error, isLoading } = useQuery({ queryKey: ["snapshot"], queryFn: loadSnapshot });
  const handle = session?.user.email?.split("@")[0] ?? "";
  const first = handle ? handle[0].toUpperCase() + handle.slice(1) : "";
  const [today] = React.useState(() =>
    new Intl.DateTimeFormat("en-CA", { weekday: "long", month: "long", day: "numeric" }).format(new Date()));

  const stats = [
    { label: "Active projects", value: data?.activeProjects, icon: FolderKanban, href: legacy("/projects") },
    { label: "Open proposals", value: data?.openProposals, icon: FileText, href: legacy("/proposals") },
    { label: "Outstanding", value: data ? money(data.outstanding) : undefined,
      sub: data ? `${data.unpaidCount} unpaid invoice${data.unpaidCount === 1 ? "" : "s"}` : "",
      icon: Receipt, href: legacy("/invoices") },
  ];
  const rebuilt = NAV.filter((n) => n.to).map((n) => n.label);
  const pending = NAV.filter((n) => !n.to).map((n) => n.label);

  return (
    <div className="space-y-6">
      <header>
        <div className="text-sm text-ink-faint">{today}</div>
        <h1 className="mt-1 text-3xl">Good to see you{first ? `, ${first}` : ""}</h1>
      </header>

      {error && (
        <div className="rounded-md bg-bad-bg px-4 py-3 text-sm text-bad">Couldn't load the studio's numbers: {(error as Error).message}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <a key={s.label} href={s.href} className="group">
            <Card className="transition-shadow group-hover:shadow-md">
              <div className="flex items-center justify-between text-[12px] uppercase tracking-wide text-ink-faint">
                {s.label}<s.icon className="size-4" />
              </div>
              <div className="mt-2 font-heading text-3xl text-ink">
                {isLoading ? <span className="inline-block h-8 w-16 animate-pulse rounded bg-bg-alt" /> : s.value ?? "—"}
              </div>
              {s.sub && <div className="mt-1 text-[13px] text-ink-soft">{s.sub}</div>}
            </Card>
          </a>
        ))}
      </div>

      <Card>
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 size-5 text-accent" />
          <div>
            <CardTitle>This is the new portal, in progress</CardTitle>
            <p className="mt-1 text-sm text-ink-soft">
              Same data, same sign-in. Screens move here one at a time; anything not rebuilt yet
              opens in the previous version, marked with ↗. Press <kbd className="rounded border border-border bg-bg px-1 text-xs">⌘K</kbd> to search anywhere.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5 text-[12px]">
              {rebuilt.map((l) => <span key={l} className="rounded-full bg-ok-bg px-2 py-0.5 text-ok">{l}</span>)}
              {pending.map((l) => <span key={l} className="rounded-full bg-bg-alt px-2 py-0.5 text-ink-faint">{l}</span>)}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
