// Projects, with the numbers that say how each one is going: time logged, what's been
// billed, and the budget it was sold on. Also the time entries logged against them.
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Json, Tables, TablesInsert, TablesUpdate } from "@/lib/database.types";
import { localISO } from "@/lib/format";

export type ProjectStatus = "lead" | "proposal" | "active" | "on_hold" | "complete" | "archived";
export const PROJECT_STATUSES: ProjectStatus[] = ["lead", "proposal", "active", "on_hold", "complete", "archived"];

export type Contact = Pick<Tables<"client_contacts">, "id" | "name" | "title" | "email" | "phone" | "is_primary">;
export type Deliverable = { label: string; done: boolean };
export type Project = Omit<Tables<"projects">, "deliverables"> & {
  deliverables: Deliverable[];
  client: (Pick<Tables<"clients">, "id" | "name" | "is_individual" | "default_rate"> & { contacts: Contact[] }) | null;
  contact: Omit<Contact, "is_primary"> | null;
};
export type Rollup = { minutes: number; billableMinutes: number; unbilledValue: number; billed: number; paid: number; budget: number | null };
export type ProjectRow = Project & { rollup: Rollup };
export type TimeEntry = Tables<"time_entries">;

const SELECT =
  "*, client:clients(id, name, is_individual, default_rate, contacts:client_contacts(id, name, title, email, phone, is_primary)), " +
  "contact:contact_id(id, name, title, email, phone)";

function unwrap<T>({ data, error }: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}
const cleanTerm = (s: string) => s.replace(/[,()*%]/g, " ").trim();

export const projectKeys = {
  all: ["projects"] as const,
  list: (f: object) => ["projects", "list", f] as const,
  one: (id: string) => ["projects", "one", id] as const,
  work: (id: string) => ["projects", "work", id] as const,
};

/* The sold-on budget: the project's own figure if set, otherwise the accepted proposal
   it was converted from (the fee schedule a project's invoices draw down against). */
function budgetFor(p: Tables<"projects">, proposals: { converted_project_id: string | null; subtotal: number | null; status: string }[]) {
  if (p.budget != null) return Number(p.budget);
  const from = proposals.filter((x) => x.converted_project_id === p.id);
  if (!from.length) return null;
  return from.reduce((s, x) => s + (Number(x.subtotal) || 0), 0);
}

export const projectsQuery = (f: { search: string; status: string; scope: string }) => queryOptions({
  queryKey: projectKeys.list(f),
  queryFn: async (): Promise<ProjectRow[]> => {
    let q = supabase.from("projects").select(SELECT).order("number", { ascending: false });
    if (f.status === "open") q = q.not("status", "in", "(complete,archived)");
    else if (f.status) q = q.eq("status", f.status);
    if (f.scope) q = q.eq("scope", f.scope);
    const term = cleanTerm(f.search);
    if (term) q = q.or(`title.ilike.%${term}%,number.ilike.%${term}%,description.ilike.%${term}%`);
    const [projects, time, invoices, proposals] = await Promise.all([
      q,
      supabase.from("time_entries").select("project_id, minutes, rate, billable, invoice_id"),
      supabase.from("invoices").select("project_id, total, status"),
      supabase.from("proposals").select("converted_project_id, subtotal, status").not("converted_project_id", "is", null),
    ]);
    const rows = unwrap(projects) as unknown as Project[];
    const t = time.data ?? [], inv = invoices.data ?? [], pr = proposals.data ?? [];
    return rows.map((p) => {
      const te = t.filter((x) => x.project_id === p.id);
      const iv = inv.filter((x) => x.project_id === p.id && x.status !== "draft");
      return {
        ...p,
        rollup: {
          minutes: te.reduce((s, x) => s + x.minutes, 0),
          billableMinutes: te.filter((x) => x.billable).reduce((s, x) => s + x.minutes, 0),
          unbilledValue: te.filter((x) => x.billable && !x.invoice_id).reduce((s, x) => s + (x.minutes / 60) * (Number(x.rate) || 0), 0),
          billed: iv.reduce((s, x) => s + (Number(x.total) || 0), 0),
          paid: iv.filter((x) => x.status === "paid").reduce((s, x) => s + (Number(x.total) || 0), 0),
          budget: budgetFor(p as unknown as Tables<"projects">, pr),
        },
      };
    });
  },
});

export const projectQuery = (id: string) => queryOptions({
  queryKey: projectKeys.one(id),
  queryFn: async () => {
    const p = unwrap(await supabase.from("projects").select(SELECT).eq("id", id).single()) as unknown as Project;
    p.deliverables = Array.isArray(p.deliverables) ? p.deliverables : [];
    return p;
  },
});

/* Everything hanging off one project. */
export const projectWorkQuery = (id: string) => queryOptions({
  queryKey: projectKeys.work(id),
  queryFn: async () => {
    const [time, expenses, invoices, proposals] = await Promise.all([
      supabase.from("time_entries").select("*").eq("project_id", id).order("entry_date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("expenses").select("*, category:category_id(id, name)").eq("project_id", id).order("expense_date", { ascending: false }),
      supabase.from("invoices").select("id, number, issue_date, due_date, total, status").eq("project_id", id).order("issue_date", { ascending: false }),
      supabase.from("proposals").select("id, number, title, subtotal, status").eq("converted_project_id", id).order("created_at"),
    ]);
    return {
      time: unwrap(time),
      expenses: unwrap(expenses) as unknown as (Tables<"expenses"> & { category: { id: string; name: string } | null })[],
      invoices: unwrap(invoices),
      proposals: unwrap(proposals),
    };
  },
});

export const invoiceStatus = (inv: { status: string; due_date: string | null }) =>
  inv.status === "sent" && inv.due_date && inv.due_date < localISO() ? "overdue" : inv.status;

/* ---------------- changes ---------------- */

type ProjectPatch = Omit<TablesUpdate<"projects">, "deliverables"> & { deliverables?: Deliverable[] };

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: ProjectPatch }) => {
      const body = { ...patch } as TablesUpdate<"projects">;
      if (patch.deliverables) body.deliverables = patch.deliverables as unknown as Json;
      return unwrap(await supabase.from("projects").update(body).eq("id", id).select(SELECT).single()) as unknown as Project;
    },
    onSuccess: (p) => {
      qc.setQueryData(projectKeys.one(p.id), { ...p, deliverables: Array.isArray(p.deliverables) ? p.deliverables : [] });
      qc.invalidateQueries({ queryKey: ["projects", "list"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

/* ---------------- time entries ---------------- */

export const activeProjectsQuery = queryOptions({
  queryKey: ["projects", "active-lite"],
  queryFn: async () => unwrap(await supabase.from("projects")
    .select("id, number, title, hourly_rate, client:clients(id, name, default_rate)")
    .not("status", "in", "(archived,complete)").order("number", { ascending: false })),
});

export function useTimeEntryMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["time"] });
    qc.invalidateQueries({ queryKey: ["snapshot"] });
  };
  return {
    save: useMutation({
      mutationFn: async ({ id, patch }: { id?: string; patch: TablesInsert<"time_entries"> }) => id
        ? unwrap(await supabase.from("time_entries").update(patch).eq("id", id).select().single())
        : unwrap(await supabase.from("time_entries").insert(patch).select().single()),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase.from("time_entries").delete().eq("id", id);
        if (error) throw new Error(error.message);
      },
      onSuccess: refresh,
    }),
  };
}
