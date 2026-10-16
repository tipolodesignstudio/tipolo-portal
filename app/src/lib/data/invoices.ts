// Invoices: progress bills against a project's budget, numbered YYNNN-XXX on finalizing.
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Json, Tables, TablesUpdate } from "@/lib/database.types";
import { localISO } from "@/lib/format";
import type { Block } from "@/lib/doc";
import { newLineId, type ProgressLine } from "@/lib/invoice-doc";

export type InvoiceProject = Pick<Tables<"projects">, "id" | "number" | "title" | "scope"> & {
  contact: { name: string; title: string | null; email: string | null; phone: string | null } | null;
  client: (Pick<Tables<"clients">, "id" | "name" | "is_individual" | "email" | "phone" | "street" | "city" | "province" | "postal_code"> & {
    contacts: { id: string; name: string; title: string | null; email: string | null; phone: string | null; is_primary: boolean }[];
  }) | null;
};
export type Invoice = Omit<Tables<"invoices">, "sections" | "progress_lines" | "line_items"> & {
  sections: Block[];
  progress_lines: ProgressLine[];
  line_items: { description: string; qty: number; unit_price: number; source_time_entry_ids?: string[]; source_expense_ids?: string[] }[];
  project: InvoiceProject | null;
};

const SELECT =
  "*, project:projects(id, number, title, scope, contact:contact_id(name, title, email, phone), " +
  "client:clients(id, name, is_individual, email, phone, street, city, province, postal_code, " +
  "contacts:client_contacts(id, name, title, email, phone, is_primary)))";

function unwrap<T>({ data, error }: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}
const asInvoice = (r: unknown) => r as Invoice;
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return localISO(d); };

export const effectiveStatus = (inv: { status: string; due_date: string | null }) =>
  inv.status === "sent" && inv.due_date && inv.due_date < localISO() ? "overdue" : inv.status;

export const invoiceKeys = {
  all: ["invoices"] as const,
  list: (s: string) => ["invoices", "list", s] as const,
  one: (id: string) => ["invoices", "one", id] as const,
  previous: (id: string) => ["invoices", "previous", id] as const,
};

export const invoicesQuery = (status: string) => queryOptions({
  queryKey: invoiceKeys.list(status),
  queryFn: async () => {
    let q = supabase.from("invoices").select(SELECT).order("issue_date", { ascending: false }).order("created_at", { ascending: false });
    if (status === "overdue") q = q.eq("status", "sent").lt("due_date", localISO());
    else if (status) q = q.eq("status", status);
    return (unwrap(await q) as unknown[]).map(asInvoice);
  },
});

export const invoiceQuery = (id: string) => queryOptions({
  queryKey: invoiceKeys.one(id),
  queryFn: async () => asInvoice(unwrap(await supabase.from("invoices").select(SELECT).eq("id", id).single())),
});

/* How much each line was already billed on this project's earlier, finalized invoices,
   keyed by line. Drafts don't count: nothing is billed until an invoice is finalized,
   and two open drafts would otherwise each count the other. */
export const previousDrawsQuery = (inv: Pick<Invoice, "id" | "project_id" | "created_at">) => queryOptions({
  queryKey: invoiceKeys.previous(inv.id),
  queryFn: async () => {
    const rows = unwrap(await supabase.from("invoices").select("id, status, created_at, progress_lines").eq("project_id", inv.project_id));
    const totals: Record<string, number> = {};
    for (const r of rows) {
      if (r.id === inv.id || r.status === "draft" || (inv.created_at && r.created_at >= inv.created_at)) continue;
      for (const li of (r.progress_lines as unknown as ProgressLine[]) ?? []) {
        const k = li.id || `d:${(li.description || "").trim().toLowerCase()}`;
        totals[k] = (totals[k] ?? 0) + (Number(li.amount) || 0);
      }
    }
    return totals;
  },
});

/* ---------------- building a new invoice ---------------- */

export const invoiceableProjectsQuery = queryOptions({
  queryKey: ["projects", "invoiceable"],
  queryFn: async () => unwrap(await supabase.from("projects")
    .select("id, number, title, status, client:clients(name)").order("number", { ascending: false })),
});

// The fee schedule the project was sold on: its newest converted proposal.
export async function projectBudgetLines(projectId: string) {
  const rows = unwrap(await supabase.from("proposals").select("line_items, created_at")
    .eq("converted_project_id", projectId).order("created_at", { ascending: false }).limit(1));
  return (rows[0]?.line_items as unknown as unknown[]) ?? [];
}

// Unbilled billable time, one line per rate, billed in full.
export async function unbilledTimeLines(projectId: string, title: string) {
  const entries = unwrap(await supabase.from("time_entries").select("id, minutes, rate")
    .eq("project_id", projectId).is("invoice_id", null).eq("billable", true));
  const byRate = new Map<number, { minutes: number; ids: string[] }>();
  for (const e of entries) {
    const r = Number(e.rate || 0);
    const g = byRate.get(r) ?? { minutes: 0, ids: [] };
    g.minutes += e.minutes; g.ids.push(e.id); byRate.set(r, g);
  }
  return [...byRate.entries()].map(([rate, g]) => {
    const amt = round2((g.minutes / 60) * rate);
    return { description: `${title} — professional services (${round2(g.minutes / 60)} h)`, budget: amt, amount: amt, source_time_entry_ids: g.ids };
  });
}

