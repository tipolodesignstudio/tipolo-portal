// Expenses — project and business costs. Billable ones can be pulled onto a project's
// invoice (with optional markup), like unbilled time.
import { escapeHtml, money, date, isoDate, debounce } from "../core/format.js";
import { on } from "../core/render.js";
import {
  listExpenses, createExpense, updateExpense, deleteExpense,
  listExpenseCategories, listProjectsForInvoicing, uploadReceipt,
} from "../core/api.js";
import { openModal, confirmModal } from "../components/modal.js";
import { field, textarea, select, row, readForm, nullIfEmpty } from "../components/form.js";
import { toastOk, toastErr } from "../components/toast.js";

let state = { projectId: "", categoryId: "", billable: "", billed: "" };
let categories = [];
let projects = [];

export async function render(root, ctx) {
  ctx.setCrumbs?.("Expenses");
  try {
    [categories, projects] = await Promise.all([listExpenseCategories(), listProjectsForInvoicing()]);
  } catch { categories = []; projects = []; }

  root.innerHTML = `
    <div class="page-head">
      <div><h1>Expenses</h1><div class="muted">Project and business costs. Mark billable ones to add them to an invoice.</div></div>
      <button class="btn" data-new>+ New expense</button>
    </div>
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

  const listEl = root.querySelector("#exp-list");

  async function refresh() {
    listEl.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading…</div>`;
    try {
      const q = { ...state };
      if (q.projectId === "none") { q.projectId = ""; q._noProject = true; }
      let rows = await listExpenses(q);
      if (state.projectId === "none") rows = rows.filter((e) => !e.project_id);
      listEl.innerHTML = rows.length ? table(rows) : empty();
    } catch (err) {
      listEl.innerHTML = `<div class="empty"><h3>Couldn't load expenses</h3>
        <p class="faint">${escapeHtml(err.message)}</p></div>`;
    }
  }

  on(root, "change", "[data-f]", (e) => { state[e.target.dataset.f] = e.target.value; refresh(); });
  on(root, "click", "[data-new]", () => editExpense(null, refresh));
  on(root, "click", "[data-edit-exp]", (e, el) => editExpense(el.dataset.editExp, refresh));
  on(root, "click", "[data-del-exp]", async (e, el) => {
    const ok = await confirmModal("Delete this expense?", { title: "Delete expense", confirmText: "Delete" });
    if (!ok) return;
    try { await deleteExpense(el.dataset.delExp); toastOk("Deleted"); refresh(); }
    catch (err) { toastErr(err.message); }
  });

  await refresh();
}

