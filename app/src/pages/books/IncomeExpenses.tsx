// Income & Expenses — the Income & Expense Tracker workbook as four tabs. Entries are made
// here; the workbook in Google Drive is rewritten to match (see sync.ts).
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FileSpreadsheet, Plus, Receipt, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/dialog";
import { DataTable, EmptyState } from "@/components/ui/data-table";
import { useConfirm } from "@/components/ui/confirm";
import { cn, legacy } from "@/lib/utils";
import { date, money, relTime } from "@/lib/format";
import {
  categoriesQuery, createFixedCost, deleteExpense, deleteFixedCost, deleteIncome, expensesQuery, fixedQuery, incomeQuery,
  pickerProjectsQuery, updateFixedCost, type Expense, type ExpenseFilters, type FixedCost, type Income,
} from "@/lib/data/books";
import { drive, planImport, runImport, summarise, type ImportPlan } from "@/lib/books";
import { useBooksSync } from "./sync";
import { ExpenseDialog, IncomeDialog, openReceipt, receiptLink } from "./Dialogs";

type Tab = "expenses" | "income" | "summary" | "fixed";
const TAB_KEY = "tipolo.books.tab";

export function IncomeExpenses() {
  const sync = useBooksSync();
  const [tab, setTab] = React.useState<Tab>(() => { try { return (localStorage.getItem(TAB_KEY) as Tab) || "expenses"; } catch { return "expenses"; } });
  const [adding, setAdding] = React.useState(false);
  const [importing, setImporting] = React.useState<File | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const qcFixed = useQuery(fixedQuery);
  React.useEffect(() => { drive.loadGoogle().catch(() => {}); }, []);

  const choose = (t: Tab) => { setTab(t); try { localStorage.setItem(TAB_KEY, t); } catch { /* */ } };
  const addFixed = async () => { try { await createFixedCost({ item: "" }); sync.changed(); await qcFixed.refetch(); } catch (e) { toast.error((e as Error).message); } };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Income &amp; Expenses</h1>
          <p className="mt-1 text-sm text-ink-soft">The Income &amp; Expense Tracker. Entries made here are copied to the Excel file in Google Drive.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SyncChip sync={sync} />
          <label>
            <input ref={fileInput} type="file" accept=".xlsx" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setImporting(f); }} />
            <Button asChild variant="outline" size="sm"><span><FileSpreadsheet />Import from Excel</span></Button>
          </label>
          {tab !== "summary" && <Button onClick={() => (tab === "fixed" ? addFixed() : setAdding(true))}><Plus />{tab === "income" ? "New income" : tab === "fixed" ? "Add fixed cost" : "New expense"}</Button>}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {([["expenses", "Expenses"], ["income", "Income"], ["summary", "Summary"], ["fixed", "Fixed costs"]] as [Tab, string][]).map(([id, label]) => (
          <button key={id} onClick={() => choose(id)} className={cn("-mb-px border-b-2 px-3 py-2 text-[13.5px]", tab === id ? "border-accent font-medium" : "border-transparent text-ink-soft hover:text-ink")}>{label}</button>
        ))}
      </div>

      {tab === "expenses" && <ExpensesTab onChanged={sync.changed} />}
      {tab === "income" && <IncomeTab onChanged={sync.changed} />}
      {tab === "summary" && <SummaryTab />}
      {tab === "fixed" && <FixedTab onChanged={sync.changed} />}

      {adding && tab === "expenses" && <ExpenseDialog onClose={() => setAdding(false)} onSaved={sync.changed} />}
      {adding && tab === "income" && <IncomeDialog onClose={() => setAdding(false)} onSaved={sync.changed} />}
      {importing && <ImportDialog file={importing} onClose={() => setImporting(null)} onDone={sync.changed} />}
    </div>
  );
}

