// Income & Expenses — the Income & Expense Tracker, in the portal.
//
// Four tabs, one per sheet of the workbook: Expenses, Income, Summary, Fixed Costs.
// The portal is where entries are made; after each change the workbook in Google Drive
// is rewritten to match (see core/books.js). Receipts are filed straight into the
// Drive folder. Billable expenses still flow onto a project's invoice as before.

import { escapeHtml, money, date, isoDate, relTime } from "../core/format.js";
import { on } from "../core/render.js";
import {
  listExpenses, createExpense, updateExpense, deleteExpense,
  listExpenseCategories, listProjectsForInvoicing, receiptUrl,
  listIncome, createIncome, updateIncome, deleteIncome, listAllClients,
  listFixedCosts, createFixedCost, updateFixedCost, deleteFixedCost, booksState,
} from "../core/api.js";
import * as drive from "../core/gdrive.js";
import {
  uploadReceipt, refileReceipt, syncTracker, isBehind, summarise, planImport, runImport,
} from "../core/books.js";
import { openModal, confirmModal } from "../components/modal.js";
import { field, textarea, select, row, readForm, nullIfEmpty } from "../components/form.js";
import { toastOk, toastErr } from "../components/toast.js";

const TABS = [
  { id: "expenses", label: "Expenses" },
  { id: "income", label: "Income" },
  { id: "summary", label: "Summary" },
  { id: "fixed", label: "Fixed Costs" },
];
const TAB_KEY = "tipolo.books.tab";

let state = { projectId: "", categoryId: "", billable: "", billed: "", year: "" };
let categories = [];
let projects = [];
let clients = [];
let books = {};                        // app_settings: payment lists, Drive ids, sync stamps

const lists = () => ({
  expense: books.expense_payment_methods?.length ? books.expense_payment_methods
    : ["Tipolo Credit Card", "Personal Credit Card", "Cash", "E-transfer", "Cheque"],
  income: books.income_payment_methods?.length ? books.income_payment_methods
    : ["Business card", "Personal card", "Cash", "E-transfer", "Cheque"],
});
const linked = () => drive.configured() && !!books.drive_tracker_file_id;

async function loadRefs() {
  const [c, p, cl, b] = await Promise.allSettled([
    listExpenseCategories(), listProjectsForInvoicing(), listAllClients(), booksState(),
  ]);
  categories = c.value || [];
  projects = p.value || [];
  clients = cl.value || [];
  books = b.value || {};
  return b.status === "rejected" ? b.reason : null;
}

/* ---------------- keeping the workbook in step ---------------- */

let syncing = null;
let syncTimer = null;
const syncListeners = new Set();
const paintSync = () => syncListeners.forEach((fn) => fn());

// After any change: pick up the new "changed" stamp, and if Drive is connected, write
// the workbook a moment later (several quick edits → one write).
export async function booksChanged() {
  try { books = { ...books, ...(await booksState()) }; } catch { /* */ }
  paintSync();
  if (!linked() || !drive.connected()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => runSync().catch(() => {}), 1200);
}

async function runSync() {
  if (syncing) return syncing;
  paintSync();
  syncing = (async () => {
    try {
      await syncTracker();
      books = { ...books, ...(await booksState()) };
    } finally { syncing = null; paintSync(); }
  })();
  paintSync();
  return syncing;
}

function syncChip() {
  if (!drive.configured()) {
    return `<span class="faint" style="font-size:.85rem" title="See SETUP.md → Google Drive">Excel sync is off</span>`;
  }
  if (!books.drive_tracker_file_id) {
    return `<a class="btn subtle sm" href="#/settings" data-goto-drive>Link Google Drive</a>`;
  }
  if (syncing) return `<span class="badge grey"><span class="spinner"></span> Updating Excel…</span>`;
  const behind = isBehind(books);
  const when = books.tracker_synced_at ? `synced ${relTime(books.tracker_synced_at)}` : "never synced";
  return `
    <span class="badge ${behind ? "amber" : "green"}" title="${escapeHtml(when)}">
      ${behind ? "Excel is behind" : "Excel up to date"}</span>
    ${behind || !drive.connected()
      ? `<button class="btn subtle sm" data-sync>${drive.connected() ? "Sync now" : "Connect Google &amp; sync"}</button>`
      : `<button class="btn link sm" data-sync title="${escapeHtml(when)}">sync again</button>`}`;
}

