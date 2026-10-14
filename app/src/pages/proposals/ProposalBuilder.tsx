// Proposal builder — the document on the left, the printed page on the right, updating
// as you type. The five parts of a Tipolo proposal are tabs; inside each you type into
// headings and paragraphs set in the document's own type. A proposal imported from a
// PDF has no document to build — the PDF is the document — so it only shows the client,
// the fee schedule and the revision log beside the PDF.

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useBlocker, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, Check, ExternalLink, FileDown, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox, Field, Select } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/data-table";
import { useConfirm } from "@/components/ui/confirm";
import { cn, legacy } from "@/lib/utils";
import { date } from "@/lib/format";
import { settingsQuery } from "@/lib/data/settings";
import {
  convertProposal, deleteProposal, proposalKeys, proposalQuery, revisionsQuery, sourceName, sourceUrl,
  statusPatch, updateProposal, uploadProposalSource, useUpdateProposal,
  type Proposal, type ProposalStatus,
} from "@/lib/data/proposals";
import {
  KIND_LABEL, PARTS, TOKEN_HELP, lineAmount, normaliseSections, printProposal,
  type Block, type LineItem, type Part,
} from "@/lib/doc";
import {
  BlockFrame, FeeEditor, OptionalEditor, PaymentEditor, ScheduleEditor, TextBlock,
} from "./builder/BlockEditors";
import { RecipientPanel, RevisionsPanel } from "./builder/Panels";
import { Preview } from "./builder/Preview";

type Tab = Part | "revisions" | "client" | "feesheet";
const SPLIT_KEY = "tipolo.builder.split";

export function ProposalBuilder() {
  const { id } = useParams({ from: "/proposals/$id" });
  const { data: p, error, isLoading } = useQuery(proposalQuery(id));
  const { data: settings } = useQuery(settingsQuery);
  if (isLoading) return <div className="m-8 h-[70vh] animate-pulse rounded-lg bg-card" />;
  if (error || !p) {
    return <div className="p-8"><EmptyState title="Proposal not found">
      {(error as Error)?.message} <Link to="/proposals" className="text-accent underline">Back to proposals</Link>
    </EmptyState></div>;
  }
  // keyed on the id so moving to another proposal starts a fresh draft
  return <Builder key={p.id} proposal={p} settings={settings ?? {}} />;
}

