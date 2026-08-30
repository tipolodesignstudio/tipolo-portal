// Dashboard: live counts + project pipeline. Grows with $ figures in Phases 2–3.
import { escapeHtml, relTime, STATUS_LABELS, STATUS_TONE } from "../core/format.js";
import { on } from "../core/render.js";
import { getDashboardStats, getSettings, getMyProfile } from "../core/api.js";

const PIPELINE = ["lead", "proposal", "active", "on_hold", "complete"];

export async function render(root, ctx) {
  ctx.setCrumbs?.("Dashboard");
  root.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading…</div>`;

  let stats, settings = {}, profile = null;
  try {
    [stats, settings, profile] = await Promise.all([
      getDashboardStats(),
      getSettings().catch(() => ({})),
      getMyProfile().catch(() => null),
    ]);
  } catch (err) {
    root.innerHTML = `<div class="empty"><h3>Couldn't load the dashboard</h3>
      <p class="faint">${escapeHtml(err.message)}</p></div>`;
    return;
  }

  const name = (profile?.full_name || "").split(" ")[0] || "there";
  const setupNeeds = [];
  if (!settings.business_name) setupNeeds.push("business name & address");
  if (!settings.email) setupNeeds.push("billing email");

  root.innerHTML = `
    <div class="page-head">
      <div><h1>Welcome, ${escapeHtml(name)}</h1>
        <div class="muted">Tipolo Studio Portal</div></div>
    </div>

    <div class="grid-cards" style="margin-bottom:16px">
      <a class="stat" href="#/clients" style="text-decoration:none">
        <div class="k">Active clients</div><div class="v">${stats.activeClients}</div></a>
      <a class="stat" href="#/projects?status=active" style="text-decoration:none" data-nav-soft>
        <div class="k">Active projects</div><div class="v">${stats.activeProjects}</div></a>
      <div class="stat"><div class="k">Unbilled hours</div><div class="v faint">—</div><div class="d">Phase 2</div></div>
      <div class="stat"><div class="k">Outstanding</div><div class="v faint">—</div><div class="d">Phase 3</div></div>
    </div>

    ${setupNeeds.length ? `
      <div class="alert warn" style="margin-bottom:16px">
        Finish setup: add ${setupNeeds.join(" and ")} in <a href="#/settings">Settings</a>.
      </div>` : ""}

    <div class="card">
      <h2>Pipeline</h2>
      <div class="cluster" style="gap:18px">
        ${PIPELINE.map((s) => `
          <div>
            <div class="v" style="font-family:var(--font-heading);font-size:1.3rem">${stats.byStatus[s] || 0}</div>
            <div class="faint" style="font-size:.82rem">${STATUS_LABELS[s]}</div>
          </div>`).join("")}
      </div>
    </div>

    <div class="card">
      <div class="between"><h2 class="mt-0">Recently updated</h2><a href="#/projects" class="faint" style="font-size:.9rem">All projects →</a></div>
      ${stats.recent.length ? `
        <div class="table-wrap"><table class="data">
          <tbody>
            ${stats.recent.map((p) => `
              <tr class="clickable" data-pid="${p.id}">
                <td>${escapeHtml(p.title)}</td>
                <td class="muted">${escapeHtml(p.client?.name || "—")}</td>
                <td><span class="badge ${STATUS_TONE[p.status] || "grey"}">${STATUS_LABELS[p.status] || p.status}</span></td>
                <td class="muted right nowrap">${relTime(p.updated_at)}</td>
              </tr>`).join("")}
          </tbody>
        </table></div>` : `<p class="faint">No projects yet. <a href="#/projects">Create one →</a></p>`}
    </div>`;

  on(root, "click", "tr[data-pid]", (e, tr) => ctx.navigate(`/projects/${tr.dataset.pid}`));
}