/* ---------------- page ---------------- */

export async function render(root, ctx) {
  ctx.setCrumbs?.("Income & Expenses");
  root.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading…</div>`;
  const setupErr = await loadRefs();
  drive.loadGoogle().catch(() => {});

  let tab = localStorage.getItem(TAB_KEY);
  if (!TABS.some((t) => t.id === tab)) tab = TABS[0].id;

  root.innerHTML = `
    <div class="page-head">
      <div><h1>Income &amp; Expenses</h1>
        <div class="muted">The Income &amp; Expense Tracker. Entries made here are copied to the Excel file in Google Drive.</div></div>
      <div class="cluster">
        <span class="cluster" id="sync-chip">${syncChip()}</span>
        <label class="btn subtle sm" title="Bring in entries from the tracker workbook">Import from Excel…
          <input type="file" id="xl-import" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden /></label>
        <button class="btn" data-new>+ New</button>
      </div>
    </div>
    ${setupErr ? `<div class="alert error">${escapeHtml(setupErr.message)}</div>` : ""}
    <div class="part-nav" id="books-tabs">
      ${TABS.map((t) => `<button type="button" data-tab="${t.id}">${t.label}</button>`).join("")}
    </div>
    <div id="books-body"></div>`;

  const body = root.querySelector("#books-body");
  const chip = root.querySelector("#sync-chip");
  const newBtn = root.querySelector("[data-new]");

  const repaint = () => { if (chip.isConnected) chip.innerHTML = syncChip(); };
  syncListeners.clear();
  syncListeners.add(repaint);
  const offDrive = drive.onConnectionChange(repaint);
  const tick = setInterval(() => { if (!chip.isConnected) { clearInterval(tick); offDrive(); } else repaint(); }, 30_000);

  const show = async (id) => {
    tab = id;
    try { localStorage.setItem(TAB_KEY, id); } catch { /* */ }
    root.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === id));
    newBtn.hidden = id === "summary";
    newBtn.textContent = { expenses: "+ New expense", income: "+ New income", fixed: "+ Add fixed cost" }[id] || "+ New";
    // a fresh pane each time, so delegated listeners never pile up on one element
    const pane = document.createElement("div");
    pane.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading…</div>`;
    body.replaceChildren(pane);
    const again = () => show(id);
    try {
      if (id === "expenses") await expensesTab(pane);
      if (id === "income") await incomeTab(pane, again);
      if (id === "summary") await summaryTab(pane, again);
      if (id === "fixed") await fixedTab(pane, again);
    } catch (err) {
      pane.innerHTML = `<div class="empty"><h3>Couldn't load this tab</h3>
        <p class="faint">${escapeHtml(err.message)}</p></div>`;
    }
  };
  const reload = () => show(tab);

  on(root, "click", "[data-tab]", (e, b) => show(b.dataset.tab));
  on(root, "click", "[data-goto-drive]", () => { try { localStorage.setItem("tipolo.settings.tab", "drive"); } catch { /* */ } });
  newBtn.addEventListener("click", async () => {
    if (tab === "expenses") editExpense(null, reload);
    if (tab === "income") editIncome(null, reload);
    if (tab === "fixed") {
      try { await createFixedCost({ item: "" }); booksChanged(); await reload();
        body.querySelector("[data-fc]:last-child [data-fc-field=item]")?.focus(); }
      catch (err) { toastErr(err.message); }
    }
  });

  on(root, "click", "[data-sync]", (e) => {
    const go = drive.connected() ? Promise.resolve() : drive.connect();   // popup: must start in the click
    go.then(() => runSync())
      .then(() => toastOk("Excel file updated in Google Drive"))
      .catch((err) => toastErr(err.message));
  });

  root.querySelector("#xl-import").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (file) importFlow(file, reload);
  });

  await show(tab);
}

