import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useBlocker, useNavigate, useParams } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, EmptyState } from "@/components/ui/data-table";
import { useConfirm } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";
import { money } from "@/lib/format";
import { settingsQuery } from "@/lib/data/settings";
import {
  deleteTemplate, proposalKeys, saveTemplate, templateQuery, templatesQuery, type Template,
} from "@/lib/data/proposals";
import {
  PARTS, TOKEN_HELP, defaultLineItems, defaultSections, lineAmount, normaliseSections,
  type Block, type LineItem, type Part,
} from "@/lib/doc";
import { BlockList } from "./builder/BlockList";
import { Preview } from "./builder/Preview";

/* ---------------- list ---------------- */

export function TemplatesList() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: rows = [], isLoading, error } = useQuery(templatesQuery);

  const remove = async (t: Template) => {
    if (!(await confirm({ title: "Delete template", danger: true, confirm: "Delete",
      message: `Delete “${t.name}”? Proposals already written from it are unaffected.` }))) return;
    try { await deleteTemplate(t.id); qc.invalidateQueries({ queryKey: proposalKeys.templates }); toast.success("Deleted"); }
    catch (e) { toast.error((e as Error).message); }
  };

  const columns: ColumnDef<Template, unknown>[] = [
    { id: "name", header: "Template", accessorFn: (t) => t.name, cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
    { id: "blocks", header: "Blocks", accessorFn: (t) => (t.sections ?? []).length, meta: { align: "right", className: "w-24" } },
    {
      id: "fee", header: "Default fees", accessorFn: (t) => (t.default_line_items ?? []).reduce((s, li) => s + lineAmount(li), 0),
      meta: { align: "right", className: "w-36" }, cell: ({ getValue }) => money(getValue() as number),
    },
    {
      id: "del", header: "", enableSorting: false, meta: { className: "w-12" },
      cell: ({ row: { original: t } }) => (
        <button type="button" title="Delete" onClick={() => remove(t)} className="grid size-7 place-items-center rounded text-ink-faint hover:bg-bg-alt hover:text-bad">
          <Trash2 className="size-3.5" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <Link to="/proposals" className="inline-flex items-center gap-1 text-[13px] text-ink-faint hover:text-ink"><ArrowLeft className="size-3.5" />Proposals</Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl">Proposal templates</h1>
            <p className="mt-1 text-sm text-ink-soft">Your standard wording and fees. Tokens like <code className="rounded bg-bg-alt px-1">{"{{client.name}}"}</code> fill in when a proposal is created from one.</p>
          </div>
          <Button onClick={() => navigate({ to: "/proposals/templates/$id", params: { id: "new" } })}><Plus />New template</Button>
        </div>
      </div>
      {error ? <EmptyState title="Couldn't load templates">{(error as Error).message}</EmptyState>
        : isLoading ? <div className="h-40 animate-pulse rounded-lg border border-border bg-card" />
        : <DataTable data={rows} columns={columns} initialSort={[{ id: "name", desc: false }]}
            onRowClick={(t) => navigate({ to: "/proposals/templates/$id", params: { id: t.id } })}
            empty={<EmptyState title="No templates yet">New proposals start from the Tipolo standard proposal until you save one of your own.</EmptyState>} />}
    </div>
  );
}

/* ---------------- editor ---------------- */

export function TemplateEditor() {
  const { id } = useParams({ from: "/proposals/templates/$id" });
  const isNew = id === "new";
  const { data, isLoading, error } = useQuery({ ...templateQuery(id), enabled: !isNew });
  if (!isNew && isLoading) return <div className="m-8 h-[70vh] animate-pulse rounded-lg bg-card" />;
  if (!isNew && (error || !data)) {
    return <div className="p-8"><EmptyState title="Template not found">{(error as Error)?.message}</EmptyState></div>;
  }
  return <Editor key={id} template={isNew ? null : data!} />;
}

function Editor({ template }: { template: Template | null }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: settings } = useQuery(settingsQuery);
  // a new template starts as the complete house proposal, to be edited down
  const [name, setName] = React.useState(template?.name ?? "");
  const [blocks, setBlocks] = React.useState<Block[]>(() => template ? normaliseSections(template.sections ?? []) : defaultSections());
  const [items, setItems] = React.useState<LineItem[]>(() => (template ? template.default_line_items ?? [] : defaultLineItems()).map((li) => ({ ...li })));
  const [tab, setTab] = React.useState<Part>("cover");
  const [dirty, setDirty] = React.useState(!template);
  const [busy, setBusy] = React.useState(false);

  useBlocker({ shouldBlockFn: () => dirty && !window.confirm("Leave without saving this template?"), enableBeforeUnload: () => dirty });

  const save = async () => {
    if (!name.trim()) return toast.error("Give the template a name.");
    setBusy(true);
    try {
      const saved = await saveTemplate(template?.id ?? null, { name: name.trim(), sections: blocks, default_line_items: items });
      qc.invalidateQueries({ queryKey: proposalKeys.templates });
      setDirty(false);
      toast.success("Template saved");
      if (!template) setTimeout(() => navigate({ to: "/proposals/templates/$id", params: { id: saved.id }, replace: true }));
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // previewed with its tokens showing, the way it reads before a client fills them in
  const doc = React.useMemo(() => ({ number: "YYNNN", title: "{{project.title}}", project_scope: "landscape",
    sections: blocks, line_items: items, client: null }), [blocks, items]);

  return (
    <div className="flex h-screen flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-bg px-5 py-3">
        <div className="min-w-0 flex-1">
          <Link to="/proposals/templates" className="inline-flex items-center gap-1 text-[12.5px] text-ink-faint hover:text-ink"><ArrowLeft className="size-3.5" />Templates</Link>
          <Input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} placeholder="Template name, e.g. Residential landscape"
                 className="mt-1 h-9 max-w-md border-transparent bg-transparent px-0 font-heading text-xl hover:border-border focus:px-2" />
        </div>
        {dirty && <span className="text-[12px] text-warn">Unsaved</span>}
        <Button size="sm" onClick={save} disabled={busy}><Save />{busy ? "Saving…" : "Save template"}</Button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 w-full overflow-y-auto md:w-[46%] md:shrink-0">
          <div className="space-y-4 p-5">
            <p className="text-[12.5px] text-ink-faint">Tokens fill in when a proposal is created: {TOKEN_HELP.map((t) => <code key={t} className="mr-1 rounded bg-bg-alt px-1">{t}</code>)}</p>
            <div className="flex flex-wrap gap-1 border-b border-border">
              {PARTS.map((pt) => {
                const n = blocks.filter((b) => (b.part ?? "workplan") === pt.id).length;
                return (
                  <button key={pt.id} onClick={() => setTab(pt.id)}
                    className={cn("-mb-px border-b-2 px-3 py-2 text-[13px]", tab === pt.id ? "border-accent font-medium" : "border-transparent text-ink-soft hover:text-ink")}>
                    {pt.label}{n ? <span className="ml-1.5 text-[11px] text-ink-faint">{n}</span> : null}
                  </button>
                );
              })}
            </div>
            <BlockList key={tab} part={tab} blocks={blocks} setBlocks={setBlocks} items={items} setItems={setItems}
              editable onDirty={() => setDirty(true)} />
          </div>
        </div>
        <div className="hidden min-h-0 min-w-0 flex-1 border-l border-border md:block">
          <Preview doc={doc} settings={settings ?? {}} docOnly />
        </div>
      </div>
    </div>
  );
}
