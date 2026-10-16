// Invoice builder — the same split workspace as the proposal builder: the document on
// the left, the printed page on the right.
//
// An invoice is a progress bill. Each line carries the budget agreed in the proposal,
// what earlier invoices already drew against it, and what this one draws. Only the
// Current column is typed; Previous comes from the project's other invoices, Balance is
// what's left, and a draw larger than the line has left is refused as you type.

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useBlocker, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, ExternalLink, FileDown, FileText, Pencil, Plus, Save, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox, Field, Select } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/data-table";
import { useConfirm } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";
import { date, formatPhone, localISO, money } from "@/lib/format";
import { settingsQuery } from "@/lib/data/settings";
import { saveRecipient, type ProposalClient } from "@/lib/data/proposals";
import {
  deleteInvoice, effectiveStatus, finalizeInvoice, invoiceKeys, invoiceQuery, previousDrawsQuery, useInvoiceUpdate,
  type Invoice,
} from "@/lib/data/invoices";
import {
  INVOICE_LEVELS, INVOICE_PARTS, INVOICE_TOKEN_HELP, computeProgressTotals, invoiceDocHtml, lineBalance, lineKey,
  lineRemaining, newLineId, normaliseInvoiceSections, printInvoice, type ProgressLine, type TaxDef,
} from "@/lib/invoice-doc";
import type { Block } from "@/lib/doc";
import { BlockFrame, TextBlock } from "@/pages/proposals/builder/BlockEditors";
import { Preview } from "@/pages/proposals/builder/Preview";

type Tab = "details" | "lines" | "payment";

export function InvoiceBuilder() {
  const { id } = useParams({ from: "/invoices/$id" });
  const { data: inv, error, isLoading } = useQuery(invoiceQuery(id));
  const { data: settings } = useQuery(settingsQuery);
  const prev = useQuery({ ...previousDrawsQuery(inv ?? { id, project_id: "", created_at: "" }), enabled: !!inv });
  if (isLoading || (inv && prev.isLoading)) return <div className="m-8 h-[70vh] animate-pulse rounded-lg bg-card" />;
  if (error || !inv) return <div className="p-8"><EmptyState title="Invoice not found">{(error as Error)?.message} <Link to="/invoices" className="text-accent underline">Back to invoices</Link></EmptyState></div>;
  if (inv.doc_mode === "pdf") return <PdfInvoice key={inv.id} inv={inv} settings={settings ?? {}} />;
  return <Builder key={inv.id} inv={inv} settings={settings ?? {}} previous={prev.data ?? {}} />;
}

