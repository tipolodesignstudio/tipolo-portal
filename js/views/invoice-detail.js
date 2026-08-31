// Invoice editor / viewer.
//  draft  -> edit line items, notes, dates; "Finalize & send" assigns the number
//  sent   -> "Mark paid", "Save as PDF", "Reopen to draft"
//  paid   -> "Save as PDF", "Reopen"
import { escapeHtml, money, num, date, isoDate } from "../core/format.js";
import { on } from "../core/render.js";
import {
  getInvoice, updateInvoice, finalizeInvoice, markInvoicePaid, reopenInvoice,
  deleteInvoice, getSettings,
} from "../core/api.js";
import { computeTotals, lineAmount } from "../core/invoice-calc.js";
import { openModal, confirmModal } from "../components/modal.js";
import { field, select } from "../components/form.js";
import { toastOk, toastErr } from "../components/toast.js";
import { effectiveStatus } from "./invoices.js";
import { printInvoice } from "../print/invoice-print.js";

const TONE = { draft: "grey", sent: "amber", paid: "green", overdue: "red" };
const LABEL = { draft: "Draft", sent: "Sent", paid: "Paid", overdue: "Overdue" };

export async function render(root, ctx) {
  const id = ctx.params.id;
  root.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading…</div>`;

  let inv, settings;
  try {
    [inv, settings] = await Promise.all([getInvoice(id), getSettings().catch(() => ({}))]);
  } catch (err) {
    root.innerHTML = `<div class="empty"><h3>Invoice not found</h3>
      <p class="faint">${escapeHtml(err.message)}</p>
      <p><a href="#/invoices">← Back to invoices</a></p></div>`;
    return;
  }
  ctx.setCrumbs?.(`Invoices / ${inv.number || "draft"}`);

  // working copy for the draft editor
  let items = (inv.line_items || []).map((li) => ({ ...li }));
  const st = effectiveStatus(inv);
  const editable = inv.status === "draft";

  const recalc = () => computeTotals(items, settings.tax_lines || []);

  root.innerHTML = `
    <div class="page-head">
      <div>
        <div class="faint" style="font-size:.85rem"><a href="#/invoices">← Invoices</a></div>
        <h1>${escapeHtml(inv.number || "Draft invoice")}
          <span class="badge ${TONE[st]}">${LABEL[st]}</span></h1>
        <div class="muted">
          <a href="#/projects/${inv.project?.id}">${escapeHtml(inv.project?.number ? inv.project.number + " · " : "")}${escapeHtml(inv.project?.title || "project")}</a>
          &nbsp;·&nbsp; ${escapeHtml(inv.project?.client?.name || "")}
        </div>
      </div>
      <div class="cluster" id="inv-actions"></div>
    </div>

    <div class="card">
      <div class="form-grid cols-2">
        ${dateField("issue_date", "Issue date", inv.issue_date, editable)}
        ${dateField("due_date", "Due date", inv.due_date, editable)}
      </div>
    </div>

    <div class="card">
      <div class="between"><h2 class="mt-0">Line items</h2>
        ${editable ? `<button class="btn subtle sm" data-add-line>+ Add line</button>` : ""}</div>
      <div class="table-wrap">
        <table class="data" id="lines">
          <thead><tr>
            <th style="min-width:200px">Description</th>
            <th class="num" style="width:90px">Qty</th>
            <th class="num" style="width:120px">Unit price</th>
            <th class="num" style="width:120px">Amount</th>
            ${editable ? "<th></th>" : ""}
          </tr></thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="totals-box" id="totals"></div>
    </div>

    <div class="card">
      <label class="lbl" for="inv-notes">Notes / payment terms</label>
      <textarea id="inv-notes" rows="3" ${editable ? "" : "disabled"}>${escapeHtml(inv.notes || "")}</textarea>
    </div>`;

  const tbody = root.querySelector("#lines tbody");
  const totalsBox = root.querySelector("#totals");
  const actions = root.querySelector("#inv-actions");

  function renderLines() {
    tbody.innerHTML = items.length ? items.map((li, i) => `
      <tr data-i="${i}">
        <td>${editable
          ? `<input data-k="description" value="${escapeHtml(li.description || "")}" />`
          : escapeHtml(li.description || "")}
          ${li.kind === "time" ? `<span class="badge grey" style="margin-left:6px">time</span>` : ""}</td>
        <td class="num">${editable
          ? `<input data-k="qty" type="number" step="0.01" min="0" value="${li.qty ?? 0}" style="text-align:right" />`
          : num(li.qty, 2)}</td>
        <td class="num">${editable
          ? `<input data-k="unit_price" type="number" step="0.01" min="0" value="${li.unit_price ?? 0}" style="text-align:right" />`
          : money(li.unit_price)}</td>
        <td class="num">${money(lineAmount(li))}</td>
        ${editable ? `<td class="right"><button class="btn link" data-del-line="${i}">remove</button></td>` : ""}
      </tr>`).join("")
      : `<tr><td colspan="${editable ? 5 : 4}" class="faint" style="text-align:center;padding:20px">No line items yet.</td></tr>`;
    renderTotals();
  }

  function renderTotals() {
    const t = recalc();
    totalsBox.innerHTML = `
      <div class="totals">
        <div class="row"><span>Subtotal</span><span>${money(t.subtotal)}</span></div>
        ${t.taxLines.map((tx) => `<div class="row"><span>${escapeHtml(tx.label)} (${num(tx.rate, tx.rate % 1 ? 2 : 0)}%)</span><span>${money(tx.amount)}</span></div>`).join("")}
        <div class="row grand"><span>Total</span><span>${money(t.total)}</span></div>
      </div>`;
  }

  async function persist(extra = {}) {
    const t = recalc();
    return updateInvoice(inv.id, {
      issue_date: root.querySelector("[name=issue_date]")?.value || inv.issue_date,
      due_date: root.querySelector("[name=due_date]")?.value || null,
      notes: root.querySelector("#inv-notes").value || null,
      line_items: items,
      tax_lines: t.taxLines,
      subtotal: t.subtotal, tax_total: t.taxTotal, total: t.total,
      ...extra,
    });
  }

  function renderActions() {
    const s = inv.status;
    const btns = [];
    if (s === "draft") {
      btns.push(`<button class="btn ghost" data-save>Save draft</button>`);
      btns.push(`<button class="btn" data-finalize>Finalize &amp; send</button>`);
    } else {
      btns.push(`<button class="btn ghost" data-print>Save as PDF</button>`);
      if (s === "sent") btns.push(`<button class="btn" data-paid>Mark paid</button>`);
      if (s === "paid") btns.push(`<button class="btn ghost" data-reopen>Reopen</button>`);
      if (s === "sent") btns.push(`<button class="btn ghost sm" data-reopen>Back to draft</button>`);
    }
    btns.push(`<button class="btn ghost sm" data-delete title="Delete invoice">Delete</button>`);
    actions.innerHTML = btns.join("");
  }

  // -- draft editing --
  on(root, "input", "#lines input", (e, el) => {
    const tr = el.closest("tr"); const i = +tr.dataset.i; const k = el.dataset.k;
    items[i][k] = k === "description" ? el.value : Number(el.value);
    if (k !== "description") {
      tr.querySelector("td:nth-child(4)").textContent = money(lineAmount(items[i]));
      renderTotals();
    }
  });
  on(root, "click", "[data-add-line]", () => {
    items.push({ description: "", qty: 1, unit_price: 0, kind: "fixed", source_time_entry_ids: [] });
    renderLines();
  });
  on(root, "click", "[data-del-line]", (e, el) => { items.splice(+el.dataset.delLine, 1); renderLines(); });
  on(root, "change", "[name=issue_date],[name=due_date]", () => {});

  on(root, "click", "[data-save]", async (e, btn) => {
    btn.disabled = true;
    try { inv = await persist(); toastOk("Draft saved"); items = inv.line_items.map((x) => ({ ...x })); renderLines(); }
    catch (err) { toastErr(err.message); }
    finally { btn.disabled = false; }
  });

  on(root, "click", "[data-finalize]", async () => {
    if (!items.length) return toastErr("Add at least one line item first.");
    const ok = await confirmModal(
      "Finalize this invoice? It gets the next invoice number, its time entries are marked billed, and it can't be edited after.",
      { title: "Finalize & send", confirmText: "Finalize", danger: false });
    if (!ok) return;
    try {
      inv = await persist();
      inv = await finalizeInvoice(inv);
      toastOk(`Invoice ${inv.number} finalized`);
      ctx.navigate(ctx.path); // reload view in read mode
    } catch (err) { toastErr(err.message); }
  });

  on(root, "click", "[data-paid]", async () => {
    const res = await openModal({
      title: "Mark invoice paid",
      confirmText: "Mark paid",
      body: `<form class="form-grid">
        ${field("paid_date", "Payment date", isoDate(), { type: "date", required: true })}
        ${select("payment_method", "Method", "e-transfer",
          ["e-transfer", "cheque", "cash", "credit card", "other"].map((m) => ({ value: m, label: m })))}
      </form>`,
      onConfirm: (dlg) => {
        const f = new FormData(dlg.querySelector("form"));
        return { paid_date: f.get("paid_date"), payment_method: f.get("payment_method") };
      },
    });
    if (!res) return;
    try { inv = await markInvoicePaid(inv.id, res); toastOk("Marked paid"); ctx.navigate(ctx.path); }
    catch (err) { toastErr(err.message); }
  });

  on(root, "click", "[data-reopen]", async () => {
    const ok = await confirmModal("Reopen this invoice to draft? You can edit it again.",
      { title: "Reopen", confirmText: "Reopen", danger: false });
    if (!ok) return;
    try { inv = await reopenInvoice(inv.id); toastOk("Reopened"); ctx.navigate(ctx.path); }
    catch (err) { toastErr(err.message); }
  });

  on(root, "click", "[data-print]", () => printInvoice(inv, settings));

  on(root, "click", "[data-delete]", async () => {
    const warn = inv.status === "draft"
      ? "Delete this draft invoice?"
      : `Delete invoice ${inv.number}? Its time entries are released back to unbilled, and this will leave a gap in your invoice numbers.`;
    const ok = await confirmModal(warn, { title: "Delete invoice", confirmText: "Delete" });
    if (!ok) return;
    try { await deleteInvoice(inv.id); toastOk("Invoice deleted"); ctx.navigate("/invoices"); }
    catch (err) { toastErr(err.message); }
  });

  renderLines();
  renderActions();
}

function dateField(name, label, value, editable) {
  return `<div class="field">
    <label class="lbl" for="f_${name}">${label}</label>
    <input id="f_${name}" name="${name}" type="date" value="${value || ""}" ${editable ? "" : "disabled"} />
  </div>`;
}
