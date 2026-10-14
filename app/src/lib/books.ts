// The books and Google Drive: receipts filed into Accounting/Receipts/<year>/<MM Month>/,
// the Excel tracker rewritten from the portal, and the import of what the tracker holds.
// The Excel reading/writing and the Drive client are shared with the previous portal
// (js/core/tracker-xlsx.js, gdrive.js); this ports the glue from js/core/books.js.

import * as gd from "@site/js/core/gdrive.js";
import * as xl from "@site/js/core/tracker-xlsx.js";
import { localISO } from "@/lib/format";
import {
  createCategory, createFixedCost, getBooksState, invoicesByNumber, listCategories, listExpenses, listFixedCosts,
  listIncome, saveExpense, saveIncome, setBooksState, type BooksState, type Category, type Expense, type Income,
} from "@/lib/data/books";
import { supabase } from "@/lib/supabase";

type DriveFile = { id: string; name: string; mimeType: string; parents?: string[]; webViewLink?: string };
export const drive = {
  configured: gd.configured as () => boolean,
  connected: gd.connected as () => boolean,
  connect: gd.connect as (o?: { email?: string }) => Promise<string>,
  disconnect: gd.disconnect as () => void,
  loadGoogle: gd.loadGoogle as () => Promise<boolean>,
  onConnectionChange: gd.onConnectionChange as (fn: (on: boolean) => void) => () => void,
  setLoginHint: gd.setLoginHint as (email: string) => void,
  idFromLink: gd.idFromLink as (s: string) => string,
  getFile: gd.getFile as (id: string) => Promise<DriveFile>,
  listChildren: gd.listChildren as (id: string, o?: { name?: string; folders?: boolean }) => Promise<DriveFile[]>,
  findOrCreateFolder: gd.findOrCreateFolder as (parent: string, name: string) => Promise<DriveFile>,
  download: gd.download as (id: string) => Promise<ArrayBuffer>,
  upload: gd.upload as (parent: string, name: string, blob: Blob) => Promise<DriveFile>,
  replace: gd.replace as (id: string, blob: Blob) => Promise<DriveFile>,
  copy: gd.copy as (id: string, parent: string, name: string) => Promise<DriveFile>,
  moveRename: gd.moveRename as (id: string, o: { name?: string; from?: string; to?: string }) => Promise<DriveFile>,
};

export const TRACKER_NAME = "Tipolo Income & Expense Tracker.xlsx";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/* ---------------- Drive locations ---------------- */

// Point the portal at the Accounting folder: find Receipts and the tracker inside it, and
// once, before the portal ever writes to it, keep a copy of the tracker as it was.
export async function linkAccountingFolder(link: string) {
  const id = drive.idFromLink(link);
  if (!id) throw new Error("Paste the link to the Accounting folder (or its ID).");
  const folder = await drive.getFile(id);
  if (folder.mimeType !== "application/vnd.google-apps.folder") throw new Error("That link is a file, not a folder.");
  const receipts = await drive.findOrCreateFolder(folder.id, "Receipts");
  const kids = await drive.listChildren(folder.id);
  const xlsx = kids.filter((f) => /\.xlsx$/i.test(f.name) && !/before portal/i.test(f.name));
  const tracker = xlsx.find((f) => f.name === TRACKER_NAME) ?? xlsx.find((f) => /income.*expense/i.test(f.name));
  if (!tracker) throw new Error(`No “${TRACKER_NAME}” in ${folder.name}.`);
  const backup = tracker.name.replace(/\.xlsx$/i, " (before portal).xlsx");
  if (!kids.some((f) => f.name === backup)) await drive.copy(tracker.id, folder.id, backup);
  await setBooksState({ drive_folder_id: folder.id, drive_receipts_folder_id: receipts.id, drive_tracker_file_id: tracker.id });
  return { folder, receipts, tracker };
}

export async function linkFolder(key: "drive_proposals_folder_id" | "drive_projects_folder_id", link: string) {
  const id = drive.idFromLink(link);
  if (!id) throw new Error("Paste the link to that folder (or its ID).");
  const folder = await drive.getFile(id);
  if (folder.mimeType !== "application/vnd.google-apps.folder") throw new Error("That link is a file, not a folder.");
  await setBooksState({ [key]: folder.id });
  return folder;
}

