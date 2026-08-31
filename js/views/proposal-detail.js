// Proposal editor / viewer + convert-to-project.
import { escapeHtml, money, num, date, isoDate } from "../core/format.js";
import { on } from "../core/render.js";
import {
  getProposal, updateProposal, deleteProposal, setProposalStatus, convertProposal,
  getSettings,
} from "../core/api.js";
import { lineAmount } from "../core/invoice-calc.js";
import { TOKEN_HELP } from "../core/tokens.js";
import { openModal, confirmModal } from "../components/modal.js";
import { field, select } from "../components/form.js";
import { toastOk, toastErr } from "../components/toast.js";
import { printProposal } from "../print/proposal-print.js";

const TONE = { draft: "grey", sent: "amber", accepted: "green", declined: "red" };
const LABEL = { draft: "Draft", sent: "Sent", accepted: "Accepted", declined: "Declined" };

export async function render(root, ctx) {
  const id = ctx.params.id;
  root.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading…</div>`;

  let p, settings;
  try { [p, settings] = await Promise.all([getProposal(id), getSettings().catch(() => ({}))]); }
  catch (err) {
    root.innerHTML = `<div class="empty"><h3>Proposal not found</h3>
      <p class="faint">${escapeHtml(err.message)}</p>
      <p><a href="#/proposals">← Back to proposals</a></p></div>`;
    return;
  }
  ctx.setCrumbs?.(`Proposals / ${p.number || "draft"}`);

  let sections = (p.sections || []).map((s) => ({ ...s }));
  let items = (p.line_items || []).map((li) => ({ ...li }));
  const editable = p.status === "draft";
  const subtotal = () => items.reduce((s, li) => s + lineAmount(li), 0);

  root.innerHTML = `
    <div class="page-head">
      <div>
        <div class="faint" style="font-size:.85rem">
          <a href="#/proposals">← Proposals</a> ·
          <a href="#/clients/${p.client?.id}">${escapeHtml(p.client?.name || "client")}</a>
        </div>
        <h1><span class="faint">${escapeHtml(p.number || "")}</span> ${escapeHtml(p.title)}
          <span class="badge ${TONE[p.status]}">${LABEL[p.status]}</span></h1>
      </div>
      <div class="cluster" id="actions"></div>
    </div>

    ${p.converted_project_id ? `<div class="alert success" style="margin-bottom:16px">
      Converted to project
      <a href="#/projects/${p.converted_project_id}">${escapeHtml(p.converted_project?.number || "")}</a>.
    </div>` : ""}

    <div class="card">
      <div class="form-grid cols-2">
        ${field("title", "Project title", p.title, { required: true })}
        ${select("project_scope", "Scope", p.project_scope,
          ["landscape", "multimedia", "other"].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })))}
        ${field("valid_until", "Valid until", p.valid_until, { type: "date" })}
      </div>
      ${editable ? `<div class="hint" style="margin-top:8px">Tokens you can use in section text:
        ${TOKEN_HELP.map((t) => `<code>${escapeHtml(t)}</code>`).join(" ")}</div>` : ""}
    </div>

    <div class="card">
      <div class="between"><h2 class="mt-0">Sections</h2>
        ${editable ? `<button class="btn subtle sm" data-add-section>+ Add section</button>` : ""}</div>
      <div id="sections"></div>
    </div>

    <div class="card">
      <div class="between"><h2 class="mt-0">Fee schedule</h2>
        ${editable ? `<button class="btn subtle sm" data-add-line>+ Add line</button>` : ""}</div>
      <div class="table-wrap">
        <table class="data" id="lines"><thead><tr>
          <th style="min-width:200px">Description</th>
          <th class="num" style="width:80px">Qty</th>
          <th class="num" style="width:120px">Unit price</th>
          <th class="num" style="width:120px">Amount</th>
          ${editable ? "<th></th>" : ""}
        </tr></thead><tbody></tbody></table>
      </div>
      <div class="totals-box"><div class="totals">
        <div class="row grand"><span>Estimated fee</span><span id="fee-total">${money(subtotal())}</span></div>
        <div class="row faint" style="font-size:.85rem"><span></span><span>plus applicable taxes</span></div>
      </div></div>
    </div>`;

  const secEl = root.querySelector("#sections");
  const tbody = root.querySelector("#lines tbody");
  const actions = root.querySelector("#actions");

  function renderSections() {
    secEl.innerHTML = sections.length ? sections.map((s, i) => `
      <div class="sec-block" data-i="${i}">
        ${editable ? `
          <div class="cluster" style="gap:6px;margin-bottom:6px">
            <input data-k="heading" value="${escapeHtml(s.heading || "")}" placeholder="Section heading" style="flex:1" />
            <button class="btn link" data-move="-1" ${i === 0 ? "disabled" : ""}>↑</button>
            <button class="btn link" data-move="1" ${i === sections.length - 1 ? "disabled" : ""}>↓</button>
            <button class="btn link" data-del-sec>remove</button>
          </div>
          <textarea data-k="body" rows="4" placeholder="Section text…">${escapeHtml(s.body || "")}</textarea>
        ` : `
          <h3>${escapeHtml(s.heading || "")}</h3>
          <div style="white-space:pre-wrap">${escapeHtml(s.body || "")}</div>
        `}
      </div>`).join("")
      : `<p class="faint" style="font-size:.9rem">${editable ? "No sections yet — add one, or start a proposal from a template." : "No sections."}</p>`;
  }

  function renderLines() {
    tbody.innerHTML = items.length ? items.map((li, i) => `
      <tr data-i="${i}">
        <td>${editable ? `<input data-k="description" value="${escapeHtml(li.description || "")}" />` : escapeHtml(li.description || "")}</td>
        <td class="num">${editable ? `<input data-k="qty" type="number" step="0.01" min="0" value="${li.qty ?? 1}" style="text-align:right" />` : num(li.qty, 2)}</td>
        <td class="num">${editable ? `<input data-k="unit_price" type="number" step="0.01" min="0" value="${li.unit_price ?? 0}" style="text-align:right" />` : money(li.unit_price)}</td>
        <td class="num">${money(lineAmount(li))}</td>
        ${editable ? `<td class="right"><button class="btn link" data-del-line="${i}">remove</button></td>` : ""}
      </tr>`).join("")
      : `<tr><td colspan="${editable ? 5 : 4}" class="faint" style="text-align:center;padding:16px">No fee lines yet.</td></tr>`;
    root.querySelector("#fee-total").textContent = money(subtotal());
  }

  function renderActions() {
    const s = p.status;
    const b = [];
    b.push(`<button class="btn ghost" data-print>Save as PDF</button>`);
    if (s === "draft") b.push(`<button class="btn ghost" data-save>Save</button>`,
                              `<button class="btn" data-status="sent">Mark as sent</button>`);
    if (s === "sent") b.push(`<button class="btn" data-status="accepted">Accepted</button>`,
                             `<button class="btn ghost" data-status="declined">Declined</button>`,
                             `<button class="btn ghost sm" data-status="draft">Back to draft</button>`);
    if (s === "accepted" && !p.converted_project_id) b.push(`<button class="btn" data-convert>Convert to project</button>`);
    if (s === "declined") b.push(`<button class="btn ghost sm" data-status="draft">Reopen</button>`);
    b.push(`<button class="btn ghost sm" data-delete>Delete</button>`);
    actions.innerHTML = b.join("");
  }

  async function persist() {
    return updateProposal(p.id, {
      title: root.querySelector("[name=title]").value.trim() || p.title,
      project_scope: root.querySelector("[name=project_scope]").value,
      valid_until: root.querySelector("[name=valid_until]").value || null,
      sections,
      line_items: items,
      subtotal: Math.round(subtotal() * 100) / 100,
    });
  }

  // section editing
  on(root, "input", "#sections [data-k]", (e, el) => {
    const i = +el.closest(".sec-block").dataset.i;
    sections[i][el.dataset.k] = el.value;
  });
  on(root, "click", "[data-add-section]", () => { sections.push({ heading: "", body: "" }); renderSections(); });
  on(root, "click", "[data-del-sec]", (e, el) => { sections.splice(+el.closest(".sec-block").dataset.i, 1); renderSections(); });
  on(root, "click", "[data-move]", (e, el) => {
    const i = +el.closest(".sec-block").dataset.i; const j = i + (+el.dataset.move);
    if (j < 0 || j >= sections.length) return;
    [sections[i], sections[j]] = [sections[j], sections[i]];
    renderSections();
  });

  // fee line editing
  on(root, "input", "#lines input", (e, el) => {
    const i = +el.closest("tr").dataset.i; const k = el.dataset.k;
    items[i][k] = k === "description" ? el.value : Number(el.value);
    if (k !== "description") {
      el.closest("tr").querySelector("td:nth-child(4)").textContent = money(lineAmount(items[i]));
      root.querySelector("#fee-total").textContent = money(subtotal());
    }
  });
  on(root, "click", "[data-add-line]", () => { items.push({ description: "", qty: 1, unit_price: 0 }); renderLines(); });
  on(root, "click", "[data-del-line]", (e, el) => { items.splice(+el.dataset.delLine, 1); renderLines(); });

  on(root, "click", "[data-save]", async (e, btn) => {
    btn.disabled = true;
    try { p = await persist(); toastOk("Saved"); }
    catch (err) { toastErr(err.message); }
    finally { btn.disabled = false; }
  });

  on(root, "click", "[data-status]", async (e, btn) => {
    const next = btn.dataset.status;
    if (p.status === "draft" && next === "sent") { try { p = await persist(); } catch (err) { return toastErr(err.message); } }
    try { p = await setProposalStatus(p.id, next); toastOk(LABEL[next]); ctx.navigate(ctx.path); }
    catch (err) { toastErr(err.message); }
  });

  on(root, "click", "[data-convert]", async () => {
    const res = await openModal({
      title: `Convert ${p.number} to a project`,
      confirmText: "Create project",
      body: `<form class="form-grid">
        <div class="alert info">The project keeps this proposal's number (<strong>${escapeHtml(p.number)}</strong>) and starts in <strong>Lead</strong>.</div>
        ${field("start_date", "Start date", "", { type: "date" })}
        ${field("due_date", "Due date", "", { type: "date" })}
        <label style="display:flex;gap:8px;align-items:center;font-size:.9rem">
          <input type="checkbox" name="copy_deliverables" checked style="width:auto" />
          Seed deliverables from the fee schedule descriptions
        </label>
      </form>`,
      onConfirm: (dlg) => {
        const f = new FormData(dlg.querySelector("form"));
        return {
          start_date: f.get("start_date") || null,
          due_date: f.get("due_date") || null,
          deliverables: f.get("copy_deliverables") === "on"
            ? items.filter((li) => li.description).map((li) => ({ label: li.description, done: false }))
            : [],
        };
      },
    });
    if (!res) return;
    try {
      const project = await convertProposal(p, { status: "lead", ...res });
      toastOk(`Project ${project.number} created`);
      ctx.navigate(`/projects/${project.id}`);
    } catch (err) { toastErr(err.message); }
  });

  on(root, "click", "[data-print]", () => printProposal(p, settings));

  on(root, "click", "[data-delete]", async () => {
    const ok = await confirmModal(
      p.converted_project_id
        ? `Delete proposal ${p.number}? Its project stays, but the link is lost.`
        : `Delete proposal ${p.number || "draft"}? This can't be undone.`,
      { title: "Delete proposal", confirmText: "Delete" });
    if (!ok) return;
    try { await deleteProposal(p.id); toastOk("Deleted"); ctx.navigate("/proposals"); }
    catch (err) { toastErr(err.message); }
  });

  renderSections();
  renderLines();
  renderActions();
}
