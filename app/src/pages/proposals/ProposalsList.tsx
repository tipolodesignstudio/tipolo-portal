import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { FileUp, HardDrive, LayoutTemplate, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/fields";
import { DataTable, EmptyState } from "@/components/ui/data-table";
import { date, money } from "@/lib/format";
import { proposalsQuery, type Proposal } from "@/lib/data/proposals";
import { NewProposalDialog } from "./NewProposalDialog";

type StatusFilter = "" | "draft" | "sent" | "accepted" | "declined";

const columns: ColumnDef<Proposal, unknown>[] = [
  {
    id: "number", header: "No.", accessorFn: (p) => p.number ?? "", meta: { className: "w-20" },
    cell: ({ getValue }) => <span className="tabular-nums text-ink-faint">{(getValue() as string) || "—"}</span>,
  },
  {
    id: "title", header: "Proposal", accessorFn: (p) => p.title,
    cell: ({ row: { original: p } }) => (
      <div>
        <div className="font-medium text-ink">{p.title}</div>
        <div className="mt-0.5 text-[12.5px] text-ink-faint">
          {p.client?.name ?? "No client"}{p.doc_mode === "pdf" && " · imported PDF"}
        </div>
      </div>
    ),
  },
  {
    id: "subtotal", header: "Fee", accessorFn: (p) => Number(p.subtotal) || 0, meta: { align: "right", className: "w-32" },
    cell: ({ getValue }) => money(getValue() as number),
  },
  {
    id: "dates", header: "Sent / valid until", accessorFn: (p) => p.sent_date ?? "", meta: { className: "w-44" },
    cell: ({ row: { original: p } }) => p.sent_date
      ? <span className="text-[13px] text-ink-soft">{date(p.sent_date)}<span className="text-ink-faint"> → {date(p.valid_until)}</span></span>
      : <span className="text-ink-faint">—</span>,
  },
  {
    id: "status", header: "Status", accessorFn: (p) => p.status, meta: { className: "w-40" },
    cell: ({ row: { original: p } }) => (
      <div className="flex flex-wrap gap-1">
        <StatusBadge status={p.status} />
        {p.converted_project && <Badge>project {p.converted_project.number}</Badge>}
      </div>
    ),
  },
];

export function ProposalsList() {
  const navigate = useNavigate();
  const [status, setStatus] = React.useState<StatusFilter>("");
  const [creating, setCreating] = React.useState(false);
  const { data: rows = [], isLoading, error } = useQuery({ ...proposalsQuery(status), placeholderData: (p) => p });

  const open = rows.filter((p) => p.status === "draft" || p.status === "sent");
  const pipeline = open.reduce((s, p) => s + Number(p.subtotal || 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Proposals</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {isLoading ? "Loading…" : status ? `${rows.length} ${status}` : `${open.length} open · ${money(pipeline)} in the pipeline`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><Link to="/proposals/templates"><LayoutTemplate />Templates</Link></Button>
          <Button variant="outline" asChild><Link to="/proposals/import"><FileUp />Import PDF</Link></Button>
          <Button variant="outline" asChild><Link to="/proposals/from-drive"><HardDrive />From Drive</Link></Button>
          <Button onClick={() => setCreating(true)}><Plus />New proposal</Button>
        </div>
      </div>

      <Segmented value={status} onChange={setStatus} options={[
        { value: "", label: "All" }, { value: "draft", label: "Draft" }, { value: "sent", label: "Sent" },
        { value: "accepted", label: "Accepted" }, { value: "declined", label: "Declined" },
      ]} />

      {error ? <EmptyState title="Couldn't load proposals">{(error as Error).message}</EmptyState>
        : isLoading ? <div className="h-64 animate-pulse rounded-lg border border-border bg-card" />
        : (
          <DataTable data={rows} columns={columns}
            onRowClick={(p) => navigate({ to: "/proposals/$id", params: { id: p.id } })}
            empty={<EmptyState title={status ? `No ${status} proposals` : "No proposals yet"}>
              Every project starts as a proposal. <button className="text-accent underline" onClick={() => setCreating(true)}>Write one</button>
              {" "}or <Link to="/proposals/import" className="text-accent underline">import a PDF</Link>.
            </EmptyState>} />
        )}

      <NewProposalDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
