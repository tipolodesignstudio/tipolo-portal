// Client detail: contact card + this client's projects.
import { escapeHtml, money, date, STATUS_LABELS, STATUS_TONE } from "../core/format.js";
import { on } from "../core/render.js";
import { getClient, listProjects, listProposals } from "../core/api.js";
import { editClient } from "./clients.js";
import { newProposalFlow } from "./proposals.js";

export async function render(root, ctx) {
  const id = ctx.params.id;
  root.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading…</div>`;

  let client, projects, proposals;
  try {
    [client, projects, proposals] = await Promise.all([
      getClient(id), listProjects({ clientId: id }), listProposals({ clientId: id }),
    ]);
  } catch (err) {
    root.innerHTML = `<div class="empty"><h3>Client not found</h3>
      <p class="faint">${escapeHtml(err.message)}</p>
      <p><a href="#/clients">← Back to clients</a></p></div>`;
    return;
  }
  ctx.setCrumbs?.(`Clients / ${client.name}`);

  root.innerHTML = `
    <div class="page-head">
      <div>
        <div class="faint" style="font-size:.85rem"><a href="#/clients">← Clients</a></div>
        <h1>${escapeHtml(client.name)}
          ${client.status === "archived" ? `<span class="badge grey">archived</span>` : ""}</h1>
        <div class="muted">${client.is_individual ? "Individual client"
          : escapeHtml(client.contact_name || "")}</div>
      </div>
      <div class="cluster">
        <button class="btn ghost" data-edit-client>Edit client</button>
        <button class="btn" data-new-proposal>+ New proposal</button>
      </div>
    </div>

    <div class="card">
      <h2>Contact</h2>
      <dl class="kv">
        ${client.is_individual ? "" : `<dt>Contact person</dt><dd>${escapeHtml(client.contact_name || "—")}</dd>`}
        <dt>Email</dt><dd>${client.email ? `<a href="mailto:${escapeHtml(client.email)}">${escapeHtml(client.email)}</a>` : "—"}</dd>
        <dt>Phone</dt><dd>${escapeHtml(client.phone || "—")}</dd>
        <dt>Address</dt><dd style="white-space:pre-wrap">${escapeHtml(addressBlock(client)) || "—"}</dd>
        <dt>Default rate</dt><dd>${client.default_rate != null ? money(client.default_rate) + " / hr" : "—"}</dd>
        <dt>Tags</dt><dd>${(client.tags || []).map((t) => `<span class="badge">${escapeHtml(t)}</span>`).join(" ") || "—"}</dd>
        <dt>Notes</dt><dd style="white-space:pre-wrap">${escapeHtml(client.notes || "—")}</dd>
      </dl>
    </div>

    <div class="card">
      <div class="between"><h2 class="mt-0">Proposals</h2><span class="faint">${proposals.length}</span></div>
      <div>${proposalList(proposals)}</div>
    </div>

    <div class="card">
      <div class="between"><h2 class="mt-0">Projects</h2><span class="faint">${projects.length}</span></div>
      <div id="proj-list">${projectList(projects)}</div>
    </div>`;

  on(root, "click", "[data-edit-client]", () =>
    editClient({ id: client.id }, () => ctx.navigate(ctx.path), true));
  on(root, "click", "[data-new-proposal]", () => newProposalFlow(ctx, client.id));
  on(root, "click", "tr[data-pid]", (e, tr) => ctx.navigate(`/projects/${tr.dataset.pid}`));
  on(root, "click", "tr[data-prop]", (e, tr) => ctx.navigate(`/proposals/${tr.dataset.prop}`));
}

function proposalList(proposals) {
  if (!proposals.length) return `<div class="empty"><p class="faint">No proposals for this client yet.</p></div>`;
  const TONE = { draft: "grey", sent: "amber", accepted: "green", declined: "red" };
  return `
    <div class="table-wrap"><table class="data">
      <thead><tr><th>No.</th><th>Title</th><th class="num">Fee</th><th>Status</th></tr></thead>
      <tbody>
        ${proposals.map((p) => `
          <tr class="clickable" data-prop="${p.id}">
            <td class="muted nowrap">${escapeHtml(p.number || "—")}</td>
            <td>${escapeHtml(p.title)}</td>
            <td class="num">${money(p.subtotal)}</td>
            <td><span class="badge ${TONE[p.status] || "grey"}">${p.status}</span></td>
          </tr>`).join("")}
      </tbody>
    </table></div>`;
}

function addressBlock(c) {
  const region = [c.province, c.postal_code].filter(Boolean).join("  ");
  return [c.street, c.city, region].filter(Boolean).join("\n");
}

function projectList(projects) {
  if (!projects.length) return `<div class="empty"><p class="faint">No projects for this client yet.</p></div>`;
  return `
    <div class="table-wrap">
      <table class="data">
        <thead><tr><th>Title</th><th>Scope</th><th>Status</th><th>Due</th><th class="num">Budget</th></tr></thead>
        <tbody>
          ${projects.map((p) => `
            <tr class="clickable" data-pid="${p.id}">
              <td>${escapeHtml(p.title)}</td>
              <td class="muted">${escapeHtml(p.scope)}</td>
              <td><span class="badge ${STATUS_TONE[p.status] || "grey"}">${STATUS_LABELS[p.status] || p.status}</span></td>
              <td class="muted">${p.due_date ? date(p.due_date) : "—"}</td>
              <td class="num">${p.budget != null ? money(p.budget) : "—"}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}