/* ---------------- Expenses ---------------- */

async function expensesTab(host) {
  host.innerHTML = `
    <div class="filters">
      <select data-f="projectId">
        <option value="">All projects</option>
        <option value="none">No project (business)</option>
        ${projects.map((p) => `<option value="${p.id}" ${state.projectId === p.id ? "selected" : ""}>${escapeHtml(p.number ? p.number + " · " : "")}${escapeHtml(p.title)}</option>`).join("")}
      </select>
      <select data-f="categoryId">
        <option value="">All categories</option>
        ${categories.map((c) => `<option value="${c.id}" ${state.categoryId === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
      </select>
      <select data-f="billable">
        <option value="">Billable + not</option>
        <option value="yes" ${state.billable === "yes" ? "selected" : ""}>Billable</option>
        <option value="no" ${state.billable === "no" ? "selected" : ""}>Not billable</option>
      </select>
      <select data-f="billed">
        <option value="">Any</option>
        <option value="unbilled" ${state.billed === "unbilled" ? "selected" : ""}>Unbilled</option>
        <option value="billed" ${state.billed === "billed" ? "selected" : ""}>Billed</option>
      </select>
    </div>
    <div id="exp-list"><div class="loading-row"><span class="spinner"></span> Loading…</div></div>`;
  const listEl = host.querySelector("#exp-list");

  let rows = [];
  async function refresh() {
    const q = { ...state };
    if (q.projectId === "none") q.projectId = "";
    rows = await listExpenses(q);
    if (state.projectId === "none") rows = rows.filter((e) => !e.project_id);
    listEl.innerHTML = rows.length ? expenseTable(rows) : `<div class="empty"><h3>No expenses</h3>
      <p class="faint">Log a cost and attach its receipt. It's filed in Google Drive and added to the Excel tracker.</p></div>`;
  }

  on(host, "change", "[data-f]", (e) => { state[e.target.dataset.f] = e.target.value; refresh().catch((err) => toastErr(err.message)); });
  on(host, "click", "[data-receipt]", (e, el) => openReceipt(el.dataset.receipt));
  on(host, "click", "[data-edit-exp]", (e, el) => editExpense(rows.find((x) => x.id === el.dataset.editExp), refresh));
  on(host, "click", "[data-del-exp]", async (e, el) => {
    const ex = rows.find((x) => x.id === el.dataset.delExp);
    const ok = await confirmModal(ex?.receipt_drive_id
      ? "Delete this expense? Its receipt stays in Google Drive."
      : "Delete this expense?", { title: "Delete expense", confirmText: "Delete" });
    if (!ok) return;
    try { await deleteExpense(el.dataset.delExp); toastOk("Deleted"); booksChanged(); refresh(); }
    catch (err) { toastErr(err.message); }
  });

  await refresh();
}

export const receiptLink = (e) => e?.receipt_drive_url || e?.receipt_url || "";

