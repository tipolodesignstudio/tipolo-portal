import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox, Field, Select, Textarea } from "@/components/ui/fields";
import { formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  categoriesQuery, useSaveClient, type Client, type ClientDraft, type ContactDraft,
} from "@/lib/data/clients";

const blankContact = (primary = false): ContactDraft =>
  ({ name: "", title: "", email: "", phone: "", is_primary: primary });

function toDraft(c?: Client): ClientDraft {
  return {
    is_individual: c?.is_individual ?? false,
    business_name: c && !c.is_individual ? c.name : "",
    category_id: c?.category_id ?? "",
    default_rate: c?.default_rate != null ? String(c.default_rate) : "",
    street: c?.street ?? "", city: c?.city ?? "", province: c?.province ?? "", postal_code: c?.postal_code ?? "",
    tags: (c?.tags ?? []).join(", "),
    archived: c?.status === "archived",
    contacts: c?.contacts.length
      ? c.contacts.map((x) => ({ id: x.id, name: x.name, title: x.title ?? "", email: x.email ?? "", phone: x.phone ?? "", is_primary: x.is_primary }))
      : [{ ...blankContact(true), name: c?.is_individual ? c.name : "" }],
    first_note: "",
  };
}

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  client?: Client;
  onSaved?: (id: string) => void;
};

// Mounted only while open, so every opening starts from a fresh copy of the client.
export function ClientDialog(props: Props) {
  return props.open ? <ClientForm {...props} /> : null;
}

function ClientForm({ open, onOpenChange, client, onSaved }: Props) {
  const isNew = !client;
  const [d, setD] = React.useState<ClientDraft>(() => toDraft(client));
  const { data: categories = [] } = useQuery(categoriesQuery);
  const save = useSaveClient();

  const set = <K extends keyof ClientDraft>(k: K, v: ClientDraft[K]) => setD((p) => ({ ...p, [k]: v }));
  const setContact = (i: number, patch: Partial<ContactDraft>) =>
    setD((p) => ({ ...p, contacts: p.contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const makePrimary = (i: number) =>
    setD((p) => ({ ...p, contacts: p.contacts.map((c, j) => ({ ...c, is_primary: j === i })) }));
  const removeContact = (i: number) => setD((p) => {
    const contacts = p.contacts.filter((_, j) => j !== i);
    if (contacts.length && !contacts.some((c) => c.is_primary)) contacts[0].is_primary = true;
    return { ...p, contacts };
  });

  // An individual client is one person: one contact, and their name is the client's name.
  const setIndividual = (on: boolean) => setD((p) => ({
    ...p, is_individual: on,
    contacts: on ? [{ ...(p.contacts[0] ?? blankContact()), is_primary: true }] : p.contacts,
  }));

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    try {
      const saved = await save.mutateAsync({ id: client?.id, draft: d });
      toast.success(isNew ? "Client created" : "Client saved");
      onOpenChange(false);
      onSaved?.(saved.id);
    } catch { /* shown in the dialog */ }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} wide
      title={isNew ? "New client" : `Edit ${client.name}`}
      footer={<>
        {save.error && <div className="mr-auto text-sm text-bad">{save.error.message}</div>}
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button onClick={() => submit()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : isNew ? "Create client" : "Save"}
        </Button>
      </>}
    >
      <form onSubmit={submit} className="space-y-5">
        <Checkbox label="Individual client (no separate business name)"
                  checked={d.is_individual} onChange={(e) => setIndividual(e.target.checked)} />

        <div className="grid gap-4 sm:grid-cols-2">
          {!d.is_individual && (
            <Field label="Client / business name *">
              <Input autoFocus value={d.business_name} onChange={(e) => set("business_name", e.target.value)} />
            </Field>
          )}
          <Field label="Category" hint={categories.length ? undefined : "Add categories in Settings."}>
            <Select value={d.category_id} onChange={(e) => set("category_id", e.target.value)}>
              <option value="">None</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        </div>

        <div>
          <div className="mb-2 text-[13px] font-medium text-ink-soft">
            {d.is_individual ? "Contact (this person is the client)" : "Contacts"}
          </div>
          <div className="space-y-2.5">
            {d.contacts.map((c, i) => (
              <div key={c.id ?? `new-${i}`} className={cn("rounded-md border p-3", c.is_primary ? "border-accent/40 bg-accent/[0.03]" : "border-border")}>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input placeholder={d.is_individual ? "Client's name *" : "Name"} value={c.name}
                         onChange={(e) => setContact(i, { name: e.target.value })} />
                  <Input placeholder="Role / title" value={c.title} onChange={(e) => setContact(i, { title: e.target.value })} />
                  <Input type="email" placeholder="Email" value={c.email} onChange={(e) => setContact(i, { email: e.target.value })} />
                  <Input placeholder="Phone" value={c.phone} inputMode="tel"
                         onChange={(e) => setContact(i, { phone: formatPhone(e.target.value) })} />
                </div>
                {!d.is_individual && (
                  <div className="mt-2 flex items-center gap-3 text-[13px]">
                    <button type="button" onClick={() => makePrimary(i)}
                            className={cn("inline-flex items-center gap-1", c.is_primary ? "text-accent" : "text-ink-faint hover:text-ink")}>
                      <Star className={cn("size-3.5", c.is_primary && "fill-current")} />{c.is_primary ? "Primary contact" : "Make primary"}
                    </button>
                    {d.contacts.length > 1 && (
                      <button type="button" onClick={() => removeContact(i)} className="ml-auto inline-flex items-center gap-1 text-ink-faint hover:text-bad">
                        <Trash2 className="size-3.5" />Remove
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          {!d.is_individual && (
            <Button type="button" variant="ghost" size="sm" className="mt-2"
                    onClick={() => setD((p) => ({ ...p, contacts: [...p.contacts, blankContact(!p.contacts.length)] }))}>
              <Plus />Add contact
            </Button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Street" className="sm:col-span-2">
            <Input value={d.street} onChange={(e) => set("street", e.target.value)} />
          </Field>
          <Field label="City"><Input value={d.city} onChange={(e) => set("city", e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Province"><Input placeholder="BC" value={d.province} onChange={(e) => set("province", e.target.value)} /></Field>
            <Field label="Postal code"><Input placeholder="V3H 0A1" value={d.postal_code} onChange={(e) => set("postal_code", e.target.value)} /></Field>
          </div>
          <Field label="Default hourly rate" hint="Leave blank to use the studio's default.">
            <Input type="number" step="0.01" min="0" value={d.default_rate} onChange={(e) => set("default_rate", e.target.value)} />
          </Field>
          <Field label="Tags" hint="Comma-separated.">
            <Input value={d.tags} onChange={(e) => set("tags", e.target.value)} />
          </Field>
        </div>

        {isNew ? (
          <Field label="First note (optional)">
            <Textarea rows={2} placeholder="e.g. Referred by…" value={d.first_note} onChange={(e) => set("first_note", e.target.value)} />
          </Field>
        ) : (
          <Checkbox label="Archived" checked={d.archived} onChange={(e) => set("archived", e.target.checked)} />
        )}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