function SyncChip({ sync }: { sync: ReturnType<typeof useBooksSync> }) {
  if (!sync.configured) return <span className="text-[12.5px] text-ink-faint">Excel sync is off</span>;
  if (!sync.state?.drive_tracker_file_id) {
    return <a href={legacy("/settings")} onClick={() => { try { localStorage.setItem("tipolo.settings.tab", "drive"); } catch { /* */ } }} className="text-[13px] text-accent hover:underline">Link Google Drive</a>;
  }
  if (sync.syncing) return <Badge><RefreshCw className="mr-1 size-3 animate-spin" />Updating Excel…</Badge>;
  const when = sync.state.tracker_synced_at ? `synced ${relTime(sync.state.tracker_synced_at)}` : "never synced";
  const run = () => {
    const go = drive.connected() ? Promise.resolve("") : drive.connect();   // the popup must start in the click
    go.then(() => sync.syncNow()).then(() => toast.success("Excel file updated in Google Drive")).catch((e) => toast.error((e as Error).message));
  };
  return (
    <div className="flex items-center gap-2" title={when}>
      <Badge tone={sync.behind ? "amber" : "green"}>{sync.behind ? "Excel is behind" : "Excel up to date"}</Badge>
      <Button variant={sync.behind ? "outline" : "ghost"} size="sm" onClick={run}><RefreshCw />{sync.connected ? "Sync" : "Connect & sync"}</Button>
    </div>
  );
}

/* ---------------- Expenses ---------------- */

