import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox, Field, Segmented, Select } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/dialog";
import { DataTable, EmptyState } from "@/components/ui/data-table";
import { date, localISO, money } from "@/lib/format";
import { settingsQuery } from "@/lib/data/settings";
import {
  createInvoice, effectiveStatus, invoiceKeys, invoiceableProjectsQuery, invoicesQuery, myName,
  projectBudgetLines, unbilledExpenseLines, unbilledTimeLines, type Invoice,
} from "@/lib/data/invoices";
import {
  budgetLinesFromProposal, computeProgressTotals, defaultInvoiceSections, newLineId, type TaxDef,
} from "@/lib/invoice-doc";

type Filter = "" | "draft" | "sent" | "overdue" | "paid";

const columns: ColumnDef<Invoice, unknown>[] = [
  {
    id: "number", header: "Invoice", accessorFn: (i) => i.number ?? "", meta: { className: "w-32" },
    cell: ({ getValue }) => <span className="tabular-nums">{(getValue() as string) || <span className="text-ink-faint">Draft</span>}</span>,
  },
  {
    id: "project", header: "Project", accessorFn: (i) => i.project?.title ?? "",
    cell: ({ row: { original: i } }) => (
      <div>
        <div className="font-medium">{i.project?.title ?? "—"}</div>
        <div className="mt-0.5 text-[12.5px] text-ink-faint">{i.project?.client?.name ?? ""}</div>
      </div>
    ),
  },
  { id: "issued", header: "Issued", accessorFn: (i) => i.issue_date ?? "", meta: { className: "w-28" },
    cell: ({ getValue }) => <span className="text-[13px] text-ink-soft">{date(getValue() as string) || "—"}</span> },
  { id: "due", header: "Due", accessorFn: (i) => i.due_date ?? "", meta: { className: "w-28" },
    cell: ({ row: { original: i } }) => <span className={effectiveStatus(i) === "overdue" ? "text-[13px] text-bad" : "text-[13px] text-ink-soft"}>{date(i.due_date) || "—"}</span> },
  { id: "total", header: "Total", accessorFn: (i) => Number(i.total) || 0, meta: { align: "right", className: "w-32" },
    cell: ({ getValue }) => money(getValue() as number) },
  { id: "status", header: "Status", accessorFn: (i) => effectiveStatus(i), meta: { className: "w-28" },
    cell: ({ row: { original: i } }) => <StatusBadge status={effectiveStatus(i)} /> },
];

