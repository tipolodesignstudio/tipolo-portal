// Client detail: contacts, CRM notes timeline, proposals, projects.
import { escapeHtml, money, date, relTime, STATUS_LABELS, STATUS_TONE } from "../core/format.js";
import { on } from "../core/render.js";
import {
  getClient, listProjects, listProposals, listClientNotes, addClientNote,
} from "../core/api.js";
import { editClient } from "./clients.js";
import { newProposalFlow } from "./proposals.js";
import { toastOk, toastErr } from "../components/toast.js";

export async function render(root, ctx) {
  const id = ctx.params.id;
  root.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading…</div>`;

  let client, projects, proposals, notes;
  try {
    [client, projects, proposals, notes] = await Promise.all([
      getClient(id), listProjects({ clientId: id }), listProposals({ clientId: id }),
      listClientNotes(id).catch(() => []),
    ]);
  } catch (err) {
    root.innerHTML = `<div class="empty"><h3>Client not found</h3>
      <p class="faint">${escapeHtml(err.message)}</p>
      <p><a href="#/clients">← Back to clients</a></p></div>`;
    return;
  }
  ctx.setCrumbs?.(`Clients / ${client.name}`);
  const contacts = (client.contacts || []).slice().sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0));

  root.innerHTML = `
    <div class="page-head">
      <div>
        <div class="faint" style="font-size:.85rem"><a href="#/clients">← Clients</a></div>
        <h1>${escapeHtml(client.name)}
          ${client.status === "archived" ? `<span class="badge grey">archived</span>` : ""}</h1>
        <div class="muted">
          ${client.is_individual ? "Individual client" : escapeHtml(client.primary_contact?.name || "")}
          ${client.category ? `<span class="badge" style="margin-left:6px">${escapeHtml(client.category.name)}</span>` : ""}
        </div>
      </div>
      <div class="cluster">
        <button class="btn ghost" data-edit-client>Edit client</button>
        <button class="btn" data-new-proposal>+ New proposal</button>
      </div>
    </div>

    <div class="card">
      <h2>Notes history</h2>
      <form id="add-note" class="stack" style="gap:8px;margin-bottom:14px">
        <textarea name="body" rows="2" placeholder="Add a dated note…"></textarea>
        <div><button class="btn sm" type="submit">Add note</button></div>
      </form>
      <div id="note-timeline"></div>
    </div>

    <div class="card">
      <h2>Contacts</h2>
      ${contacts.length ? `
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Phone</th></tr></thead>
          <tbody>
            ${contacts.map((ct) => `
              <tr>
                <td>${escapeHtml(ct.name)}${ct.is_primary ? ` <span class="badge green">primary</span>` : ""}</td>
                <td class="muted">${escapeHtml(ct.title || "—")}</td>
                <td class="muted">${ct.email ? `<a href="mailto:${escapeHtml(ct.email)}">${escapeHtml(ct.email)}</a>` : "—"}</td>
                <td class="muted">${escapeHtml(ct.phone || "—")}</td>
              </tr>`).join("")}
          </tbody>
        </table></div>` : `<p class="faint" style="font-size:.9rem">No contacts recorded.</p>`}
    </div>

    <div class="card">
      <h2>Details</h2>
      <dl class="kv">
        <dt>Address</dt><dd style="white-space:pre-wrap">${escapeHtml(addressBlock(client)) || "—"}</dd>
        <dt>Default rate</dt><dd>${client.default_rate != null ? money(client.default_rate) + " / hr" : "—"}</dd>
        <dt>Tags</dt><dd>${(client.tags || []).map((t) => `<span class="badge">${escapeHtml(t)}</span>`).join(" ") || "—"}</dd>
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

  const timeline = root.querySelector("#note-timeline");
  const renderNotes = (list) => {
    timeline.innerHTML = list.length ? list.map((n, i) => `
      <div class="note-entry${i > 0 ? " archived" : ""}">
        <div class="faint" style="font-size:.78rem">${date(n.created_at)} · ${relTime(n.created_at)}${i === 0 ? "" : " · archived"}</div>
        <div style="white-space:pre-wrap">${escapeHtml(n.body)}</div>
      </div>`).join("")
      : `<p class="faint" style="font-size:.9rem">No notes yet.</p>`;
  };
  renderNotes(notes);

  root.querySelector("#add-note").addEventListener("submit", async (e) => {
    e.preventDefault();
    const ta = e.target.elements.body;
    const body = ta.value.trim();
    if (!body) return;
    e.target.querySelector("button").disabled = true;
    try {
      await addClientNote(client.id, body);
      ta.value = "";
      renderNotes(await listClientNotes(client.id));
      toastOk("Note added");
    } catch (err) { toastErr(err.message); }
    finally { e.target.querySelector("button").disabled = false; }
  });
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