function expenseTable(rows) {
  const total = rows.reduce((s, e) => s + Number(e.amount || 0), 0);
  const tax = rows.reduce((s, e) => s + Number(e.tax_amount || 0), 0);
  const unbilled = rows.filter((e) => e.billable && !e.invoice_id)
    .reduce((s, e) => s + Number(e.amount || 0) * (1 + (Number(e.markup_pct) || 0) / 100), 0);
  return `
    <div class="table-wrap">
      <table class="data">
        <thead><tr>
          <th>Date</th><th>Description</th><th>Client / Project</th><th>Category</th>
          <th>Payment</th><th class="num">Amount</th><th>Billing</th><th></th>
        </tr></thead>
        <tbody>
          ${rows.map((e) => `
            <tr>
              <td class="nowrap">${date(e.expense_date)}</td>
              <td>${escapeHtml(e.description || e.vendor || "—")}
                ${receiptLink(e) ? ` <button class="btn link" data-receipt="${escapeHtml(receiptLink(e))}" title="${escapeHtml(e.receipt_name || "View receipt")}">🧾</button>` : ""}</td>
              <td class="muted">${e.project ? escapeHtml((e.project.number ? e.project.number + " · " : "") + e.project.title) : "—"}</td>
              <td class="muted">${escapeHtml(e.category?.name || "—")}</td>
              <td class="muted">${escapeHtml(e.payment_method || "—")}</td>
              <td class="num">${money(e.amount)}</td>
              <td>${e.billable
                ? (e.invoice_id ? `<span class="badge green">billed</span>`
                  : `<span class="badge amber">billable${e.markup_pct ? ` +${e.markup_pct}%` : ""}</span>`)
                : `<span class="badge grey">internal</span>`}</td>
              <td class="right nowrap">
                <button class="btn link" data-edit-exp="${e.id}">edit</button>
                <button class="btn link" data-del-exp="${e.id}">del</button>
              </td>
            </tr>`).join("")}
        </tbody>
        <tfoot><tr>
          <td colspan="5"><strong>${rows.length} expense${rows.length === 1 ? "" : "s"}</strong>
            ${tax ? `<span class="faint"> · ${money(tax)} tax</span>` : ""}</td>
          <td class="num"><strong>${money(total)}</strong></td>
          <td colspan="2" class="faint">${money(unbilled)} unbilled (with markup)</td>
        </tr></tfoot>
      </table>
    </div>`;
}

// Drive links open as they are; an older receipt in the portal's private bucket gets a
// fresh signed URL.
export async function openReceipt(link) {
  const w = window.open("", "_blank");           // open synchronously to dodge popup blockers
  try {
    const url = /^https:\/\/(drive|docs)\.google\.com\//.test(link) ? link : await receiptUrl(link);
    if (w) w.location = url; else window.location.href = url;
  } catch (err) {
    if (w) w.close();
    toastErr("Couldn't open receipt: " + err.message);
  }
}

const withCurrent = (list, value) => (value && !list.includes(value) ? [...list, value] : list);