function table(rows) {
  const total = rows.reduce((s, e) => s + Number(e.amount || 0), 0);
  const tax = rows.reduce((s, e) => s + Number(e.tax_amount || 0), 0);
  const unbilled = rows.filter((e) => e.billable && !e.invoice_id)
    .reduce((s, e) => s + Number(e.amount || 0) * (1 + (Number(e.markup_pct) || 0) / 100), 0);
  return `
    <div class="table-wrap">
      <table class="data">
        <thead><tr>
          <th>Date</th><th>Vendor</th><th>Category</th><th>Project</th>
          <th class="num">Amount</th><th class="num">Tax</th><th>Billing</th><th></th>
        </tr></thead>
        <tbody>
          ${rows.map((e) => `
            <tr>
              <td class="nowrap">${date(e.expense_date)}</td>
              <td>${escapeHtml(e.vendor || "—")}
                ${e.receipt_url ? ` <a href="${escapeHtml(e.receipt_url)}" target="_blank" rel="noopener" title="Receipt">🧾</a>` : ""}</td>
              <td class="muted">${escapeHtml(e.category?.name || "—")}</td>
              <td class="muted">${e.project ? escapeHtml((e.project.number ? e.project.number + " · " : "") + e.project.title) : "—"}</td>
              <td class="num">${money(e.amount)}</td>
              <td class="num">${e.tax_amount ? money(e.tax_amount) : "—"}</td>
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
          <td colspan="4"><strong>${rows.length} expense${rows.length === 1 ? "" : "s"}</strong></td>
          <td class="num"><strong>${money(total)}</strong></td>
          <td class="num">${money(tax)}</td>
          <td colspan="2" class="faint">${money(unbilled)} unbilled (with markup)</td>
        </tr></tfoot>
      </table>
    </div>`;
}

function empty() {
  return `<div class="empty"><h3>No expenses</h3>
    <p class="faint">Log a cost — attach a receipt, tie it to a project, mark it billable.</p></div>`;
}

/* ---- create / edit ---- */
export async function editExpense(existing, onSaved) {
  let e = {};
  if (existing && typeof existing === "string") {
    const all = await listExpenses({});
    e = all.find((x) => x.id === existing) || {};
  } else if (existing) {
    e = existing;
  }
  const isNew = !e.id;
  if (!categories.length) { try { categories = await listExpenseCategories(); } catch { /* */ } }
  if (!projects.length) { try { projects = await listProjectsForInvoicing(); } catch { /* */ } }

  let receiptUrl = e.receipt_url || "";

  const result = await openModal({
    title: isNew ? "New expense" : "Edit expense",
    confirmText: isNew ? "Add expense" : "Save",
    size: "lg",
    body: `<form class="form-grid">
      ${row(
        field("expense_date", "Date", e.expense_date || isoDate(), { type: "date", required: true }),
        field("vendor", "Vendor", e.vendor, { ph: "Home Depot" }),
      )}
      ${row(
        select("category_id", "Category", e.category_id || "",
          [{ value: "", label: "—" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]),
        select("project_id", "Project", e.project_id || "",
          [{ value: "", label: "None (business expense)" },
           ...projects.map((p) => ({ value: p.id, label: `${p.number ? p.number + " · " : ""}${p.title}` }))]),
      )}
      ${row(
        field("amount", "Amount (tax incl.)", e.amount, { type: "number", step: "0.01", min: 0, required: true }),
        field("tax_amount", "Tax portion", e.tax_amount, { type: "number", step: "0.01", min: 0, hint: "For your ITC tracking" }),
      )}
      ${row(
        `<div class="field"><label class="lbl">&nbsp;</label>
          <label style="display:flex;gap:8px;align-items:center;font-size:.9rem;padding:9px 0">
            <input type="checkbox" name="billable" ${e.billable ? "checked" : ""} style="width:auto" /> Billable to the client</label></div>`,
        field("markup_pct", "Markup %", e.markup_pct || 0, { type: "number", step: "0.5", min: 0, hint: "Applied when billed" }),
      )}
      ${field("payment_method", "Payment method", e.payment_method, { ph: "Visa ••1234" })}
      ${textarea("notes", "Notes", e.notes, { rows: 2 })}
      <div class="field">
        <label class="lbl">Receipt</label>
        <div class="cluster">
          <label class="btn subtle sm">Upload<input type="file" id="rcpt" accept="image/*,application/pdf" hidden /></label>
          <span id="rcpt-state" class="faint" style="font-size:.85rem">${receiptUrl ? `<a href="${escapeHtml(receiptUrl)}" target="_blank" rel="noopener">current receipt</a>` : "none"}</span>
        </div>
        <div class="hint">Needs a Storage bucket named <code>receipts</code> (see SETUP.md).</div>
      </div>
      ${!isNew && e.invoice_id ? `<div class="alert info">This expense is on an invoice.</div>` : ""}
    </form>`,
    onOpen: (dlg) => {
      const fileInput = dlg.querySelector("#rcpt");
      const stateEl = dlg.querySelector("#rcpt-state");
      fileInput.addEventListener("change", async () => {
        const file = fileInput.files[0];
        if (!file) return;
        stateEl.textContent = "uploading…";
        try { receiptUrl = await uploadReceipt(file); stateEl.innerHTML = `<a href="${escapeHtml(receiptUrl)}" target="_blank" rel="noopener">receipt uploaded ✓</a>`; }
        catch (err) { stateEl.textContent = "upload failed: " + err.message; }
      });
    },
    onConfirm: async (dlg) => {
      const f = readForm(dlg.querySelector("form"));
      if (!f.amount || Number(f.amount) <= 0) throw new Error("Enter an amount.");
      const patch = {
        expense_date: f.expense_date,
        vendor: nullIfEmpty(f.vendor),
        category_id: f.category_id || null,
        project_id: f.project_id || null,
        amount: Number(f.amount),
        tax_amount: f.tax_amount ? Number(f.tax_amount) : 0,
        billable: !!f.billable,
        markup_pct: f.markup_pct ? Number(f.markup_pct) : 0,
        payment_method: nullIfEmpty(f.payment_method),
        notes: nullIfEmpty(f.notes),
        receipt_url: receiptUrl || null,
      };
      return isNew ? await createExpense(patch) : await updateExpense(e.id, patch);
    },
  });

  if (result) { toastOk(isNew ? "Expense added" : "Expense saved"); onSaved?.(result); }
}
