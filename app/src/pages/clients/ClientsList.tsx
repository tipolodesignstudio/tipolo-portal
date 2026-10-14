import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Segmented, Select, Textarea } from "@/components/ui/fields";
import { DataTable, EmptyState } from "@/components/ui/data-table";
import { relTime } from "@/lib/format";
import {
  categoriesQuery, clientsQuery, useAddNote, type Client, type ClientFilters,
} from "@/lib/data/clients";
import { ClientDialog } from "./ClientDialog";

/* The newest note, editable in place. Saving it adds a dated entry to the client's
   history rather than overwriting the old one. */
function NoteCell({ client }: { client: Client }) {
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState(client.latest_note ?? "");
  const add = useAddNote();
  const start = () => { setText(client.latest_note ?? ""); setEditing(true); };

  const changed = text.trim() !== "" && text.trim() !== (client.latest_note ?? "").trim();
  const save = async () => {
    try {
      await add.mutateAsync({ clientId: client.id, body: text });
      setEditing(false);
      toast.success("Note added to the history");
    } catch (e) { toast.error((e as Error).message); }
  };

  if (!editing) {
    return (
      <button type="button" onClick={start} data-stop
              className="block w-full rounded-md px-2 py-1 -mx-2 -my-1 text-left hover:bg-bg-alt">
        {client.latest_note
          ? <span className="line-clamp-2 text-ink-soft">{client.latest_note}</span>
          : <span className="text-ink-faint">Add a note…</span>}
        {client.latest_note_at && <span className="mt-0.5 block text-[11.5px] text-ink-faint">{relTime(client.latest_note_at)}</span>}
      </button>
    );
  }
  return (
    <div data-stop className="space-y-1.5">
      <Textarea autoFocus rows={2} value={text} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setEditing(false);
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && changed) save();
                }} />
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={save} disabled={!changed || add.isPending}>{add.isPending ? "Saving…" : "Save note"}</Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        <span className="ml-auto text-[11px] text-ink-faint">⌘↵ to save</span>
      </div>
    </div>
  );
}

const columns: ColumnDef<Client, unknown>[] = [
  {
    id: "name", header: "Client", accessorFn: (c) => c.name,
    meta: { className: "w-[30%]" },
    cell: ({ row: { original: c } }) => (
      <div>
        <div className="flex items-center gap-2 font-medium text-ink">
          {c.name}{c.status === "archived" && <Badge>archived</Badge>}
        </div>
        <div className="mt-0.5 text-[12.5px] text-ink-faint">
          {c.is_individual ? "Individual" : c.primary_contact?.name ?? "No contact"}
          {c.primary_contact?.email && <> · {c.primary_contact.email}</>}
        </div>
      </div>
    ),
  },
  {
    id: "category", header: "Category", accessorFn: (c) => c.category?.name ?? "",
    meta: { className: "w-40" },
    cell: ({ row: { original: c } }) => c.category ? <Badge tone="accent">{c.category.name}</Badge> : <span className="text-ink-faint">—</span>,
  },
  {
    id: "projects", header: "Projects", accessorFn: (c) => c.project_count,
    meta: { align: "right", className: "w-24" },
    cell: ({ getValue }) => <span className={getValue() ? "text-ink" : "text-ink-faint"}>{getValue() as number}</span>,
  },
  {
    id: "note", header: "Latest note", accessorFn: (c) => c.latest_note_at ?? "", sortDescFirst: true,
    cell: ({ row: { original: c } }) => <NoteCell client={c} />,
  },
];

export function ClientsList() {
  const navigate = useNavigate();
  const [filters, setFilters] = React.useState<ClientFilters>({ search: "", status: "active", categoryId: "" });
  const [search, setSearch] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, search })), 220);
    return () => clearTimeout(t);
  }, [search]);

  const { data: clients = [], isLoading, error } = useQuery({ ...clientsQuery(filters), placeholderData: (p) => p });
  const { data: categories = [] } = useQuery(categoriesQuery);
  const filtered = !!(filters.search || filters.categoryId);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Clients</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {isLoading ? "Loading…" : `${clients.length} ${filters.status === "all" ? "" : filters.status + " "}client${clients.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus />New client</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input className="pl-9" placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select className="w-48" value={filters.categoryId} onChange={(e) => setFilters((f) => ({ ...f, categoryId: e.target.value }))}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Segmented value={filters.status} onChange={(status) => setFilters((f) => ({ ...f, status }))}
          options={[{ value: "active", label: "Active" }, { value: "archived", label: "Archived" }, { value: "all", label: "All" }]} />
      </div>

      {error ? (
        <EmptyState title="Couldn't load clients">{(error as Error).message}</EmptyState>
      ) : isLoading ? (
        <div className="h-64 animate-pulse rounded-lg border border-border bg-card" />
      ) : (
        <DataTable data={clients} columns={columns} initialSort={[{ id: "name", desc: false }]}
          onRowClick={(c) => navigate({ to: "/clients/$id", params: { id: c.id } })}
          empty={<EmptyState title={filtered ? "No clients match" : "No clients yet"}>
            {filtered ? "Try a different search or category." : "Add a client to start proposals and projects."}
          </EmptyState>} />
      )}

      <ClientDialog open={creating} onOpenChange={setCreating}
        onSaved={(id) => navigate({ to: "/clients/$id", params: { id } })} />
    </div>
  );
}
