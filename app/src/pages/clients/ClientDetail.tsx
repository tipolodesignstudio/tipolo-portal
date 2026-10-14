import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Mail, Pencil, Phone, Plus, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/fields";
import { EmptyState } from "@/components/ui/data-table";
import { date, money, relTime } from "@/lib/format";
import { legacy } from "@/lib/utils";
import { clientNotesQuery, clientQuery, clientWorkQuery, useAddNote } from "@/lib/data/clients";
import { ClientDialog } from "./ClientDialog";

function Notes({ clientId }: { clientId: string }) {
  const { data: notes = [], isLoading } = useQuery(clientNotesQuery(clientId));
  const [text, setText] = React.useState("");
  const add = useAddNote();

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!text.trim()) return;
    try {
      await add.mutateAsync({ clientId, body: text });
      setText("");
      toast.success("Note added");
    } catch (err) { toast.error((err as Error).message); }
  };

  return (
    <Card>
      <CardTitle>Notes</CardTitle>
      <form onSubmit={submit} className="mt-3 space-y-2">
        <Textarea rows={2} placeholder="Add a dated note…" value={text} onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }} />
        <Button size="sm" type="submit" disabled={!text.trim() || add.isPending}>{add.isPending ? "Adding…" : "Add note"}</Button>
      </form>
      <ol className="mt-5 space-y-4 border-l border-border pl-4">
        {isLoading && <li className="text-sm text-ink-faint">Loading…</li>}
        {!isLoading && !notes.length && <li className="text-sm text-ink-faint">No notes yet.</li>}
        {notes.map((n, i) => (
          <li key={n.id} className="relative">
            <span className={`absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-card ${i === 0 ? "bg-accent" : "bg-border"}`} />
            <div className="text-[12px] text-ink-faint">
              {date(n.created_at)}{relTime(n.created_at) !== date(n.created_at) && <> · {relTime(n.created_at)}</>}
            </div>
            <div className={`mt-0.5 whitespace-pre-wrap text-sm ${i === 0 ? "text-ink" : "text-ink-soft"}`}>{n.body}</div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function ClientDetail() {
  const { id } = useParams({ from: "/clients/$id" });
  const { data: c, isLoading, error } = useQuery(clientQuery(id));
  const { data: work } = useQuery(clientWorkQuery(id));
  const [editing, setEditing] = React.useState(false);

  if (isLoading) return <div className="h-96 animate-pulse rounded-lg bg-card" />;
  if (error || !c) {
    return (
      <EmptyState title="Client not found">
        {(error as Error)?.message} <Link to="/clients" className="text-accent underline">Back to clients</Link>
      </EmptyState>
    );
  }

  const address = [c.street, c.city, [c.province, c.postal_code].filter(Boolean).join("  ")].filter(Boolean);
  const proposals = work?.proposals ?? [];
  const projects = work?.projects ?? [];
  const accepted = proposals.filter((p) => p.status === "accepted").reduce((s, p) => s + Number(p.subtotal || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/clients" className="inline-flex items-center gap-1 text-[13px] text-ink-faint hover:text-ink">
          <ArrowLeft className="size-3.5" />Clients
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-3xl">
              {c.name}{c.status === "archived" && <Badge>archived</Badge>}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
              {c.is_individual ? "Individual client" : c.primary_contact?.name}
              {c.category && <Badge tone="accent">{c.category.name}</Badge>}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing(true)}><Pencil />Edit</Button>
            <Button asChild><a href={legacy("/proposals")}><Plus />New proposal</a></Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Projects", String(projects.length)],
          ["Proposals", String(proposals.length)],
          ["Accepted fees", money(accepted)],
        ].map(([k, v]) => (
          <Card key={k} className="py-4">
            <div className="text-[12px] uppercase tracking-wide text-ink-faint">{k}</div>
            <div className="mt-1 font-heading text-2xl">{v}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card className="p-0">
            <div className="flex items-center justify-between px-5 pt-5"><CardTitle>Proposals</CardTitle>
              <span className="text-sm text-ink-faint">{proposals.length}</span></div>
            {proposals.length ? (
              <ul className="mt-3 divide-y divide-border/70 border-t border-border/70">
                {proposals.map((p) => (
                  <li key={p.id}>
                    <a href={legacy(`/proposals/${p.id}`)} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-bg/60">
                      <span className="w-14 shrink-0 tabular-nums text-ink-faint">{p.number ?? "—"}</span>
                      <span className="min-w-0 flex-1 truncate">{p.title}</span>
                      <span className="tabular-nums text-ink-soft">{money(p.subtotal)}</span>
                      <StatusBadge status={p.status} />
                    </a>
                  </li>
                ))}
              </ul>
            ) : <p className="px-5 pb-5 pt-2 text-sm text-ink-faint">No proposals yet.</p>}
          </Card>

          <Card className="p-0">
            <div className="flex items-center justify-between px-5 pt-5"><CardTitle>Projects</CardTitle>
              <span className="text-sm text-ink-faint">{projects.length}</span></div>
            {projects.length ? (
              <ul className="mt-3 divide-y divide-border/70 border-t border-border/70">
                {projects.map((p) => (
                  <li key={p.id}>
                    <a href={legacy(`/projects/${p.id}`)} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-bg/60">
                      <span className="w-14 shrink-0 tabular-nums text-ink-faint">{p.number ?? "—"}</span>
                      <span className="min-w-0 flex-1 truncate">{p.title}</span>
                      {p.due_date && <span className="text-[12.5px] text-ink-faint">due {date(p.due_date)}</span>}
                      <StatusBadge status={p.status} />
                    </a>
                  </li>
                ))}
              </ul>
            ) : <p className="px-5 pb-5 pt-2 text-sm text-ink-faint">No projects yet.</p>}
          </Card>

          <Notes clientId={c.id} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardTitle>Contacts</CardTitle>
            {c.contacts.length ? (
              <ul className="mt-3 space-y-4">
                {c.contacts.map((ct) => (
                  <li key={ct.id} className="text-sm">
                    <div className="flex items-center gap-1.5 font-medium">
                      {ct.name}{ct.is_primary && <Star className="size-3.5 fill-accent text-accent" aria-label="primary" />}
                    </div>
                    {ct.title && <div className="text-[12.5px] text-ink-faint">{ct.title}</div>}
                    {ct.email && <a href={`mailto:${ct.email}`} className="mt-1 flex items-center gap-1.5 text-ink-soft hover:text-accent"><Mail className="size-3.5" />{ct.email}</a>}
                    {ct.phone && <a href={`tel:${ct.phone.replace(/[^\d+]/g, "")}`} className="mt-0.5 flex items-center gap-1.5 text-ink-soft hover:text-accent"><Phone className="size-3.5" />{ct.phone}</a>}
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-ink-faint">No contacts recorded.</p>}
          </Card>

          <Card>
            <CardTitle>Details</CardTitle>
            <dl className="mt-3 space-y-3 text-sm">
              <div><dt className="text-[12px] text-ink-faint">Address</dt>
                <dd className="mt-0.5 whitespace-pre-line">{address.length ? address.join("\n") : "—"}</dd></div>
              <div><dt className="text-[12px] text-ink-faint">Default rate</dt>
                <dd className="mt-0.5">{c.default_rate != null ? `${money(c.default_rate)} / hr` : "Studio default"}</dd></div>
              <div><dt className="text-[12px] text-ink-faint">Tags</dt>
                <dd className="mt-1 flex flex-wrap gap-1">{c.tags?.length ? c.tags.map((t) => <Badge key={t}>{t}</Badge>) : "—"}</dd></div>
              <div><dt className="text-[12px] text-ink-faint">Client since</dt>
                <dd className="mt-0.5">{date(c.created_at)}</dd></div>
            </dl>
          </Card>
        </div>
      </div>

      <ClientDialog open={editing} onOpenChange={setEditing} client={c} />
    </div>
  );
}