export async function editExpense(existing, onSaved) {
  const e = existing || {};
  const isNew = !e.id;
  if (!categories.length || !projects.length || !books.expense_payment_methods) await loadRefs();

  let pendingFile = null;
  const canAttach = linked();
  const methods = withCurrent(lists().expense, e.payment_method);

  const result = await openModal({
    title: isNew ? "New expense" : "Edit expense",
    confirmText: isNew ? "Add expense" : "Save",
    size: "lg",
    body: `<form class="form-grid">
      ${row(
        field("expense_date", "Date", e.expense_date || isoDate(), { type: "date", required: true }),
        field("description", "Description", e.description || e.vendor, { ph: "Office table", required: true }),
      )}
      ${row(
        select("project_id", "Client / Project", e.project_id || "",
          [{ value: "", label: "N/A (business expense)" },
           ...projects.map((p) => ({ value: p.id, label: `${p.number ? p.number + " · " : ""}${p.title}` }))]),
        field("amount", "Amount (tax incl.)", e.amount, { type: "number", step: "0.01", min: 0, required: true }),
      )}
      ${row(
        select("category_id", "Category", e.category_id || "",
          [{ value: "", label: "Uncategorized" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]),
        select("payment_method", "Payment method", e.payment_method || "",
          [{ value: "", label: "—" }, ...methods]),
      )}
      <div class="field">
        <label class="lbl">Receipt</label>
        <div class="cluster">
          <label class="btn subtle sm ${canAttach ? "" : "disabled"}">${receiptLink(e) ? "Replace" : "Attach"}
            <input type="file" id="rcpt" accept="image/*,application/pdf" hidden ${canAttach ? "" : "disabled"} /></label>
          <span id="rcpt-state" class="faint" style="font-size:.85rem">${receiptLink(e)
            ? `<button type="button" class="btn link" id="rcpt-view">${escapeHtml(e.receipt_name || "view current receipt")}</button>` : "none"}</span>
        </div>
        <div class="hint">${canAttach
          ? "Filed in Google Drive under Receipts / year / month, named by date and description."
          : drive.configured() ? "Link Google Drive in Settings to attach receipts." : "Google Drive isn't set up yet (SETUP.md → Google Drive)."}</div>
      </div>
      <details ${e.billable || Number(e.tax_amount) || e.notes ? "open" : ""}>
        <summary class="faint" style="cursor:pointer;font-size:.9rem;margin:4px 0 10px">Tax, billing and notes</summary>
        ${row(
          field("tax_amount", "Tax portion", e.tax_amount, { type: "number", step: "0.01", min: 0, hint: "For your ITC tracking" }),
          field("markup_pct", "Markup %", e.markup_pct || 0, { type: "number", step: "0.5", min: 0, hint: "Applied when billed" }),
        )}
        <label style="display:flex;gap:8px;align-items:center;font-size:.9rem;padding:4px 0 12px">
          <input type="checkbox" name="billable" ${e.billable ? "checked" : ""} style="width:auto" /> Billable to the client</label>
        ${textarea("notes", "Notes", e.notes, { rows: 2 })}
      </details>
      ${!isNew && e.invoice_id ? `<div class="alert info">This expense is on an invoice.</div>` : ""}
    </form>`,
    onOpen: (dlg) => {
      const input = dlg.querySelector("#rcpt");
      const stateEl = dlg.querySelector("#rcpt-state");
      dlg.querySelector("#rcpt-view")?.addEventListener("click", () => openReceipt(receiptLink(e)));
      input?.addEventListener("change", () => {
        pendingFile = input.files[0] || null;
        stateEl.textContent = pendingFile ? `${pendingFile.name} — files to Drive when you save` : "none";
      });
    },
    onConfirm: async (dlg) => {
      const f = readForm(dlg.querySelector("form"));
      if (!f.amount || Number(f.amount) <= 0) throw new Error("Enter an amount.");
      const moved = e.receipt_drive_id &&
        (f.expense_date !== e.expense_date || f.description !== (e.description || e.vendor || ""));
      // Google's sign-in popup has to open inside this click, before anything is awaited.
      const needDrive = pendingFile || moved;
      const auth = needDrive && !drive.connected() ? drive.connect() : Promise.resolve();

      const patch = {
        expense_date: f.expense_date,
        description: nullIfEmpty(f.description),
        category_id: f.category_id || null,
        project_id: f.project_id || null,
        amount: Number(f.amount),
        tax_amount: f.tax_amount ? Number(f.tax_amount) : 0,
        billable: !!f.billable,
        markup_pct: f.markup_pct ? Number(f.markup_pct) : 0,
        payment_method: nullIfEmpty(f.payment_method),
        notes: nullIfEmpty(f.notes),
      };

      if (pendingFile) {
        await auth;
        Object.assign(patch, await uploadReceipt(pendingFile, { date: f.expense_date, description: f.description }));
      } else if (moved) {
        try { await auth; Object.assign(patch, await refileReceipt(e, { date: f.expense_date, description: f.description }) || {}); }
        catch (err) { toastErr("Saved, but the receipt wasn't renamed in Drive: " + err.message); }
      }
      return isNew ? await createExpense(patch) : await updateExpense(e.id, patch);
    },
  });

  if (result) { toastOk(isNew ? "Expense added" : "Expense saved"); booksChanged(); onSaved?.(result); }
}

/* ---------------- Income ---------------- */