/* ---------------- receipts ---------------- */

const clean = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
export function receiptName(dateIso: string, description: string, file: { name?: string; type?: string }) {
  const ext = (/\.([a-z0-9]{1,5})$/i.exec(file.name ?? "") ?? [])[1]?.toLowerCase() ?? (file.type === "application/pdf" ? "pdf" : "jpg");
  return `${dateIso.slice(2)} ${clean(description) || "Receipt"}`.slice(0, 120) + "." + ext;
}
async function monthFolder(receiptsId: string, dateIso: string) {
  const [y, m] = dateIso.split("-");
  const year = await drive.findOrCreateFolder(receiptsId, y);
  return drive.findOrCreateFolder(year.id, `${m} ${MONTHS[+m - 1]}`);
}
// "26-09-18 Amazon.pdf" is taken → "26-09-18 Amazon 2.pdf"
async function freeName(folderId: string, name: string, exceptId?: string) {
  const taken = new Set((await drive.listChildren(folderId)).filter((f) => f.id !== exceptId).map((f) => f.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf(".");
  for (let n = 2; ; n++) { const c = `${name.slice(0, dot)} ${n}${name.slice(dot)}`; if (!taken.has(c.toLowerCase())) return c; }
}
async function receiptsFolder() {
  const st = await getBooksState();
  if (!st.drive_receipts_folder_id) throw new Error("Google Drive isn't linked yet — Settings → Google Drive.");
  return st.drive_receipts_folder_id;
}
export type ReceiptRef = { receipt_drive_id: string; receipt_drive_url: string | null; receipt_name: string };
export async function uploadReceipt(file: File, o: { date: string; description: string }): Promise<ReceiptRef> {
  const month = await monthFolder(await receiptsFolder(), o.date);
  const f = await drive.upload(month.id, await freeName(month.id, receiptName(o.date, o.description, file)), file);
  return { receipt_drive_id: f.id, receipt_drive_url: f.webViewLink ?? null, receipt_name: f.name };
}
// The expense's date or description changed → the receipt follows it.
export async function refileReceipt(e: Pick<Expense, "receipt_drive_id">, o: { date: string; description: string }): Promise<ReceiptRef | null> {
  if (!e.receipt_drive_id) return null;
  const month = await monthFolder(await receiptsFolder(), o.date);
  const cur = await drive.getFile(e.receipt_drive_id);
  const wanted = receiptName(o.date, o.description, { name: cur.name });
  if ((cur.parents ?? []).includes(month.id) && cur.name === wanted) return null;
  const f = await drive.moveRename(cur.id, { name: await freeName(month.id, wanted, cur.id), from: cur.parents?.[0], to: month.id });
  return { receipt_drive_id: f.id, receipt_drive_url: f.webViewLink ?? null, receipt_name: f.name };
}

/* ---------------- the tracker's Summary ---------------- */

export function summarise(expenses: Expense[], income: Income[], categories: Category[], today = localISO()) {
  const sum = <T,>(rows: T[], pick: (r: T) => unknown) => rows.reduce((s, r) => s + (Number(pick(r)) || 0), 0);
  const byCat = new Map(categories.map((c) => [c.id, 0]));
  let uncategorised = 0;
  for (const e of expenses) {
    if (e.category_id && byCat.has(e.category_id)) byCat.set(e.category_id, byCat.get(e.category_id)! + Number(e.amount || 0));
    else uncategorised += Number(e.amount || 0);
  }
  const totalExpenses = sum(expenses, (e) => e.amount);
  const totalIncome = sum(income, (i) => i.amount);
  return {
    today: sum(expenses.filter((e) => e.expense_date === today), (e) => e.amount),
    month: sum(expenses.filter((e) => (e.expense_date ?? "").startsWith(today.slice(0, 7))), (e) => e.amount),
    income: totalIncome, expenses: totalExpenses, net: totalIncome - totalExpenses,
    categories: categories.map((c) => ({ id: c.id, name: c.name, total: byCat.get(c.id) ?? 0 })),
    uncategorised,
  };
}

/* ---------------- sync to Excel ---------------- */

const projectLabel = (p: { number: string | null; title: string } | null) => (p ? [p.number, p.title].filter(Boolean).join(" ") : "");
const byDate = <T extends { created_at: string }>(field: keyof T) => (a: T, b: T) =>
  String(a[field] ?? "").localeCompare(String(b[field] ?? "")) || a.created_at.localeCompare(b.created_at);

export async function syncTracker() {
  const st = await getBooksState();
  if (!st.drive_tracker_file_id) throw new Error("Google Drive isn't linked yet — Settings → Google Drive.");
  const started = new Date().toISOString();
  const [template, expenses, income, fixed, categories] = await Promise.all([
    drive.download(st.drive_tracker_file_id), listExpenses(), listIncome(), listFixedCosts(), listCategories(),
  ]);
  const s = summarise(expenses, income, categories);
  const summary: Record<string, number> = {
    "today": s.today, "this month": s.month, "all time": s.expenses,
    "total income": s.income, "total expenses": s.expenses, "net": s.net,
  };
  for (const c of s.categories) summary[c.name.toLowerCase()] = c.total;

  const blob: Blob = await xl.writeTracker(template, {
    expenses: [...expenses].sort(byDate<Expense>("expense_date")).map((e) => ({
      "Date": { serial: xl.toSerial(e.expense_date) }, "Description": e.description || e.vendor || "",
      "Client / Project": projectLabel(e.project) || "N/A", "Amount": Number(e.amount) || 0,
      "Category": e.category?.name ?? "", "Payment Method": e.payment_method ?? "",
    })),
    income: [...income].sort(byDate<Income>("income_date")).map((i) => ({
      "Date": { serial: xl.toSerial(i.income_date) }, "Client / Project": i.client?.name || projectLabel(i.project),
      "Description": i.description ?? "", "Amount": Number(i.amount) || 0, "Payment Method": i.payment_method ?? "",
      "Invoice #": i.invoice?.number ?? "",
    })),
    fixed: fixed.map((f) => ({ item: f.item, category: f.category?.name ?? "", annual_cost: f.annual_cost, notes: f.notes })),
    summary,
    lists: {
      categories: categories.map((c) => c.name),
      expensePayment: (st.expense_payment_methods as string[] | null) ?? [],
      incomePayment: (st.income_payment_methods as string[] | null) ?? [],
    },
  });
  await drive.replace(st.drive_tracker_file_id, blob);
  await setBooksState({ tracker_synced_at: started });
  return { expenses: expenses.length, income: income.length, fixed: fixed.length };
}

export const isBehind = (st: Partial<BooksState>) =>
  !!st.drive_tracker_file_id && (!st.tracker_synced_at || new Date(st.books_changed_at ?? 0) > new Date(st.tracker_synced_at));

/* ---------------- import from Excel ---------------- */

type Sheet = {
  expenses: { date: string; amount: number; description: string; project: string; category: string; payment_method: string }[];
  income: { date: string; amount: number; client: string; description: string; payment_method: string; invoice: string }[];
  fixed: { item: string; category: string; annual_cost: number; notes: string }[];
};
const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const money2 = (n: unknown) => Math.round(Number(n || 0) * 100) / 100;

export type ImportPlan = Awaited<ReturnType<typeof planImport>>;

// Reads the workbook and works out what would be added, without writing anything.
export async function planImport(buffer: ArrayBuffer) {
  const sheet: Sheet = await xl.readTracker(buffer);
  const [expenses, income, fixed, categories, projects, clients] = await Promise.all([
    listExpenses(), listIncome(), listFixedCosts(), listCategories(),
    supabase.from("projects").select("id, number, title").then((r) => r.data ?? []),
    supabase.from("clients").select("id, name").then((r) => r.data ?? []),
  ]);
  const invoices = await invoicesByNumber([...new Set(sheet.income.map((i) => i.invoice).filter(Boolean))]);
  const key = (d: string, desc: unknown, amt: unknown) => `${d}|${norm(desc)}|${money2(amt)}`;
  const haveExp = new Set(expenses.map((e) => key(e.expense_date, e.description || e.vendor, e.amount)));
  const haveInc = new Set(income.map((i) => key(i.income_date, i.description, i.amount)));
  const incByInvoice = new Map(income.filter((i) => i.invoice_id).map((i) => [i.invoice_id!, i]));
  const catByName = new Map(categories.map((c) => [norm(c.name), c]));
  const haveFixed = new Set(fixed.map((f) => norm(f.item)));
  const findProject = (text: string) => {
    const t = norm(text);
    if (!t || t === "n/a" || t === "na" || t === "-") return null;
    const num = /\b(\d{5})\b/.exec(t)?.[1];
    return projects.find((p) => num && p.number === num) ?? projects.find((p) => norm(p.title) === t || (p.title && t.includes(norm(p.title)))) ?? null;
  };
  const findClient = (text: string) => {
    const t = norm(text);
    return clients.find((c) => norm(c.name) === t) ?? clients.find((c) => t && (norm(c.name).includes(t) || t.includes(norm(c.name)))) ?? null;
  };

  const plan = {
    expenses: [] as (Sheet["expenses"][number] & { project_id: string | null; projectText: string })[],
    income: [] as (Sheet["income"][number] & { client_id: string | null; project_id: string | null; invoice_id: string | null })[],
    incomeUpdates: [] as { id: string; description: string }[],
    fixed: [] as Sheet["fixed"],
    newCategories: new Set<string>(),
    skipped: 0,
    catByName,
  };
  for (const e of sheet.expenses) {
    if (haveExp.has(key(e.date, e.description, e.amount))) { plan.skipped++; continue; }
    const p = findProject(e.project);
    if (e.category && !catByName.has(norm(e.category))) plan.newCategories.add(e.category);
    plan.expenses.push({ ...e, project_id: p?.id ?? null, projectText: p || norm(e.project) === "n/a" ? "" : e.project });
  }
  for (const i of sheet.income) {
    const inv = invoices.find((x) => x.number === i.invoice);
    const existing = inv && incByInvoice.get(inv.id);
    if (existing) {                                 // the paid invoice already put it in
      if (i.description && norm(existing.description) !== norm(i.description)) plan.incomeUpdates.push({ id: existing.id, description: i.description });
      else plan.skipped++;
      continue;
    }
    if (haveInc.has(key(i.date, i.description, i.amount))) { plan.skipped++; continue; }
    plan.income.push({ ...i, client_id: findClient(i.client)?.id ?? inv?.project?.client_id ?? null, project_id: inv?.project_id ?? null, invoice_id: inv?.id ?? null });
  }
  for (const f of sheet.fixed) {
    if (haveFixed.has(norm(f.item))) { plan.skipped++; continue; }
    if (f.category && !catByName.has(norm(f.category))) plan.newCategories.add(f.category);
    plan.fixed.push(f);
  }
  return plan;
}

export async function runImport(plan: ImportPlan) {
  const cats = plan.catByName;
  for (const name of plan.newCategories) cats.set(norm(name), await createCategory(name));
  const catId = (name: string) => (name ? cats.get(norm(name))?.id ?? null : null);
  for (const e of plan.expenses) {
    await saveExpense(undefined, { expense_date: e.date, description: e.description || null, amount: money2(e.amount),
      category_id: catId(e.category), project_id: e.project_id, payment_method: e.payment_method || null,
      notes: e.projectText ? `Client / Project: ${e.projectText}` : null });
  }
  for (const i of plan.income) {
    await saveIncome(undefined, { income_date: i.date, client_id: i.client_id, project_id: i.project_id, invoice_id: i.invoice_id,
      description: i.description || null, amount: money2(i.amount), payment_method: i.payment_method || null });
  }
  for (const u of plan.incomeUpdates) await supabase.from("income").update({ description: u.description }).eq("id", u.id);
  for (const f of plan.fixed) {
    await createFixedCost({ item: f.item, category_id: catId(f.category), annual_cost: money2(f.annual_cost), notes: f.notes || null });
  }
  return { expenses: plan.expenses.length, income: plan.income.length + plan.incomeUpdates.length, fixed: plan.fixed.length };
}
