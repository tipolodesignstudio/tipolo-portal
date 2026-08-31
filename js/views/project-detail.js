// Project detail: overview, deliverables checklist, and tabs (Time/Invoices/Proposals
// fill in during later phases).
import { escapeHtml, money, date, minutesToHM, minutesToHours, STATUS_LABELS, STATUS_TONE } from "../core/format.js";
import { on } from "../core/render.js";
import { getProject, updateProject, getSettings, effectiveRate, listProjectTime, listProjectInvoices, listProjectProposals, listProjectExpenses } from "../core/api.js";
import { editProject } from "./projects.js";
import { editTimeEntry, confirmDeleteEntry } from "./time-entry-modal.js";
import { editExpense, openReceipt } from "./expenses.js";
import { newInvoiceFlow, effectiveStatus } from "./invoices.js";
import { toastErr } from "../components/toast.js";

export async function render(root, ctx) {
  const id = ctx.params.id;
  root.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading…</div>`;

  let p, settings;
  try {
    [p, settings] = await Promise.all([getProject(id), getSettings().catch(() => ({}))]);
  } catch (err) {
    root.innerHTML = `<div class="empty"><h3>Project not found</h3>
      <p class="faint">${escapeHtml(err.message)}</p>
      <p><a href="#/projects">← Back to projects</a></p></div>`;
    return;
  }
  ctx.setCrumbs?.(`Projects / ${p.title}`);

  const tab = ctx.query.tab || "overview";
  const rate = effectiveRate(p, settings);
  let deliverables = Array.isArray(p.deliverables) ? p.deliverables.map((d) => ({ ...d })) : [];

  root.innerHTML = `
    <div class="page-head">
      <div>
        <div class="faint" style="font-size:.85rem">
          <a href="#/projects">← Projects</a> ·
          <a href="#/clients/${p.client?.id}">${escapeHtml(p.client?.name || "client")}</a>
        </div>
        <h1>${p.number ? `<span class="faint">${escapeHtml(p.number)}</span> ` : ""}${escapeHtml(p.title)}
          <span class="badge ${STATUS_TONE[p.status] || "grey"}">${STATUS_LABELS[p.status] || p.status}</span></h1>
      </div>
      <button class="btn ghost" data-edit>Edit project</button>
    </div>

    <div class="tabs">
      ${["overview", "time", "expenses", "invoices", "proposals"].map((t) =>
        `<a href="#/projects/${id}?tab=${t}" class="${tab === t ? "active" : ""}">${t[0].toUpperCase() + t.slice(1)}</a>`).join("")}
    </div>

    <div id="tabpane"></div>`;

  const pane = root.querySelector("#tabpane");

  if (tab === "overview") {
    pane.innerHTML = `
      <div class="card">
        <h2>Overview</h2>
        <dl class="kv">
          <dt>Client</dt><dd><a href="#/clients/${p.client?.id}">${escapeHtml(p.client?.name || "—")}</a></dd>
          <dt>Contact</dt><dd>${(() => {
            const ct = p.contact || (p.client?.contacts || []).find((x) => x.is_primary) || (p.client?.contacts || [])[0];
            if (!ct) return "—";
            return `${escapeHtml(ct.name)}${ct.title ? ` <span class="faint">· ${escapeHtml(ct.title)}</span>` : ""}${p.contact ? "" : ` <span class="faint">(client primary)</span>`}`;
          })()}</dd>
          <dt>Scope</dt><dd>${escapeHtml(p.scope)}</dd>
          <dt>Status</dt><dd>${STATUS_LABELS[p.status] || p.status}</dd>
          <dt>Start</dt><dd>${p.start_date ? date(p.start_date) : "—"}</dd>
          <dt>Due</dt><dd>${p.due_date ? date(p.due_date) : "—"}</dd>
          <dt>Budget</dt><dd>${p.budget != null ? money(p.budget) : "—"}</dd>
          <dt>Hourly rate</dt><dd>${rate != null ? money(rate) + " / hr" : "—"}
            ${p.hourly_rate == null && rate != null ? ` <span class="faint">(inherited)</span>` : ""}</dd>
          <dt>Description</dt><dd style="white-space:pre-wrap">${escapeHtml(p.description || "—")}</dd>
        </dl>
      </div>

      <div class="card">
        <div class="between"><h2 class="mt-0">Deliverables</h2></div>
        <div id="deliverables"></div>
        <form class="cluster" id="add-deliverable" style="margin-top:10px">
          <input type="text" name="label" placeholder="Add a deliverable…" style="flex:1;min-width:200px" />
          <button class="btn subtle sm" type="submit">Add</button>
        </form>
      </div>`;

    const delEl = pane.querySelector("#deliverables");
    const renderDeliverables = () => {
      delEl.innerHTML = deliverables.length
        ? deliverables.map((d, i) => `
          <label style="display:flex;gap:10px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-soft)">
            <input type="checkbox" data-toggle="${i}" ${d.done ? "checked" : ""} style="width:auto" />
            <span style="flex:1;${d.done ? "text-decoration:line-through;color:var(--ink-faint)" : ""}">${escapeHtml(d.label)}</span>
            <button class="btn link" data-del="${i}">remove</button>
          </label>`).join("")
        : `<p class="faint" style="font-size:.9rem">No deliverables yet.</p>`;
    };
    renderDeliverables();

    const persist = async () => {
      try { await updateProject(id, { deliverables }); }
      catch (err) { toastErr("Couldn't save: " + err.message); }
    };

    on(pane, "change", "[data-toggle]", (e, el) => {
      deliverables[+el.dataset.toggle].done = el.checked;
      renderDeliverables(); persist();
    });
    on(pane, "click", "[data-del]", (e, el) => {
      deliverables.splice(+el.dataset.del, 1);
      renderDeliverables(); persist();
    });
    pane.querySelector("#add-deliverable").addEventListener("submit", (e) => {
      e.preventDefault();
      const input = e.target.elements.label;
      const label = input.value.trim();
      if (!label) return;
      deliverables.push({ label, done: false });
      input.value = "";
      renderDeliverables(); persist();
    });
  } else if (tab === "time") {
    await renderTimeTab(pane, p, ctx);
  } else if (tab === "expenses") {
    await renderExpensesTab(pane, p, ctx);
  } else if (tab === "invoices") {
    await renderInvoicesTab(pane, p, ctx);
  } else if (tab === "proposals") {
    await renderProposalsTab(pane, p, ctx);
  }

  on(root, "click", "[data-edit]", () => editProject({ id }, () => ctx.navigate(ctx.path)));
}

async function renderTimeTab(pane, project, ctx) {
  pane.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading time…</div>`;
  const reload = () => renderTimeTab(pane, project, ctx);

  let entries;
  try { entries = await listProjectTime(project.id); }
  catch (err) { pane.innerHTML = `<div class="empty"><p class="faint">${escapeHtml(err.message)}</p></div>`; return; }

  const total = entries.reduce((s, e) => s + e.minutes, 0);
  const billableMin = entries.filter((e) => e.billable).reduce((s, e) => s + e.minutes, 0);
  const unbilledVal = entries
    .filter((e) => e.billable && !e.invoice_id)
    .reduce((s, e) => s + (e.minutes / 60) * (e.rate || 0), 0);

  pane.innerHTML = `
    <div class="grid-cards" style="margin-bottom:14px">
      <div class="stat"><div class="k">Total logged</div><div class="v">${minutesToHours(total)} h</div><div class="d">${minutesToHM(total)}</div></div>
      <div class="stat"><div class="k">Billable</div><div class="v">${minutesToHours(billableMin)} h</div></div>
      <div class="stat"><div class="k">Unbilled value</div><div class="v">${money(unbilledVal)}</div></div>
    </div>
    <div class="between" style="margin-bottom:10px">
      <h2 class="mt-0">Entries</h2>
      <button class="btn sm" data-log-here>+ Log time</button>
    </div>
    ${entries.length ? `
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Date</th><th>Description</th><th class="num">Hours</th><th class="num">Rate</th><th></th></tr></thead>
        <tbody>
          ${entries.map((e) => `
            <tr>
              <td class="nowrap">${date(e.entry_date)}</td>
              <td>${escapeHtml(e.description || "—")}
                ${e.billable ? "" : ` <span class="badge grey">non-billable</span>`}
                ${e.invoice_id ? ` <span class="badge green">billed</span>` : ""}</td>
              <td class="num">${minutesToHM(e.minutes)}</td>
              <td class="num">${e.rate != null ? money(e.rate) : "—"}</td>
              <td class="right nowrap">
                <button class="btn link" data-edit-te="${e.id}">edit</button>
                <button class="btn link" data-del-te="${e.id}">del</button>
              </td>
            </tr>`).join("")}
        </tbody>
      </table></div>` : `<div class="empty"><p class="faint">No time logged on this project yet.</p></div>`}`;

  const map = new Map(entries.map((e) => [e.id, e]));
  on(pane, "click", "[data-log-here]", () =>
    editTimeEntry({ prefill: { project_id: project.id }, onSaved: reload }));
  on(pane, "click", "[data-edit-te]", (e, el) => {
    const ex = map.get(el.dataset.editTe);
    if (ex) editTimeEntry({ existing: ex, onSaved: reload });
  });
  on(pane, "click", "[data-del-te]", (e, el) => confirmDeleteEntry(el.dataset.delTe, reload));
}