async function incomeTab(host, reload) {
  const rows = await listIncome({});
  const total = rows.reduce((s, i) => s + Number(i.amount || 0), 0);
  host.innerHTML = rows.length ? `
    <div class="table-wrap">
      <table class="data">
        <thead><tr>
          <th>Date</th><th>Client / Project</th><th>Description</th><th class="num">Amount</th>
          <th>Payment</th><th>Invoice #</th><th></th>
        </tr></thead>
        <tbody>
          ${rows.map((i) => `
            <tr>
              <td class="nowrap">${date(i.income_date)}</td>
              <td>${escapeHtml(i.client?.name || (i.project ? i.project.title : "—"))}
                ${i.project ? `<div class="faint" style="font-size:.8rem">${escapeHtml([i.project.number, i.project.title].filter(Boolean).join(" · "))}</div>` : ""}</td>
              <td>${escapeHtml(i.description || "—")}</td>
              <td class="num">${money(i.amount)}</td>
              <td class="muted">${escapeHtml(i.payment_method || "—")}</td>
              <td>${i.invoice ? `<a href="#/invoices/${i.invoice.id}">${escapeHtml(i.invoice.number || "draft")}</a>` : `<span class="faint">—</span>`}</td>
              <td class="right nowrap">
                <button class="btn link" data-edit-inc="${i.id}">edit</button>
                <button class="btn link" data-del-inc="${i.id}">del</button>
              </td>
            </tr>`).join("")}
        </tbody>
        <tfoot><tr>
          <td colspan="3"><strong>${rows.length} payment${rows.length === 1 ? "" : "s"}</strong></td>
          <td class="num"><strong>${money(total)}</strong></td><td colspan="3"></td>
        </tr></tfoot>
      </table>
    </div>
    <p class="faint" style="font-size:.85rem">Marking an invoice paid adds it here on its own.</p>`
    : `<div class="empty"><h3>No income yet</h3>
      <p class="faint">Marking an invoice paid adds it here on its own. Log anything else with + New income.</p></div>`;

  on(host, "click", "[data-edit-inc]", (e, el) => editIncome(rows.find((x) => x.id === el.dataset.editInc), reload));
  on(host, "click", "[data-del-inc]", async (e, el) => {
    const inc = rows.find((x) => x.id === el.dataset.delInc);
    const ok = await confirmModal(inc?.invoice_id
      ? "Delete this payment? The invoice stays marked paid — reopen the invoice instead if the payment didn't happen."
      : "Delete this payment?", { title: "Delete income", confirmText: "Delete" });
    if (!ok) return;
    try { await deleteIncome(el.dataset.delInc); toastOk("Deleted"); booksChanged(); reload(); }
    catch (err) { toastErr(err.message); }
  });
}

async function editIncome(existing, onSaved) {
  const i = existing || {};
  const isNew = !i.id;
  if (!clients.length) await loadRefs();
  const methods = withCurrent(lists().income, i.payment_method);

  const result = await openModal({
    title: isNew ? "New income" : "Edit income",
    confirmText: isNew ? "Add income" : "Save",
    size: "lg",
    body: `<form class="form-grid">
      ${row(
        field("income_date", "Date", i.income_date || isoDate(), { type: "date", required: true }),
        field("amount", "Amount", i.amount, { type: "number", step: "0.01", min: 0, required: true }),
      )}
      ${row(
        select("client_id", "Client", i.client_id || "",
          [{ value: "", label: "—" }, ...clients.map((c) => ({ value: c.id, label: c.name }))]),
        select("project_id", "Project", i.project_id || "",
          [{ value: "", label: "—" },
           ...projects.map((p) => ({ value: p.id, label: `${p.number ? p.number + " · " : ""}${p.title}` }))]),
      )}
      ${field("description", "Description", i.description, { ph: "Task 1: Template exploration & mock-ups" })}
      ${select("payment_method", "Payment method", i.payment_method || "", [{ value: "", label: "—" }, ...methods])}
      ${i.invoice ? `<div class="alert info">From invoice ${escapeHtml(i.invoice.number || "")}, added when it was marked paid.</div>` : ""}
    </form>`,
    onConfirm: async (dlg) => {
      const f = readForm(dlg.querySelector("form"));
      if (!f.amount || Number(f.amount) <= 0) throw new Error("Enter an amount.");
      const patch = {
        income_date: f.income_date, amount: Number(f.amount),
        client_id: f.client_id || null, project_id: f.project_id || null,
        description: nullIfEmpty(f.description), payment_method: nullIfEmpty(f.payment_method),
      };
      return isNew ? await createIncome(patch) : await updateIncome(i.id, patch);
    },
  });
  if (result) { toastOk(isNew ? "Income added" : "Income saved"); booksChanged(); onSaved?.(result); }
}

/* ---------------- Summary ---------------- */

