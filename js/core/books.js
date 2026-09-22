// The books: receipts filed in Google Drive, the Excel tracker kept in step, and the
// one-time import of what the tracker already holds.
//
// The portal is the record; the workbook in Drive is a copy it rewrites. Receipts go
// to Accounting/Receipts/<year>/<MM Month>/ named "YY-MM-DD Description.ext" — the
// same filing the folder already uses.

import * as drive from "./gdrive.js";
import { readTracker, writeTracker, toSerial } from "./tracker-xlsx.js";
import {
  booksState, setBooksState, listExpenses, listIncome, listFixedCosts, listExpenseCategories,
  createExpense, createIncome, updateIncome, createFixedCost, createExpenseCategory,
  listProjectsForInvoicing, listAllClients, invoicesByNumber,
} from "./api.js";
import { isoDate } from "./format.js";

export const TRACKER_NAME = "Tipolo Income & Expense Tracker.xlsx";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

/* ---------------- Drive locations ---------------- */

// Point the portal at the Accounting folder: finds Receipts and the tracker inside it,
// and — once, before the portal ever writes to it — saves a copy of the tracker as it
// was, in case anything in it didn't come across.
export async function linkDrive(link) {
  const id = drive.idFromLink(link);
  if (!id) throw new Error("Paste the link to the Accounting folder (or its ID).");
  const folder = await drive.getFile(id);
  if (folder.mimeType !== "application/vnd.google-apps.folder") throw new Error("That link is a file, not a folder.");

  const receipts = await drive.findOrCreateFolder(folder.id, "Receipts");
  const kids = await drive.listChildren(folder.id);
  const xlsx = kids.filter((f) => /\.xlsx$/i.test(f.name) && !/before portal/i.test(f.name));
  const tracker = xlsx.find((f) => f.name === TRACKER_NAME)
    || xlsx.find((f) => /income.*expense/i.test(f.name));
  if (!tracker) throw new Error(`No "${TRACKER_NAME}" in ${folder.name}.`);

  const backupName = tracker.name.replace(/\.xlsx$/i, " (before portal).xlsx");
  if (!kids.some((f) => f.name === backupName)) await drive.copy(tracker.id, folder.id, backupName);

  await setBooksState({
    drive_folder_id: folder.id, drive_receipts_folder_id: receipts.id, drive_tracker_file_id: tracker.id,
  });
  return { folder, receipts, tracker };
}

/* ---------------- receipts ---------------- */