function ExpensesTab({ onChanged }: { onChanged: () => void }) {
  const [f, setF] = React.useState<ExpenseFilters>({ projectId: "", categoryId: "", billable: "", billed: "" });
  const { data: rows = [], isLoading, error } = useQuery({ ...expensesQuery(f), placeholderData: (p) => p });
  const { data: categories = [] } = useQuery(categoriesQuery);
  const { data: projects = [] } = useQuery(pickerProjectsQuery);
  const [editing, setEditing] = React.useState<Expense | null>(null);
  const confirm = useConfirm();

  const remove = async (e: Expense) => {
    if (!(await confirm({ title: "Delete expense", confirm: "Delete", danger: true,
      message: e.receipt_drive_id ? "Delete this expense? Its receipt stays in Google Drive." : "Delete this expense?" }))) return;
    try { await deleteExpense(e.id); toast.success("Deleted"); onChanged(); } catch (err) { toast.error((err as Error).message); }
  };
  const total = rows.reduce((s, e) => s + Number(e.amount || 0), 0);
  const tax = rows.reduce((s, e) => s + Number(e.tax_amount || 0), 0);
  const unbilled = rows.filter((e) => e.billable && !e.invoice_id).reduce((s, e) => s + Number(e.amount || 0) * (1 + (Number(e.markup_pct) || 0) / 100), 0);

  const columns: ColumnDef<Expense, unknown>[] = [
    { id: "date", header: "Date", accessorFn: (e) => e.expense_date, meta: { className: "w-28" }, cell: ({ getValue }) => <span className="text-[13px]">{date(getValue() as string)}</span> },
    {
      id: "desc", header: "Description", accessorFn: (e) => e.description ?? e.vendor ?? "",
      cell: ({ row: { original: e } }) => (
        <div className="flex items-center gap-2">
          <span>{e.description || e.vendor || "—"}</span>
          {receiptLink(e) && <button title={e.receipt_name ?? "View receipt"} onClick={() => openReceipt(receiptLink(e))} className="text-ink-faint hover:text-accent"><Receipt className="size-3.5" /></button>}
        </div>
      ),
    },
    { id: "project", header: "Client / Project", accessorFn: (e) => e.project?.title ?? "", cell: ({ row: { original: e } }) => <span className="text-[13px] text-ink-soft">{e.project ? [e.project.number, e.project.title].filter(Boolean).join(" · ") : "—"}</span> },
    { id: "category", header: "Category", accessorFn: (e) => e.category?.name ?? "", cell: ({ getValue }) => <span className="text-[13px] text-ink-soft">{(getValue() as string) || "—"}</span> },
    { id: "method", header: "Payment", accessorFn: (e) => e.payment_method ?? "", cell: ({ getValue }) => <span className="text-[13px] text-ink-soft">{(getValue() as string) || "—"}</span> },
    { id: "amount", header: "Amount", accessorFn: (e) => Number(e.amount) || 0, meta: { align: "right", className: "w-28" }, cell: ({ getValue }) => money(getValue() as number) },
    {
      id: "billing", header: "Billing", accessorFn: (e) => (e.billable ? (e.invoice_id ? 2 : 1) : 0), meta: { className: "w-32" },
      cell: ({ row: { original: e } }) => e.billable ? <Badge tone={e.invoice_id ? "green" : "amber"}>{e.invoice_id ? "billed" : `billable${e.markup_pct ? ` +${e.markup_pct}%` : ""}`}</Badge> : <Badge>internal</Badge>,
    },
    { id: "del", header: "", enableSorting: false, meta: { className: "w-10" }, cell: ({ row: { original: e } }) => <button title="Delete" onClick={() => remove(e)} className="text-ink-faint hover:text-bad"><Trash2 className="size-3.5" /></button> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select className="w-52" value={f.projectId} onChange={(e) => setF((x) => ({ ...x, projectId: e.target.value }))}>
          <option value="">All projects</option><option value="none">No project (business)</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{[p.number, p.title].filter(Boolean).join(" · ")}</option>)}
        </Select>
        <Select className="w-52" value={f.categoryId} onChange={(e) => setF((x) => ({ ...x, categoryId: e.target.value }))}>
          <option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select className="w-40" value={f.billable} onChange={(e) => setF((x) => ({ ...x, billable: e.target.value as ExpenseFilters["billable"] }))}>
          <option value="">Billable + not</option><option value="yes">Billable</option><option value="no">Not billable</option>
        </Select>
        <Select className="w-36" value={f.billed} onChange={(e) => setF((x) => ({ ...x, billed: e.target.value as ExpenseFilters["billed"] }))}>
          <option value="">Billed or not</option><option value="unbilled">Unbilled</option><option value="billed">Billed</option>
        </Select>
        <span className="ml-auto text-sm text-ink-soft">{rows.length} · <strong className="text-ink">{money(total)}</strong>{tax > 0 && ` · ${money(tax)} tax`}{unbilled > 0 && <> · <span className="text-warn">{money(unbilled)} unbilled</span></>}</span>
      </div>
      {error ? <EmptyState title="Couldn't load expenses">{(error as Error).message}</EmptyState>
        : isLoading ? <div className="h-64 animate-pulse rounded-lg border border-border bg-card" />
        : <DataTable data={rows} columns={columns} initialSort={[{ id: "date", desc: true }]} onRowClick={setEditing}
            empty={<EmptyState title="No expenses">Log a cost and attach its receipt. It's filed in Google Drive and added to the Excel tracker.</EmptyState>} />}
      {editing && <ExpenseDialog expense={editing} onClose={() => setEditing(null)} onSaved={onChanged} />}
    </div>
  );
}

/* ---------------- Income ---------------- */

function IncomeTab({ onChanged }: { onChanged: () => void }) {
  const { data: rows = [], isLoading, error } = useQuery(incomeQuery);
  const [editing, setEditing] = React.useState<Income | null>(null);
  const confirm = useConfirm();
  const remove = async (i: Income) => {
    if (!(await confirm({ title: "Delete income", confirm: "Delete", danger: true,
      message: i.invoice_id ? "Delete this payment? The invoice stays marked paid — reopen the invoice instead if the payment didn't happen." : "Delete this payment?" }))) return;
    try { await deleteIncome(i.id); toast.success("Deleted"); onChanged(); } catch (e) { toast.error((e as Error).message); }
  };
  const columns: ColumnDef<Income, unknown>[] = [
    { id: "date", header: "Date", accessorFn: (i) => i.income_date, meta: { className: "w-28" }, cell: ({ getValue }) => <span className="text-[13px]">{date(getValue() as string)}</span> },
    { id: "client", header: "Client / Project", accessorFn: (i) => i.client?.name ?? "", cell: ({ row: { original: i } }) => (
      <div><div>{i.client?.name ?? i.project?.title ?? "—"}</div>{i.project && <div className="text-[12px] text-ink-faint">{[i.project.number, i.project.title].filter(Boolean).join(" · ")}</div>}</div>) },
    { id: "desc", header: "Description", accessorFn: (i) => i.description ?? "", cell: ({ getValue }) => <span className="text-[13px] text-ink-soft">{(getValue() as string) || "—"}</span> },
    { id: "amount", header: "Amount", accessorFn: (i) => Number(i.amount) || 0, meta: { align: "right", className: "w-28" }, cell: ({ getValue }) => money(getValue() as number) },
    { id: "method", header: "Payment", accessorFn: (i) => i.payment_method ?? "", cell: ({ getValue }) => <span className="text-[13px] text-ink-soft">{(getValue() as string) || "—"}</span> },
    { id: "invoice", header: "Invoice", accessorFn: (i) => i.invoice?.number ?? "", meta: { className: "w-28" }, cell: ({ getValue }) => <span className="tabular-nums text-[13px]">{(getValue() as string) || "—"}</span> },
    { id: "del", header: "", enableSorting: false, meta: { className: "w-10" }, cell: ({ row: { original: i } }) => <button title="Delete" onClick={() => remove(i)} className="text-ink-faint hover:text-bad"><Trash2 className="size-3.5" /></button> },
  ];
  const total = rows.reduce((s, i) => s + Number(i.amount || 0), 0);
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">{rows.length} payment{rows.length === 1 ? "" : "s"} · <strong className="text-ink">{money(total)}</strong> · marking an invoice paid adds it here on its own.</p>
      {error ? <EmptyState title="Couldn't load income">{(error as Error).message}</EmptyState>
        : isLoading ? <div className="h-48 animate-pulse rounded-lg border border-border bg-card" />
        : <DataTable data={rows} columns={columns} initialSort={[{ id: "date", desc: true }]} onRowClick={setEditing}
            empty={<EmptyState title="No income yet">Marking an invoice paid adds it here on its own. Log anything else with New income.</EmptyState>} />}
      {editing && <IncomeDialog income={editing} onClose={() => setEditing(null)} onSaved={onChanged} />}
    </div>
  );
}

