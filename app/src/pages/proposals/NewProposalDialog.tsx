import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Select } from "@/components/ui/fields";
import { supabase } from "@/lib/supabase";
import { settingsQuery } from "@/lib/data/settings";
import { createProposal, proposalKeys, templatesQuery } from "@/lib/data/proposals";
import {
  buildTokenMap, defaultLineItems, defaultSections, lineAmount, resolveSections, type Block, type LineItem,
} from "@/lib/doc";

const STANDARD = "";
const BLANK = "__blank__";

export function NewProposalDialog({ open, onOpenChange, clientId }: {
  open: boolean; onOpenChange: (v: boolean) => void; clientId?: string;
}) {
  return open ? <NewProposalForm onOpenChange={onOpenChange} clientId={clientId} /> : null;
}

function NewProposalForm({ onOpenChange, clientId }: { onOpenChange: (v: boolean) => void; clientId?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients", "picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients")
        .select("id, name, is_individual, email, phone, street, city, province, postal_code, contacts:client_contacts(name, title, email, phone, is_primary)")
        .eq("is_internal", false).eq("status", "active").order("name");
      if (error) throw new Error(error.message);
      return data;
    },
  });
  const { data: templates = [] } = useQuery(templatesQuery);
  const { data: settings } = useQuery(settingsQuery);

  const [title, setTitle] = React.useState("");
  const [client, setClient] = React.useState(clientId ?? "");
  const [scope, setScope] = React.useState("landscape");
  const [template, setTemplate] = React.useState(STANDARD);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const chosenClient = client || clients[0]?.id || "";

  async function create(e?: React.FormEvent) {
    e?.preventDefault();
    if (!title.trim()) return setError("Give the project a title.");
    if (!chosenClient) return setError("Pick a client.");
    setBusy(true); setError("");
    try {
      // No template = the house proposal, complete with the standard work plan, fees and
      // services agreement, specifics left in [brackets].
      let sections: Block[] = [];
      let lineItems: LineItem[] = [];
      if (template === STANDARD) {
        sections = defaultSections();
        lineItems = defaultLineItems();
      } else if (template !== BLANK) {
        const tpl = templates.find((t) => t.id === template)!;
        const c = clients.find((x) => x.id === chosenClient);
        const map = buildTokenMap({ client: c, settings,
          proposal: { title, project_scope: scope, line_items: tpl.default_line_items ?? [] } });
        sections = resolveSections(tpl.sections ?? [], map);
        lineItems = (tpl.default_line_items ?? []).map((li) => ({ ...li }));
      }
      const subtotal = lineItems.reduce((s, li) => s + lineAmount(li), 0);
      const p = await createProposal({
        template_id: template && template !== BLANK ? template : null,
        client_id: chosenClient, title: title.trim(), project_scope: scope,
        sections, line_items: lineItems, subtotal: Math.round(subtotal * 100) / 100, status: "draft",
      });
      qc.invalidateQueries({ queryKey: proposalKeys.all });
      onOpenChange(false);
      navigate({ to: "/proposals/$id", params: { id: p.id } });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange} title="New proposal"
      description="It reserves the next job number, and is valid for a year from the day you mark it sent."
      footer={<>
        {error && <div className="mr-auto text-sm text-bad">{error}</div>}
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button onClick={() => create()} disabled={busy || isLoading}>{busy ? "Creating…" : "Create draft"}</Button>
      </>}>
      {!isLoading && !clients.length ? (
        <p className="text-sm text-ink-soft">A proposal is addressed to a client. Add a client first, then write the proposal.</p>
      ) : (
        <form onSubmit={create} className="space-y-4">
          <Field label="Project title *">
            <Input autoFocus placeholder="Front garden redesign" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Client">
            <Select value={chosenClient} onChange={(e) => setClient(e.target.value)}>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Scope">
              <Select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="landscape">Landscape</option>
                <option value="multimedia">Multimedia</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Start from">
              <Select value={template} onChange={(e) => setTemplate(e.target.value)}>
                <option value={STANDARD}>Tipolo standard proposal</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                <option value={BLANK}>Blank</option>
              </Select>
            </Field>
          </div>
          <button type="submit" hidden />
        </form>
      )}
    </Dialog>
  );
}