async function summaryTab(host, reload) {
  const [expenses, income] = await Promise.all([listExpenses({}), listIncome({})]);
  const years = [...new Set([...expenses.map((e) => e.expense_date), ...income.map((i) => i.income_date)]
    .filter(Boolean).map((d) => d.slice(0, 4)))].sort().reverse();
  const y = state.year;
  const inYear = (d) => !y || (d || "").startsWith(y);
  const all = summarise(expenses, income, categories);
  const s = summarise(expenses.filter((e) => inYear(e.expense_date)), income.filter((i) => inYear(i.income_date)), categories);
  const max = Math.max(1, ...s.categories.map((c) => c.total));

  host.innerHTML = `
    <div class="between" style="margin-bottom:12px">
      <h2 class="mt-0">Tipolo Design Studio — Financial Summary</h2>
      <select data-year style="max-width:160px">
        <option value="">All time</option>
        ${years.map((yr) => `<option value="${yr}" ${yr === y ? "selected" : ""}>${yr}</option>`).join("")}
      </select>
    </div>
    <div class="grid-cards" style="margin-bottom:18px">
      <div class="stat"><div class="k">Spent today</div><div class="v">${money(all.today)}</div></div>
      <div class="stat"><div class="k">Spent this month</div><div class="v">${money(all.month)}</div></div>
      <div class="stat"><div class="k">Total income</div><div class="v">${money(s.income)}</div><div class="d">${y || "all time"}</div></div>
      <div class="stat"><div class="k">Total expenses</div><div class="v">${money(s.expenses)}</div><div class="d">${y || "all time"}</div></div>
      <div class="stat"><div class="k">Net</div><div class="v" style="color:${s.net < 0 ? "var(--danger, #9b3b2a)" : "inherit"}">${money(s.net)}</div><div class="d">income − expenses</div></div>
    </div>
    <div class="table-wrap">
      <table class="data">
        <thead><tr><th>Category</th><th class="num">Total</th><th style="width:40%"></th></tr></thead>
        <tbody>
          ${s.categories.map((c) => `
            <tr>
              <td>${escapeHtml(c.name)}</td>
              <td class="num">${money(c.total)}</td>
              <td><div style="height:8px;border-radius:4px;background:var(--accent);opacity:.75;width:${(c.total / max) * 100}%"></div></td>
            </tr>`).join("")}
          ${s.uncategorised ? `<tr><td class="faint">Uncategorized</td><td class="num">${money(s.uncategorised)}</td><td></td></tr>` : ""}
        </tbody>
        <tfoot><tr><td><strong>Total</strong></td><td class="num"><strong>${money(s.expenses)}</strong></td><td></td></tr></tfoot>
      </table>
    </div>`;

  host.querySelector("[data-year]").addEventListener("change", (e) => { state.year = e.target.value; reload(); });
}

/* ---------------- Fixed Costs ---------------- */

