// Projects list: search + status + scope filters, create/edit.
import { escapeHtml, debounce, money, date, STATUS_LABELS, STATUS_TONE } from "../core/format.js";
import { on } from "../core/render.js";
import { listProjects, createProject, updateProject, getProject, listClients } from "../core/api.js";
import { openModal } from "../components/modal.js";
import { field, textarea, select, row, readForm } from "../components/form.js";
import { toastOk, toastErr } from "../components/toast.js";

const STATUSES = ["lead", "proposal", "active", "on_hold", "complete", "archived"];
const SCOPES = ["landscape", "multimedia", "other"];

let state = { search: "", status: "", scope: "" };

export async function render(root, ctx) {
  ctx.setCrumbs?.("Projects");
  root.innerHTML = `
    <div class="page-head">
      <div><h1>Projects</h1><div class="muted">Projects are created by converting an accepted proposal.</div></div>
      <a class="btn ghost" href="#/proposals">Proposals →</a>
    </div>
    <div class="filters">
      <input class="search" type="search" placeholder="Search title, description…"
             value="${escapeHtml(state.search)}" data-search />
      <select data-f="status">
        <option value="">All statuses</option>
        ${STATUSES.map((s) => `<option value="${s}" ${state.status === s ? "selected" : ""}>${STATUS_LABELS[s]}</option>`).join("")}
      </select>
      <select data-f="scope">
        <option value="">All scopes</option>
        ${SCOPES.map((s) => `<option value="${s}" ${state.scope === s ? "selected" : ""}>${s[0].toUpperCase() + s.slice(1)}</option>`).join("")}
      </select>
    </div>
    <div id="proj-list"><div class="loading-row"><span class="spinner"></span> Loading…</div></div>`;

  const listEl = root.querySelector("#proj-list");

  async function refresh() {
    listEl.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading…</div>`;
    try {
      const rows = await listProjects(state);
      listEl.innerHTML = rows.length ? table(rows) : empty();
    } catch (err) {
      listEl.innerHTML = `<div class="empty"><h3>Couldn't load projects</h3>
        <p class="faint">${escapeHtml(err.message)}</p></div>`;
    }
  }

  on(root, "input", "[data-search]", debounce((e) => { state.search = e.target.value; refresh(); }, 250));
  on(root, "change", "[data-f]", (e) => { state[e.target.dataset.f] = e.target.value; refresh(); });
  on(root, "click", "tr[data-id]", (e, tr) => ctx.navigate(`/projects/${tr.dataset.id}`));

  await refresh();
}

function table(rows) {
  return `
    <div class="table-wrap">
      <table class="data">
        <thead><tr><th>No.</th><th>Title</th><th>Client</th><th>Scope</th><th>Status</th><th>Due</th><th class="num">Budget</th></tr></thead>
        <tbody>
          ${rows.map((p) => `
            <tr class="clickable" data-id="${p.id}">
              <td class="muted nowrap">${escapeHtml(p.number || "—")}</td>
              <td>${escapeHtml(p.title)}</td>
              <td class="muted">${escapeHtml(p.client?.name || "—")}</td>
              <td class="muted">${escapeHtml(p.scope)}</td>
              <td><span class="badge ${STATUS_TONE[p.status] || "grey"}">${STATUS_LABELS[p.status] || p.status}</span></td>
              <td class="muted">${p.due_date ? date(p.due_date) : "—"}</td>
              <td class="num">${p.budget != null ? money(p.budget) : "—"}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function empty() {
  return `<div class="empty"><h3>No projects yet</h3>
    <p class="faint">Projects appear here once you convert an accepted
    <a href="#/proposals">proposal</a>.</p></div>`;
}

/* ---- create / edit modal (exported for reuse) ---- */
export async function editProject(existing, onSaved) {
  let p = existing || {};
  const isNew = !p.id;
  if (!isNew) {
    try { p = await getProject(p.id); } catch (err) { toastErr(err.message); return; }
  }

  let clients;
  try { clients = await listClients({ status: "all" }); }
  catch (err) { toastErr("Couldn't load clients: " + err.message); return; }

  if (!clients.length) {
    await openModal({
      title: "Add a client first",
      body: `<p>Projects belong to a client. Create a client, then add the project.</p>`,
      confirmText: "OK", onConfirm: () => true,
    });
    return;
  }

  const result = await openModal({
    title: isNew ? "New project" : "Edit project",
    confirmText: isNew ? "Create project" : "Save",
    size: "lg",
    body: `<form class="form-grid">
      ${field("title", "Title", p.title, { required: true })}
      ${row(
        select("client_id", "Client", p.client_id || existing?.client_id, clients.map((c) => ({
          value: c.id, label: c.name,
        })), { required: true }),
        select("scope", "Scope", p.scope || "other", SCOPES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))),
      )}
      ${row(
        select("status", "Status", p.status || "lead", STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))),
        field("hourly_rate", "Hourly rate override", p.hourly_rate, { type: "number", step: "0.01", min: 0, hint: "Blank = client/default rate" }),
      )}
      ${row(
        field("start_date", "Start date", p.start_date, { type: "date" }),
        field("due_date", "Due date", p.due_date, { type: "date" }),
      )}
      ${field("budget", "Budget", p.budget, { type: "number", step: "0.01", min: 0 })}
      ${textarea("description", "Description", p.description, { rows: 3 })}
    </form>`,
    onConfirm: async (dlg) => {
      const f = readForm(dlg.querySelector("form"));
      const patch = {
        title: f.title,
        client_id: f.client_id,
        scope: f.scope,
        status: f.status,
        hourly_rate: f.hourly_rate,
        start_date: f.start_date || null,
        due_date: f.due_date || null,
        budget: f.budget,
        description: f.description || null,
      };
      return isNew ? await createProject(patch) : await updateProject(p.id, patch);
    },
  });

  if (result) {
    toastOk(isNew ? "Project created" : "Project saved");
    onSaved?.(result);
  }
}
