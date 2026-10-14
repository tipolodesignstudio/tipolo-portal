import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Users, FolderKanban, FileText, ArrowUpRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { NAV } from "@/lib/nav";
import { legacy } from "@/lib/utils";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";

type Hit = { id: string; label: string; sub?: string; path: string; inApp?: boolean };

// PostgREST's or() filter treats commas and brackets as syntax.
const clean = (s: string) => s.replace(/[,()*%]/g, " ").trim();

async function search(term: string) {
  const q = clean(term);
  if (q.length < 2) return { clients: [], projects: [], proposals: [] };
  const like = `%${q}%`;
  const [c, p, pr] = await Promise.all([
    supabase.from("clients").select("id, name").eq("is_internal", false).ilike("name", like).limit(6),
    supabase.from("projects").select("id, number, title, client:clients(name)")
      .or(`title.ilike.${like},number.ilike.${like}`).order("number", { ascending: false }).limit(6),
    supabase.from("proposals").select("id, number, title, client:clients(name)")
      .or(`title.ilike.${like},number.ilike.${like}`).order("number", { ascending: false }).limit(6),
  ]);
  const clientName = (r: { client?: unknown }) =>
    (Array.isArray(r.client) ? r.client[0]?.name : (r.client as { name?: string } | null)?.name) ?? "";
  return {
    clients: (c.data ?? []).map((r): Hit => ({ id: r.id, label: r.name, path: `/clients/${r.id}`, inApp: true })),
    projects: (p.data ?? []).map((r): Hit => ({
      id: r.id, label: `${r.number ?? ""} ${r.title}`.trim(), sub: clientName(r), path: `/projects/${r.id}`, inApp: true })),
    proposals: (pr.data ?? []).map((r): Hit => ({
      id: r.id, label: `${r.number ?? ""} ${r.title}`.trim(), sub: clientName(r), path: `/proposals/${r.id}`, inApp: true })),
  };
}

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const [term, setTerm] = React.useState("");
  const [debounced, setDebounced] = React.useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(term), 180);
    return () => clearTimeout(t);
  }, [term]);

  const { data, isFetching } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => search(debounced),
    enabled: open && debounced.trim().length >= 2,
    placeholderData: (prev) => prev,
  });

  // closing clears the search, so it opens empty next time
  const setOpen = (v: boolean) => { if (!v) { setTerm(""); setDebounced(""); } onOpenChange(v); };

  const go = (item: { to?: string; legacy?: string; path?: string }) => {
    setOpen(false);
    if (item.to) navigate({ to: item.to });
    else window.location.assign(legacy(item.legacy ?? item.path ?? "/"));
  };

  const pages = NAV.filter((n) => !term || n.label.toLowerCase().includes(term.toLowerCase()));
  const groups: [string, typeof Users, Hit[]][] = [
    ["Clients", Users, data?.clients ?? []],
    ["Projects", FolderKanban, data?.projects ?? []],
    ["Proposals", FileText, data?.proposals ?? []],
  ];
  const searching = term.trim().length >= 2;

  return (
    <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
      <CommandInput value={term} onValueChange={setTerm} placeholder="Search clients, projects, proposals, or jump to a page…" />
      <CommandList>
        {searching && !isFetching && groups.every(([, , hits]) => !hits.length) && !pages.length && (
          <CommandEmpty>Nothing matches “{term}”.</CommandEmpty>
        )}
        {groups.map(([heading, Icon, hits]) => hits.length > 0 && (
          <CommandGroup key={heading} heading={heading}>
            {hits.map((h) => (
              <CommandItem key={h.id} value={`${heading}-${h.id}`} onSelect={() => go(h.inApp ? { to: h.path } : { path: h.path })}>
                <Icon />
                <span className="truncate">{h.label}</span>
                {h.sub && <span className="ml-auto truncate text-xs text-ink-faint">{h.sub}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        {pages.length > 0 && (
          <CommandGroup heading="Go to">
            {pages.map((n) => (
              <CommandItem key={n.label} value={`page-${n.label}`} onSelect={() => go(n)}>
                <n.icon />
                <span>{n.label}</span>
                {!n.to && <ArrowUpRight className="ml-auto" aria-label="opens the previous version" />}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