async function renderExpensesTab(pane, project, ctx) {
  pane.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading expenses…</div>`;
  const reload = () => renderExpensesTab(pane, project, ctx);
  let rows;
  try { rows = await listProjectExpenses(project.id); }
  catch (err) { pane.innerHTML = `<div class="empty"><p class="faint">${escapeHtml(err.message)}</p></div>`; return; }

  const total = rows.reduce((s, e) => s + Number(e.amount || 0), 0);
  const billable = rows.filter((e) => e.billable);
  const unbilled = billable.filter((e) => !e.invoice_id)
    .reduce((s, e) => s + Number(e.amount || 0) * (1 + (Number(e.markup_pct) || 0) / 100), 0);

  pane.innerHTML = `
    <div class="grid-cards" style="margin-bottom:14px">
      <div class="stat"><div class="k">Total spent</div><div class="v">${money(total)}</div></div>
      <div class="stat"><div class="k">Billable</div><div class="v">${money(billable.reduce((s, e) => s + Number(e.amount || 0), 0))}</div></div>
      <div class="stat"><div class="k">Unbilled (with markup)</div><div class="v">${money(unbilled)}</div></div>
    </div>
    <div class="between" style="margin-bottom:10px">
      <h2 class="mt-0">Expenses</h2>
      <button class="btn sm" data-new-exp>+ Add expense</button>
    </div>
    ${rows.length ? `
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Date</th><th>Vendor</th><th>Category</th><th class="num">Amount</th><th>Billing</th><th></th></tr></thead>
        <tbody>
          ${rows.map((e) => `
            <tr>
              <td class="nowrap">${date(e.expense_date)}</td>
              <td>${escapeHtml(e.vendor || "—")}${e.receipt_url ? ` <button class="btn link" data-receipt="${escapeHtml(e.receipt_url)}" title="View receipt">🧾</button>` : ""}</td>
              <td class="muted">${escapeHtml(e.category?.name || "—")}</td>
              <td class="num">${money(e.amount)}</td>
              <td>${e.billable ? (e.invoice_id ? `<span class="badge green">billed</span>`
                : `<span class="badge amber">billable${e.markup_pct ? ` +${e.markup_pct}%` : ""}</span>`)
                : `<span class="badge grey">internal</span>`}</td>
              <td class="right"><button class="btn link" data-edit-exp="${e.id}">edit</button></td>
            </tr>`).join("")}
        </tbody>
      </table></div>` : `<div class="empty"><p class="faint">No expenses on this project yet.</p></div>`}`;

  const map = new Map(rows.map((e) => [e.id, e]));
  on(pane, "click", "[data-new-exp]", () =>
    editExpense({ project_id: project.id }, reload));
  on(pane, "click", "[data-edit-exp]", (e, el) => {
    const ex = map.get(el.dataset.editExp);
    if (ex) editExpense(ex, reload);
  });
  on(pane, "click", "[data-receipt]", (e, el) => openReceipt(el.dataset.receipt));
}

async function renderInvoicesTab(pane, project, ctx) {
  pane.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading invoices…</div>`;
  let invoices;
  try { invoices = await listProjectInvoices(project.id); }
  catch (err) { pane.innerHTML = `<div class="empty"><p class="faint">${escapeHtml(err.message)}</p></div>`; return; }

  const TONE = { draft: "grey", sent: "amber", paid: "green", overdue: "red" };
  pane.innerHTML = `
    <div class="between" style="margin-bottom:10px">
      <h2 class="mt-0">Invoices</h2>
      <button class="btn sm" data-new-inv>+ New invoice</button>
    </div>
    ${invoices.length ? `
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Number</th><th>Issued</th><th class="num">Total</th><th>Status</th></tr></thead>
        <tbody>
          ${invoices.map((inv) => {
            const st = effectiveStatus(inv);
            return `<tr class="clickable" data-inv="${inv.id}">
              <td>${escapeHtml(inv.number || "— draft")}</td>
              <td class="muted nowrap">${inv.issue_date ? date(inv.issue_date) : "—"}</td>
              <td class="num">${money(inv.total)}</td>
              <td><span class="badge ${TONE[st]}">${st[0].toUpperCase() + st.slice(1)}</span></td>
            </tr>`;
          }).join("")}
        </tbody>
      </table></div>` : `<div class="empty"><p class="faint">No invoices reference this project yet.</p></div>`}`;

  on(pane, "click", "[data-new-inv]", () => newInvoiceFlow(ctx, project.id));
  on(pane, "click", "[data-inv]", (e, el) => ctx.navigate(`/invoices/${el.dataset.inv}`));
}

async function renderProposalsTab(pane, project, ctx) {
  pane.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading…</div>`;
  let proposals;
  try { proposals = await listProjectProposals(project.id); }
  catch (err) { pane.innerHTML = `<div class="empty"><p class="faint">${escapeHtml(err.message)}</p></div>`; return; }

  pane.innerHTML = proposals.length ? `
    <div class="table-wrap"><table class="data">
      <thead><tr><th>No.</th><th>Title</th><th class="num">Fee</th><th>Status</th></tr></thead>
      <tbody>
        ${proposals.map((p) => `
          <tr class="clickable" data-prop="${p.id}">
            <td class="muted nowrap">${escapeHtml(p.number || "—")}</td>
            <td>${escapeHtml(p.title)}</td>
            <td class="num">${money(p.subtotal)}</td>
            <td><span class="badge grey">${escapeHtml(p.status)}</span></td>
          </tr>`).join("")}
      </tbody>
    </table></div>`
    : `<div class="empty"><p class="faint">This project was created directly (no linked proposal).</p></div>`;

  on(pane, "click", "[data-prop]", (e, el) => ctx.navigate(`/proposals/${el.dataset.prop}`));
}
