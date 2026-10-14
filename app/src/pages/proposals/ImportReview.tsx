import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, LayoutTemplate } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Field, Select } from "@/components/ui/fields";
import { supabase } from "@/lib/supabase";
import { money } from "@/lib/format";
import { lineAmount, type LineItem } from "@/lib/doc";
import { matchClient, type ParsedProposal } from "@/lib/pdf-import";
import { createProposal, proposalKeys, reserveJobNumber, saveTemplate, uploadProposalSource } from "@/lib/data/proposals";
import { FeeEditor } from "./builder/BlockEditors";

const NEW = "__new__";

export const importClientsQuery = {
  queryKey: ["clients", "import-picker"],
  queryFn: async () => {
    const { data, error } = await supabase.from("clients").select("id, name").eq("is_internal", false).order("name");
    if (error) throw new Error(error.message);
    return data;
  },
};

function Confidence({ v }: { v?: number }) {
  const c = v ?? 0;
  if (c >= 0.75) return <Badge tone="green" title="Read confidently">read</Badge>;
  if (c >= 0.4) return <Badge tone="amber" title="Best guess — please check">guess</Badge>;
  return <Badge tone="red" title="Not found in the document">not found</Badge>;
}

/* What the reader found in a finished proposal PDF, laid out to check and correct.
   Nothing is written until Create — then the PDF is attached as the proposal's document,
   and only the client and fee schedule come into the portal. `number` keeps a Drive
   folder's job number instead of drawing a new one. */
export function ImportReview({ file, parsed, pageCount, number, onCreated, footerExtra }: {
  file: File;
  parsed: ParsedProposal;
  pageCount?: number;
  number?: string;
  onCreated: (p: { id: string; number: string | null }) => void;
  footerExtra?: React.ReactNode;
}) {
  const qc = useQueryClient();
  const { data: clients = [] } = useQuery(importClientsQuery);
  const [title, setTitle] = React.useState(parsed.title);
  const [scope, setScope] = React.useState(parsed.project_scope || "other");
  const [clientId, setClientId] = React.useState(parsed.client_id || NEW);
  const [newName, setNewName] = React.useState(parsed.client_name);
  const [items, setItems] = React.useState<LineItem[]>(() => parsed.line_items.map((li) => ({ ...li })));
  const [busy, setBusy] = React.useState<"" | "create" | "template">("");

  const total = items.reduce((s, li) => s + lineAmount(li), 0);
  const near = !parsed.client_id && parsed.client_name ? matchClient(parsed.client_name, clients).near : null;
  const clientName = clientId === NEW ? newName.trim() : clients.find((c) => c.id === clientId)?.name ?? "";

  const create = async () => {
    if (!title.trim()) return toast.error("Give the proposal a project title.");
    if (clientId === NEW && !newName.trim()) return toast.error("Pick a client, or name the new one.");
    setBusy("create");
    try {
      let cid = clientId;
      if (cid === NEW) {
        const { data, error } = await supabase.from("clients").insert({ name: newName.trim(), status: "active" }).select("id").single();
        if (error) throw new Error(error.message);
        cid = data.id;
        qc.invalidateQueries({ queryKey: ["clients"] });
      }
      // The PDF is the document, so it isn't optional: without it there'd be nothing to read.
      const path = await uploadProposalSource(file);
      const p = await createProposal({
        ...(number ? { number } : {}),
        client_id: cid, title: title.trim(), project_scope: scope, doc_mode: "pdf",
        sections: [], line_items: items.filter((li) => (li.description || "").trim()),
        subtotal: Math.round(total * 100) / 100, status: "draft", source_pdf_path: path,
      });
      if (number) { try { await reserveJobNumber(number); } catch { /* not worth failing over */ } }
      qc.invalidateQueries({ queryKey: proposalKeys.all });
      toast.success(`Proposal ${p.number ?? ""} created`);
      onCreated(p);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy("");
    }
  };

  // The wording is read too, but only so it can become a reusable template.
  const asTemplate = async () => {
    setBusy("template");
    try {
      const swap = (t?: string) => (t && clientName.length >= 3
        ? t.replace(new RegExp(clientName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "{{client.name}}") : t);
      const t = await saveTemplate(null, {
        name: title.trim() || file.name.replace(/\.pdf$/i, ""),
        sections: parsed.sections.filter((s) => (s.heading || "").trim() || (s.body || "").trim())
          .map((s) => ({ ...s, heading: swap(s.heading), body: swap(s.body) })),
        default_line_items: items.filter((li) => (li.description || "").trim()),
      });
      qc.invalidateQueries({ queryKey: proposalKeys.templates });
      toast.success(`Template “${t.name}” saved`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(""); }
  };

  return (
    <div className="space-y-5">
      <div className="text-sm text-ink-soft">
        From <strong className="text-ink">{file.name}</strong>{pageCount ? ` · ${pageCount} page${pageCount === 1 ? "" : "s"}` : ""}
        {number && <> · keeps job number <strong className="text-ink">{number}</strong></>}
      </div>

      {parsed.warnings.length > 0 && (
        <div className="flex gap-2 rounded-md bg-warn-bg px-4 py-3 text-sm text-warn">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <ul className="space-y-0.5">{parsed.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Project title *">
          <div className="flex items-center gap-2"><Input value={title} onChange={(e) => setTitle(e.target.value)} /><Confidence v={parsed.conf.title} /></div>
        </Field>
        <Field label="Scope">
          <div className="flex items-center gap-2">
            <Select value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="landscape">Landscape</option><option value="multimedia">Multimedia</option><option value="other">Other</option>
            </Select><Confidence v={parsed.conf.project_scope} />
          </div>
        </Field>
        <Field label="Client *" hint={parsed.client_name
          ? `The document says “${parsed.client_name}”${parsed.client_id ? " — matched." : near ? ` — closest existing client is ${near.name}.` : "."}`
          : "No client name found in the document — pick one."}>
          <div className="flex items-center gap-2">
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value={NEW}>＋ New client{parsed.client_name ? `: ${parsed.client_name}` : ""}</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select><Confidence v={parsed.conf.client_name} />
          </div>
        </Field>
        {clientId === NEW && (
          <Field label="New client name *" hint="A client record is created with this name.">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
          </Field>
        )}
      </div>

      <div className="rounded-md border border-border bg-card p-4">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-ink-faint">
          Fee schedule <Confidence v={parsed.conf.line_items} />
        </div>
        <FeeEditor items={items} editable onChange={setItems} />
        {parsed.subtotal > 0 && Math.abs(parsed.subtotal - total) > 0.02 && (
          <p className="mt-2 text-[12.5px] text-warn">The document's own total is {money(parsed.subtotal)} — check the lines above.</p>
        )}
      </div>

      <p className="rounded-md bg-bg-alt px-4 py-3 text-[13px] text-ink-soft">
        <strong className="text-ink">The PDF is the proposal.</strong> It's attached as the document and shown as it is;
        only the client and the fees above come into the portal.
      </p>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {footerExtra}
        <Button variant="ghost" onClick={asTemplate} disabled={!!busy || parsed.sections.length === 0}>
          <LayoutTemplate />{busy === "template" ? "Saving…" : "Save the wording as a template"}
        </Button>
        <Button onClick={create} disabled={!!busy}>{busy === "create" ? "Creating…" : "Create proposal"}</Button>
      </div>
    </div>
  );
}
