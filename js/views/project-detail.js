// Project detail: overview, deliverables checklist, and tabs (Time/Invoices/Proposals
// fill in during later phases).
import { escapeHtml, money, date, STATUS_LABELS, STATUS_TONE } from "../core/format.js";
import { on } from "../core/render.js";
import { getProject, updateProject, getSettings, effectiveRate } from "../core/api.js";
import { editProject } from "./projects.js";
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
        <h1>${escapeHtml(p.title)}
          <span class="badge ${STATUS_TONE[p.status] || "grey"}">${STATUS_LABELS[p.status] || p.status}</span></h1>
      </div>
      <button class="btn ghost" data-edit>Edit project</button>
    </div>

    <div class="tabs">
      ${["overview", "time", "invoices", "proposals"].map((t) =>
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
  } else {
    const phase = { time: "Phase 2", invoices: "Phase 3", proposals: "Phase 4" }[tab];
    pane.innerHTML = `<div class="empty"><h3>${tab[0].toUpperCase() + tab.slice(1)}</h3>
      <p class="faint">Arrives in ${phase}.</p></div>`;
  }

  on(root, "click", "[data-edit]", () => editProject({ id }, () => ctx.navigate(ctx.path)));
}