async function fixedTab(host, reload) {
  const rows = await listFixedCosts();
  const total = () => rows.reduce((s, r) => s + (Number(r.annual_cost) || 0), 0);
  const catOptions = (v) => `<option value="">—</option>` + categories.map((c) =>
    `<option value="${c.id}" ${c.id === v ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("");

  host.innerHTML = `
    <div class="between" style="margin-bottom:10px">
      <h2 class="mt-0">Annual Fixed Costs</h2>
      <span class="muted">What the studio spends in a year before any project.</span>
    </div>
    ${rows.length ? `
    <div class="table-wrap">
      <table class="data fixed-costs">
        <thead><tr><th>Cost item</th><th>Category</th><th class="num">Annual cost</th><th>Notes</th><th></th></tr></thead>
        <tbody>
          ${rows.map((r) => `
            <tr data-fc="${r.id}">
              <td><input data-fc-field="item" value="${escapeHtml(r.item || "")}" placeholder="Cost item" /></td>
              <td><select data-fc-field="category_id">${catOptions(r.category_id)}</select></td>
              <td class="num"><input data-fc-field="annual_cost" type="number" step="0.01" min="0"
                    value="${r.annual_cost ?? ""}" style="text-align:right;max-width:130px" /></td>
              <td><input data-fc-field="notes" value="${escapeHtml(r.notes || "")}" placeholder="Notes" /></td>
              <td class="right"><button type="button" class="icon-btn" data-fc-del title="Delete">✕</button></td>
            </tr>`).join("")}
        </tbody>
        <tfoot><tr>
          <td colspan="2"><strong>Total annual fixed costs</strong></td>
          <td class="num"><strong id="fc-total">${money(total())}</strong></td>
          <td class="faint" id="fc-month">${money(total() / 12)} a month</td><td></td>
        </tr></tfoot>
      </table>
    </div>` : `<div class="empty"><h3>No fixed costs</h3>
      <p class="faint">Add memberships, insurance, software, rent — anything you pay every year.</p></div>`}`;

  const commit = async (el) => {
    const tr = el.closest("[data-fc]");
    const r = rows.find((x) => x.id === tr.dataset.fc);
    const fieldName = el.dataset.fcField;
    let value = el.value.trim();
    if (fieldName === "annual_cost") value = value === "" ? 0 : Number(value);
    if (fieldName === "category_id" || fieldName === "notes") value = value || null;
    if (String(r[fieldName] ?? "") === String(value ?? "")) return;
    try {
      Object.assign(r, await updateFixedCost(r.id, { [fieldName]: value }));
      host.querySelector("#fc-total").textContent = money(total());
      host.querySelector("#fc-month").textContent = `${money(total() / 12)} a month`;
      booksChanged();
    } catch (err) { toastErr(err.message); }
  };
  on(host, "focusout", "[data-fc-field]", (e, el) => { if (el.tagName !== "SELECT") commit(el); });
  on(host, "change", "select[data-fc-field]", (e, el) => commit(el));
  on(host, "keydown", "input[data-fc-field]", (e, el) => { if (e.key === "Enter") { e.preventDefault(); el.blur(); } });
  on(host, "click", "[data-fc-del]", async (e, btn) => {
    const ok = await confirmModal("Delete this fixed cost?", { title: "Delete", confirmText: "Delete" });
    if (!ok) return;
    try { await deleteFixedCost(btn.closest("[data-fc]").dataset.fc); booksChanged(); reload(); }
    catch (err) { toastErr(err.message); }
  });
}

/* ---------------- Import from Excel ---------------- */

async function importFlow(file, onDone) {
  let plan;
  try { plan = await planImport(await file.arrayBuffer()); }
  catch (err) { toastErr("Couldn't read that workbook: " + err.message); return; }

  const n = plan.expenses.length + plan.income.length + plan.incomeUpdates.length + plan.fixed.length;
  const li = (count, what) => (count ? `<li>${count} ${what}</li>` : "");
  const ok = await openModal({
    title: "Import from Excel",
    confirmText: n ? `Import ${n}` : "Close",
    body: n ? `
      <p>From <strong>${escapeHtml(file.name)}</strong>:</p>
      <ul>
        ${li(plan.expenses.length, plan.expenses.length === 1 ? "expense" : "expenses")}
        ${li(plan.income.length, plan.income.length === 1 ? "income entry" : "income entries")}
        ${li(plan.incomeUpdates.length, "paid invoice descriptions, taken from the sheet")}
        ${li(plan.fixed.length, plan.fixed.length === 1 ? "fixed cost" : "fixed costs")}
        ${plan.newCategories.size ? `<li>new categories: ${[...plan.newCategories].map(escapeHtml).join(", ")}</li>` : ""}
      </ul>
      ${plan.skipped ? `<p class="faint">${plan.skipped} already in the portal — left alone.</p>` : ""}
      <p class="faint" style="font-size:.85rem">Receipts aren't in the workbook. Attach them to each expense afterwards.</p>`
      : `<p>Everything in <strong>${escapeHtml(file.name)}</strong> is already in the portal.</p>`,
    onConfirm: async () => (n ? runImport(plan) : null),
  });
  if (ok && n) {
    toastOk(`Imported ${ok.expenses} expenses, ${ok.income} income, ${ok.fixed} fixed costs`);
    await loadRefs();
    booksChanged();
    onDone?.();
  }
}
