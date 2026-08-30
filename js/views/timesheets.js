// Timesheets: week grid grouped by day, totals, filters, log/edit/delete.
import { escapeHtml, isoDate, money, minutesToHM, minutesToHours, num } from "../core/format.js";
import { on } from "../core/render.js";
import { listTimeEntries, listActiveProjectsLite } from "../core/api.js";
import { editTimeEntry, confirmDeleteEntry } from "./time-entry-modal.js";

const DAY_MS = 86400000;

function mondayOf(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const wd = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - wd);
  return x;
}

let state = { weekStart: isoDate(mondayOf(new Date())), projectId: "", billable: "", billed: "" };
let detachTimeListener = null;

export async function render(root, ctx) {
  ctx.setCrumbs?.("Timesheets");
  detachTimeListener?.();

  let projects = [];
  try { projects = await listActiveProjectsLite(); } catch { /* non-fatal */ }

  root.innerHTML = `
    <div class="page-head">
      <div><h1>Timesheets</h1><div class="muted">Log and review your hours.</div></div>
      <button class="btn" data-log>+ Log time</button>
    </div>

    <div class="filters">
      <div class="seg" data-weeknav>
        <button data-w="prev">← Prev</button>
        <button data-w="today">This week</button>
        <button data-w="next">Next →</button>
      </div>
      <span class="faint" id="week-label"></span>
      <span style="flex:1"></span>
      <select data-f="projectId">
        <option value="">All projects</option>
        ${projects.map((p) => `<option value="${p.id}" ${state.projectId === p.id ? "selected" : ""}>${escapeHtml(p.title)}</option>`).join("")}
      </select>
      <select data-f="billable">
        <option value="">Billable + non</option>
        <option value="yes" ${state.billable === "yes" ? "selected" : ""}>Billable only</option>
        <option value="no" ${state.billable === "no" ? "selected" : ""}>Non-billable only</option>
      </select>
      <select data-f="billed">
        <option value="">Any</option>
        <option value="unbilled" ${state.billed === "unbilled" ? "selected" : ""}>Unbilled</option>
        <option value="billed" ${state.billed === "billed" ? "selected" : ""}>Billed</option>
      </select>
    </div>

    <div id="week-grid"><div class="loading-row"><span class="spinner"></span> Loading…</div></div>`;

  const grid = root.querySelector("#week-grid");

  async function refresh() {
    const start = new Date(state.weekStart + "T00:00:00");
    const end = new Date(start.getTime() + 6 * DAY_MS);
    root.querySelector("#week-label").textContent =
      `${start.toLocaleDateString("en-CA", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}`;
    grid.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading…</div>`;
    try {
      const entries = await listTimeEntries({
        from: isoDate(start), to: isoDate(end),
        projectId: state.projectId, billable: state.billable, billed: state.billed,
      });
      grid.innerHTML = weekGrid(start, entries);
    } catch (err) {
      grid.innerHTML = `<div class="empty"><h3>Couldn't load entries</h3>
        <p class="faint">${escapeHtml(err.message)}</p></div>`;
    }
  }

  on(root, "click", "[data-weeknav] button", (e, btn) => {
    const cur = new Date(state.weekStart + "T00:00:00");
    if (btn.dataset.w === "prev") cur.setDate(cur.getDate() - 7);
    else if (btn.dataset.w === "next") cur.setDate(cur.getDate() + 7);
    else return (state.weekStart = isoDate(mondayOf(new Date()))), refresh();
    state.weekStart = isoDate(cur);
    refresh();
  });
  on(root, "change", "[data-f]", (e) => { state[e.target.dataset.f] = e.target.value; refresh(); });
  on(root, "click", "[data-log]", () => editTimeEntry({ prefill: { entry_date: state.weekStart }, onSaved: refresh }));
  on(root, "click", "[data-edit-entry]", (e, el) => {
    const existing = _entryMap.get(el.dataset.editEntry);
    if (existing) editTimeEntry({ existing, onSaved: refresh });
  });
  on(root, "click", "[data-del-entry]", (e, el) => confirmDeleteEntry(el.dataset.delEntry, refresh));

  window.addEventListener("tipolo:time-changed", refresh);
  detachTimeListener = () => window.removeEventListener("tipolo:time-changed", refresh);

  await refresh();
}

// entries currently on the page, for the edit dialog
let _entryMap = new Map();

function weekGrid(start, entries) {
  _entryMap = new Map(entries.map((e) => [e.id, e]));
  const byDay = {};
  for (const e of entries) (byDay[e.entry_date] ||= []).push(e);

  let weekMin = 0, weekBillableValue = 0;
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getTime() + i * DAY_MS);
    const key = isoDate(d);
    const list = (byDay[key] || []).sort((a, b) => (a.created_at > b.created_at ? 1 : -1));
    const dayMin = list.reduce((s, e) => s + e.minutes, 0);
    weekMin += dayMin;
    weekBillableValue += list.reduce((s, e) => s + (e.billable ? (e.minutes / 60) * (e.rate || 0) : 0), 0);

    days.push(`
      <div class="day-block">
        <div class="day-head">
          <span>${d.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" })}</span>
          <span class="faint">${dayMin ? minutesToHM(dayMin) : "—"}</span>
        </div>
        ${list.length ? list.map(rowHtml).join("") : `<div class="day-empty faint">No entries</div>`}
      </div>`);
  }

  return `
    <div class="week-grid">${days.join("")}</div>
    <div class="card week-totals">
      <div class="between">
        <div><strong>Week total</strong></div>
        <div class="nowrap">${minutesToHours(weekMin)} h &nbsp;·&nbsp; ${minutesToHM(weekMin)}</div>
      </div>
      <div class="between faint" style="font-size:.9rem">
        <div>Billable value (this week)</div><div>${money(weekBillableValue)}</div>
      </div>
    </div>`;
}

function rowHtml(e) {
  const proj = e.project?.title || "—";
  const client = e.project?.client?.name ? ` · ${escapeHtml(e.project.client.name)}` : "";
  return `
    <div class="te-row">
      <div class="te-main">
        <div class="te-desc">${escapeHtml(e.description || "(no description)")}</div>
        <div class="te-meta faint">${escapeHtml(proj)}${client}
          ${e.billable ? "" : ` · <span class="badge grey">non-billable</span>`}
          ${e.invoice_id ? ` · <span class="badge green">billed</span>` : ""}</div>
      </div>
      <div class="te-dur nowrap">${minutesToHM(e.minutes)}</div>
      <div class="te-acts">
        <button class="btn link" data-edit-entry="${e.id}">edit</button>
        <button class="btn link" data-del-entry="${e.id}">del</button>
      </div>
    </div>`;
}
