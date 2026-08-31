// Proposal list + "New proposal" flow. Proposals are the entry point for all work —
// a project only exists once a proposal is converted.
import { escapeHtml, money, date } from "../core/format.js";
import { on } from "../core/render.js";
import {
  listProposals, listClients, listTemplates, getTemplate, createProposal, getSettings,
} from "../core/api.js";
import { buildTokenMap, resolveSections } from "../core/tokens.js";
import { openModal } from "../components/modal.js";
import { field, select } from "../components/form.js";
import { toastErr } from "../components/toast.js";

let state = { status: "" };

const META = {
  draft: { label: "Draft", tone: "grey" },
  sent: { label: "Sent", tone: "amber" },
  accepted: { label: "Accepted", tone: "green" },
  declined: { label: "Declined", tone: "red" },
};
const SCOPES = ["landscape", "multimedia", "other"];

export async function render(root, ctx) {
  ctx.setCrumbs?.("Proposals");
  root.innerHTML = `
    <div class="page-head">
      <div><h1>Proposals</h1><div class="muted">Every project starts here.</div></div>
      <div class="cluster">
        <a class="btn ghost" href="#/proposals/templates">Templates</a>
        <button class="btn" data-new>+ New proposal</button>
      </div>
    </div>
    <div class="filters">
      <select data-f="status">
        ${["", "draft", "sent", "accepted", "declined"].map((s) =>
          `<option value="${s}" ${state.status === s ? "selected" : ""}>${s ? META[s].label : "All statuses"}</option>`).join("")}
      </select>
    </div>
    <div id="list"><div class="loading-row"><span class="spinner"></span> Loading…</div></div>`;

  const listEl = root.querySelector("#list");

  async function refresh() {
    listEl.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading…</div>`;
    try {
      const rows = await listProposals(state);
      listEl.innerHTML = rows.length ? table(rows) : empty();
    } catch (err) {
      listEl.innerHTML = `<div class="empty"><h3>Couldn't load proposals</h3>
        <p class="faint">${escapeHtml(err.message)}</p></div>`;
    }
  }

  on(root, "change", "[data-f]", (e) => { state[e.target.dataset.f] = e.target.value; refresh(); });
  on(root, "click", "[data-new]", () => newProposalFlow(ctx));
  on(root, "click", "tr[data-id]", (e, tr) => ctx.navigate(`/proposals/${tr.dataset.id}`));

  await refresh();
}

function table(rows) {
  return `
    <div class="table-wrap">
      <table class="data">
        <thead><tr>
          <th>No.</th><th>Title</th><th>Client</th><th>Valid until</th>
          <th class="num">Fee</th><th>Status</th>
        </tr></thead>
        <tbody>
          ${rows.map((p) => {
            const m = META[p.status] || META.draft;
            return `
            <tr class="clickable" data-id="${p.id}">
              <td class="muted nowrap">${escapeHtml(p.number || "—")}</td>
              <td>${escapeHtml(p.title)}</td>
              <td class="muted">${escapeHtml(p.client?.name || "—")}</td>
              <td class="muted nowrap">${p.valid_until ? date(p.valid_until) : "—"}</td>
              <td class="num">${money(p.subtotal)}</td>
              <td><span class="badge ${m.tone}">${m.label}</span>${p.converted_project_id ? ` <span class="badge grey">converted</span>` : ""}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>`;
}

function empty() {
  return `<div class="empty"><h3>No proposals${state.status ? " with that status" : ""}</h3>
    <p class="faint">Create a proposal to quote a client and, once accepted, start a project.</p></div>`;
}

/* ---- new proposal ---- */
export async function newProposalFlow(ctx, presetClientId = "") {
  let clients, templates, settings;
  try {
    [clients, templates, settings] = await Promise.all([
      listClients({ status: "all" }), listTemplates(), getSettings().catch(() => ({})),
    ]);
  } catch (err) { toastErr(err.message); return; }

  if (!clients.length) {
    await openModal({ title: "Add a client first",
      body: `<p>A proposal is addressed to a client. Add one, then write the proposal.</p>`,
      confirmText: "OK", onConfirm: () => true });
    return;
  }

  const result = await openModal({
    title: "New proposal",
    confirmText: "Create draft",
    body: `<form class="form-grid">
      ${field("title", "Project title", "", { required: true, ph: "Front garden redesign" })}
      ${select("client_id", "Client", presetClientId || clients[0].id,
        clients.map((c) => ({ value: c.id, label: c.name })), { required: true })}
      ${select("project_scope", "Scope", "landscape",
        SCOPES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })))}
      ${select("template_id", "Template", "",
        [{ value: "", label: "None — blank proposal" },
         ...templates.map((t) => ({ value: t.id, label: t.name }))])}
      ${field("valid_until", "Valid until", "", { type: "date" })}
    </form>`,
    onConfirm: async (dlg) => {
      const f = new FormData(dlg.querySelector("form"));
      const clientId = f.get("client_id");
      const client = clients.find((c) => c.id === clientId);
      const templateId = f.get("template_id") || null;

      let sections = [];
      let lineItems = [];
      if (templateId) {
        const tpl = await getTemplate(templateId);
        const draft = {
          title: f.get("title"), project_scope: f.get("project_scope"),
          valid_until: f.get("valid_until") || null, line_items: tpl.default_line_items || [],
        };
        const map = buildTokenMap({ client, proposal: draft, settings });
        sections = resolveSections(tpl.sections, map);
        lineItems = (tpl.default_line_items || []).map((li) => ({ ...li }));
      }
      const subtotal = lineItems.reduce((s, li) => s + (Number(li.qty) || 0) * (Number(li.unit_price) || 0), 0);

      return await createProposal({
        template_id: templateId,
        client_id: clientId,
        title: f.get("title"),
        project_scope: f.get("project_scope"),
        valid_until: f.get("valid_until") || null,
        sections,
        line_items: lineItems,
        subtotal: Math.round(subtotal * 100) / 100,
        status: "draft",
      });
    },
  });

  if (result) ctx.navigate(`/proposals/${result.id}`);
}
