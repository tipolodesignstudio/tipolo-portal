import * as React from "react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Select, Textarea } from "@/components/ui/fields";
import { STATUS } from "@/lib/format";
import { PROJECT_STATUSES, useUpdateProject, type Project } from "@/lib/data/projects";

/* Edit a project. New ones come only from converting a proposal. */
export function ProjectDialog({ project: p, onClose }: { project: Project; onClose: () => void }) {
  const update = useUpdateProject();
  const [f, setF] = React.useState({
    title: p.title ?? "", scope: p.scope ?? "other", status: p.status ?? "lead", contact_id: p.contact_id ?? "",
    hourly_rate: p.hourly_rate != null ? String(p.hourly_rate) : "", budget: p.budget != null ? String(p.budget) : "",
    start_date: p.start_date ?? "", due_date: p.due_date ?? "", description: p.description ?? "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value }));
  const contacts = p.client?.contacts ?? [];
  const num = (s: string) => (s.trim() === "" ? null : Number(s));

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!f.title.trim()) return toast.error("A project needs a title.");
    try {
      await update.mutateAsync({ id: p.id, patch: {
        title: f.title.trim(), scope: f.scope, status: f.status, contact_id: f.contact_id || null,
        hourly_rate: num(f.hourly_rate), budget: num(f.budget),
        start_date: f.start_date || null, due_date: f.due_date || null, description: f.description.trim() || null,
      } });
      toast.success("Project saved");
      onClose();
    } catch (err) { toast.error((err as Error).message); }
  };

  return (
    <Dialog open wide onOpenChange={(v) => !v && onClose()} title={`Edit ${p.number ? p.number + " · " : ""}${p.title}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => save()} disabled={update.isPending}>{update.isPending ? "Saving…" : "Save"}</Button></>}>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" className="sm:col-span-2"><Input value={f.title} onChange={set("title")} /></Field>
        <Field label="Scope">
          <Select value={f.scope} onChange={set("scope")}><option value="landscape">Landscape</option><option value="multimedia">Multimedia</option><option value="other">Other</option></Select>
        </Field>
        <Field label="Status">
          <Select value={f.status} onChange={set("status")}>{PROJECT_STATUSES.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}</Select>
        </Field>
        <Field label="Project contact" className="sm:col-span-2" hint="Who invoices are addressed to.">
          <Select value={f.contact_id} onChange={set("contact_id")}>
            <option value="">{contacts.length ? "The client's primary contact" : "No contacts on this client"}</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.title ? `${c.name} — ${c.title}` : c.name}</option>)}
          </Select>
        </Field>
        <Field label="Hourly rate" hint="Blank uses the client's or the studio's rate."><Input type="number" step="0.01" min="0" value={f.hourly_rate} onChange={set("hourly_rate")} /></Field>
        <Field label="Budget" hint="Blank uses the accepted proposal's fees."><Input type="number" step="0.01" min="0" value={f.budget} onChange={set("budget")} /></Field>
        <Field label="Start date"><Input type="date" value={f.start_date} onChange={set("start_date")} /></Field>
        <Field label="Due date"><Input type="date" value={f.due_date} onChange={set("due_date")} /></Field>
        <Field label="Description" className="sm:col-span-2"><Textarea rows={3} value={f.description} onChange={set("description")} /></Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