const clean = (s) => String(s || "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();

export function receiptName(dateIso, description, file) {
  const ext = (/\.([a-z0-9]{1,5})$/i.exec(file?.name || "") || [])[1]?.toLowerCase()
    || (file?.type === "application/pdf" ? "pdf" : "jpg");
  const d = dateIso.slice(2);                         // YY-MM-DD
  return `${d} ${clean(description) || "Receipt"}`.slice(0, 120) + "." + ext;
}

async function monthFolder(receiptsId, dateIso) {
  const [y, m] = dateIso.split("-");
  const year = await drive.findOrCreateFolder(receiptsId, y);
  return drive.findOrCreateFolder(year.id, `${m} ${MONTHS[+m - 1]}`);
}

// "26-09-18 Amazon.pdf" is taken → "26-09-18 Amazon 2.pdf"
async function freeName(folderId, name, exceptId) {
  const taken = new Set((await drive.listChildren(folderId))
    .filter((f) => f.id !== exceptId).map((f) => f.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf(".");
  const stem = name.slice(0, dot), ext = name.slice(dot);
  for (let n = 2; ; n++) if (!taken.has(`${stem} ${n}${ext}`.toLowerCase())) return `${stem} ${n}${ext}`;
}

async function receiptsFolderId() {
  const st = await booksState();
  if (!st.drive_receipts_folder_id) {
    throw new Error("Google Drive isn't linked yet — Settings → Google Drive.");
  }
  return st.drive_receipts_folder_id;
}

// -> { receipt_drive_id, receipt_drive_url, receipt_name }
export async function uploadReceipt(file, { date, description }) {
  const month = await monthFolder(await receiptsFolderId(), date);
  const name = await freeName(month.id, receiptName(date, description, file));
  const f = await drive.upload(month.id, name, file);
  return { receipt_drive_id: f.id, receipt_drive_url: f.webViewLink, receipt_name: f.name };
}

// The expense's date or description changed → the receipt follows it.
export async function refileReceipt(expense, { date, description }) {
  if (!expense.receipt_drive_id) return null;
  const month = await monthFolder(await receiptsFolderId(), date);
  const current = await drive.getFile(expense.receipt_drive_id);
  const wanted = receiptName(date, description, { name: current.name });
  const inPlace = (current.parents || []).includes(month.id);
  if (inPlace && current.name === wanted) return null;
  const name = await freeName(month.id, wanted, current.id);
  const f = await drive.moveRename(current.id, { name, from: (current.parents || [])[0], to: month.id });
  return { receipt_drive_id: f.id, receipt_drive_url: f.webViewLink, receipt_name: f.name };
}

/* ---------------- summary (the tracker's Summary tab) ---------------- */

export function summarise(expenses, income, categories, today = isoDate()) {
  const month = today.slice(0, 7);
  const sum = (rows, pick) => rows.reduce((s, r) => s + (Number(pick(r)) || 0), 0);
  const byCat = new Map(categories.map((c) => [c.id, 0]));
  let uncategorised = 0;
  for (const e of expenses) {
    if (e.category_id && byCat.has(e.category_id)) byCat.set(e.category_id, byCat.get(e.category_id) + Number(e.amount || 0));
    else uncategorised += Number(e.amount || 0);
  }
  const totalExpenses = sum(expenses, (e) => e.amount);
  const totalIncome = sum(income, (i) => i.amount);
  return {
    today: sum(expenses.filter((e) => e.expense_date === today), (e) => e.amount),
    month: sum(expenses.filter((e) => (e.expense_date || "").startsWith(month)), (e) => e.amount),
    income: totalIncome,
    expenses: totalExpenses,
    net: totalIncome - totalExpenses,
    categories: categories.map((c) => ({ id: c.id, name: c.name, total: byCat.get(c.id) || 0 })),
    uncategorised,
  };
}

/* ---------------- sync to Excel ---------------- */

const projectLabel = (p) => (p ? [p.number, p.title].filter(Boolean).join(" ") : "");
const byDate = (field) => (a, b) =>
  (a[field] || "").localeCompare(b[field] || "") || (a.created_at || "").localeCompare(b.created_at || "");

export async function syncTracker() {
  const st = await booksState();
  if (!st.drive_tracker_file_id) throw new Error("Google Drive isn't linked yet — Settings → Google Drive.");
  const started = new Date().toISOString();

  const [template, expenses, income, fixed, categories] = await Promise.all([
    drive.download(st.drive_tracker_file_id),
    listExpenses({}), listIncome({}), listFixedCosts(), listExpenseCategories(),
  ]);
  const s = summarise(expenses, income, categories);
  const summary = {
    "today": s.today, "this month": s.month, "all time": s.expenses,
    "total income": s.income, "total expenses": s.expenses, "net": s.net,
  };
  for (const c of s.categories) summary[c.name.toLowerCase()] = c.total;

  const blob = await writeTracker(template, {
    expenses: [...expenses].sort(byDate("expense_date")).map((e) => ({
      "Date": { serial: toSerial(e.expense_date) },
      "Description": e.description || e.vendor || "",
      "Client / Project": projectLabel(e.project) || "N/A",
      "Amount": Number(e.amount) || 0,
      "Category": e.category?.name || "",
      "Payment Method": e.payment_method || "",
    })),
    income: [...income].sort(byDate("income_date")).map((i) => ({
      "Date": { serial: toSerial(i.income_date) },
      "Client / Project": i.client?.name || projectLabel(i.project) || "",
      "Description": i.description || "",
      "Amount": Number(i.amount) || 0,
      "Payment Method": i.payment_method || "",
      "Invoice #": i.invoice?.number || "",
    })),
    fixed: fixed.map((f) => ({ item: f.item, category: f.category?.name || "", annual_cost: f.annual_cost, notes: f.notes })),
    summary,
    lists: {
      categories: categories.map((c) => c.name),
      expensePayment: st.expense_payment_methods || [],
      incomePayment: st.income_payment_methods || [],
    },
  });
  await drive.replace(st.drive_tracker_file_id, blob);
  await setBooksState({ tracker_synced_at: started });
  return { expenses: expenses.length, income: income.length, fixed: fixed.length };
}

export const isBehind = (st) =>
  !!st.drive_tracker_file_id && (!st.tracker_synced_at || new Date(st.books_changed_at) > new Date(st.tracker_synced_at));

/* ---------------- import from Excel ---------------- */

const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
const money2 = (n) => Math.round(Number(n || 0) * 100) / 100;

// Reads the file and works out what would be added, without writing anything.
export async function planImport(buffer) {
  const sheet = await readTracker(buffer);
  const [expenses, income, fixed, categories, projects, clients] = await Promise.all([
    listExpenses({}), listIncome({}), listFixedCosts(), listExpenseCategories(),
    listProjectsForInvoicing(), listAllClients(),
  ]);
  const invoices = await invoicesByNumber([...new Set(sheet.income.map((i) => i.invoice).filter(Boolean))]);

  const expKey = (d, desc, amt) => `${d}|${norm(desc)}|${money2(amt)}`;
  const haveExp = new Set(expenses.map((e) => expKey(e.expense_date, e.description || e.vendor, e.amount)));
  const haveInc = new Set(income.map((i) => expKey(i.income_date, i.description, i.amount)));
  const incByInvoice = new Map(income.filter((i) => i.invoice_id).map((i) => [i.invoice_id, i]));
  const catByName = new Map(categories.map((c) => [norm(c.name), c]));
  const haveFixed = new Set(fixed.map((f) => norm(f.item)));

  const findProject = (text) => {
    const t = norm(text);
    if (!t || t === "n/a" || t === "na" || t === "-") return null;
    const num = /\b(\d{5})\b/.exec(t)?.[1];
    return projects.find((p) => num && p.number === num)
      || projects.find((p) => norm(p.title) === t || (p.title && t.includes(norm(p.title)))) || null;
  };
  const findClient = (text) => {
    const t = norm(text);
    return clients.find((c) => norm(c.name) === t || norm(c.company) === t)
      || clients.find((c) => t && (norm(c.name).includes(t) || t.includes(norm(c.name)))) || null;
  };

  const plan = { expenses: [], income: [], incomeUpdates: [], fixed: [], newCategories: new Set(), skipped: 0 };

  for (const e of sheet.expenses) {
    if (haveExp.has(expKey(e.date, e.description, e.amount))) { plan.skipped++; continue; }
    const project = findProject(e.project);
    if (e.category && !catByName.has(norm(e.category))) plan.newCategories.add(e.category);
    plan.expenses.push({ ...e, project_id: project?.id || null, projectText: project ? "" : (norm(e.project) === "n/a" ? "" : e.project) });
  }
  for (const i of sheet.income) {
    const inv = invoices.find((x) => x.number === i.invoice);
    const existing = inv && incByInvoice.get(inv.id);
    if (existing) {                         // the paid invoice already put it in
      if (i.description && norm(existing.description) !== norm(i.description)) {
        plan.incomeUpdates.push({ id: existing.id, description: i.description });
      } else plan.skipped++;
      continue;
    }
    if (haveInc.has(expKey(i.date, i.description, i.amount))) { plan.skipped++; continue; }
    const client = findClient(i.client);
    plan.income.push({ ...i, client_id: client?.id || (inv?.project?.client_id ?? null),
      project_id: inv?.project_id || null, invoice_id: inv?.id || null });
  }
  for (const f of sheet.fixed) {
    if (haveFixed.has(norm(f.item))) { plan.skipped++; continue; }
    if (f.category && !catByName.has(norm(f.category))) plan.newCategories.add(f.category);
    plan.fixed.push(f);
  }
  plan.catByName = catByName;
  return plan;
}

export async function runImport(plan) {
  const cats = plan.catByName;
  for (const name of plan.newCategories) cats.set(norm(name), await createExpenseCategory(name));
  const catId = (name) => (name ? cats.get(norm(name))?.id || null : null);

  for (const e of plan.expenses) {
    await createExpense({
      expense_date: e.date, description: e.description || null, amount: money2(e.amount),
      category_id: catId(e.category), project_id: e.project_id,
      payment_method: e.payment_method || null,
      notes: e.projectText ? `Client / Project: ${e.projectText}` : null,
    });
  }
  for (const i of plan.income) {
    await createIncome({
      income_date: i.date, client_id: i.client_id, project_id: i.project_id, invoice_id: i.invoice_id,
      description: i.description || null, amount: money2(i.amount), payment_method: i.payment_method || null,
    });
  }
  for (const u of plan.incomeUpdates) await updateIncome(u.id, { description: u.description });
  for (const f of plan.fixed) {
    await createFixedCost({ item: f.item, category_id: catId(f.category),
      annual_cost: money2(f.annual_cost), notes: f.notes || null });
  }
  return { expenses: plan.expenses.length, income: plan.income.length + plan.incomeUpdates.length, fixed: plan.fixed.length };
}
