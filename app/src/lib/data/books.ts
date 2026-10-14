// The books: expenses, income, fixed costs and their categories, plus the Google Drive
// locations and sync stamps kept on app_settings.
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables, TablesInsert, TablesUpdate } from "@/lib/database.types";

export type Category = Tables<"expense_categories">;
export type Expense = Tables<"expenses"> & {
  category: { id: string; name: string } | null;
  project: { id: string; number: string | null; title: string } | null;
};
export type Income = Tables<"income"> & {
  client: { id: string; name: string } | null;
  project: { id: string; number: string | null; title: string } | null;
  invoice: { id: string; number: string | null } | null;
};
export type FixedCost = Tables<"fixed_costs"> & { category: { id: string; name: string } | null };
export type BooksState = Pick<Tables<"app_settings">,
  "books_changed_at" | "tracker_synced_at" | "drive_folder_id" | "drive_receipts_folder_id" | "drive_tracker_file_id" |
  "drive_proposals_folder_id" | "drive_projects_folder_id" | "expense_payment_methods" | "income_payment_methods">;

export const EXPENSE_SELECT = "*, category:category_id(id, name), project:project_id(id, number, title)";
export const INCOME_SELECT = "*, client:client_id(id, name), project:project_id(id, number, title), invoice:invoice_id(id, number)";

export function unwrap<T>({ data, error }: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (error) throw new Error(/does not exist/.test(error.message) ? `${error.message} — a migration may not have been run yet.` : error.message);
  return data as NonNullable<T>;
}

export const booksKeys = {
  all: ["books"] as const,
  expenses: (f: object) => ["books", "expenses", f] as const,
  income: ["books", "income"] as const,
  fixed: ["books", "fixed"] as const,
  categories: ["books", "categories"] as const,
  state: ["books", "state"] as const,
};

export type ExpenseFilters = { projectId: string; categoryId: string; billable: "" | "yes" | "no"; billed: "" | "unbilled" | "billed" };

export async function listExpenses(f: Partial<ExpenseFilters> = {}) {
  let q = supabase.from("expenses").select(EXPENSE_SELECT).order("expense_date", { ascending: false }).order("created_at", { ascending: false });
  if (f.projectId === "none") q = q.is("project_id", null);
  else if (f.projectId) q = q.eq("project_id", f.projectId);
  if (f.categoryId) q = q.eq("category_id", f.categoryId);
  if (f.billable === "yes") q = q.eq("billable", true);
  if (f.billable === "no") q = q.eq("billable", false);
  if (f.billed === "unbilled") q = q.is("invoice_id", null);
  if (f.billed === "billed") q = q.not("invoice_id", "is", null);
  return unwrap(await q) as unknown as Expense[];
}
export const expensesQuery = (f: ExpenseFilters) => queryOptions({ queryKey: booksKeys.expenses(f), queryFn: () => listExpenses(f) });

export async function listIncome() {
  return unwrap(await supabase.from("income").select(INCOME_SELECT)
    .order("income_date", { ascending: false }).order("created_at", { ascending: false })) as unknown as Income[];
}
export const incomeQuery = queryOptions({ queryKey: booksKeys.income, queryFn: listIncome });

export async function listFixedCosts() {
  return unwrap(await supabase.from("fixed_costs").select("*, category:category_id(id, name)")
    .order("sort_order").order("created_at")) as unknown as FixedCost[];
}
export const fixedQuery = queryOptions({ queryKey: booksKeys.fixed, queryFn: listFixedCosts });

export async function listCategories() {
  return unwrap(await supabase.from("expense_categories").select("*").order("sort_order").order("name"));
}
export const categoriesQuery = queryOptions({ queryKey: booksKeys.categories, queryFn: listCategories, staleTime: 5 * 60_000 });

export async function getBooksState(): Promise<BooksState> {
  const { data, error } = await supabase.from("app_settings")
    .select("books_changed_at, tracker_synced_at, drive_folder_id, drive_receipts_folder_id, drive_tracker_file_id, drive_proposals_folder_id, drive_projects_folder_id, expense_payment_methods, income_payment_methods")
    .eq("id", 1).maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? {}) as BooksState;
}
export const booksStateQuery = queryOptions({ queryKey: booksKeys.state, queryFn: getBooksState });
export async function setBooksState(patch: TablesUpdate<"app_settings">) {
  return unwrap(await supabase.from("app_settings").update(patch).eq("id", 1).select("id").single());
}

/* ---- writes ---- */
export const saveExpense = async (id: string | undefined, patch: TablesInsert<"expenses">) => id
  ? unwrap(await supabase.from("expenses").update(patch).eq("id", id).select(EXPENSE_SELECT).single()) as unknown as Expense
  : unwrap(await supabase.from("expenses").insert(patch).select(EXPENSE_SELECT).single()) as unknown as Expense;
export const deleteExpense = async (id: string) => { unwrap(await supabase.from("expenses").delete().eq("id", id).select("id")); };

export const saveIncome = async (id: string | undefined, patch: TablesInsert<"income">) => id
  ? unwrap(await supabase.from("income").update(patch).eq("id", id).select(INCOME_SELECT).single()) as unknown as Income
  : unwrap(await supabase.from("income").insert(patch).select(INCOME_SELECT).single()) as unknown as Income;
export const deleteIncome = async (id: string) => { unwrap(await supabase.from("income").delete().eq("id", id).select("id")); };

export async function createFixedCost(patch: TablesInsert<"fixed_costs">) {
  const { data: max } = await supabase.from("fixed_costs").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  return unwrap(await supabase.from("fixed_costs").insert({ sort_order: (max?.[0]?.sort_order ?? 0) + 1, ...patch }).select("*, category:category_id(id, name)").single());
}
export const updateFixedCost = async (id: string, patch: TablesUpdate<"fixed_costs">) =>
  unwrap(await supabase.from("fixed_costs").update(patch).eq("id", id).select("*, category:category_id(id, name)").single()) as unknown as FixedCost;
export const deleteFixedCost = async (id: string) => { unwrap(await supabase.from("fixed_costs").delete().eq("id", id).select("id")); };

export async function createCategory(name: string) {
  const { data: max } = await supabase.from("expense_categories").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  return unwrap(await supabase.from("expense_categories").insert({ name: name.trim(), sort_order: (max?.[0]?.sort_order ?? 0) + 1 }).select().single());
}

/* ---- pickers ---- */
export const pickerProjectsQuery = queryOptions({
  queryKey: ["projects", "picker"],
  queryFn: async () => unwrap(await supabase.from("projects").select("id, number, title").order("number", { ascending: false })),
});
// every client, the studio's own included — income can come from anywhere
export const pickerClientsQuery = queryOptions({
  queryKey: ["clients", "picker-all"],
  queryFn: async () => unwrap(await supabase.from("clients").select("id, name").order("name")),
});
export async function invoicesByNumber(numbers: string[]) {
  if (!numbers.length) return [];
  return unwrap(await supabase.from("invoices").select("id, number, project_id, project:project_id(client_id)").in("number", numbers)) as unknown as
    { id: string; number: string; project_id: string; project: { client_id: string } | null }[];
}
