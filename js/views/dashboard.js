// Dashboard. Phase 0: welcome + setup checklist. Grows in later phases with live stats.
import { escapeHtml } from "../core/format.js";
import { getSettings, getMyProfile } from "../core/api.js";

export async function render(root, ctx) {
  ctx.setCrumbs?.("Dashboard");
  root.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading…</div>`;

  let s = {}, profile = null;
  try { [s, profile] = await Promise.all([getSettings(), getMyProfile()]); }
  catch (err) { /* non-fatal on the dashboard */ console.warn(err); }

  const name = (profile?.full_name || "").split(" ")[0] || "there";
  const needs = [];
  if (!s.business_name) needs.push(`Add your business name &amp; address in <a href="#/settings">Settings</a>`);
  if (!s.email) needs.push(`Set a billing email in <a href="#/settings">Settings</a>`);

  root.innerHTML = `
    <div class="page-head">
      <div><h1>Welcome, ${escapeHtml(name)}</h1>
        <div class="muted">Tipolo Studio Portal</div></div>
    </div>

    <div class="grid-cards" style="margin-bottom:16px">
      <div class="stat"><div class="k">Clients</div><div class="v">—</div><div class="d">Added in Phase 1</div></div>
      <div class="stat"><div class="k">Active projects</div><div class="v">—</div><div class="d">Added in Phase 1</div></div>
      <div class="stat"><div class="k">Unbilled hours</div><div class="v">—</div><div class="d">Added in Phase 2</div></div>
      <div class="stat"><div class="k">Outstanding</div><div class="v">—</div><div class="d">Added in Phase 3</div></div>
    </div>

    ${needs.length ? `
      <div class="card">
        <h2>Finish setting up</h2>
        <ul style="margin:0;padding-left:18px;line-height:1.9">
          ${needs.map((n) => `<li>${n}</li>`).join("")}
        </ul>
      </div>` : `
      <div class="card">
        <h2>You're set up</h2>
        <p class="muted">Client and project tools arrive in the next phase.</p>
      </div>`}`;
}
