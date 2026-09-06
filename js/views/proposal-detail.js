// Proposal builder — a split workspace: the document on the left, the printed page on
// the right, updating as you type.
//
// The left pane is deliberately close to a word processor: the five parts of a Tipolo
// proposal are tabs, and inside each you type into headings and paragraphs set in the
// document's own type, with no visible boxes until you touch them. Text stays plain —
// what makes it a heading is its level, not markup you have to write.
//
// The preview is not a mock-up of the output. proposalDocHtml() builds the same markup
// printProposal() sends to the printer, styled by the same document.css, laid into a
// Letter-sized sheet. If it looks right here it prints right.

import { escapeHtml, money, num, date, debounce } from "../core/format.js";
import { on } from "../core/render.js";
import {
  getProposal, updateProposal, deleteProposal, setProposalStatus, convertProposal,
  getSettings, proposalSourceUrl, updateClient, saveClientContacts, clientPrimaryContact,
} from "../core/api.js";
import { lineAmount } from "../core/invoice-calc.js";
import { TOKEN_HELP } from "../core/tokens.js";
import { PARTS, LEVELS, normaliseSections, defaultSections, defaultLineItems }
  from "../core/proposal-template.js";
import { openModal, confirmModal } from "../components/modal.js";
import { field } from "../components/form.js";
import { toastOk, toastErr } from "../components/toast.js";
import { printProposal } from "../print/proposal-print.js";
import { proposalDocHtml } from "../print/proposal-doc.js";

const TONE = { draft: "grey", sent: "amber", accepted: "green", declined: "red" };
const LABEL = { draft: "Draft", sent: "Sent", accepted: "Accepted", declined: "Declined" };
const SCOPES = ["landscape", "multimedia", "other"];

// Page geometry lives in the paginator; the preview only needs the sheet width for
// the "Fit" zoom.
const PAGE_W = 8.5 * 96;

const ZOOM_KEY = "tipolo.builder.zoom";
const SPLIT_KEY = "tipolo.builder.split";

const KIND_LABEL = {
  schedule: "Schedule table",
  fees: "Base scope fee table",
  "optional-fees": "Optional scope fee table",
  signature: "Signature block",
};

let detach = null;  // teardown for the previously mounted builder

