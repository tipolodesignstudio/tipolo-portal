import * as React from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ArrowUpRight, LogOut, Menu, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { NAV } from "@/lib/nav";
import { cn, legacy } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CommandMenu } from "./CommandMenu";
import { Timer } from "@/components/time/Timer";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function AppShell() {
  const { session } = useAuth();
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const fullBleed = useRouterState({ select: (s) => s.matches.some((m) => m.staticData?.fullBleed) });

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const item = "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13.5px] transition-colors";

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-border bg-bg-alt/60 px-3 py-4 md:flex">
        <div className="mb-5 px-2.5">
          <div className="font-heading text-xl leading-none text-accent">tipolo</div>
          <div className="mt-1 text-[11px] uppercase tracking-wider text-ink-faint">Studio portal</div>
        </div>

        <button
          onClick={() => setSearchOpen(true)}
          className="mb-4 flex h-8 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-[13px] text-ink-faint hover:text-ink"
        >
          <Search className="size-3.5" />
          Search
          <kbd className="ml-auto rounded border border-border bg-bg px-1.5 text-[11px]">{isMac ? "⌘" : "Ctrl"} K</kbd>
        </button>

        <Timer />

        <nav className="flex flex-col gap-0.5">
          {NAV.map((n) =>
            n.to ? (
              <Link key={n.label} to={n.to} className={cn(item, "text-ink-soft hover:bg-card hover:text-ink")}
                    activeProps={{ className: "bg-card text-ink font-medium shadow-[0_1px_2px_rgb(36_42_32/0.06)]" }}
                    activeOptions={{ exact: n.to === "/" }}>
                <n.icon className="size-4" />{n.label}
              </Link>
            ) : (
              <a key={n.label} href={legacy(n.legacy!)} className={cn(item, "group text-ink-soft hover:bg-card hover:text-ink")}
                 title="Not rebuilt yet: opens in the previous version">
                <n.icon className="size-4" />{n.label}
                <ArrowUpRight className="ml-auto size-3.5 text-ink-faint opacity-0 group-hover:opacity-100" />
              </a>
            ),
          )}
        </nav>

        <div className="mt-auto border-t border-border pt-3">
          <div className="truncate px-2.5 text-[12px] text-ink-faint">{session?.user.email}</div>
          <Button variant="ghost" size="sm" className="mt-1 w-full justify-start" onClick={() => supabase.auth.signOut()}>
            <LogOut />Sign out
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        {/* phones: no sidebar, so search and the menu live up here */}
        <div className="border-b border-border md:hidden">
          <div className="flex items-center gap-2 px-4 py-3">
            <Button variant="ghost" size="icon" aria-label="Menu" onClick={() => setMenuOpen((v) => !v)}>{menuOpen ? <X /> : <Menu />}</Button>
            <span className="font-heading text-lg text-accent">tipolo</span>
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => setSearchOpen(true)}>
              <Search />Search
            </Button>
          </div>
          {menuOpen && <div className="px-3"><Timer /></div>}
          {menuOpen && (
            // any choice in the menu closes it
            <nav className="grid grid-cols-2 gap-1 px-3 pb-3" onClick={() => setMenuOpen(false)}>
              {NAV.map((n) => n.to ? (
                <Link key={n.label} to={n.to} className={cn(item, "text-ink-soft hover:bg-card")}
                      activeProps={{ className: "bg-card text-ink font-medium" }} activeOptions={{ exact: n.to === "/" }}>
                  <n.icon className="size-4" />{n.label}
                </Link>
              ) : (
                <a key={n.label} href={legacy(n.legacy!)} className={cn(item, "text-ink-soft hover:bg-card")}><n.icon className="size-4" />{n.label}</a>
              ))}
              <button onClick={() => supabase.auth.signOut()} className={cn(item, "text-ink-soft hover:bg-card")}><LogOut className="size-4" />Sign out</button>
            </nav>
          )}
        </div>
        {fullBleed ? <Outlet /> : (
          <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
            <Outlet />
          </div>
        )}
      </main>

      {/* mounted only while open, so the search box always starts empty */}
      {searchOpen && <CommandMenu open onOpenChange={setSearchOpen} />}
    </div>
  );
}
