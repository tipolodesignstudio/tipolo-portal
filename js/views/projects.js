// Projects list: search + status + scope filters, create/edit.
import { escapeHtml, debounce, money, date, STATUS_LABELS, STATUS_TONE } from "../core/format.js";
import { on } from "../core/render.js";
import { listProjects, updateProject, getProject } from "../core/api.js";
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

/* ---- edit an existing project (new projects come from proposal conversion) ---- */
export async function editProject(existing, onSaved) {
  let p;
  try { p = await getProject(existing.id); } catch (err) { toastErr(err.message); return; }
  const contacts = p.client?.contacts || [];

  const result = await openModal({
    title: `Edit ${p.number ? p.number + " · " : ""}${p.title}`,
    confirmText: "Save",
    size: "lg",
    body: `<form class="form-grid">
      ${field("title", "Title", p.title, { required: true })}
      <div class="field"><label class="lbl">Client</label>
        <div class="input" style="background:var(--bg-alt)">${escapeHtml(p.client?.name || "—")}</div></div>
      ${row(
        select("scope", "Scope", p.scope || "other", SCOPES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))),
        select("status", "Status", p.status || "lead", STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))),
      )}
      ${select("contact_id", "Project contact", p.contact_id || "",
        [{ value: "", label: contacts.length ? "— use client's primary contact" : "no contacts on this client" },
         ...contacts.map((c) => ({ value: c.id, label: c.title ? `${c.name} — ${c.title}` : c.name }))])}
      ${row(
        field("hourly_rate", "Hourly rate override", p.hourly_rate, { type: "number", step: "0.01", min: 0, hint: "Blank = client/default rate" }),
        field("budget", "Budget", p.budget, { type: "number", step: "0.01", min: 0 }),
      )}
      ${row(
        field("start_date", "Start date", p.start_date, { type: "date" }),
        field("due_date", "Due date", p.due_date, { type: "date" }),
      )}
      ${textarea("description", "Description", p.description, { rows: 3 })}
    </form>`,
    onConfirm: async (dlg) => {
      const f = readForm(dlg.querySelector("form"));
      return await updateProject(p.id, {
        title: f.title,
        scope: f.scope,
        status: f.status,
        contact_id: f.contact_id || null,
        hourly_rate: f.hourly_rate,
        start_date: f.start_date || null,
        due_date: f.due_date || null,
        budget: f.budget,
        description: f.description || null,
      });
    },
  });

  if (result) { toastOk("Project saved"); onSaved?.(result); }
}