export async function render(root, ctx) {
  detach?.(); detach = null;

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

  /* ---------------- state ---------------- */

  let blocks = normaliseSections(p.sections || []);
  let items = (p.line_items || []).map((li) => ({ ...li }));
  let title = p.title || "";
  let scope = p.project_scope || "other";
  let part = PARTS[0].id;
  let dirty = false;
  let activeBlk = -1;

  const editable = p.status === "draft";
  const subtotal = () => items.reduce((s, li) => s + lineAmount(li), 0);
  const live = () => ({ ...p, title, project_scope: scope, sections: blocks, line_items: items });
  const inPart = (i) => (blocks[i].part || "workplan") === part;

  /* ---------------- shell ---------------- */

  root.innerHTML = `
    <div class="builder" data-tab="edit">
      <div class="builder-bar">
        <div style="min-width:0">
          <div class="crumbs">
            <a href="#/proposals">← Proposals</a> ·
            <a href="#/clients/${p.client?.id}">${escapeHtml(p.client?.name || "client")}</a>
            ${p.source_pdf_path ? ` · <a href="#" data-source>original PDF</a>` : ""}
          </div>
          <h1>
            ${p.number ? `<span class="num">${escapeHtml(p.number)}</span>` : ""}
            <span class="name" data-bar-title>${escapeHtml(title || "Untitled proposal")}</span>
            <span class="badge ${TONE[p.status]}">${LABEL[p.status]}</span>
          </h1>
        </div>
        <div class="builder-tabs" role="tablist">
          <button data-tab-btn="edit" class="active">Edit</button>
          <button data-tab-btn="preview">Preview</button>
        </div>
        <div class="bar-actions">
          <span class="dirty-dot" data-dirty hidden>Unsaved</span>
          <span id="actions" class="cluster" style="gap:8px"></span>
        </div>
      </div>

      ${p.converted_project_id ? `<div class="alert success" style="margin:12px 18px 0">
        Converted to project
        <a href="#/projects/${p.converted_project_id}">${escapeHtml(p.converted_project?.number || "")}</a>.
      </div>` : ""}

      <div class="builder-split">
        <div class="pane pane-edit">
          <div class="doc-details">
            <label>Project title
              ${editable
                ? `<input data-f="title" value="${escapeHtml(title)}" />`
                : `<span class="ro">${escapeHtml(title)}</span>`}</label>
            <label>Scope
              ${editable
                ? `<select data-f="project_scope">${SCOPES.map((s) =>
                    `<option value="${s}" ${scope === s ? "selected" : ""}>${s[0].toUpperCase() + s.slice(1)}</option>`).join("")}</select>`
                : `<span class="ro">${escapeHtml(scope)}</span>`}</label>
            <label>Valid until
              <span class="ro">${p.valid_until ? date(p.valid_until) : "1 year after “sent”"}</span></label>
          </div>
          <div class="part-nav" id="parts"></div>
          <div class="we" id="editor"></div>
        </div>
        <div class="splitter" data-splitter role="separator" aria-orientation="vertical"
             tabindex="0" aria-label="Resize the editor"></div>
        <div class="pane pane-preview" id="preview">
          <div class="preview-bar">
            <span class="lbl-sm">Print preview</span>
            <select data-zoom aria-label="Preview zoom">
              <option value="fit">Fit</option>
              <option value="0.5">50%</option>
              <option value="0.75">75%</option>
              <option value="1">100%</option>
            </select>
            <span class="pages" data-pages></span>
          </div>
          <div class="paper-wrap"><div class="paper" id="paper"></div></div>
        </div>
      </div>
    </div>`;

  const builder = root.querySelector(".builder");
  const partNav = root.querySelector("#parts");
  const editor = root.querySelector("#editor");
  const previewPane = root.querySelector("#preview");
  const paper = root.querySelector("#paper");
  const pagesLabel = root.querySelector("[data-pages]");
  const zoomSel = root.querySelector("[data-zoom]");
  const actions = root.querySelector("#actions");
  const dirtyDot = root.querySelector("[data-dirty]");
  const split = root.querySelector(".builder-split");

  /* ---------------- part navigation ---------------- */

  function renderParts() {
    partNav.innerHTML = PARTS.map((pt) => {
      const n = blocks.filter((b) => (b.part || "workplan") === pt.id).length;
      return `<button data-part="${pt.id}" class="${pt.id === part ? "active" : ""}">
        ${escapeHtml(pt.label)}${n ? `<span class="n">${n}</span>` : ""}</button>`;
    }).join("");
  }

  /* ---------------- the writing surface ---------------- */

  function blockHtml(b, i) {
    const lvl = b.level ?? (b.heading ? 2 : 0);

    if (b.kind) {
      return `<div class="wb wb-table ${i === activeBlk ? "on" : ""}" data-i="${i}">
        ${tools(i, true)}
        <div class="wb-kind">${escapeHtml(KIND_LABEL[b.kind] || b.kind)}</div>
        ${b.kind === "schedule" ? scheduleEditor(b, i)
          : b.kind === "optional-fees" ? optionalEditor(b, i)
          : b.kind === "fees" ? feeEditor()
          : `<p class="faint" style="font-size:.85rem;margin:0">
               Signs off the agreement. Printed from your business name — nothing to edit.</p>`}
      </div>`;
    }

    return `<div class="wb ${i === activeBlk ? "on" : ""}" data-i="${i}">
      ${tools(i)}
      ${lvl > 0 ? `<input class="wh h${lvl}" data-k="heading" value="${escapeHtml(b.heading || "")}"
                     placeholder="Heading ${lvl}" ${editable ? "" : "readonly"} />` : ""}
      <textarea class="wt" data-k="body" placeholder="Write here…"
        ${editable ? "" : "readonly"}>${escapeHtml(b.body || "")}</textarea>
      ${editable ? `<div class="wb-format">
        <button data-fmt="bullet" title="Bullet list">• List</button>
        <button data-fmt="number" title="Numbered list">1. List</button>
        <button data-fmt="outdent" title="Outdent (Shift+Tab)">⇤</button>
        <button data-fmt="indent" title="Indent (Tab)">⇥</button>
      </div>` : ""}
    </div>`;
  }

  function tools(i, isTable = false) {
    if (!editable) return "";
    const b = blocks[i];
    const lvl = b.level ?? (b.heading ? 2 : 0);
    return `<div class="wb-tools">
      ${isTable ? "" : `<select data-k="level" title="Level">
        ${LEVELS.map((l) => `<option value="${l.value}" ${lvl === l.value ? "selected" : ""}>${l.label}</option>`).join("")}
      </select>`}
      <button class="icon-btn" data-move="-1" title="Move up">↑</button>
      <button class="icon-btn" data-move="1" title="Move down">↓</button>
      <button class="icon-btn" data-del title="Delete">✕</button>
    </div>`;
  }

  function scheduleEditor(b, i) {
    const scale = b.scale || "week";
    const dated = (b.rows || []).some((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.start || r.due || ""));
    return `<div class="sched-scale">
        <span>Chart by</span>
        <label><input type="radio" name="sc${i}" data-scale="week" ${scale === "week" ? "checked" : ""}
          ${editable ? "" : "disabled"} /> Weeks</label>
        <label><input type="radio" name="sc${i}" data-scale="day" ${scale === "day" ? "checked" : ""}
          ${editable ? "" : "disabled"} /> Working days</label>
      </div>
      <table class="mini"><thead><tr>
        <th>Task</th><th style="width:132px">Start</th><th style="width:132px">Due</th><th></th>
      </tr></thead>
      <tbody>${(b.rows || []).map((r, j) => `<tr data-j="${j}">
        <td><input data-rk="task" value="${escapeHtml(r.task || "")}" ${editable ? "" : "readonly"} /></td>
        <td><input data-rk="start" type="date" value="${escapeHtml(isoOnly(r.start))}" ${editable ? "" : "readonly"} /></td>
        <td><input data-rk="due" type="date" value="${escapeHtml(isoOnly(r.due))}" ${editable ? "" : "readonly"} /></td>
        <td>${editable ? `<button class="icon-btn" data-del-row>✕</button>` : ""}</td></tr>`).join("")}
      </tbody></table>
      ${editable ? `<button class="btn link sm" data-add-row>+ Add row</button>` : ""}
      <p class="hint" style="margin-top:6px">
        ${dated
          ? "Leave <strong>Due</strong> empty for a milestone — it plots as a diamond, like Project Start."
          : "Set dates to draw the chart. Until then the schedule prints as a plain table."}
        Weeks run Monday–Friday.</p>`;
  }

  // A date input only accepts YYYY-MM-DD; older rows may hold "[Date]" or similar.
  function isoOnly(v) { return /^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : ""; }

  function optionalEditor(b, i) {
    return `<table class="mini"><thead><tr><th style="width:44px">Ref</th><th>Description</th><th style="width:110px">Fee</th><th></th></tr></thead>
      <tbody>${(b.rows || []).map((r, j) => `<tr data-j="${j}">
        <td><input data-rk="code" value="${escapeHtml(r.code || "")}" ${editable ? "" : "readonly"} /></td>
        <td><input data-rk="description" value="${escapeHtml(r.description || "")}" ${editable ? "" : "readonly"} /></td>
        <td><input data-rk="fee" value="${escapeHtml(r.fee || "")}" ${editable ? "" : "readonly"} /></td>
        <td>${editable ? `<button class="icon-btn" data-del-row>✕</button>` : ""}</td></tr>`).join("")}
      </tbody></table>
      ${editable ? `<button class="btn link sm" data-add-row>+ Add row</button>` : ""}`;
  }

  function feeEditor() {
    return `<table class="mini" id="lines"><thead><tr>
        <th>Task description and timeline</th><th style="width:70px">Hrs</th>
        <th style="width:100px">Rate</th><th style="width:96px">Fee</th><th></th>
      </tr></thead><tbody>
      ${items.map((li, j) => `<tr data-j="${j}">
        <td><input data-lk="description" value="${escapeHtml(li.description || "")}" ${editable ? "" : "readonly"} /></td>
        <td><input data-lk="qty" type="number" step="0.5" min="0" value="${li.qty ?? 1}" style="text-align:right" ${editable ? "" : "readonly"} /></td>
        <td><input data-lk="unit_price" type="number" step="0.01" min="0" value="${li.unit_price ?? 0}" style="text-align:right" ${editable ? "" : "readonly"} /></td>
        <td class="amt">${money(lineAmount(li))}</td>
        <td>${editable ? `<button class="icon-btn" data-del-line>✕</button>` : ""}</td></tr>`).join("")}
      </tbody></table>
      <div class="mini-foot"><span>Total</span><strong data-fee-total>${money(subtotal())}</strong></div>
      ${editable ? `<button class="btn link sm" data-add-line>+ Add task</button>` : ""}`;
  }

  // The letter is addressed from the client record, so the Cover Letter tab shows what
  // will print and lets the record be corrected without leaving the proposal.
  function recipientPanel() {
    const c = p.client || {};
    const person = c.is_individual ? null : clientPrimaryContact(c);
    const lines = [
      { k: "Name", v: person?.name || c.name || "", bold: true },
      { k: "Position, Company", v: [person?.title, c.is_individual ? "" : c.name].filter(Boolean).join(", ") },
      { k: "Street", v: c.street || "" },
      { k: "City, Province", v: [c.city, c.province].filter(Boolean).join(", ") },
      { k: "Email | Phone", v: [person?.email || c.email, person?.phone || c.phone].filter(Boolean).join(" | ") },
    ];
    const missing = lines.filter((l) => !l.v).length;
    return `<div class="recip">
      <div class="between" style="margin-bottom:8px">
        <h2>Addressed to</h2>
        ${editable ? `<button class="btn subtle sm" data-edit-recipient>Edit details</button>` : ""}
      </div>
      <dl>${lines.map((l) => `<dt>${escapeHtml(l.k)}</dt>
        <dd class="${l.v ? (l.bold ? "b" : "") : "gap"}">${l.v ? escapeHtml(l.v) : "not set"}</dd>`).join("")}</dl>
      ${missing ? `<p class="hint" style="margin-top:8px">${missing} line${missing === 1 ? "" : "s"}
        missing — they are simply left out of the letter until filled in.</p>` : ""}
    </div>`;
  }

  function renderEditor() {
    const idx = blocks.map((_, i) => i).filter(inPart);
    editor.innerHTML = (part === "cover" ? recipientPanel() : "");
    editor.innerHTML += idx.length
      ? idx.map((i) => blockHtml(blocks[i], i)).join("")
      : `<p class="faint" style="font-size:.9rem">Nothing in this part yet.</p>`;
    if (editable) {
      editor.innerHTML += `<div class="wb-add">
        <button class="btn subtle sm" data-add-block>+ Add a block</button>
        <span class="hint" style="margin:0">Tokens: ${TOKEN_HELP.slice(0, 4).map((t) => `<code>${escapeHtml(t)}</code>`).join(" ")}</span>
      </div>`;
    }
    editor.querySelectorAll("textarea").forEach(grow);
    renderParts();
  }

  function grow(ta) {
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }

  /* ---------------- preview pane ---------------- */

  let zoom = 1;
  let zoomMode = localStorage.getItem(ZOOM_KEY) || "fit";
  zoomSel.value = zoomMode;

  function applyZoom() {
    zoom = zoomMode === "fit"
      ? Math.min(1, Math.max(0.35, (previewPane.clientWidth - 40) / PAGE_W))
      : Number(zoomMode) || 1;
    paper.style.setProperty("--zoom", zoom);
  }

  function paintPreview() {
    // proposalDocHtml() returns finished 8.5x11 sheets, so the preview is the pages.
    paper.innerHTML = proposalDocHtml(live(), settings);
    const n = paper.querySelectorAll(".sheet-page").length;
    pagesLabel.textContent = `${n} page${n === 1 ? "" : "s"}`;
    highlightPreview();
  }

  function highlightPreview() {
    paper.querySelectorAll(".hi").forEach((el) => el.classList.remove("hi"));
    if (activeBlk < 0) return;
    paper.querySelector(`[data-blk="${activeBlk}"]`)?.classList.add("hi");
  }

  function scrollPreviewTo(i) {
    const el = paper.querySelector(`[data-blk="${i}"]`);
    if (!el) return;
    const top = el.getBoundingClientRect().top - previewPane.getBoundingClientRect().top
      + previewPane.scrollTop;
    previewPane.scrollTo({ top: Math.max(0, top - 80), behavior: "smooth" });
  }

  // Repainting the whole sheet on every keystroke is wasteful and makes the caret
  // stutter; one frame behind the typing is imperceptible and keeps input smooth.
  const schedulePreview = debounce(paintPreview, 160);

  function touched() {
    dirty = true;
    dirtyDot.hidden = false;
    schedulePreview();
  }

  /* ---------------- actions ---------------- */

  function renderActions() {
    const s = p.status;
    const b = [];
    if (s === "draft") b.push(`<button class="btn ghost sm" data-save>Save</button>`);
    b.push(`<button class="btn ghost sm" data-print>Save as PDF</button>`);
    if (s === "draft") b.push(`<button class="btn sm" data-status="sent">Mark as sent</button>`);
    if (s === "sent") b.push(`<button class="btn sm" data-status="accepted">Accepted</button>`,
                             `<button class="btn ghost sm" data-status="declined">Declined</button>`,
                             `<button class="btn ghost sm" data-status="draft">Back to draft</button>`);
    if (s === "accepted" && !p.converted_project_id) b.push(`<button class="btn sm" data-convert>Convert to project</button>`);
    if (s === "declined") b.push(`<button class="btn ghost sm" data-status="draft">Reopen</button>`);
    b.push(`<button class="btn ghost sm" data-delete>Delete</button>`);
    actions.innerHTML = b.join("");
  }

  async function persist() {
    return updateProposal(p.id, {
      title: title.trim() || p.title,
      project_scope: scope,
      sections: blocks,
      line_items: items,
      subtotal: Math.round(subtotal() * 100) / 100,
    });
  }

  async function save() {
    if (!editable || !dirty) return;
    const btn = root.querySelector("[data-save]");
    if (btn) btn.disabled = true;
    try {
      p = await persist();
      dirty = false;
      dirtyDot.hidden = true;
      toastOk("Saved");
    } catch (err) { toastErr(err.message); }
    finally { if (btn) btn.disabled = false; }
  }

  /* ---------------- wiring ---------------- */

  on(root, "click", "[data-part]", (e, btn) => {
    part = btn.dataset.part;
    activeBlk = -1;
    renderEditor();
    editor.scrollIntoView?.({ block: "nearest" });
  });

  // title / scope live in a small strip above the editor for the Cover part
  on(root, "input", "[data-f]", (e, el) => {
    const k = el.dataset.f;
    if (k === "title") {
      title = el.value;
      root.querySelector("[data-bar-title]").textContent = title || "Untitled proposal";
    } else if (k === "project_scope") scope = el.value;
    touched();
  });

  /* ---- blocks ---- */
  on(root, "input", ".wb [data-k]", (e, el) => {
    const i = +el.closest(".wb").dataset.i;
    blocks[i][el.dataset.k] = el.value;
    if (el.tagName === "TEXTAREA") grow(el);
    touched();
  });
  on(root, "change", ".wb select[data-k=level]", (e, el) => {
    const i = +el.closest(".wb").dataset.i;
    blocks[i].level = Number(el.value);
    if (blocks[i].level === 0) blocks[i].heading = "";
    renderEditor();
    touched();
  });
  on(root, "focusin", ".wb", (e, el) => {
    const i = +el.dataset.i;
    if (i === activeBlk) return;
    activeBlk = i;
    editor.querySelectorAll(".wb").forEach((w) => w.classList.toggle("on", +w.dataset.i === i));
    highlightPreview();
    scrollPreviewTo(i);
  });
  on(root, "click", ".wb [data-move]", (e, el) => {
    const i = +el.closest(".wb").dataset.i;
    const dir = Number(el.dataset.move);
    // move within the part: swap with the next block that belongs to it
    let j = i + dir;
    while (j >= 0 && j < blocks.length && !inPart(j)) j += dir;
    if (j < 0 || j >= blocks.length) return;
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    activeBlk = j;
    renderEditor();
    touched();
  });
  on(root, "click", ".wb [data-del]", async (e, el) => {
    const i = +el.closest(".wb").dataset.i;
    const what = blocks[i].heading || KIND_LABEL[blocks[i].kind] || "this block";
    if (!(await confirmModal(`Delete “${what}”?`, { confirmText: "Delete" }))) return;
    blocks.splice(i, 1);
    activeBlk = -1;
    renderEditor();
    touched();
  });
  on(root, "click", "[data-add-block]", () => {
    // drop it after the last block of this part so it lands where you are reading
    let at = blocks.length;
    for (let i = blocks.length - 1; i >= 0; i--) if (inPart(i)) { at = i + 1; break; }
    blocks.splice(at, 0, { part, level: 2, heading: "", body: "" });
    activeBlk = at;
    renderEditor();
    editor.querySelector(`.wb[data-i="${at}"] .wh`)?.focus();
    touched();
  });

  /* ---- table rows inside blocks ---- */
  // `change` as well as `input`: a date picked from the calendar popup fires change.
  const rowEdit = (e, el) => {
    const i = +el.closest(".wb").dataset.i;
    const j = +el.closest("tr").dataset.j;
    blocks[i].rows[j][el.dataset.rk] = el.value;
    touched();
  };
  on(root, "input", ".wb [data-rk]", rowEdit);
  on(root, "change", ".wb input[type=date][data-rk]", rowEdit);
  on(root, "change", ".wb [data-scale]", (e, el) => {
    const i = +el.closest(".wb").dataset.i;
    blocks[i].scale = el.dataset.scale;
    renderEditor();
    touched();
  });
  on(root, "click", ".wb [data-add-row]", (e, el) => {
    const i = +el.closest(".wb").dataset.i;
    const b = blocks[i];
    b.rows = b.rows || [];
    b.rows.push(b.kind === "schedule" ? { task: "", start: "", due: "" } : { code: "", description: "", fee: "" });
    renderEditor();
    touched();
  });
  on(root, "click", ".wb [data-del-row]", (e, el) => {
    const i = +el.closest(".wb").dataset.i;
    blocks[i].rows.splice(+el.closest("tr").dataset.j, 1);
    renderEditor();
    touched();
  });

  /* ---- list formatting, applied to the selected lines ---- */

  const MARKER = /^([ \t]*)([•\-*]|\d+[.)]|[A-Za-z][.)])[ \t]+/;

  function formatLines(ta, action) {
    const v = ta.value;
    const from = v.lastIndexOf("\n", Math.max(0, ta.selectionStart - 1)) + 1;
    let to = v.indexOf("\n", ta.selectionEnd);
    if (to === -1) to = v.length;

    const lines = v.slice(from, to).split("\n");
    let out;

    if (action === "indent" || action === "outdent") {
      out = lines.map((l) => action === "indent"
        ? `  ${l}`
        : l.replace(/^ {1,2}|^\t/, ""));
    } else if (action === "bullet") {
      // already all bullets -> strip them, so the button toggles
      const allBullets = lines.every((l) => /^[ \t]*[•\-*][ \t]+/.test(l) || !l.trim());
      out = lines.map((l) => {
        if (!l.trim()) return l;
        const ws = l.match(/^[ \t]*/)[0];
        const text = l.replace(MARKER, "").trim();
        return allBullets ? ws + text : `${ws}• ${text}`;
      });
    } else {
      const allNumbered = lines.every((l) => /^[ \t]*\d+[.)][ \t]+/.test(l) || !l.trim());
      let n = 0;
      out = lines.map((l) => {
        if (!l.trim()) return l;
        const ws = l.match(/^[ \t]*/)[0];
        const text = l.replace(MARKER, "").trim();
        return allNumbered ? ws + text : `${ws}${++n}. ${text}`;
      });
    }

    const next = out.join("\n");
    ta.setRangeText(next, from, to, "select");   // keeps undo history intact
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.focus();
  }

  on(root, "click", ".wb-format button", (e, btn) => {
    e.preventDefault();
    const ta = btn.closest(".wb").querySelector("textarea");
    if (ta) formatLines(ta, btn.dataset.fmt);
  });

  // Tab indents a list item, the way it does in a word processor. Only on list lines,
  // so Tab still moves between fields everywhere else.
  on(root, "keydown", ".wb textarea", (e, ta) => {
    if (e.key !== "Tab") return;
    const from = ta.value.lastIndexOf("\n", Math.max(0, ta.selectionStart - 1)) + 1;
    const line = ta.value.slice(from, ta.value.indexOf("\n", from) === -1
      ? ta.value.length : ta.value.indexOf("\n", from));
    if (!MARKER.test(line)) return;
    e.preventDefault();
    formatLines(ta, e.shiftKey ? "outdent" : "indent");
  });

  /* ---- base-scope fee lines ---- */
  on(root, "input", "#lines [data-lk]", (e, el) => {
    const j = +el.closest("tr").dataset.j;
    const k = el.dataset.lk;
    items[j][k] = k === "description" ? el.value : Number(el.value);
    if (k !== "description") {
      el.closest("tr").querySelector(".amt").textContent = money(lineAmount(items[j]));
      root.querySelector("[data-fee-total]").textContent = money(subtotal());
    }
    touched();
  });
  on(root, "click", "[data-add-line]", () => {
    items.push({ description: "", qty: 1, unit_price: 0 });
    renderEditor();
    touched();
  });
  on(root, "click", "[data-del-line]", (e, el) => {
    items.splice(+el.closest("tr").dataset.j, 1);
    renderEditor();
    touched();
  });

  on(root, "click", "[data-edit-recipient]", async () => {
    const c = p.client || {};
    const person = clientPrimaryContact(c);
    const res = await openModal({
      title: `Recipient details — ${c.name || "client"}`,
      confirmText: "Save to client",
      body: `<form class="form-grid">
        <div class="hint">Saved on the client record, so every proposal for
          ${escapeHtml(c.name || "them")} uses it.</div>
        <div class="form-grid cols-2">
          ${field("contact_name", "Name", person?.name || "", { ph: "Ken Larsson" })}
          ${field("contact_title", "Position", person?.title || "", { ph: "Sr. Principal" })}
        </div>
        ${field("street", "Street address", c.street || "", { ph: "2305 Hemlock Street" })}
        <div class="form-grid cols-2">
          ${field("city", "City", c.city || "", { ph: "Vancouver" })}
          ${field("province", "Province", c.province || "", { ph: "BC" })}
        </div>
        <div class="form-grid cols-2">
          ${field("email", "Email", person?.email || c.email || "", { type: "email" })}
          ${field("phone", "Phone", person?.phone || c.phone || "")}
        </div>
      </form>`,
      onConfirm: (dlg) => Object.fromEntries(new FormData(dlg.querySelector("form"))),
    });
    if (!res) return;
    try {
      await updateClient(c.id, {
        street: res.street.trim() || null,
        city: res.city.trim() || null,
        province: res.province.trim() || null,
        email: res.email.trim() || null,
        phone: res.phone.trim() || null,
      });
      if (res.contact_name.trim()) {
        await saveClientContacts(c.id, [{
          ...(person?.id ? { id: person.id } : {}),
          name: res.contact_name, title: res.contact_title,
          email: res.email, phone: res.phone, is_primary: true,
        }]);
      }
      p = await getProposal(p.id);      // reread so the letter and preview agree
      renderEditor();
      paintPreview();
      toastOk("Recipient updated");
    } catch (err) { toastErr(err.message); }
  });

  on(root, "click", "[data-save]", save);

  on(root, "click", "[data-status]", async (e, btn) => {
    const next = btn.dataset.status;
    if (p.status === "draft" && next === "sent") {
      try { p = await persist(); dirty = false; dirtyDot.hidden = true; }
      catch (err) { return toastErr(err.message); }
    }
    if (dirty && !(await confirmModal(
      "You have unsaved edits. Change the status anyway? Your edits will be lost.",
      { confirmText: "Change status" }))) return;
    try { p = await setProposalStatus(p.id, next); dirty = false; toastOk(LABEL[next]); ctx.navigate(ctx.path); }
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

  on(root, "click", "[data-print]", () => printProposal(live(), settings));

  // The bucket is private, so mint a signed URL. Open the tab first — doing it after
  // the await would trip the popup blocker.
  on(root, "click", "[data-source]", async (e) => {
    e.preventDefault();
    const w = window.open("", "_blank");
    try {
      const url = await proposalSourceUrl(p.source_pdf_path);
      if (w) w.location = url; else window.location.href = url;
    } catch (err) { w?.close(); toastErr(err.message); }
  });

  on(root, "click", "[data-delete]", async () => {
    const ok = await confirmModal(
      p.converted_project_id
        ? `Delete proposal ${p.number}? Its project stays, but the link is lost.`
        : `Delete proposal ${p.number || "draft"}? This can't be undone.`,
      { title: "Delete proposal", confirmText: "Delete" });
    if (!ok) return;
    try { dirty = false; await deleteProposal(p.id); toastOk("Deleted"); ctx.navigate("/proposals"); }
    catch (err) { toastErr(err.message); }
  });

  zoomSel.addEventListener("change", () => {
    zoomMode = zoomSel.value;
    localStorage.setItem(ZOOM_KEY, zoomMode);
    applyZoom();
  });

  on(root, "click", "[data-tab-btn]", (e, btn) => {
    const t = btn.dataset.tabBtn;
    builder.dataset.tab = t;
    root.querySelectorAll("[data-tab-btn]").forEach((b) => b.classList.toggle("active", b === btn));
    if (t === "preview") applyZoom();
  });

  /* ---- splitter drag ---- */
  const savedSplit = localStorage.getItem(SPLIT_KEY);
  if (savedSplit) split.style.setProperty("--edit-w", savedSplit);

  const splitter = root.querySelector("[data-splitter]");
  splitter.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    splitter.setPointerCapture(e.pointerId);
    splitter.classList.add("dragging");
    document.body.classList.add("splitting");

    const move = (ev) => {
      const box = split.getBoundingClientRect();
      const px = Math.min(Math.max(ev.clientX - box.left, 340), box.width - 380);
      split.style.setProperty("--edit-w", `${px}px`);
    };
    const up = () => {
      splitter.classList.remove("dragging");
      document.body.classList.remove("splitting");
      splitter.removeEventListener("pointermove", move);
      splitter.removeEventListener("pointerup", up);
      localStorage.setItem(SPLIT_KEY, split.style.getPropertyValue("--edit-w"));
      applyZoom();
    };
    splitter.addEventListener("pointermove", move);
    splitter.addEventListener("pointerup", up);
  });
  splitter.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 64 : 16;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const box = split.getBoundingClientRect();
    const cur = root.querySelector(".pane-edit").getBoundingClientRect().width;
    const px = Math.min(Math.max(cur + (e.key === "ArrowRight" ? step : -step), 340), box.width - 380);
    split.style.setProperty("--edit-w", `${px}px`);
    localStorage.setItem(SPLIT_KEY, `${px}px`);
    applyZoom();
  });

  /* ---- window-level listeners, torn down when the view is swapped out ---- */

  const onKey = (e) => {
    if (!root.isConnected) return cleanup();
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
  };
  const onBeforeUnload = (e) => {
    if (!root.isConnected || !dirty) return;
    e.preventDefault();
    e.returnValue = "";
  };
  const onHash = () => setTimeout(() => { if (!root.isConnected) cleanup(); }, 0);

  const ro = new ResizeObserver(debounce(() => {
    if (!root.isConnected) return cleanup();
    if (zoomMode === "fit") applyZoom();
  }, 120));
  ro.observe(previewPane);

  function cleanup() {
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("beforeunload", onBeforeUnload);
    window.removeEventListener("hashchange", onHash);
    ro.disconnect();
    detach = null;
  }
  window.addEventListener("keydown", onKey);
  window.addEventListener("beforeunload", onBeforeUnload);
  window.addEventListener("hashchange", onHash);
  detach = cleanup;

  /* ---------------- first paint ---------------- */

  renderEditor();
  renderActions();
  applyZoom();
  paintPreview();
}
