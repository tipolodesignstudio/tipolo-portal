import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/lib/format";
import {
  proposalKeys, revisionsQuery, saveRecipient, useRevisionMutations, type Proposal, type ProposalClient,
} from "@/lib/data/proposals";

const primaryOf = (c: ProposalClient | null) => c?.contacts.find((x) => x.is_primary) ?? c?.contacts[0] ?? null;

/* The letter is addressed from the client record, so this shows what will print and
   lets the record be corrected without leaving the proposal. */
export function RecipientPanel({ proposal, editable, heading }: { proposal: Proposal; editable: boolean; heading: string }) {
  const [editing, setEditing] = React.useState(false);
  const c = proposal.client;
  const person = c?.is_individual ? null : primaryOf(c);
  const lines = [
    { k: "Name", v: person?.name || c?.name || "", bold: true },
    { k: "Position, Company", v: [person?.title, c?.is_individual ? "" : c?.name].filter(Boolean).join(", ") },
    { k: "Street", v: c?.street ?? "" },
    { k: "City, Province", v: [c?.city, c?.province].filter(Boolean).join(", ") },
    { k: "Email | Phone", v: [person?.email || c?.email, person?.phone || c?.phone].filter(Boolean).join(" | ") },
  ];
  const missing = lines.filter((l) => !l.v).length;

  return (
    <div className="mb-4 rounded-md border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">{heading}</div>
        {editable && c && <Button variant="ghost" size="sm" onClick={() => setEditing(true)}><Pencil />Edit details</Button>}
      </div>
      <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
        {lines.map((l) => (
          <React.Fragment key={l.k}>
            <dt className="text-ink-faint">{l.k}</dt>
            <dd className={cn(l.v ? (l.bold ? "font-medium" : "") : "italic text-ink-faint/70")}>{l.v || "not set"}</dd>
          </React.Fragment>
        ))}
      </dl>
      {missing > 0 && (
        <p className="mt-2 text-[12px] text-ink-faint">
          {missing} line{missing === 1 ? "" : "s"} missing — left out of the letter until filled in.
        </p>
      )}
      {editing && c && <RecipientDialog proposal={proposal} client={c} onClose={() => setEditing(false)} />}
    </div>
  );
}

function RecipientDialog({ proposal, client, onClose }: { proposal: Proposal; client: ProposalClient; onClose: () => void }) {
  const qc = useQueryClient();
  const person = primaryOf(client);
  const [r, setR] = React.useState({
    contact_name: person?.name ?? "", contact_title: person?.title ?? "",
    street: client.street ?? "", city: client.city ?? "", province: client.province ?? "",
    email: person?.email || client.email || "", phone: person?.phone || client.phone || "",
  });
  const [busy, setBusy] = React.useState(false);
  const set = (k: keyof typeof r) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setR((p) => ({ ...p, [k]: k === "phone" ? formatPhone(e.target.value) : e.target.value }));

  const save = async () => {
    setBusy(true);
    try {
      await saveRecipient(client, r);
      await qc.invalidateQueries({ queryKey: proposalKeys.one(proposal.id) });
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Recipient updated");
      onClose();
    } catch (e) { toast.error((e as Error).message); setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={`Recipient — ${client.name}`}
      description={`Saved on the client, so every proposal for ${client.name} uses it.`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save to client"}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name"><Input value={r.contact_name} onChange={set("contact_name")} /></Field>
        <Field label="Position"><Input value={r.contact_title} onChange={set("contact_title")} /></Field>
        <Field label="Street" className="sm:col-span-2"><Input value={r.street} onChange={set("street")} /></Field>
        <Field label="City"><Input value={r.city} onChange={set("city")} /></Field>
        <Field label="Province"><Input value={r.province} onChange={set("province")} placeholder="BC" /></Field>
        <Field label="Email"><Input type="email" value={r.email} onChange={set("email")} /></Field>
        <Field label="Phone"><Input value={r.phone} onChange={set("phone")} /></Field>
      </div>
    </Dialog>
  );
}

/* A hand-kept log beside the proposal, not printed on it. Rows save as you leave the
   field, independent of the document's own Save — and it stays editable after the
   proposal is sent, which is exactly when revisions start happening. */
export function RevisionsPanel({ proposalId }: { proposalId: string }) {
  const { data: revisions = [], isLoading } = useQuery(revisionsQuery(proposalId));
  const m = useRevisionMutations(proposalId);
  const confirm = useConfirm();

  const commit = (id: string, field: "revised_on" | "note", value: string, was: string | null) => {
    if ((was ?? "") === value) return;
    m.update.mutate({ id, patch: { [field]: field === "revised_on" ? value || null : value } },
      { onError: (e) => toast.error(e.message) });
  };

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ink-faint">Revision history</div>
      {isLoading ? <p className="text-sm text-ink-faint">Loading…</p> : revisions.length === 0 ? (
        <p className="text-sm text-ink-faint">Nothing logged yet.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {revisions.map((r) => (
            <li key={r.id} className="flex items-center gap-2 py-1.5">
              <input type="date" defaultValue={r.revised_on ?? ""} className="h-8 w-36 rounded border border-transparent px-2 text-[13px] hover:border-border focus:border-accent/50 focus:outline-none"
                     onBlur={(e) => commit(r.id, "revised_on", e.target.value, r.revised_on)} />
              <input defaultValue={r.note ?? ""} placeholder="Fee schedule revised after the client call"
                     className="h-8 flex-1 rounded border border-transparent px-2 text-[13px] hover:border-border focus:border-accent/50 focus:outline-none"
                     onBlur={(e) => commit(r.id, "note", e.target.value, r.note)}
                     onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
              <button type="button" title="Delete" className="grid size-7 place-items-center rounded text-ink-faint hover:bg-bg-alt hover:text-bad"
                onClick={async () => {
                  if (await confirm({ title: "Delete revision", message: "Delete this revision entry?", confirm: "Delete", danger: true }))
                    m.remove.mutate(r.id, { onError: (e) => toast.error(e.message) });
                }}><Trash2 className="size-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="ghost" size="sm" className="mt-2" disabled={m.add.isPending}
              onClick={() => m.add.mutate(undefined, { onError: (e) => toast.error(e.message) })}>
        <Plus />Add revision
      </Button>
      <p className="mt-1 text-[12px] text-ink-faint">Kept beside the proposal, not printed on it. Entries save as you leave the field.</p>
    </div>
  );
}

