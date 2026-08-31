// Invoice list + "New invoice" flow. One invoice belongs to one project;
// its number is YYNNN-XX (project number + per-project sequence).
import { escapeHtml, money, date, isoDate } from "../core/format.js";
import { on } from "../core/render.js";
import {
  listInvoices, listProjectsForInvoicing, buildTimeLineItems, createInvoice, getSettings,
} from "../core/api.js";
import { computeTotals } from "../core/invoice-calc.js";
import { openModal } from "../components/modal.js";
import { field, select } from "../components/form.js";
import { toastErr } from "../components/toast.js";

let state = { status: "" };

const STATUS_META = {
  draft: { label: "Draft", tone: "grey" },
  sent: { label: "Sent", tone: "amber" },
  paid: { label: "Paid", tone: "green" },
  overdue: { label: "Overdue", tone: "red" },
};

export function effectiveStatus(inv) {
  if (inv.status === "sent" && inv.due_date && inv.due_date < isoDate()) return "overdue";
  return inv.status;
}

export async function render(root, ctx) {
  ctx.setCrumbs?.("Invoices");
  root.innerHTML = `
    <div class="page-head">
      <div><h1>Invoices</h1><div class="muted">Bill a project for time and fixed fees.</div></div>
      <button class="btn" data-new-invoice>+ New invoice</button>
    </div>
    <div class="filters">
      <select data-f="status">
        ${["", "draft", "sent", "overdue", "paid"].map((s) =>
          `<option value="${s}" ${state.status === s ? "selected" : ""}>${s ? STATUS_META[s].label : "All statuses"}</option>`).join("")}
      </select>
    </div>
    <div id="inv-list"><div class="loading-row"><span class="spinner"></span> Loading…</div></div>`;

  const listEl = root.querySelector("#inv-list");

  async function refresh() {
    listEl.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading…</div>`;
    try {
      const rows = await listInvoices(state);
      listEl.innerHTML = rows.length ? table(rows) : empty();
    } catch (err) {
      listEl.innerHTML = `<div class="empty"><h3>Couldn't load invoices</h3>
        <p class="faint">${escapeHtml(err.message)}</p></div>`;
    }
  }

  on(root, "change", "[data-f]", (e) => { state[e.target.dataset.f] = e.target.value; refresh(); });
  on(root, "click", "[data-new-invoice]", () => newInvoiceFlow(ctx));
  on(root, "click", "tr[data-id]", (e, tr) => ctx.navigate(`/invoices/${tr.dataset.id}`));

  await refresh();
}

function table(rows) {
  return `
    <div class="table-wrap">
      <table class="data">
        <thead><tr>
          <th>Number</th><th>Project</th><th>Client</th><th>Issued</th><th>Due</th>
          <th class="num">Total</th><th>Status</th>
        </tr></thead>
        <tbody>
          ${rows.map((inv) => {
            const st = effectiveStatus(inv);
            const m = STATUS_META[st] || STATUS_META.draft;
            return `
            <tr class="clickable" data-id="${inv.id}">
              <td>${escapeHtml(inv.number || "— draft")}</td>
              <td class="muted">${escapeHtml(inv.project?.title || "—")}</td>
              <td class="muted">${escapeHtml(inv.project?.client?.name || "—")}</td>
              <td class="muted nowrap">${inv.issue_date ? date(inv.issue_date) : "—"}</td>
              <td class="muted nowrap">${inv.due_date ? date(inv.due_date) : "—"}</td>
              <td class="num">${money(inv.total)}</td>
              <td><span class="badge ${m.tone}">${m.label}</span></td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>`;
}

function empty() {
  return `<div class="empty"><h3>No invoices${state.status ? " with that status" : ""}</h3>
    <p class="faint">Create one from a project's unbilled time or from scratch.</p></div>`;
}

/* ---- new invoice: pick project, pull its unbilled time, create draft ---- */
export async function newInvoiceFlow(ctx, presetProjectId = "") {
  let projects, settings;
  try {
    [projects, settings] = await Promise.all([
      listProjectsForInvoicing(),
      getSettings().catch(() => ({})),
    ]);
  } catch (err) { toastErr(err.message); return; }

  if (!projects.length) {
    await openModal({ title: "Create a project first",
      body: `<p>Invoices belong to a project. Add a project, then invoice it.</p>`,
      confirmText: "OK", onConfirm: () => true });
    return;
  }

  const result = await openModal({
    title: "New invoice",
    confirmText: "Create draft",
    body: `<form class="form-grid">
      ${select("project_id", "Project", presetProjectId || projects[0].id,
        projects.map((p) => ({
          value: p.id,
          label: `${p.number ? p.number + " · " : ""}${p.title}${p.client?.name ? ` — ${p.client.name}` : ""}`,
        })), { required: true })}
      <label style="display:flex;gap:8px;align-items:center;font-size:.9rem">
        <input type="checkbox" name="pull_time" checked style="width:auto" />
        Pull this project's unbilled billable time into line items
      </label>
      ${field("issue_date", "Issue date", isoDate(), { type: "date", required: true })}
    </form>`,
    onConfirm: async (dlg) => {
      const f = new FormData(dlg.querySelector("form"));
      const projectId = f.get("project_id");
      const pull = f.get("pull_time") === "on";

      let lineItems = [];
      if (pull) lineItems = (await buildTimeLineItems(projectId)).lineItems;

      const totals = computeTotals(lineItems, settings.tax_lines || []);
      return await createInvoice({
        project_id: projectId,
        issue_date: f.get("issue_date"),
        line_items: lineItems,
        tax_lines: totals.taxLines,
        subtotal: totals.subtotal,
        tax_total: totals.taxTotal,
        total: totals.total,
        notes: settings.payment_terms || null,
        status: "draft",
      });
    },
  });

  if (result) ctx.navigate(`/invoices/${result.id}`);
}
