import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/fields";
import { EmptyState } from "@/components/ui/data-table";
import { useConfirm } from "@/components/ui/confirm";
import { TimeEntryDialog } from "@/components/time/TimeEntryDialog";
import { cn } from "@/lib/utils";
import { date, hours, minutesToHM, money, STATUS } from "@/lib/format";
import { settingsQuery } from "@/lib/data/settings";
import { sourceUrl } from "@/lib/data/proposals";
import {
  PROJECT_STATUSES, invoiceStatus, projectQuery, projectWorkQuery, useTimeEntryMutations, useUpdateProject,
  type Project, type TimeEntry,
} from "@/lib/data/projects";
import { BudgetBar } from "./ProjectsList";
import { ProjectDialog } from "./ProjectDialog";
import { NewInvoiceDialog } from "@/pages/invoices/InvoicesList";
import { ExpenseDialog } from "@/pages/books/Dialogs";
import { useQueryClient } from "@tanstack/react-query";

const TABS = ["overview", "time", "expenses", "invoices", "proposals"] as const;
type Tab = (typeof TABS)[number];

export function ProjectDetail() {
  const { id } = useParams({ from: "/projects/$id" });
  const { tab = "overview" } = useSearch({ from: "/projects/$id" }) as { tab?: Tab };
  const navigate = useNavigate();
  const { data: p, isLoading, error } = useQuery(projectQuery(id));
  const { data: work } = useQuery(projectWorkQuery(id));
  const { data: settings } = useQuery(settingsQuery);
  const update = useUpdateProject();
  const [editing, setEditing] = React.useState(false);
  const [invoicing, setInvoicing] = React.useState(false);
  const [expense, setExpense] = React.useState<{ id?: string } | null>(null);
  const qc = useQueryClient();

  if (isLoading) return <div className="h-96 animate-pulse rounded-lg bg-card" />;
  if (error || !p) return <EmptyState title="Project not found">{(error as Error)?.message} <Link to="/projects" className="text-accent underline">Back to projects</Link></EmptyState>;

  const time = work?.time ?? [];
  const invoices = (work?.invoices ?? []).filter((i) => i.status !== "draft");
  const billed = invoices.reduce((s, i) => s + Number(i.total || 0), 0);
  const paid = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.total || 0), 0);
  const budget = p.budget != null ? Number(p.budget) : (work?.proposals ?? []).reduce((s, x) => s + Number(x.subtotal || 0), 0) || null;
  const minutes = time.reduce((s, e) => s + e.minutes, 0);
  const unbilled = time.filter((e) => e.billable && !e.invoice_id).reduce((s, e) => s + (e.minutes / 60) * (Number(e.rate) || 0), 0);
  const rate = p.hourly_rate ?? p.client?.default_rate ?? settings?.default_hourly_rate ?? null;

  const openSource = async () => {
    const w = window.open("", "_blank");
    try { const url = await sourceUrl(p.source_pdf_path!); if (w) w.location.href = url; }
    catch (e) { w?.close(); toast.error((e as Error).message); }
  };

  const counts: Partial<Record<Tab, number>> = {
    time: time.length, expenses: work?.expenses.length, invoices: work?.invoices.length, proposals: work?.proposals.length,
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-ink-faint">
          <Link to="/projects" className="inline-flex items-center gap-1 hover:text-ink"><ArrowLeft className="size-3.5" />Projects</Link>
          {p.client && <>·<Link to="/clients/$id" params={{ id: p.client.id }} className="hover:text-ink">{p.client.name}</Link></>}
          {p.source_pdf_path && <>·<button onClick={openSource} className="inline-flex items-center gap-1 hover:text-ink">original PDF<ExternalLink className="size-3" /></button></>}
        </div>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <h1 className="flex flex-wrap items-center gap-2 text-3xl">
            {p.number && <span className="tabular-nums text-ink-faint">{p.number}</span>}{p.title}
          </h1>
          <div className="flex items-center gap-2">
            {/* status changes in place: it's the thing that changes most */}
            <Select className="w-36" value={p.status} aria-label="Status"
              onChange={(e) => update.mutate({ id: p.id, patch: { status: e.target.value } },
                { onSuccess: () => toast.success(`Marked ${STATUS[e.target.value]?.label.toLowerCase()}`), onError: (er) => toast.error(er.message) })}>
              {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
            </Select>
            <Button variant="outline" onClick={() => setEditing(true)}><Pencil />Edit</Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="py-4 sm:col-span-2">
          <div className="text-[12px] uppercase tracking-wide text-ink-faint">Billed against budget</div>
          <BudgetBar className="mt-3" billed={billed} budget={budget} />
          <div className="mt-2 text-[12.5px] text-ink-soft">{money(paid)} paid{billed - paid > 0 && ` · ${money(billed - paid)} outstanding`}</div>
        </Card>
        <Card className="py-4">
          <div className="text-[12px] uppercase tracking-wide text-ink-faint">Hours logged</div>
          <div className="mt-1 font-heading text-2xl">{hours(minutes)}</div>
          <div className="text-[12.5px] text-ink-soft">{rate != null ? `${money(rate)}/hr` : "no rate"}</div>
        </Card>
        <Card className="py-4">
          <div className="text-[12px] uppercase tracking-wide text-ink-faint">Not yet invoiced</div>
          <div className={cn("mt-1 font-heading text-2xl", unbilled > 0 && "text-warn")}>{money(unbilled)}</div>
          <div className="text-[12.5px] text-ink-soft">billable time</div>
        </Card>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button key={t} onClick={() => navigate({ to: "/projects/$id", params: { id }, search: t === "overview" ? {} : { tab: t }, replace: true })}
            className={cn("-mb-px border-b-2 px-3 py-2 text-[13.5px] capitalize", tab === t ? "border-accent font-medium" : "border-transparent text-ink-soft hover:text-ink")}>
            {t}{counts[t] ? <span className="ml-1.5 text-[11px] text-ink-faint">{counts[t]}</span> : null}
          </button>
        ))}
      </div>

      {tab === "overview" && <Overview p={p} rate={rate} />}
      {tab === "time" && <TimeTab projectId={p.id} entries={time} />}
      {tab === "expenses" && (
        <Card className="p-0">
          <div className="flex items-center justify-between px-5 pt-5">
            <CardTitle>Expenses</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setExpense({})}><Plus />Add expense</Button>
          </div>
          {work?.expenses.length ? (
            <ul className="mt-3 divide-y divide-border/70 border-t border-border/70">
              {work.expenses.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <span className="w-24 shrink-0 text-ink-faint">{date(e.expense_date)}</span>
                  <span className="min-w-0 flex-1 truncate">{e.description || e.vendor || "—"}{e.category && <span className="text-ink-faint"> · {e.category.name}</span>}</span>
                  {e.billable && <Badge tone={e.invoice_id ? "green" : "amber"}>{e.invoice_id ? "billed" : `billable${e.markup_pct ? ` +${e.markup_pct}%` : ""}`}</Badge>}
                  <span className="w-24 text-right tabular-nums">{money(e.amount)}</span>
                </li>
              ))}
              <li className="flex justify-between px-5 py-3 text-sm font-medium"><span>Total</span><span className="tabular-nums">{money(work.expenses.reduce((s, e) => s + Number(e.amount || 0), 0))}</span></li>
            </ul>
          ) : <p className="px-5 pb-5 pt-2 text-sm text-ink-faint">No expenses on this project.</p>}
        </Card>
      )}
      {tab === "invoices" && (
        <Card className="p-0">
          <div className="flex items-center justify-between px-5 pt-5">
            <CardTitle>Invoices</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setInvoicing(true)}><Plus />New invoice</Button>
          </div>
          {work?.invoices.length ? (
            <ul className="mt-3 divide-y divide-border/70 border-t border-border/70">
              {work.invoices.map((inv) => (
                <li key={inv.id}>
                  <Link to="/invoices/$id" params={{ id: inv.id }} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-bg/60">
                    <span className="w-28 tabular-nums">{inv.number ?? "draft"}</span>
                    <span className="flex-1 text-ink-faint">{inv.issue_date ? date(inv.issue_date) : ""}</span>
                    <span className="tabular-nums">{money(inv.total)}</span>
                    <StatusBadge status={invoiceStatus(inv)} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="px-5 pb-5 pt-2 text-sm text-ink-faint">No invoices yet.</p>}
        </Card>
      )}
      {tab === "proposals" && (
        <Card className="p-0">
          <div className="px-5 pt-5"><CardTitle>Proposals</CardTitle></div>
          {work?.proposals.length ? (
            <ul className="mt-3 divide-y divide-border/70 border-t border-border/70">
              {work.proposals.map((x) => (
                <li key={x.id}>
                  <Link to="/proposals/$id" params={{ id: x.id }} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-bg/60">
                    <span className="w-14 tabular-nums text-ink-faint">{x.number}</span>
                    <span className="flex-1">{x.title}</span>
                    <span className="tabular-nums">{money(x.subtotal)}</span>
                    <StatusBadge status={x.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="px-5 pb-5 pt-2 text-sm text-ink-faint">No linked proposal.</p>}
        </Card>
      )}

      {editing && <ProjectDialog project={p} onClose={() => setEditing(false)} />}
      {invoicing && <NewInvoiceDialog projectId={p.id} onClose={() => setInvoicing(false)} />}
      {expense && <ExpenseDialog prefill={{ project_id: p.id }} onClose={() => setExpense(null)}
        onSaved={() => { qc.invalidateQueries({ queryKey: ["projects"] }); qc.invalidateQueries({ queryKey: ["books"] }); }} />}
    </div>
  );
}

function Overview({ p, rate }: { p: Project; rate: number | null }) {
  const update = useUpdateProject();
  const [label, setLabel] = React.useState("");
  const items = p.deliverables;
  const contact = p.contact ?? p.client?.contacts.find((c) => c.is_primary) ?? p.client?.contacts[0] ?? null;
  const done = items.filter((d) => d.done).length;

  const save = (deliverables: typeof items) =>
    update.mutate({ id: p.id, patch: { deliverables } }, { onError: (e) => toast.error(`Couldn't save: ${e.message}`) });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>Deliverables</CardTitle>
          {items.length > 0 && <span className="text-sm text-ink-faint">{done} of {items.length} done</span>}
        </div>
        {items.length > 0 && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-alt">
            <div className="h-full rounded-full bg-accent" style={{ width: `${(done / items.length) * 100}%` }} />
          </div>
        )}
        <ul className="mt-3 divide-y divide-border/60">
          {items.map((d, i) => (
            <li key={i} className="group flex items-center gap-3 py-2">
              <input type="checkbox" className="size-4 accent-accent" checked={d.done}
                     onChange={(e) => save(items.map((x, k) => (k === i ? { ...x, done: e.target.checked } : x)))} />
              <span className={cn("flex-1 text-sm", d.done && "text-ink-faint line-through")}>{d.label}</span>
              <button title="Remove" onClick={() => save(items.filter((_, k) => k !== i))}
                      className="opacity-0 text-ink-faint hover:text-bad group-hover:opacity-100"><Trash2 className="size-3.5" /></button>
            </li>
          ))}
          {!items.length && <li className="py-2 text-sm text-ink-faint">No deliverables yet.</li>}
        </ul>
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!label.trim()) return; save([...items, { label: label.trim(), done: false }]); setLabel(""); }}>
          <Input placeholder="Add a deliverable…" value={label} onChange={(e) => setLabel(e.target.value)} />
          <Button type="submit" variant="subtle" disabled={!label.trim()}>Add</Button>
        </form>
      </Card>

      <Card>
        <CardTitle>Details</CardTitle>
        <dl className="mt-3 space-y-3 text-sm">
          {[
            ["Contact", contact ? `${contact.name}${contact.title ? ` · ${contact.title}` : ""}${p.contact ? "" : " (client's primary)"}` : "—"],
            ["Scope", p.scope],
            ["Start", p.start_date ? date(p.start_date) : "—"],
            ["Due", p.due_date ? date(p.due_date) : "—"],
            ["Hourly rate", rate != null ? `${money(rate)} / hr${p.hourly_rate == null ? " (inherited)" : ""}` : "—"],
            ["Budget", p.budget != null ? money(p.budget) : "From the proposal"],
          ].map(([k, v]) => (
            <div key={k}><dt className="text-[12px] text-ink-faint">{k}</dt><dd className="mt-0.5">{v}</dd></div>
          ))}
          {p.description && <div><dt className="text-[12px] text-ink-faint">Description</dt><dd className="mt-0.5 whitespace-pre-wrap">{p.description}</dd></div>}
        </dl>
      </Card>
    </div>
  );
}

function TimeTab({ projectId, entries }: { projectId: string; entries: TimeEntry[] }) {
  const [dialog, setDialog] = React.useState<{ entry?: TimeEntry } | null>(null);
  const m = useTimeEntryMutations();
  const confirm = useConfirm();
  const total = entries.reduce((s, e) => s + e.minutes, 0);

  return (
    <Card className="p-0">
      <div className="flex items-center justify-between px-5 pt-5">
        <CardTitle>Time <span className="font-sans text-sm font-normal text-ink-faint">· {minutesToHM(total)} h</span></CardTitle>
        <Button size="sm" onClick={() => setDialog({})}><Plus />Log time</Button>
      </div>
      {entries.length ? (
        <ul className="mt-3 divide-y divide-border/70 border-t border-border/70">
          {entries.map((e) => (
            <li key={e.id} className="group flex items-center gap-3 px-5 py-3 text-sm">
              <span className="w-24 shrink-0 text-ink-faint">{date(e.entry_date)}</span>
              <button className="min-w-0 flex-1 truncate text-left hover:text-accent" onClick={() => setDialog({ entry: e })}>{e.description || "—"}</button>
              {!e.billable && <Badge>non-billable</Badge>}
              {e.invoice_id && <Badge tone="green">billed</Badge>}
              <span className="w-14 text-right tabular-nums">{minutesToHM(e.minutes)}</span>
              <span className="w-20 text-right tabular-nums text-ink-faint">{e.rate != null ? money(e.rate) : "—"}</span>
              <button title="Delete" className="opacity-0 text-ink-faint hover:text-bad group-hover:opacity-100"
                onClick={async () => {
                  if (await confirm({ title: "Delete time entry", message: "Delete this time entry? This can't be undone.", confirm: "Delete", danger: true }))
                    m.remove.mutate(e.id, { onSuccess: () => toast.success("Entry deleted"), onError: (er) => toast.error(er.message) });
                }}><Trash2 className="size-3.5" /></button>
            </li>
          ))}
        </ul>
      ) : <p className="px-5 pb-5 pt-2 text-sm text-ink-faint">No time logged on this project yet.</p>}
      {dialog && <TimeEntryDialog entry={dialog.entry} prefill={{ project_id: projectId }} onClose={() => setDialog(null)} />}
    </Card>
  );
}