// Unbilled billable expenses, with their markup, billed in full.
export async function unbilledExpenseLines(projectId: string) {
  const rows = unwrap(await supabase.from("expenses")
    .select("id, description, vendor, notes, amount, markup_pct, category:category_id(name)")
    .eq("project_id", projectId).eq("billable", true).is("invoice_id", null));
  return rows.map((e) => {
    const amt = round2(Number(e.amount || 0) * (1 + (Number(e.markup_pct) || 0) / 100));
    const cat = Array.isArray(e.category) ? e.category[0] : e.category;
    const label = [e.description || e.vendor, cat?.name].filter(Boolean).join(" · ") || e.notes || "Expense";
    return { description: `${label}${e.markup_pct ? ` (+${e.markup_pct}%)` : ""}`, budget: amt, amount: amt, source_expense_ids: [e.id] };
  });
}

export async function myName() {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data } = await supabase.from("profiles").select("full_name").eq("id", u.user.id).maybeSingle();
  return data?.full_name ?? null;
}

type InvoicePatch = Omit<TablesUpdate<"invoices">, "sections" | "progress_lines" | "tax_lines"> & {
  sections?: Block[]; progress_lines?: ProgressLine[]; tax_lines?: unknown[];
};
const body = (p: InvoicePatch) => ({
  ...p,
  ...(p.sections ? { sections: p.sections as unknown as Json } : {}),
  ...(p.progress_lines ? { progress_lines: p.progress_lines as unknown as Json } : {}),
  ...(p.tax_lines ? { tax_lines: p.tax_lines as unknown as Json } : {}),
}) as TablesUpdate<"invoices">;

export async function createInvoice(p: InvoicePatch & { project_id: string }) {
  return asInvoice(unwrap(await supabase.from("invoices").insert(body(p) as never).select(SELECT).single()));
}
export async function updateInvoice(id: string, p: InvoicePatch) {
  return asInvoice(unwrap(await supabase.from("invoices").update(body(p)).eq("id", id).select(SELECT).single()));
}

/* Finalize: the next number (YYNNN-XXX) from the database, the time and expenses on it
   marked billed, sent today, due in 30 days unless a date was set. */
export async function finalizeInvoice(inv: Invoice) {
  const { data: number, error } = await supabase.rpc("next_invoice_number", { p_project_id: inv.project_id });
  if (error) throw new Error(error.message);
  const sources = [...(inv.progress_lines ?? []), ...(inv.line_items ?? [])];
  const te = sources.flatMap((li) => li.source_time_entry_ids ?? []);
  if (te.length) unwrap(await supabase.from("time_entries").update({ invoice_id: inv.id }).in("id", te).select("id"));
  const ex = sources.flatMap((li) => li.source_expense_ids ?? []);
  if (ex.length) unwrap(await supabase.from("expenses").update({ invoice_id: inv.id }).in("id", ex).select("id"));
  return updateInvoice(inv.id, { number: number as string, status: "sent", sent_date: localISO(), due_date: inv.due_date || addDays(localISO(), 30) });
}

export async function deleteInvoice(id: string) {
  const { error } = await supabase.from("invoices").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export function useInvoiceUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: InvoicePatch }) => updateInvoice(id, patch),
    onSuccess: (inv) => {
      qc.setQueryData(invoiceKeys.one(inv.id), inv);
      qc.invalidateQueries({ queryKey: ["invoices", "list"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

/* ---------------- invoices filed in Google Drive ---------------- */

export type DriveLink = { source_drive_id: string; source_drive_url: string; source_name: string };

// Point an invoice at its PDF in Drive. The file stays where it is.
export const linkInvoicePdf = (id: string, link: DriveLink | null) =>
  updateInvoice(id, link ?? { source_drive_id: null, source_drive_url: null, source_name: null });

// Income already entered by hand for this payment: same amount, not tied to an invoice.
export async function unlinkedIncomeFor(projectId: string, amount: number) {
  const rows = unwrap(await supabase.from("income").select("id, income_date, amount, description, project_id, payment_method")
    .is("invoice_id", null).order("income_date", { ascending: false }));
  return rows.filter((r) => round2(r.amount) === round2(amount) && (!r.project_id || r.project_id === projectId));
}

/* An invoice that already went out, brought in from its PDF. It keeps the PDF as its
   document (doc_mode 'pdf') and one line for the amount, so it counts toward the
   project's billed total. The project's invoice count moves past its number so the next
   one drawn here doesn't repeat it. Paid: the income row typed in earlier is tied to it,
   or the usual trigger adds one. */
export async function importDriveInvoice(p: {
  project: { id: string; number: string | null }; number: string; issue_date: string; due_date: string | null;
  total: number; status: "sent" | "paid"; paid_date: string | null; payment_method: string | null;
  link: DriveLink; incomeId?: string | null;
}) {
  const total = round2(p.total);
  let inv = await createInvoice({
    project_id: p.project.id, number: p.number, doc_mode: "pdf", ...p.link,
    issue_date: p.issue_date, sent_date: p.issue_date, due_date: p.due_date, status: "sent",
    progress_lines: [{ id: newLineId(), description: `Invoice ${p.number}`, budget: 0, amount: total }],
    sections: [], line_items: [], apply_taxes: false, tax_lines: [], subtotal: total, tax_total: 0, total,
    prepared_by: await myName(),
  });
  const m = p.project.number && new RegExp(`^${p.project.number}-(\\d+)$`).exec(p.number);
  if (m) {
    const { data } = await supabase.from("projects").select("next_invoice_seq").eq("id", p.project.id).single();
    if (data && data.next_invoice_seq <= Number(m[1]))
      unwrap(await supabase.from("projects").update({ next_invoice_seq: Number(m[1]) + 1 }).eq("id", p.project.id).select("id"));
  }
  if (p.status === "paid") {
    if (p.incomeId) unwrap(await supabase.from("income").update({ invoice_id: inv.id }).eq("id", p.incomeId).select("id"));
    inv = await updateInvoice(inv.id, { status: "paid", paid_date: p.paid_date, payment_method: p.payment_method });
  }
  return inv;
}
