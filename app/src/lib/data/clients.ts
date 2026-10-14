// Clients: queries and changes, typed from the live schema.
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables, TablesInsert, TablesUpdate } from "@/lib/database.types";

export type Contact = Pick<Tables<"client_contacts">, "id" | "name" | "title" | "email" | "phone" | "is_primary">;
export type Category = Tables<"client_categories">;
export type Client = Tables<"clients"> & {
  category: Pick<Category, "id" | "name"> | null;
  contacts: Contact[];
  project_count: number;
  primary_contact: Contact | null;
};
export type ClientNote = Tables<"client_notes">;
export type ClientFilters = { search: string; status: "active" | "archived" | "all"; categoryId: string };

const SELECT =
  "*, projects(count), category:category_id(id, name), " +
  "contacts:client_contacts(id, name, title, email, phone, is_primary)";

function unwrap<T>({ data, error }: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}

type Raw = Tables<"clients"> & { projects?: { count: number }[]; category: Client["category"]; contacts: Contact[] | null };
const shape = (r: Raw): Client => {
  const contacts = (r.contacts ?? []).slice().sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
  return { ...r, contacts, project_count: r.projects?.[0]?.count ?? 0, primary_contact: contacts[0] ?? null };
};

// PostgREST's or() treats commas and brackets as syntax.
const cleanTerm = (s: string) => s.replace(/[,()*%]/g, " ").trim();

export const clientKeys = {
  all: ["clients"] as const,
  list: (f: ClientFilters) => ["clients", "list", f] as const,
  one: (id: string) => ["clients", "one", id] as const,
  notes: (id: string) => ["clients", "notes", id] as const,
  categories: ["client_categories"] as const,
};

export const clientsQuery = (f: ClientFilters) => queryOptions({
  queryKey: clientKeys.list(f),
  queryFn: async () => {
    // The studio's own client carries the internal project; it isn't someone you bill.
    let q = supabase.from("clients").select(SELECT).eq("is_internal", false).order("name");
    if (f.status !== "all") q = q.eq("status", f.status);
    if (f.categoryId) q = q.eq("category_id", f.categoryId);
    const term = cleanTerm(f.search);
    if (term) q = q.or(`name.ilike.%${term}%,email.ilike.%${term}%`);
    return (unwrap(await q) as unknown as Raw[]).map(shape);
  },
});

export const clientQuery = (id: string) => queryOptions({
  queryKey: clientKeys.one(id),
  queryFn: async () => shape(unwrap(await supabase.from("clients").select(SELECT).eq("id", id).single()) as unknown as Raw),
});

export const clientNotesQuery = (id: string) => queryOptions({
  queryKey: clientKeys.notes(id),
  queryFn: async () => unwrap(await supabase.from("client_notes").select("*")
    .eq("client_id", id).order("created_at", { ascending: false })),
});

export const categoriesQuery = queryOptions({
  queryKey: clientKeys.categories,
  queryFn: async () => unwrap(await supabase.from("client_categories").select("*").order("sort_order").order("name")),
  staleTime: 5 * 60_000,
});

/* ---------------- changes ---------------- */

export function useAddNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientId, body }: { clientId: string; body: string }) =>
      unwrap(await supabase.from("client_notes").insert({ client_id: clientId, body: body.trim() }).select().single()),
    // a trigger copies the newest note onto the client, so the lists need a refresh too
    onSuccess: (_n, { clientId }) => {
      qc.invalidateQueries({ queryKey: clientKeys.notes(clientId) });
      qc.invalidateQueries({ queryKey: clientKeys.all });
    },
  });
}

export type ContactDraft = { id?: string; name: string; title: string; email: string; phone: string; is_primary: boolean };
export type ClientDraft = {
  is_individual: boolean;
  business_name: string;
  category_id: string;
  default_rate: string;
  street: string; city: string; province: string; postal_code: string;
  tags: string;
  archived: boolean;
  contacts: ContactDraft[];
  first_note: string;
};

const nul = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);

/* Saves the client, then reconciles its contacts against the form (removed ones are
   deleted, the rest updated or added), the same as the previous portal did. */
export function useSaveClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, draft }: { id?: string; draft: ClientDraft }) => {
      const contacts = draft.contacts.map((c) => ({ ...c, name: c.name.trim() })).filter((c) => c.name);
      if (draft.is_individual && !contacts.length) throw new Error("Enter the client's name.");
      if (!draft.is_individual && !draft.business_name.trim()) throw new Error("Enter the business name.");
      if (contacts.length && !contacts.some((c) => c.is_primary)) contacts[0].is_primary = true;
      const primary = contacts.find((c) => c.is_primary) ?? null;

      const patch: TablesUpdate<"clients"> = {
        name: draft.is_individual ? contacts[0].name : draft.business_name.trim(),
        is_individual: draft.is_individual,
        category_id: draft.category_id || null,
        email: nul(primary?.email),
        phone: nul(primary?.phone),
        street: nul(draft.street), city: nul(draft.city),
        province: nul(draft.province), postal_code: nul(draft.postal_code),
        default_rate: draft.default_rate.trim() === "" ? null : Number(draft.default_rate),
        tags: draft.tags.split(",").map((t) => t.trim()).filter(Boolean),
      };
      if (id) patch.status = draft.archived ? "archived" : "active";

      const saved = id
        ? unwrap(await supabase.from("clients").update(patch).eq("id", id).select().single())
        : unwrap(await supabase.from("clients").insert(patch as TablesInsert<"clients">).select().single());

      const existing = unwrap(await supabase.from("client_contacts").select("id").eq("client_id", saved.id));
      const keep = new Set(contacts.filter((c) => c.id).map((c) => c.id));
      const gone = existing.filter((e) => !keep.has(e.id)).map((e) => e.id);
      if (gone.length) unwrap(await supabase.from("client_contacts").delete().in("id", gone).select("id"));
      for (const c of contacts) {
        const row = { client_id: saved.id, name: c.name, title: nul(c.title), email: nul(c.email), phone: nul(c.phone), is_primary: c.is_primary };
        if (c.id) unwrap(await supabase.from("client_contacts").update(row).eq("id", c.id).select("id"));
        else unwrap(await supabase.from("client_contacts").insert(row).select("id"));
      }
      if (!id && draft.first_note.trim()) {
        unwrap(await supabase.from("client_notes").insert({ client_id: saved.id, body: draft.first_note.trim() }).select("id"));
      }
      return saved;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clientKeys.all }),
  });
}

/* ---------------- what a client has (read-only here until those screens move) ---------------- */

export const clientWorkQuery = (id: string) => queryOptions({
  queryKey: ["clients", "work", id],
  queryFn: async () => {
    const [proposals, projects] = await Promise.all([
      supabase.from("proposals").select("id, number, title, subtotal, status, created_at")
        .eq("client_id", id).order("created_at", { ascending: false }),
      supabase.from("projects").select("id, number, title, scope, status, due_date, budget")
        .eq("client_id", id).order("updated_at", { ascending: false }),
    ]);
    return { proposals: unwrap(proposals), projects: unwrap(projects) };
  },
});