export function InvoicesList() {
  const navigate = useNavigate();
  const [status, setStatus] = React.useState<Filter>("");
  const [creating, setCreating] = React.useState(false);
  const { data: rows = [], isLoading, error } = useQuery({ ...invoicesQuery(status), placeholderData: (p) => p });
  const { data: all = [] } = useQuery(invoicesQuery(""));

  const outstanding = all.filter((i) => i.status === "sent");
  const overdue = outstanding.filter((i) => effectiveStatus(i) === "overdue");
  const sum = (l: Invoice[]) => l.reduce((s, i) => s + Number(i.total || 0), 0);
  const thisYear = String(new Date().getFullYear());
  const paidYear = all.filter((i) => i.status === "paid" && (i.paid_date ?? "").startsWith(thisYear));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Invoices</h1>
          <p className="mt-1 text-sm text-ink-soft">Progress bills against each project's budget.</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus />New invoice</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Outstanding", money(sum(outstanding)), `${outstanding.length} sent, unpaid`, ""],
          ["Overdue", money(sum(overdue)), `${overdue.length} past due`, overdue.length ? "text-bad" : ""],
          [`Paid in ${thisYear}`, money(sum(paidYear)), `${paidYear.length} invoice${paidYear.length === 1 ? "" : "s"}`, ""],
        ].map(([k, v, d, tone]) => (
          <div key={k} className="rounded-lg border border-border bg-card px-5 py-4">
            <div className="text-[12px] uppercase tracking-wide text-ink-faint">{k}</div>
            <div className={`mt-1 font-heading text-2xl tabular-nums ${tone}`}>{v}</div>
            <div className="text-[12.5px] text-ink-soft">{d}</div>
          </div>
        ))}
      </div>

      <Segmented value={status} onChange={setStatus} options={[
        { value: "", label: "All" }, { value: "draft", label: "Draft" }, { value: "sent", label: "Sent" },
        { value: "overdue", label: "Overdue" }, { value: "paid", label: "Paid" },
      ]} />

      {error ? <EmptyState title="Couldn't load invoices">{(error as Error).message}</EmptyState>
        : isLoading ? <div className="h-64 animate-pulse rounded-lg border border-border bg-card" />
        : <DataTable data={rows} columns={columns}
            onRowClick={(i) => navigate({ to: "/invoices/$id", params: { id: i.id } })}
            empty={<EmptyState title={status ? `No ${status} invoices` : "No invoices yet"}>Invoice a project against the fee schedule it was sold on.</EmptyState>} />}

      {creating && <NewInvoiceDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

/* A new invoice draws on the project's budget: the fee schedule of the proposal it was
   converted from. Unbilled time and expenses can come too, billed in full. */
export function NewInvoiceDialog({ onClose, projectId }: { onClose: () => void; projectId?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: projects = [], isLoading } = useQuery(invoiceableProjectsQuery);
  const { data: settings } = useQuery(settingsQuery);
  const [project, setProject] = React.useState(projectId ?? "");
  const [time, setTime] = React.useState(false);
  const [expenses, setExpenses] = React.useState(false);
  const [taxes, setTaxes] = React.useState(false);
  const [issue, setIssue] = React.useState(localISO());
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const chosen = project || projects[0]?.id || "";
  const taxDefs = ((settings?.tax_lines as unknown as TaxDef[]) ?? []).filter((t) => t.enabled);

  const create = async () => {
    if (!chosen) return;
    setBusy(true); setError("");
    try {
      const p = projects.find((x) => x.id === chosen)!;
      const lines = budgetLinesFromProposal(await projectBudgetLines(chosen));
      if (time) lines.push(...(await unbilledTimeLines(chosen, p.title)).map((l) => ({ id: newLineId(), ...l })));
      if (expenses) lines.push(...(await unbilledExpenseLines(chosen)).map((l) => ({ id: newLineId(), ...l })));
      const t = computeProgressTotals(lines, (settings?.tax_lines as unknown as TaxDef[]) ?? [], taxes);
      const inv = await createInvoice({
        project_id: chosen, issue_date: issue, progress_lines: lines, sections: defaultInvoiceSections(),
        prepared_by: await myName(), apply_taxes: taxes, tax_lines: t.taxLines,
        subtotal: t.subtotal, tax_total: t.taxTotal, total: t.total, status: "draft",
      });
      qc.invalidateQueries({ queryKey: invoiceKeys.all });
      onClose();
      navigate({ to: "/invoices/$id", params: { id: inv.id } });
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title="New invoice"
      description="The Budget column comes from the proposal the project was converted from."
      footer={<>
        {error && <div className="mr-auto text-sm text-bad">{error}</div>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={create} disabled={busy || !chosen}>{busy ? "Creating…" : "Create draft"}</Button>
      </>}>
      {!isLoading && !projects.length ? <p className="text-sm text-ink-soft">Invoices belong to a project, and there aren't any yet.</p> : (
        <div className="space-y-4">
          <Field label="Project">
            <Select value={chosen} onChange={(e) => setProject(e.target.value)}>
              {projects.map((p) => {
                const c = Array.isArray(p.client) ? p.client[0] : p.client;
                return <option key={p.id} value={p.id}>{[p.number, p.title].filter(Boolean).join(" · ")}{c?.name ? ` — ${c.name}` : ""}</option>;
              })}
            </Select>
          </Field>
          <Field label="Issue date"><Input type="date" value={issue} onChange={(e) => setIssue(e.target.value)} /></Field>
          <div className="space-y-2">
            <Checkbox label="Also bill unbilled billable time, as its own line" checked={time} onChange={(e) => setTime(e.target.checked)} />
            <Checkbox label="Also bill unbilled billable expenses (with markup)" checked={expenses} onChange={(e) => setExpenses(e.target.checked)} />
            {taxDefs.length > 0 && <Checkbox label={`Add ${taxDefs.map((t) => t.label).join(" + ")} (off on the house invoice)`} checked={taxes} onChange={(e) => setTaxes(e.target.checked)} />}
          </div>
        </div>
      )}
    </Dialog>
  );
}
