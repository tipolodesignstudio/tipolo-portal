import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { Select } from "@/components/ui/fields";
import { DataTable, EmptyState } from "@/components/ui/data-table";
import { date, hours, money, STATUS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PROJECT_STATUSES, projectsQuery, type ProjectRow } from "@/lib/data/projects";

/* Billed against budget, as a bar: how far through its fee a project is. */
export function BudgetBar({ billed, budget, className }: { billed: number; budget: number | null; className?: string }) {
  if (!budget) return <span className="text-[12.5px] text-ink-faint">{billed ? `${money(billed)} billed` : "No budget"}</span>;
  const pct = Math.min(100, (billed / budget) * 100);
  const over = billed > budget + 0.5;
  return (
    <div className={cn("min-w-32", className)}>
      <div className="flex justify-between text-[12px] tabular-nums">
        <span className={over ? "text-bad" : "text-ink-soft"}>{money(billed)}</span>
        <span className="text-ink-faint">of {money(budget)}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg-alt">
        <div className={cn("h-full rounded-full", over ? "bg-bad" : "bg-accent")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const columns: ColumnDef<ProjectRow, unknown>[] = [
  {
    id: "number", header: "No.", accessorFn: (p) => p.number ?? "", meta: { className: "w-20" },
    cell: ({ getValue }) => <span className="tabular-nums text-ink-faint">{(getValue() as string) || "—"}</span>,
  },
  {
    id: "title", header: "Project", accessorFn: (p) => p.title,
    cell: ({ row: { original: p } }) => (
      <div>
        <div className="font-medium">{p.title}</div>
        <div className="mt-0.5 text-[12.5px] text-ink-faint">{p.client?.name ?? "No client"} · {p.scope}</div>
      </div>
    ),
  },
  { id: "status", header: "Status", accessorFn: (p) => PROJECT_STATUSES.indexOf(p.status as never), meta: { className: "w-28" },
    cell: ({ row: { original: p } }) => <StatusBadge status={p.status} /> },
  {
    id: "budget", header: "Billed / budget", accessorFn: (p) => p.rollup.budget ? p.rollup.billed / p.rollup.budget : -1, meta: { className: "w-52" },
    cell: ({ row: { original: p } }) => <BudgetBar billed={p.rollup.billed} budget={p.rollup.budget} />,
  },
  {
    id: "hours", header: "Hours", accessorFn: (p) => p.rollup.minutes, meta: { align: "right", className: "w-24" },
    cell: ({ row: { original: p } }) => (
      <div>
        <div className="tabular-nums">{hours(p.rollup.minutes)}</div>
        {p.rollup.unbilledValue > 0 && <div className="text-[11.5px] text-warn">{money(p.rollup.unbilledValue)} unbilled</div>}
      </div>
    ),
  },
  {
    id: "due", header: "Due", accessorFn: (p) => p.due_date ?? "", meta: { className: "w-28" },
    cell: ({ row: { original: p } }) => <span className="text-[13px] text-ink-soft">{p.due_date ? date(p.due_date) : "—"}</span>,
  },
];

export function ProjectsList() {
  const navigate = useNavigate();
  const [f, setF] = React.useState({ search: "", status: "open", scope: "" });
  const [search, setSearch] = React.useState("");
  React.useEffect(() => { const t = setTimeout(() => setF((x) => ({ ...x, search })), 220); return () => clearTimeout(t); }, [search]);
  const { data: rows = [], isLoading, error } = useQuery({ ...projectsQuery(f), placeholderData: (p) => p });

  const unbilled = rows.reduce((s, p) => s + p.rollup.unbilledValue, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl">Projects</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {isLoading ? "Loading…" : `${rows.length} project${rows.length === 1 ? "" : "s"}`}
          {unbilled > 0 && <> · <span className="text-warn">{money(unbilled)} of time not yet invoiced</span></>}
          {" · "}A project is created by converting an accepted <Link to="/proposals" className="text-accent hover:underline">proposal</Link>.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input className="pl-9" placeholder="Search title or number" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select className="w-44" value={f.status} onChange={(e) => setF((x) => ({ ...x, status: e.target.value }))}>
          <option value="open">Open (not complete)</option>
          <option value="">All statuses</option>
          {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
        </Select>
        <Select className="w-40" value={f.scope} onChange={(e) => setF((x) => ({ ...x, scope: e.target.value }))}>
          <option value="">All scopes</option><option value="landscape">Landscape</option><option value="multimedia">Multimedia</option><option value="other">Other</option>
        </Select>
      </div>

      {error ? <EmptyState title="Couldn't load projects">{(error as Error).message}</EmptyState>
        : isLoading ? <div className="h-64 animate-pulse rounded-lg border border-border bg-card" />
        : <DataTable data={rows} columns={columns}
            onRowClick={(p) => navigate({ to: "/projects/$id", params: { id: p.id } })}
            empty={<EmptyState title="No projects here">Projects appear once you convert an accepted <Link to="/proposals" className="text-accent underline">proposal</Link>.</EmptyState>} />}
    </div>
  );
}