/* ---------------- Summary ---------------- */

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function SummaryTab() {
  const { data: expenses = [] } = useQuery(expensesQuery({ projectId: "", categoryId: "", billable: "", billed: "" }));
  const { data: income = [] } = useQuery(incomeQuery);
  const { data: categories = [] } = useQuery(categoriesQuery);
  const years = [...new Set([...expenses.map((e) => e.expense_date), ...income.map((i) => i.income_date)].filter(Boolean).map((d) => d.slice(0, 4)))].sort().reverse();
  const [year, setYear] = React.useState(() => String(new Date().getFullYear()));
  const inYear = (d: string | null) => !year || (d ?? "").startsWith(year);
  const all = summarise(expenses, income, categories);
  const s = summarise(expenses.filter((e) => inYear(e.expense_date)), income.filter((i) => inYear(i.income_date)), categories);
  const monthly = MONTH.map((m, k) => {
    const key = `${year}-${String(k + 1).padStart(2, "0")}`;
    return {
      month: m,
      Income: income.filter((i) => i.income_date.startsWith(key)).reduce((a, i) => a + Number(i.amount || 0), 0),
      Expenses: expenses.filter((e) => e.expense_date.startsWith(key)).reduce((a, e) => a + Number(e.amount || 0), 0),
    };
  });
  const max = Math.max(1, ...s.categories.map((c) => c.total));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg">Financial summary</h2>
        <Select className="w-32" value={year} onChange={(e) => setYear(e.target.value)}>
          {(years.includes(year) ? years : [year, ...years]).map((y) => <option key={y} value={y}>{y}</option>)}
          <option value="">All time</option>
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Spent today", money(all.today), ""], ["Spent this month", money(all.month), ""],
          ["Income", money(s.income), year || "all time"], ["Expenses", money(s.expenses), year || "all time"],
          ["Net", money(s.net), "income − expenses"],
        ].map(([k, v, d], idx) => (
          <div key={k} className="rounded-lg border border-border bg-card px-4 py-3">
            <div className="text-[11.5px] uppercase tracking-wide text-ink-faint">{k}</div>
            <div className={cn("mt-1 font-heading text-xl tabular-nums", idx === 4 && s.net < 0 && "text-bad")}>{v}</div>
            {d && <div className="text-[12px] text-ink-soft">{d}</div>}
          </div>
        ))}
      </div>
      {year && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-2 text-[12px] uppercase tracking-wide text-ink-faint">Income and expenses by month, {year}</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#E6E1D3" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#7C8A6B", fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} width={56} tick={{ fill: "#7C8A6B", fontSize: 12 }} tickFormatter={(v) => `$${Number(v).toLocaleString()}`} />
                <Tooltip formatter={(v) => money(Number(v))} cursor={{ fill: "rgba(63,74,32,0.05)" }} contentStyle={{ borderRadius: 8, border: "1px solid #D8D3C4", fontSize: 13 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Income" fill="#3F4A20" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="Expenses" fill="#B8A88A" radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-bg/60 text-[11.5px] uppercase tracking-wide text-ink-faint">
            <th className="px-4 py-2.5 text-left font-medium">Category</th><th className="w-32 px-4 py-2.5 text-right font-medium">Total</th><th className="w-[40%]" />
          </tr></thead>
          <tbody>
            {s.categories.map((c) => (
              <tr key={c.id} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-2">{c.name}</td>
                <td className="px-4 py-2 text-right tabular-nums">{money(c.total)}</td>
                <td className="px-4 py-2"><div className="h-2 rounded-full bg-accent/70" style={{ width: `${(c.total / max) * 100}%` }} /></td>
              </tr>
            ))}
            {s.uncategorised > 0 && <tr><td className="px-4 py-2 text-ink-faint">Uncategorized</td><td className="px-4 py-2 text-right tabular-nums">{money(s.uncategorised)}</td><td /></tr>}
          </tbody>
          <tfoot><tr className="border-t border-border font-medium"><td className="px-4 py-2.5">Total</td><td className="px-4 py-2.5 text-right tabular-nums">{money(s.expenses)}</td><td /></tr></tfoot>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Fixed costs ---------------- */

function FixedTab({ onChanged }: { onChanged: () => void }) {
  const { data: rows = [], isLoading, refetch } = useQuery(fixedQuery);
  const { data: categories = [] } = useQuery(categoriesQuery);
  const confirm = useConfirm();
  const total = rows.reduce((s, r) => s + (Number(r.annual_cost) || 0), 0);
  const commit = async (r: FixedCost, field: "item" | "category_id" | "annual_cost" | "notes", raw: string) => {
    const value = field === "annual_cost" ? (raw === "" ? 0 : Number(raw)) : field === "item" ? raw.trim() : raw.trim() || null;
    if (String(r[field] ?? "") === String(value ?? "")) return;
    try { await updateFixedCost(r.id, { [field]: value }); onChanged(); await refetch(); } catch (e) { toast.error((e as Error).message); }
  };
  const cell = "h-8 w-full rounded border border-transparent bg-transparent px-2 text-[13px] hover:border-border focus:border-accent/50 focus:bg-card focus:outline-none";
  if (isLoading) return <div className="h-48 animate-pulse rounded-lg border border-border bg-card" />;
  if (!rows.length) return <EmptyState title="No fixed costs">Add memberships, insurance, software, rent — anything the studio pays every year.</EmptyState>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft">What the studio spends in a year before any project. Changes save as you leave a field.</p>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[680px] text-sm">
          <thead><tr className="border-b border-border bg-bg/60 text-[11.5px] uppercase tracking-wide text-ink-faint">
            <th className="px-3 py-2.5 text-left font-medium">Cost item</th><th className="w-52 px-3 py-2.5 text-left font-medium">Category</th>
            <th className="w-32 px-3 py-2.5 text-right font-medium">Annual cost</th><th className="px-3 py-2.5 text-left font-medium">Notes</th><th className="w-10" />
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/60 last:border-0">
                <td className="px-1"><Input className={cell} defaultValue={r.item} placeholder="Cost item" onBlur={(e) => commit(r, "item", e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} /></td>
                <td className="px-1">
                  <select className={cell} defaultValue={r.category_id ?? ""} onChange={(e) => commit(r, "category_id", e.target.value)}>
                    <option value="">—</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </td>
                <td className="px-1"><Input className={cn(cell, "text-right tabular-nums")} type="number" step="0.01" min="0" defaultValue={r.annual_cost ?? ""} onBlur={(e) => commit(r, "annual_cost", e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} /></td>
                <td className="px-1"><Input className={cell} defaultValue={r.notes ?? ""} placeholder="Notes" onBlur={(e) => commit(r, "notes", e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} /></td>
                <td className="text-center"><button title="Delete" className="text-ink-faint hover:text-bad" onClick={async () => {
                  if (await confirm({ title: "Delete fixed cost", message: `Delete “${r.item || "this row"}”?`, confirm: "Delete", danger: true })) {
                    try { await deleteFixedCost(r.id); onChanged(); await refetch(); } catch (e) { toast.error((e as Error).message); }
                  }
                }}><Trash2 className="size-3.5" /></button></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t border-border font-medium">
            <td className="px-3 py-2.5" colSpan={2}>Total annual fixed costs</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{money(total)}</td>
            <td className="px-3 py-2.5 text-[13px] font-normal text-ink-soft">{money(total / 12)} a month</td><td />
          </tr></tfoot>
        </table>
      </div>
    </div>
  );
}

/* ---------------- import ---------------- */

function ImportDialog({ file, onClose, onDone }: { file: File; onClose: () => void; onDone: () => void }) {
  const [plan, setPlan] = React.useState<ImportPlan | null>(null);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    let live = true;
    file.arrayBuffer().then(planImport).then((p) => live && setPlan(p)).catch((e) => live && setError(`Couldn't read that workbook: ${(e as Error).message}`));
    return () => { live = false; };
  }, [file]);
  const n = plan ? plan.expenses.length + plan.income.length + plan.incomeUpdates.length + plan.fixed.length : 0;
  const go = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      const r = await runImport(plan);
      toast.success(`Imported ${r.expenses} expenses, ${r.income} income, ${r.fixed} fixed costs`);
      onDone(); onClose();
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title="Import from Excel"
      footer={<>{error && <div className="mr-auto text-sm text-bad">{error}</div>}
        <Button variant="ghost" onClick={onClose}>{n ? "Cancel" : "Close"}</Button>
        {n > 0 && <Button onClick={go} disabled={busy}>{busy ? "Importing…" : `Import ${n}`}</Button>}</>}>
      {!plan && !error && <p className="text-sm text-ink-faint">Reading {file.name}…</p>}
      {plan && (n === 0 ? <p className="text-sm">Everything in <strong>{file.name}</strong> is already in the portal.</p> : (
        <div className="space-y-3 text-sm">
          <p>From <strong>{file.name}</strong>:</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {plan.expenses.length > 0 && <li>{plan.expenses.length} expense{plan.expenses.length === 1 ? "" : "s"}</li>}
            {plan.income.length > 0 && <li>{plan.income.length} income entr{plan.income.length === 1 ? "y" : "ies"}</li>}
            {plan.incomeUpdates.length > 0 && <li>{plan.incomeUpdates.length} paid-invoice descriptions, taken from the sheet</li>}
            {plan.fixed.length > 0 && <li>{plan.fixed.length} fixed cost{plan.fixed.length === 1 ? "" : "s"}</li>}
            {plan.newCategories.size > 0 && <li>new categories: {[...plan.newCategories].join(", ")}</li>}
          </ul>
          {plan.skipped > 0 && <p className="text-ink-faint">{plan.skipped} already in the portal — left alone.</p>}
          <p className="text-[12.5px] text-ink-faint">Receipts aren't in the workbook. Attach them to each expense afterwards.</p>
        </div>
      ))}
    </Dialog>
  );
}