function Builder({ inv, settings, previous }: { inv: Invoice; settings: { tax_lines?: unknown; income_payment_methods?: unknown }; previous: Record<string, number> }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const save = useInvoiceUpdate();
  const editable = inv.status === "draft";
  const taxDefs = React.useMemo(() => (settings.tax_lines as TaxDef[] | undefined) ?? [], [settings.tax_lines]);

  const [blocks, setBlocks] = React.useState<Block[]>(() => normaliseInvoiceSections(inv.sections));
  // An invoice drafted before the document format carries qty × price line items;
  // show them as fully-drawn progress lines rather than an empty table.
  const [lines, setLines] = React.useState<ProgressLine[]>(() => inv.progress_lines?.length
    ? inv.progress_lines.map((l) => ({ ...l }))
    : (inv.line_items ?? []).map((li) => {
        const amt = Math.round((Number(li.qty) || 0) * (Number(li.unit_price) || 0) * 100) / 100;
        return { id: newLineId(), description: li.description ?? "", budget: amt, amount: amt, source_time_entry_ids: li.source_time_entry_ids, source_expense_ids: li.source_expense_ids };
      }));
  const [issueDate, setIssueDate] = React.useState(inv.issue_date ?? localISO());
  const [dueDate, setDueDate] = React.useState(inv.due_date ?? "");
  const [preparedBy, setPreparedBy] = React.useState(inv.prepared_by ?? "");
  const [applyTaxes, setApplyTaxes] = React.useState(inv.apply_taxes !== false);
  const [tab, setTab] = React.useState<Tab>("lines");
  const [active, setActive] = React.useState(-1);
  const [dirty, setDirty] = React.useState(false);
  const [paying, setPaying] = React.useState(false);
  const [mobileView, setMobileView] = React.useState<"edit" | "preview">("edit");
  const touched = () => setDirty(true);

  const prevOf = React.useCallback((li: ProgressLine) => previous[lineKey(li)] ?? 0, [previous]);
  const totals = computeProgressTotals(lines, taxDefs, applyTaxes);
  const live = React.useMemo(() => ({ ...inv, issue_date: issueDate, due_date: dueDate || null, prepared_by: preparedBy, apply_taxes: applyTaxes, sections: blocks, progress_lines: lines }),
    [inv, issueDate, dueDate, preparedBy, applyTaxes, blocks, lines]);
  const prevArr = React.useMemo(() => lines.map(prevOf), [lines, prevOf]);
  const render = React.useCallback((doc: unknown, s: unknown) => invoiceDocHtml(doc, s, { previous: prevArr }), [prevArr]);

  const persist = React.useCallback(() => {
    const t = computeProgressTotals(lines, taxDefs, applyTaxes);
    return save.mutateAsync({ id: inv.id, patch: {
      issue_date: issueDate || localISO(), due_date: dueDate || null, prepared_by: preparedBy.trim() || null, apply_taxes: applyTaxes,
      sections: blocks, progress_lines: lines, tax_lines: t.taxLines, subtotal: t.subtotal, tax_total: t.taxTotal, total: t.total,
    } });
  }, [save, inv.id, lines, taxDefs, applyTaxes, issueDate, dueDate, preparedBy, blocks]);

  const doSave = React.useCallback(async () => {
    if (!editable || !dirty) return;
    try { await persist(); setDirty(false); toast.success("Saved"); } catch (e) { toast.error((e as Error).message); }
  }, [editable, dirty, persist]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); doSave(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doSave]);
  useBlocker({ shouldBlockFn: () => dirty && !window.confirm("You have unsaved changes to this invoice. Leave without saving?"), enableBeforeUnload: () => dirty });

  /* ---- actions ---- */
  const finalize = async () => {
    if (!lines.some((l) => Number(l.amount) > 0)) return toast.error("Nothing is being billed — put an amount in the Current column first.");
    if (!(await confirm({ title: "Finalize & send", confirm: "Finalize",
      message: `Finalize this invoice for ${money(totals.total)}? It gets the next invoice number, its time and expenses are marked billed, and it can't be edited after.` }))) return;
    try {
      const saved = await persist();
      const done = await finalizeInvoice(saved);
      qc.setQueryData(invoiceKeys.one(done.id), done);
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      setDirty(false);
      toast.success(`Invoice ${done.number} finalized`);
    } catch (e) { toast.error((e as Error).message); }
  };
  const reopen = async () => {
    const back = inv.status === "sent";
    if (!(await confirm({ title: "Reopen", confirm: "Reopen",
      message: back ? "Put this invoice back to draft? Its number stays with it." : "Reopen this invoice? It goes back to sent, and its income entry is removed." }))) return;
    save.mutate({ id: inv.id, patch: back ? { status: "draft" } : { status: "sent", paid_date: null } },
      { onSuccess: () => toast.success("Reopened"), onError: (e) => toast.error(e.message) });
  };
  const remove = async () => {
    if (!(await confirm({ title: "Delete invoice", confirm: "Delete", danger: true,
      message: inv.status === "draft" ? "Delete this draft invoice?" : `Delete invoice ${inv.number}? Its time entries go back to unbilled, and this leaves a gap in your invoice numbers.` }))) return;
    try {
      setDirty(false);
      await deleteInvoice(inv.id);
      qc.invalidateQueries({ queryKey: ["invoices"] }); qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Invoice deleted");
      navigate({ to: "/invoices" });
    } catch (e) { toast.error((e as Error).message); }
  };

  /* ---- text blocks ---- */
  const inTab = (i: number) => (blocks[i]?.part ?? "lines") === tab;
  const patchBlock = (i: number, p: Partial<Block>) => { setBlocks((b) => b.map((x, k) => (k === i ? { ...x, ...p } : x))); touched(); };
  const moveBlock = (i: number, dir: -1 | 1) => {
    let j = i + dir;
    while (j >= 0 && j < blocks.length && !inTab(j)) j += dir;
    if (j < 0 || j >= blocks.length) return;
    setBlocks((b) => { const n = [...b]; [n[i], n[j]] = [n[j], n[i]]; return n; }); setActive(j); touched();
  };
  const deleteBlock = async (i: number) => {
    if (!(await confirm({ title: "Delete block", message: `Delete “${blocks[i].heading || "this block"}”?`, confirm: "Delete", danger: true }))) return;
    setBlocks((b) => b.filter((_, k) => k !== i)); setActive(-1); touched();
  };
  const addBlock = () => {
    let at = blocks.length;
    for (let i = blocks.length - 1; i >= 0; i--) if (inTab(i)) { at = i + 1; break; }
    setBlocks((b) => [...b.slice(0, at), { part: tab, level: 0, heading: "", body: "" }, ...b.slice(at)]); setActive(at); touched();
  };

  const st = effectiveStatus(inv);
  const client = inv.project?.client ?? null;

  return (
    <div className="flex h-screen flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-bg px-5 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[12.5px] text-ink-faint">
            <Link to="/invoices" className="inline-flex items-center gap-1 hover:text-ink"><ArrowLeft className="size-3.5" />Invoices</Link>
            {inv.project && <>·<Link to="/projects/$id" params={{ id: inv.project.id }} className="hover:text-ink">{[inv.project.number, inv.project.title].filter(Boolean).join(" · ")}</Link></>}
            {client && <>· <span>{client.name}</span></>}
          </div>
          <h1 className="mt-0.5 flex items-center gap-2 text-xl">
            <span className="tabular-nums">{inv.number ?? "Draft"}</span>
            <span className="tabular-nums text-ink-soft">{money(totals.total)}</span>
            <StatusBadge status={st} />
          </h1>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {dirty && <span className="text-[12px] text-warn">Unsaved</span>}
          {editable && <Button variant="outline" size="sm" onClick={doSave} disabled={!dirty || save.isPending}><Save />Save</Button>}
          {inv.source_drive_url && <Button variant="outline" size="sm" asChild><a href={inv.source_drive_url} target="_blank" rel="noreferrer" title={inv.source_name ?? ""}><FileText />Filed PDF</a></Button>}
          <Button variant="outline" size="sm" onClick={() => printInvoice(live, settings, { previous: prevArr })}><FileDown />Save as PDF</Button>
          {inv.status === "draft" && <Button size="sm" onClick={finalize}><Send />Finalize &amp; send</Button>}
          {inv.status === "sent" && <><Button size="sm" onClick={() => setPaying(true)}><CheckCircle2 />Mark paid</Button>
            <Button variant="ghost" size="sm" onClick={reopen}>Back to draft</Button></>}
          {inv.status === "paid" && <Button variant="outline" size="sm" onClick={reopen}>Reopen</Button>}
          <Button variant="ghost" size="icon" title="Delete invoice" onClick={remove}><Trash2 /></Button>
        </div>
      </div>

      <div className="flex border-b border-border md:hidden">
        {(["edit", "preview"] as const).map((v) => (
          <button key={v} onClick={() => setMobileView(v)} className={cn("flex-1 py-2 text-sm capitalize", mobileView === v ? "border-b-2 border-accent font-medium" : "text-ink-soft")}>{v}</button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className={cn("min-h-0 overflow-y-auto md:w-[50%] md:shrink-0", mobileView === "edit" ? "w-full" : "hidden md:block")}>
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Issue date"><Input type="date" value={issueDate} readOnly={!editable} onChange={(e) => { setIssueDate(e.target.value); touched(); }} /></Field>
              <Field label="Due date"><Input type="date" value={dueDate} readOnly={!editable} placeholder="30 days after sending" onChange={(e) => { setDueDate(e.target.value); touched(); }} /></Field>
              <Field label="Prepared by"><Input value={preparedBy} readOnly={!editable} placeholder="Your name" onChange={(e) => { setPreparedBy(e.target.value); touched(); }} /></Field>
            </div>

            <div className="flex flex-wrap gap-1 border-b border-border">
              {INVOICE_PARTS.map((pt) => (
                <button key={pt.id} onClick={() => { setTab(pt.id); setActive(-1); }}
                  className={cn("-mb-px border-b-2 px-3 py-2 text-[13px]", tab === pt.id ? "border-accent font-medium" : "border-transparent text-ink-soft hover:text-ink")}>
                  {pt.label}
                </button>
              ))}
            </div>

            {tab === "details" ? (
              <>
                <BillTo inv={inv} editable={editable} />
                {taxDefs.some((t) => t.enabled) && (
                  <div className="rounded-md border border-border bg-card p-4">
                    <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ink-faint">Tax</div>
                    <Checkbox disabled={!editable} checked={applyTaxes} onChange={(e) => { setApplyTaxes(e.target.checked); touched(); }}
                      label={`Add ${taxDefs.filter((t) => t.enabled).map((t) => `${t.label} ${t.rate}%`).join(" + ")}`} />
                    <p className="mt-2 text-[12px] text-ink-faint">The house invoice shows a subtotal and nothing else. Turn this on only when the invoice has to carry tax.</p>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="space-y-2">
                  {blocks.map((b, i) => inTab(i) && (
                    <BlockFrame key={i} block={b} editable={editable} active={active === i} onFocus={() => setActive(i)}
                      onChange={(p) => patchBlock(i, p)} onMove={(d) => moveBlock(i, d)} onDelete={() => deleteBlock(i)}
                      levels={INVOICE_LEVELS} canDelete={b.kind !== "progress"}>
                      {b.kind === "progress"
                        ? <ProgressEditor lines={lines} setLines={(l) => { setLines(l); touched(); }} prevOf={prevOf} editable={editable} totals={totals} />
                        : <TextBlock block={b} editable={editable} active={active === i} onChange={(p) => patchBlock(i, p)} />}
                    </BlockFrame>
                  ))}
                </div>
                {editable && (
                  <div className="flex flex-wrap items-center gap-3 px-1">
                    <Button variant="subtle" size="sm" onClick={addBlock}><Plus />Add a block</Button>
                    <span className="text-[12px] text-ink-faint">Tokens: {INVOICE_TOKEN_HELP.slice(0, 3).map((t) => <code key={t} className="mr-1 rounded bg-bg-alt px-1">{t}</code>)}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <div className={cn("min-h-0 min-w-0 flex-1 border-l border-border", mobileView === "preview" ? "block" : "hidden md:block")}>
          <Preview doc={live} settings={settings} docOnly render={render} />
        </div>
      </div>

      {paying && <PaidDialog inv={inv} methods={(settings.income_payment_methods as string[] | undefined) ?? []} onClose={() => setPaying(false)} />}
    </div>
  );
}

/* The one table where the arithmetic is the point: Budget and Previous bound what may be
   typed into Current, and Balance follows. */
function ProgressEditor({ lines, setLines, prevOf, editable, totals }: {
  lines: ProgressLine[]; setLines: (l: ProgressLine[]) => void; prevOf: (l: ProgressLine) => number;
  editable: boolean; totals: ReturnType<typeof computeProgressTotals>;
}) {
  const [warn, setWarn] = React.useState("");
  const [flash, setFlash] = React.useState(-1);
  const set = (j: number, patch: Partial<ProgressLine>) => setLines(lines.map((l, k) => (k === j ? { ...l, ...patch } : l)));
  const num = (v: string) => { const n = v === "" ? 0 : Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };

  const setAmount = (j: number, raw: string) => {
    let v = num(raw);
    const rem = lineRemaining(lines[j], prevOf(lines[j]));
    if (v > rem) {
      v = rem;
      setWarn(`“${lines[j].description || "That line"}” has ${money(rem)} left of its ${money(lines[j].budget)} budget — the amount was capped there.`);
      setFlash(j); setTimeout(() => setFlash(-1), 1200);
    } else setWarn("");
    set(j, { amount: v });
  };
  const setBudget = (j: number, raw: string) => {
    const budget = num(raw);
    const next = { ...lines[j], budget };
    const rem = lineRemaining(next, prevOf(next));
    if ((Number(next.amount) || 0) > rem) { next.amount = Math.max(0, rem); setWarn(`Budget lowered — this invoice's draw came down to ${money(next.amount)}.`); }
    setLines(lines.map((l, k) => (k === j ? next : l)));
  };

  const cell = "h-8 w-full rounded border border-transparent bg-transparent px-2 text-[13px] hover:border-border focus:border-accent/50 focus:bg-card focus:outline-none read-only:hover:border-transparent";
  const th = "px-1 pb-1 text-left text-[11px] font-medium uppercase tracking-wide text-ink-faint";
  const sum = (fn: (l: ProgressLine) => number) => lines.reduce((s, l) => s + fn(l), 0);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px]">
          <thead><tr>
            <th className={th}>Description</th>
            <th className={cn(th, "w-24 text-right")}>Budget</th>
            <th className={cn(th, "w-24 text-right")}>Previous</th>
            <th className={cn(th, "w-32 text-right")}>Current</th>
            <th className={cn(th, "w-24 text-right")}>Balance</th>
            <th className="w-8" />
          </tr></thead>
          <tbody>
            {lines.map((l, j) => {
              const p = prevOf(l);
              const rem = lineRemaining(l, p);
              return (
                <tr key={l.id ?? j}>
                  <td><input className={cell} readOnly={!editable} value={l.description ?? ""} onChange={(e) => set(j, { description: e.target.value })} /></td>
                  <td><input className={cn(cell, "text-right tabular-nums")} type="number" step="0.01" min="0" readOnly={!editable} value={l.budget ?? 0} onChange={(e) => setBudget(j, e.target.value)} /></td>
                  <td className="px-2 text-right text-[13px] tabular-nums text-ink-faint">{p ? money(p) : "—"}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <input className={cn(cell, "text-right tabular-nums", flash === j && "border-bad bg-bad-bg")} type="number" step="0.01" min="0" max={rem}
                        readOnly={!editable} value={l.amount ?? 0} onChange={(e) => setAmount(j, e.target.value)} />
                      {editable && <button type="button" title="Bill the rest of this line" onClick={() => { setWarn(""); set(j, { amount: Math.max(0, rem) }); }}
                        className="rounded px-1 text-[11px] text-accent hover:bg-bg-alt">max</button>}
                    </div>
                  </td>
                  <td className="px-2 text-right text-[13px] tabular-nums">{money(lineBalance(l, p))}</td>
                  <td>{editable && <button type="button" title="Remove" onClick={() => setLines(lines.filter((_, k) => k !== j))}
                    className="grid size-6 place-items-center rounded text-ink-faint hover:text-bad"><X className="size-3.5" /></button>}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr className="border-t border-border/60 text-[13px] font-medium tabular-nums">
            <td className="px-2 pt-2">Subtotal</td>
            <td className="px-2 pt-2 text-right">{money(sum((l) => Number(l.budget) || 0))}</td>
            <td className="px-2 pt-2 text-right">{money(sum(prevOf))}</td>
            <td className="px-2 pt-2 text-right">{money(totals.subtotal)}</td>
            <td className="px-2 pt-2 text-right">{money(sum((l) => lineBalance(l, prevOf(l))))}</td>
            <td />
          </tr></tfoot>
        </table>
      </div>
      {editable && <button type="button" onClick={() => setLines([...lines, { id: newLineId(), description: "", budget: 0, amount: 0 }])}
        className="mt-1 inline-flex items-center gap-1 rounded px-2 py-1 text-[12.5px] text-accent hover:bg-bg-alt"><Plus className="size-3.5" />Add line</button>}
      {warn && <p className="mt-2 text-[12.5px] text-warn">{warn}</p>}
      {totals.taxLines.length > 0 && (
        <div className="mt-2 flex justify-between border-t border-border/60 pt-2 text-[13px]">
          <span className="text-ink-soft">{totals.taxLines.map((t) => `${t.label} ${money(t.amount)}`).join(" + ")}</span>
          <strong className="tabular-nums">Total {money(totals.total)}</strong>
        </div>
      )}
    </div>
  );
}

/* Bill To prints from the client record, so this shows what will appear and corrects the
   record without leaving the invoice. */
function BillTo({ inv, editable }: { inv: Invoice; editable: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = React.useState(false);
  const c = inv.project?.client ?? null;
  const person = c && !c.is_individual ? c.contacts.find((x) => x.is_primary) ?? c.contacts[0] ?? null : null;
  const rows = [
    { k: "Name | Position", v: [person?.name, person?.title].filter(Boolean).join(" | ") },
    { k: "Company", v: c && !c.is_individual ? c.name : "", bold: true },
    { k: "Street, City, Province", v: [c?.street, c?.city, c?.province].filter(Boolean).join(", ") },
  ];
  const [r, setR] = React.useState({ contact_name: "", contact_title: "", street: "", city: "", province: "", email: "", phone: "" });
  const open = () => {
    setR({ contact_name: person?.name ?? "", contact_title: person?.title ?? "", street: c?.street ?? "", city: c?.city ?? "",
           province: c?.province ?? "", email: person?.email || c?.email || "", phone: person?.phone || c?.phone || "" });
    setEditing(true);
  };
  const set = (k: keyof typeof r) => (e: React.ChangeEvent<HTMLInputElement>) => setR((x) => ({ ...x, [k]: k === "phone" ? formatPhone(e.target.value) : e.target.value }));
  const save = async () => {
    if (!c) return;
    try {
      await saveRecipient(c as unknown as ProposalClient, r);
      await qc.invalidateQueries({ queryKey: invoiceKeys.one(inv.id) });
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Bill To updated"); setEditing(false);
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Bill to</div>
        {editable && c && <Button variant="ghost" size="sm" onClick={open}><Pencil />Edit details</Button>}
      </div>
      <dl className="grid grid-cols-[150px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
        {rows.map((l) => (
          <React.Fragment key={l.k}>
            <dt className="text-ink-faint">{l.k}</dt>
            <dd className={cn(l.v ? (l.bold ? "font-medium" : "") : "italic text-ink-faint/70")}>{l.v || "not set"}</dd>
          </React.Fragment>
        ))}
      </dl>
      {editing && (
        <Dialog open onOpenChange={(v) => !v && setEditing(false)} title={`Bill to — ${c?.name}`} description="Saved on the client, so every invoice and proposal for them uses it."
          footer={<><Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button><Button onClick={save}>Save to client</Button></>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><Input value={r.contact_name} onChange={set("contact_name")} /></Field>
            <Field label="Position"><Input value={r.contact_title} onChange={set("contact_title")} /></Field>
            <Field label="Street" className="sm:col-span-2"><Input value={r.street} onChange={set("street")} /></Field>
            <Field label="City"><Input value={r.city} onChange={set("city")} /></Field>
            <Field label="Province"><Input value={r.province} onChange={set("province")} /></Field>
            <Field label="Email"><Input type="email" value={r.email} onChange={set("email")} /></Field>
            <Field label="Phone"><Input value={r.phone} onChange={set("phone")} /></Field>
          </div>
        </Dialog>
      )}
    </div>
  );
}

/* An invoice brought in from Drive: the PDF is the invoice, so there's nothing to build.
   The dates and the total can be corrected; the rest of its life (paid, reopened) is the
   same as any other invoice. */
function PdfInvoice({ inv, settings }: { inv: Invoice; settings: { income_payment_methods?: unknown } }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const save = useInvoiceUpdate();
  const [issue, setIssue] = React.useState(inv.issue_date ?? "");
  const [due, setDue] = React.useState(inv.due_date ?? "");
  const [total, setTotal] = React.useState(String(inv.total ?? ""));
  const [paying, setPaying] = React.useState(false);
  const amount = Math.round((Number(total.replace(/[^\d.-]/g, "")) || 0) * 100) / 100;
  const dirty = issue !== (inv.issue_date ?? "") || due !== (inv.due_date ?? "") || amount !== Number(inv.total);
  const paid = inv.status === "paid";

  const doSave = () => save.mutate({ id: inv.id, patch: {
    issue_date: issue || localISO(), due_date: due || null, subtotal: amount, total: amount, tax_total: 0,
    progress_lines: [{ ...(inv.progress_lines?.[0] ?? { id: newLineId(), description: `Invoice ${inv.number}`, budget: 0 }), amount }],
  } }, { onSuccess: () => toast.success("Saved"), onError: (e) => toast.error(e.message) });
  const reopen = async () => {
    if (!(await confirm({ title: "Reopen", confirm: "Reopen", message: "Reopen this invoice? It goes back to unpaid, and its income entry is removed." }))) return;
    save.mutate({ id: inv.id, patch: { status: "sent", paid_date: null } }, { onSuccess: () => toast.success("Reopened"), onError: (e) => toast.error(e.message) });
  };
  const remove = async () => {
    if (!(await confirm({ title: "Remove invoice", confirm: "Remove", danger: true,
      message: `Remove ${inv.number} from the portal? The PDF stays in Google Drive${paid ? ", and its income entry is removed" : ""}.` }))) return;
    try {
      await deleteInvoice(inv.id);
      qc.invalidateQueries({ queryKey: ["invoices"] }); qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Invoice removed");
      navigate({ to: "/invoices" });
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="flex h-screen flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-bg px-5 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[12.5px] text-ink-faint">
            <Link to="/invoices" className="inline-flex items-center gap-1 hover:text-ink"><ArrowLeft className="size-3.5" />Invoices</Link>
            {inv.project && <>·<Link to="/projects/$id" params={{ id: inv.project.id }} className="hover:text-ink">{[inv.project.number, inv.project.title].filter(Boolean).join(" · ")}</Link></>}
            {inv.project?.client && <>· <span>{inv.project.client.name}</span></>}
          </div>
          <h1 className="mt-0.5 flex items-center gap-2 text-xl">
            <span className="tabular-nums">{inv.number}</span>
            <span className="tabular-nums text-ink-soft">{money(inv.total)}</span>
            <StatusBadge status={effectiveStatus(inv)} />
          </h1>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {inv.source_drive_url && <Button variant="outline" size="sm" asChild><a href={inv.source_drive_url} target="_blank" rel="noreferrer"><ExternalLink />Open in Drive</a></Button>}
          {inv.status === "sent" && <Button size="sm" onClick={() => setPaying(true)}><CheckCircle2 />Mark paid</Button>}
          {paid && <Button variant="outline" size="sm" onClick={reopen}>Reopen</Button>}
          <Button variant="ghost" size="icon" title="Remove invoice" onClick={remove}><Trash2 /></Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="space-y-4 overflow-y-auto p-5 md:w-[340px] md:shrink-0">
          <p className="text-[13px] text-ink-soft">Filed in Google Drive as <span className="text-ink">{inv.source_name ?? "a PDF"}</span>. The PDF is the invoice; the portal keeps its number, dates and total.</p>
          <Field label="Issued"><Input type="date" value={issue} onChange={(e) => setIssue(e.target.value)} /></Field>
          <Field label="Due"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
          <Field label="Total"><Input inputMode="decimal" value={total} disabled={paid} onChange={(e) => setTotal(e.target.value)} /></Field>
          {paid && <p className="text-[13px] text-ink-soft">Paid {date(inv.paid_date)}{inv.payment_method ? ` by ${inv.payment_method}` : ""}. Reopen it to change the total.</p>}
          <Button onClick={doSave} disabled={!dirty || !amount || save.isPending}><Save />Save</Button>
        </div>
        <div className="min-h-[60vh] min-w-0 flex-1 border-l border-border bg-bg-alt">
          {inv.source_drive_id
            ? <iframe title={inv.source_name ?? "Invoice PDF"} src={`https://drive.google.com/file/d/${inv.source_drive_id}/preview`} className="size-full" />
            : <EmptyState title="No PDF linked">Link it from Invoices → From Drive.</EmptyState>}
        </div>
      </div>
      {paying && <PaidDialog inv={inv} methods={(settings.income_payment_methods as string[] | undefined) ?? []} onClose={() => setPaying(false)} />}
    </div>
  );
}

/* Marking paid also adds the payment to Income & Expenses (a database trigger does it). */
function PaidDialog({ inv, methods, onClose }: { inv: Invoice; methods: string[]; onClose: () => void }) {
  const save = useInvoiceUpdate();
  const options = methods.length ? methods : ["E-transfer", "Cheque", "Cash", "Credit card", "Other"];
  const [day, setDay] = React.useState(localISO());
  const [method, setMethod] = React.useState(options[0]);
  const go = () => save.mutate({ id: inv.id, patch: { status: "paid", paid_date: day, payment_method: method } },
    { onSuccess: () => { toast.success("Marked paid — added to Income"); onClose(); }, onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={`Mark ${inv.number} paid`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={go} disabled={save.isPending}>Mark paid</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Payment date"><Input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></Field>
        <Field label="Method"><Select value={method} onChange={(e) => setMethod(e.target.value)}>{options.map((m) => <option key={m}>{m}</option>)}</Select></Field>
      </div>
    </Dialog>
  );
}