function Builder({ proposal: p, settings }: { proposal: Proposal; settings: object }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const save = useUpdateProposal();

  const editable = p.status === "draft";
  const pdfBacked = p.doc_mode === "pdf";

  const [blocks, setBlocks] = React.useState<Block[]>(() => normaliseSections(p.sections ?? []));
  const [items, setItems] = React.useState<LineItem[]>(() => (p.line_items ?? []).map((li) => ({ ...li })));
  const [title, setTitle] = React.useState(p.title ?? "");
  const [scope, setScope] = React.useState(p.project_scope ?? "other");
  const [tab, setTab] = React.useState<Tab>(pdfBacked ? "client" : "cover");
  const [active, setActive] = React.useState(-1);
  const [dirty, setDirty] = React.useState(false);
  const [mobileView, setMobileView] = React.useState<"edit" | "preview">("edit");
  const [converting, setConverting] = React.useState(false);
  const { data: revisions = [] } = useQuery(revisionsQuery(p.id));

  const subtotal = items.reduce((s, li) => s + lineAmount(li), 0);
  const live = React.useMemo(() => ({ ...p, title, project_scope: scope, sections: blocks, line_items: items }),
    [p, title, scope, blocks, items]);
  const touched = () => setDirty(true);

  /* ---- saving ---- */
  const persist = React.useCallback(() => save.mutateAsync({ id: p.id, patch: {
    title: title.trim() || p.title, project_scope: scope, sections: blocks, line_items: items,
    subtotal: Math.round(items.reduce((s, li) => s + lineAmount(li), 0) * 100) / 100,
  } }), [save, p.id, p.title, title, scope, blocks, items]);

  const doSave = React.useCallback(async () => {
    if (!editable || !dirty) return;
    try { await persist(); setDirty(false); toast.success("Saved"); }
    catch (e) { toast.error((e as Error).message); }
  }, [editable, dirty, persist]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); doSave(); }
    };
    const onUnload = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onUnload);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("beforeunload", onUnload); };
  }, [doSave, dirty]);

  useBlocker({
    shouldBlockFn: () => dirty && !window.confirm("You have unsaved changes to this proposal. Leave without saving?"),
    enableBeforeUnload: false,
  });

  /* ---- blocks ---- */
  const inTab = (i: number) => (blocks[i].part ?? "workplan") === tab;
  const patchBlock = (i: number, patch: Partial<Block>) => { setBlocks((b) => b.map((x, k) => (k === i ? { ...x, ...patch } : x))); touched(); };
  const moveBlock = (i: number, dir: -1 | 1) => {
    let j = i + dir;
    while (j >= 0 && j < blocks.length && !inTab(j)) j += dir;
    if (j < 0 || j >= blocks.length) return;
    setBlocks((b) => { const n = [...b]; [n[i], n[j]] = [n[j], n[i]]; return n; });
    setActive(j); touched();
  };
  const deleteBlock = async (i: number) => {
    const b = blocks[i];
    const what = b.heading || (b.kind ? KIND_LABEL[b.kind] : "") || "this block";
    if (!(await confirm({ title: "Delete block", message: `Delete “${what}”?`, confirm: "Delete", danger: true }))) return;
    setBlocks((x) => x.filter((_, k) => k !== i)); setActive(-1); touched();
  };
  const addBlock = () => {
    let at = blocks.length;
    for (let i = blocks.length - 1; i >= 0; i--) if (inTab(i)) { at = i + 1; break; }
    setBlocks((b) => [...b.slice(0, at), { part: tab as Part, level: 2, heading: "", body: "" }, ...b.slice(at)]);
    setActive(at); touched();
  };

  /* ---- status, conversion, deletion ---- */
  const setStatus = async (next: ProposalStatus) => {
    try {
      if (p.status === "draft" && next === "sent" && dirty) { await persist(); setDirty(false); }
      else if (dirty && !(await confirm({ title: "Unsaved edits", message: "Change the status anyway? Your unsaved edits will be lost.", confirm: "Change status", danger: true }))) return;
      await save.mutateAsync({ id: p.id, patch: statusPatch(next) });
      setDirty(false);
      toast.success({ sent: "Marked as sent", accepted: "Accepted", declined: "Declined", draft: "Back to draft" }[next]);
    } catch (e) { toast.error((e as Error).message); }
  };

  const remove = async () => {
    const ok = await confirm({ title: "Delete proposal", danger: true, confirm: "Delete",
      message: p.converted_project_id ? `Delete proposal ${p.number}? Its project stays, but the link is lost.`
        : `Delete proposal ${p.number ?? "draft"}? This can't be undone.` });
    if (!ok) return;
    try {
      setDirty(false);
      await deleteProposal(p.id);
      qc.invalidateQueries({ queryKey: proposalKeys.all });
      toast.success("Deleted");
      navigate({ to: "/proposals" });
    } catch (e) { toast.error((e as Error).message); }
  };

  const openSource = async () => {
    const w = window.open("", "_blank");             // open first, or the popup blocker steps in
    try { const url = await sourceUrl(p.source_pdf_path!); if (w) w.location.href = url; }
    catch (e) { w?.close(); toast.error((e as Error).message); }
  };

  const attach = async (f: File) => {
    const path = await uploadProposalSource(f);
    const next = await updateProposal(p.id, { source_pdf_path: path });
    qc.setQueryData(proposalKeys.one(p.id), next);
  };

  /* ---- the split ---- */
  const split = React.useRef<HTMLDivElement>(null);
  const [editW, setEditW] = React.useState<string>(() => { try { return localStorage.getItem(SPLIT_KEY) || "46%"; } catch { return "46%"; } });
  const drag = (e: React.PointerEvent) => {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const box = split.current!.getBoundingClientRect();
      setEditW(`${Math.min(Math.max(ev.clientX - box.left, 360), box.width - 380)}px`);
    };
    const up = () => {
      el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up);
      try { localStorage.setItem(SPLIT_KEY, split.current!.style.getPropertyValue("--edit-w")); } catch { /* */ }
    };
    el.addEventListener("pointermove", move); el.addEventListener("pointerup", up);
  };

  /* ---- what's on the left ---- */
  const tabs: { id: Tab; label: string; n?: number }[] = pdfBacked
    ? [{ id: "client", label: "Client" }, { id: "feesheet", label: "Fee schedule", n: items.length }, { id: "revisions", label: "Revisions", n: revisions.length }]
    : [...PARTS.map((pt) => ({ id: pt.id as Tab, label: pt.label, n: blocks.filter((b) => (b.part ?? "workplan") === pt.id).length })),
       { id: "revisions", label: "Revisions", n: revisions.length }];

  const blockIdx = blocks.map((_, i) => i).filter(inTab);

  const editorBody = tab === "revisions" ? <RevisionsPanel proposalId={p.id} />
    : tab === "client" ? <RecipientPanel proposal={p} editable={editable} heading="Client" />
    : tab === "feesheet" ? (
      <div className="rounded-md border border-border bg-card p-4">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ink-faint">Fee schedule</div>
        <FeeEditor items={items} editable={editable} onChange={(x) => { setItems(x); touched(); }} />
        <p className="mt-3 text-[12px] text-ink-faint">Read from the PDF. These lines set the project's budget when the proposal is converted, and become the Budget column of its invoices — worth checking against the PDF beside them.</p>
      </div>
    ) : (
      <>
        {tab === "cover" && <RecipientPanel proposal={p} editable={editable} heading="Addressed to" />}
        <div className="space-y-2">
          {blockIdx.length === 0 && <p className="px-4 py-6 text-sm text-ink-faint">Nothing in this part yet.</p>}
          {blockIdx.map((i) => {
            const b = blocks[i];
            const onChange = (patch: Partial<Block>) => patchBlock(i, patch);
            return (
              <BlockFrame key={i} block={b} editable={editable} active={active === i} onFocus={() => setActive(i)}
                onChange={onChange} onMove={(d) => moveBlock(i, d)} onDelete={() => deleteBlock(i)}>
                {b.kind === "payment" ? <PaymentEditor block={b} editable={editable} subtotal={subtotal} onChange={onChange} />
                  : b.kind === "schedule" ? <ScheduleEditor block={b} editable={editable} onChange={onChange} />
                  : b.kind === "optional-fees" ? <OptionalEditor block={b} editable={editable} onChange={onChange} />
                  : b.kind === "fees" ? <FeeEditor items={items} editable={editable} onChange={(x) => { setItems(x); touched(); }} />
                  : b.kind === "signature" ? <p className="text-[13px] text-ink-faint">Signs off the agreement. Printed from your business name — nothing to edit.</p>
                  : <TextBlock block={b} editable={editable} active={active === i} onChange={onChange} />}
              </BlockFrame>
            );
          })}
        </div>
        {editable && (
          <div className="mt-4 flex flex-wrap items-center gap-3 px-1">
            <Button variant="subtle" size="sm" onClick={addBlock}><Plus />Add a block</Button>
            <span className="text-[12px] text-ink-faint">Tokens: {TOKEN_HELP.slice(0, 4).map((t) => <code key={t} className="mr-1 rounded bg-bg-alt px-1">{t}</code>)}</span>
          </div>
        )}
      </>
    );

  const s = p.status as ProposalStatus;

  return (
    <div className="flex h-screen flex-col">
      {/* bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-bg px-5 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[12.5px] text-ink-faint">
            <Link to="/proposals" className="inline-flex items-center gap-1 hover:text-ink"><ArrowLeft className="size-3.5" />Proposals</Link>
            {p.client && <>·<Link to="/clients/$id" params={{ id: p.client.id }} className="hover:text-ink">{p.client.name}</Link></>}
            {p.source_pdf_path && <>·<button onClick={openSource} className="inline-flex items-center gap-1 hover:text-ink">{sourceName(p.source_pdf_path)}<ExternalLink className="size-3" /></button></>}
          </div>
          <h1 className="mt-0.5 flex items-center gap-2 truncate text-xl">
            {p.number && <span className="tabular-nums text-ink-faint">{p.number}</span>}
            <span className="truncate">{title || "Untitled proposal"}</span>
            <StatusBadge status={p.status} />
          </h1>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {dirty && <span className="text-[12px] text-warn">Unsaved</span>}
          {editable && <Button variant="outline" size="sm" onClick={doSave} disabled={!dirty || save.isPending}><Save />Save</Button>}
          {pdfBacked
            ? <Button variant="outline" size="sm" onClick={openSource} disabled={!p.source_pdf_path}><ExternalLink />Open PDF</Button>
            : <Button variant="outline" size="sm" onClick={() => printProposal(live, settings)}><FileDown />Save as PDF</Button>}
          {s === "draft" && <Button size="sm" onClick={() => setStatus("sent")}>Mark as sent</Button>}
          {s === "sent" && <>
            <Button size="sm" onClick={() => setStatus("accepted")}><Check />Accepted</Button>
            <Button variant="outline" size="sm" onClick={() => setStatus("declined")}>Declined</Button>
            <Button variant="ghost" size="sm" onClick={() => setStatus("draft")}>Back to draft</Button>
          </>}
          {s === "accepted" && !p.converted_project_id && <Button size="sm" onClick={() => setConverting(true)}>Convert to project</Button>}
          {s === "declined" && <Button variant="outline" size="sm" onClick={() => setStatus("draft")}>Reopen</Button>}
          <Button variant="ghost" size="icon" title="Delete proposal" onClick={remove}><Trash2 /></Button>
        </div>
      </div>

      {p.converted_project && (
        <div className="border-b border-border bg-ok-bg px-5 py-2 text-[13px] text-ok">
          Converted to project <a className="font-medium underline" href={legacy(`/projects/${p.converted_project.id}`)}>{p.converted_project.number}</a>.
        </div>
      )}

      {/* phones: one pane at a time */}
      <div className="flex border-b border-border md:hidden">
        {(["edit", "preview"] as const).map((v) => (
          <button key={v} onClick={() => setMobileView(v)}
            className={cn("flex-1 py-2 text-sm", mobileView === v ? "border-b-2 border-accent font-medium" : "text-ink-soft")}>
            {v === "edit" ? "Edit" : "Preview"}
          </button>
        ))}
      </div>

      <div ref={split} className="flex min-h-0 flex-1" style={{ ["--edit-w" as string]: editW } as React.CSSProperties}>
        <div className={cn("min-h-0 overflow-y-auto md:w-[var(--edit-w)] md:shrink-0", mobileView === "edit" ? "w-full" : "hidden md:block")}>
          <div className="space-y-4 p-5">
            {!pdfBacked && (
              <div className="grid grid-cols-[1fr_150px] gap-3 sm:grid-cols-[1fr_150px_150px]">
                <Field label="Project title">
                  <Input value={title} readOnly={!editable} onChange={(e) => { setTitle(e.target.value); touched(); }} />
                </Field>
                <Field label="Scope">
                  <Select value={scope} disabled={!editable} onChange={(e) => { setScope(e.target.value); touched(); }}>
                    <option value="landscape">Landscape</option><option value="multimedia">Multimedia</option><option value="other">Other</option>
                  </Select>
                </Field>
                <Field label="Valid until" className="hidden sm:block">
                  <div className="flex h-9 items-center text-sm text-ink-soft">{p.valid_until ? date(p.valid_until) : "1 year after sent"}</div>
                </Field>
              </div>
            )}

            <div className="flex flex-wrap gap-1 border-b border-border">
              {tabs.map((t) => (
                <button key={t.id} onClick={() => { setTab(t.id); setActive(-1); }}
                  className={cn("-mb-px border-b-2 px-3 py-2 text-[13px] transition-colors",
                    tab === t.id ? "border-accent font-medium text-ink" : "border-transparent text-ink-soft hover:text-ink")}>
                  {t.label}{t.n ? <span className="ml-1.5 text-[11px] text-ink-faint">{t.n}</span> : null}
                </button>
              ))}
            </div>

            {editorBody}
          </div>
        </div>

        <div role="separator" aria-orientation="vertical" aria-label="Resize the editor" onPointerDown={drag}
             className="hidden w-1.5 shrink-0 cursor-col-resize bg-border/60 transition-colors hover:bg-accent/40 md:block" />

        <div className={cn("min-h-0 min-w-0 flex-1", mobileView === "preview" ? "block" : "hidden md:block")}>
          <Preview doc={live} settings={settings} sourcePath={p.source_pdf_path ?? null} pdfOnly={pdfBacked} onAttach={attach} />
        </div>
      </div>

      {converting && <ConvertDialog proposal={p} items={items} onClose={() => setConverting(false)} />}
    </div>
  );
}

function ConvertDialog({ proposal: p, items, onClose }: { proposal: Proposal; items: LineItem[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [start, setStart] = React.useState("");
  const [due, setDue] = React.useState("");
  const [seed, setSeed] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  const go = async () => {
    setBusy(true);
    try {
      const project = await convertProposal(p, {
        start_date: start || null, due_date: due || null,
        deliverables: seed ? items.filter((li) => li.description).map((li) => ({ label: li.description, done: false })) : [],
      });
      qc.invalidateQueries({ queryKey: proposalKeys.all });
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success(`Project ${project.number} created`);
      window.location.assign(legacy(`/projects/${project.id}`));
    } catch (e) { toast.error((e as Error).message); setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={`Convert ${p.number} to a project`}
      description={`The project keeps this proposal's number (${p.number}) and starts as a Lead.`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={go} disabled={busy}>{busy ? "Creating…" : "Create project"}</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date"><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Due date"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        </div>
        <Checkbox label="Seed deliverables from the fee schedule" checked={seed} onChange={(e) => setSeed(e.target.checked)} />
      </div>
    </Dialog>
  );
}
