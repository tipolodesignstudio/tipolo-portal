// Proposal template list.
import { escapeHtml } from "../core/format.js";
import { on } from "../core/render.js";
import { listTemplates, deleteTemplate } from "../core/api.js";
import { confirmModal } from "../components/modal.js";
import { toastOk, toastErr } from "../components/toast.js";

export async function render(root, ctx) {
  ctx.setCrumbs?.("Proposals / Templates");
  root.innerHTML = `
    <div class="page-head">
      <div>
        <div class="faint" style="font-size:.85rem"><a href="#/proposals">← Proposals</a></div>
        <h1>Proposal templates</h1>
        <div class="muted">Reusable sections and fee lines. Tokens like <code>{{client.name}}</code> fill in when you create a proposal.</div>
      </div>
      <a class="btn" href="#/proposals/templates/new">+ New template</a>
    </div>
    <div id="list"><div class="loading-row"><span class="spinner"></span> Loading…</div></div>`;

  const listEl = root.querySelector("#list");

  async function refresh() {
    try {
      const rows = await listTemplates();
      listEl.innerHTML = rows.length ? `
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Name</th><th class="num">Sections</th><th class="num">Fee lines</th><th></th></tr></thead>
          <tbody>
            ${rows.map((t) => `
              <tr class="clickable" data-id="${t.id}">
                <td>${escapeHtml(t.name)}</td>
                <td class="num">${(t.sections || []).length}</td>
                <td class="num">${(t.default_line_items || []).length}</td>
                <td class="right"><button class="btn link" data-del="${t.id}">delete</button></td>
              </tr>`).join("")}
          </tbody>
        </table></div>`
        : `<div class="empty"><h3>No templates yet</h3>
           <p class="faint">Create one so new proposals start from your standard wording.</p></div>`;
    } catch (err) {
      listEl.innerHTML = `<div class="empty"><p class="faint">${escapeHtml(err.message)}</p></div>`;
    }
  }

  on(root, "click", "tr[data-id]", (e, tr) => {
    if (e.target.closest("[data-del]")) return;
    ctx.navigate(`/proposals/templates/${tr.dataset.id}`);
  });
  on(root, "click", "[data-del]", async (e, btn) => {
    e.stopPropagation();
    const ok = await confirmModal("Delete this template? Existing proposals are unaffected.",
      { title: "Delete template", confirmText: "Delete" });
    if (!ok) return;
    try { await deleteTemplate(btn.dataset.del); toastOk("Deleted"); refresh(); }
    catch (err) { toastErr(err.message); }
  });

  await refresh();
}
