// Invoice builder — a split workspace: the document on the left, the printed page on
// the right, updating as you type. The same shape as the proposal builder, because it
// is the same job: write a document and watch the page it makes.
//
// An invoice is a progress bill. Each line carries the budget agreed in the proposal,
// what earlier invoices already drew against it, and what this one draws. Only the
// Current Invoice column is typed — Previous is summed from the project's other
// invoices, Balance is what is left, and a draw larger than the line's remaining
// budget is refused as you type.
//
// The preview is not a mock-up of the output. invoiceDocHtml() builds the same markup
// printInvoice() sends to the printer, styled by the same document.css.

import { escapeHtml, money, num, date, isoDate, debounce } from "../core/format.js";
import { on } from "../core/render.js";
import {
  getInvoice, updateInvoice, finalizeInvoice, markInvoicePaid, reopenInvoice,
  deleteInvoice, getSettings, previousDraws, updateClient, saveClientContacts,
  clientPrimaryContact,
} from "../core/api.js";
import {
  computeProgressTotals, lineAmount, lineBalance, lineRemaining,
} from "../core/invoice-calc.js";
import {
  PARTS, LEVELS, normaliseInvoiceSections, lineKey, newLineId,
} from "../core/invoice-template.js";
import { openModal, confirmModal } from "../components/modal.js";
import { field } from "../components/form.js";
import { toastOk, toastErr } from "../components/toast.js";
import { printInvoice } from "../print/invoice-print.js";
import { invoiceDocHtml, INVOICE_TOKEN_HELP } from "../print/invoice-doc.js";
import { effectiveStatus } from "./invoices.js";

const TONE = { draft: "grey", sent: "amber", paid: "green", overdue: "red" };
const LABEL = { draft: "Draft", sent: "Sent", paid: "Paid", overdue: "Overdue" };

const PAGE_W = 8.5 * 96;
const ZOOM_KEY = "tipolo.builder.zoom";
const SPLIT_KEY = "tipolo.builder.split";

let detach = null;   // teardown for the previously mounted builder

export async function render(root, ctx) {
  detach?.(); detach = null;

  const id = ctx.params.id;
  root.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading…</div>`;

  let inv, settings, prevMap;
  try {
    [inv, settings] = await Promise.all([getInvoice(id), getSettings().catch(() => ({}))]);
    prevMap = await previousDraws(inv.project_id, inv.id, inv.created_at).catch(() => new Map());
  } catch (err) {
    root.innerHTML = `<div class="empty"><h3>Invoice not found</h3>
      <p class="faint">${escapeHtml(err.message)}</p>
      <p><a href="#/invoices">← Back to invoices</a></p></div>`;
    return;
  }
  ctx.setCrumbs?.(`Invoices / ${inv.number || "draft"}`);

  /* ---------------- state ---------------- */

  let blocks = normaliseInvoiceSections(inv.sections);
  let lines = (inv.progress_lines || []).map((li) => ({ ...li }));
  // An invoice drafted before the document format carries qty x unit_price line items.
  // Show them as fully-drawn progress lines rather than an empty table.
  if (!lines.length && (inv.line_items || []).length) {
    lines = inv.line_items.map((li) => ({
      id: newLineId(),
      description: li.description || "",
      budget: lineAmount(li),
      amount: lineAmount(li),
      source_time_entry_ids: li.source_time_entry_ids || [],
      source_expense_ids: li.source_expense_ids || [],
    }));
  }
  let issueDate = inv.issue_date || isoDate();
  let dueDate = inv.due_date || "";
  let preparedBy = inv.prepared_by || "";
  let applyTaxes = inv.apply_taxes !== false;
  let part = PARTS[0].id;
  let dirty = false;
  let activeBlk = -1;

  const editable = inv.status === "draft";
  const taxDefs = (settings.tax_lines || []).filter((t) => t.enabled);

  const prevOf = (li) => prevMap.get(lineKey(li)) || 0;
  const totals = () => computeProgressTotals(lines, settings.tax_lines || [], applyTaxes);
  const live = () => ({
    ...inv, issue_date: issueDate, due_date: dueDate || null, prepared_by: preparedBy,
    apply_taxes: applyTaxes, sections: blocks, progress_lines: lines,
  });
  const previousArr = () => lines.map(prevOf);
  const inPart = (i) => (blocks[i].part || "lines") === part;

  /* ---------------- shell ---------------- */

  const st = effectiveStatus(inv);
  root.innerHTML = `
    <div class="builder" data-tab="edit">
      <div class="builder-bar">
        <div style="min-width:0">
          <div class="crumbs">
            <a href="#/invoices">← Invoices</a> ·
            <a href="#/projects/${inv.project?.id}">${escapeHtml(inv.project?.title || "project")}</a> ·
            ${escapeHtml(inv.project?.client?.name || "")}
          </div>
          <h1>
            <span class="num">${escapeHtml(inv.number || "Draft")}</span>
            <span class="name" data-bar-total>${money(inv.total)}</span>
            <span class="badge ${TONE[st]}">${LABEL[st]}</span>
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

      <div class="builder-split">
        <div class="pane pane-edit">
          <div class="doc-details">
            <label>Issue date
              ${editable ? `<input data-f="issue_date" type="date" value="${escapeHtml(issueDate)}" />`
                         : `<span class="ro">${date(issueDate)}</span>`}</label>
            <label>Due date
              ${editable ? `<input data-f="due_date" type="date" value="${escapeHtml(dueDate)}" />`
                         : `<span class="ro">${dueDate ? date(dueDate) : "30 days after sending"}</span>`}</label>
            <label>Prepared by
              ${editable ? `<input data-f="prepared_by" value="${escapeHtml(preparedBy)}" placeholder="Your name" />`
                         : `<span class="ro">${escapeHtml(preparedBy || "—")}</span>`}</label>
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
      const n = pt.id === "details" ? 0 : blocks.filter((b) => (b.part || "lines") === pt.id).length;
      return `<button data-part="${pt.id}" class="${pt.id === part ? "active" : ""}">
        ${escapeHtml(pt.label)}${n ? `<span class="n">${n}</span>` : ""}</button>`;
    }).join("");
  }

  /* ---------------- the writing surface ---------------- */

  // Bill To is printed from the client record, so this tab shows what will appear and
  // lets the record be corrected without leaving the invoice.
  function billToPanel() {
    const c = inv.project?.client || {};
    const person = c.is_individual ? null : clientPrimaryContact(c);
    const rows = [
      { k: "Name | Position", v: [person?.name, person?.title].filter(Boolean).join(" | ") },
      { k: "Company", v: c.is_individual ? "" : (c.name || ""), bold: true },
      { k: "Street, City, Province", v: [c.street, c.city, c.province].filter(Boolean).join(", ") },
    ];
    const missing = rows.filter((l) => !l.v).length;
    return `<div class="recip">
      <div class="between" style="margin-bottom:8px">
        <h2>Bill to</h2>
        ${editable ? `<button class="btn subtle sm" data-edit-recipient>Edit details</button>` : ""}
      </div>
      <dl>${rows.map((l) => `<dt>${escapeHtml(l.k)}</dt>
        <dd class="${l.v ? (l.bold ? "b" : "") : "gap"}">${l.v ? escapeHtml(l.v) : "not set"}</dd>`).join("")}</dl>
      ${missing ? `<p class="hint" style="margin-top:8px">${missing} line${missing === 1 ? "" : "s"}
        missing — they are simply left out of the address until filled in.</p>` : ""}
    </div>
    ${taxDefs.length ? `<div class="recip" style="margin-top:12px">
      <h2>Tax</h2>
      <label style="display:flex;gap:8px;align-items:center;font-size:.9rem;margin-top:8px">
        <input type="checkbox" data-f="apply_taxes" ${applyTaxes ? "checked" : ""}
          ${editable ? "" : "disabled"} style="width:auto" />
        Add ${escapeHtml(taxDefs.map((t) => `${t.label} ${num(t.rate, t.rate % 1 ? 2 : 0)}%`).join(" + "))}
      </label>
      <p class="hint" style="margin-top:6px">The house invoice shows a subtotal and
        nothing else. Turn this on only when the invoice has to carry tax.</p>
    </div>` : ""}`;
  }

  function blockHtml(b, i) {
    if (b.kind === "progress") {
      return `<div class="wb wb-table ${i === activeBlk ? "on" : ""}" data-i="${i}">
        ${tools(i, true)}
        <div class="wb-kind">Invoice table</div>
        ${progressEditor()}
      </div>`;
    }
    const lvl = b.level ?? (b.heading ? 3 : 0);
    return `<div class="wb ${i === activeBlk ? "on" : ""}" data-i="${i}">
      ${tools(i)}
      ${lvl > 0 ? `<input class="wh h3" data-k="heading" value="${escapeHtml(b.heading || "")}"
                     placeholder="Heading" ${editable ? "" : "readonly"} />` : ""}
      <textarea class="wt" data-k="body" placeholder="Write here…"
        ${editable ? "" : "readonly"}>${escapeHtml(b.body || "")}</textarea>
      ${editable ? `<div class="wb-format">
        <button data-wrap="**" title="Bold (⌘B)" style="font-weight:700">B</button>
        <button data-wrap="*" title="Italic (⌘I)" style="font-style:italic">I</button>
        <button data-wrap="__" title="Underline (⌘U)" style="text-decoration:underline">U</button>
        <span class="sep"></span>
        <button data-fmt="bullet" title="Bullet list">• List</button>
        <button data-fmt="number" title="Numbered list">1. List</button>
        <span class="sep"></span>
        <button data-fmt="outdent" title="Outdent (⇧Tab)">⇤</button>
        <button data-fmt="indent" title="Indent (Tab)">⇥</button>
      </div>` : ""}
    </div>`;
  }

  function tools(i, isTable = false) {
    if (!editable) return "";
    const b = blocks[i];
    const lvl = b.level ?? (b.heading ? 3 : 0);
    return `<div class="wb-tools">
      ${isTable ? "" : `<select data-k="level" title="Level">
        ${LEVELS.map((l) => `<option value="${l.value}" ${lvl === l.value ? "selected" : ""}>${l.label}</option>`).join("")}
      </select>`}
      <label class="brk" title="Start this block on a new page">
        <input type="checkbox" data-brk ${b.breakBefore ? "checked" : ""} /> page
      </label>
      <button class="icon-btn" data-move="-1" title="Move up">↑</button>
      <button class="icon-btn" data-move="1" title="Move down">↓</button>
      ${isTable ? "" : `<button class="icon-btn" data-del title="Delete">✕</button>`}
    </div>`;
  }

  /* The one table in the app where the arithmetic is the point: Budget and Previous
     bound what may be typed into Current, and Balance follows. */
  function progressEditor() {
    const t = totals();
    const sum = (fn) => lines.reduce((s, li) => s + fn(li, prevOf(li)), 0);
    return `<table class="mini prog" id="prog"><thead><tr>
        <th>Description</th>
        <th style="width:82px">Budget</th>
        <th style="width:72px">Previous</th>
        <th style="width:100px">Current</th>
        <th style="width:72px">Balance</th>
        <th></th>
      </tr></thead><tbody>
      ${lines.map((li, j) => {
        const prev = prevOf(li);
        const rem = lineRemaining(li, prev);
        return `<tr data-j="${j}">
          <td><input data-lk="description" value="${escapeHtml(li.description || "")}"
               ${editable ? "" : "readonly"} /></td>
          <td><input data-lk="budget" type="number" step="0.01" min="0" value="${li.budget ?? 0}"
               style="text-align:right" ${editable ? "" : "readonly"} /></td>
          <td class="amt prev">${prev ? money(prev) : "—"}</td>
          <td class="cur">
            <input data-lk="amount" type="number" step="0.01" min="0" max="${rem}"
              value="${li.amount ?? 0}" style="text-align:right" ${editable ? "" : "readonly"} />
            ${editable ? `<button class="btn link sm" data-max title="Bill the rest of this line">max</button>` : ""}
          </td>
          <td class="amt bal">${money(lineBalance(li, prev))}</td>
          <td>${editable ? `<button class="icon-btn" data-del-line>✕</button>` : ""}</td>
        </tr>`;
      }).join("")}
      </tbody>
      <tfoot><tr>
        <th>Subtotal</th>
        <th class="amt">${money(sum((li) => Number(li.budget) || 0))}</th>
        <th class="amt">${money(sum((li, p) => p))}</th>
        <th class="amt" data-cur-total>${money(t.subtotal)}</th>
        <th class="amt" data-bal-total>${money(sum(lineBalance))}</th>
        <th></th>
      </tr></tfoot></table>
      ${editable ? `<button class="btn link sm" data-add-line>+ Add line</button>` : ""}
      <p class="hint" data-cap-warn hidden style="margin-top:6px"></p>
      ${t.taxLines.length ? `<div class="mini-foot">
        <span>${escapeHtml(t.taxLines.map((x) => x.label).join(" + "))}</span>
        <strong>${money(t.taxTotal)} — total ${money(t.total)}</strong>
      </div>` : ""}`;
  }

  function renderEditor() {
    if (part === "details") {
      editor.innerHTML = billToPanel();
      renderParts();
      return;
    }
    const idx = blocks.map((_, i) => i).filter(inPart);
    editor.innerHTML = idx.length
      ? idx.map((i) => blockHtml(blocks[i], i)).join("")
      : `<p class="faint" style="font-size:.9rem">Nothing in this part yet.</p>`;
    if (editable) {
      editor.innerHTML += `<div class="wb-add">
        <button class="btn subtle sm" data-add-block>+ Add a block</button>
        <span class="hint" style="margin:0">Tokens: ${INVOICE_TOKEN_HELP.slice(0, 3)
          .map((t) => `<code>${escapeHtml(t)}</code>`).join(" ")}</span>
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
      ? Math.min(1, Math.max(0.3, (previewPane.clientWidth - 40) / PAGE_W))
      : Number(zoomMode) || 1;
    paper.style.setProperty("--zoom", zoom);
  }

  function paintPreview() {
    paper.innerHTML = invoiceDocHtml(live(), settings, { previous: previousArr() });
    const n = paper.querySelectorAll(".sheet-page").length;
    pagesLabel.textContent = `${n} page${n === 1 ? "" : "s"}`;
    root.querySelector("[data-bar-total]").textContent = money(totals().total);
    if (zoomMode === "fit") applyZoom();
  }

  function scrollPreviewTo(i) {
    const el = paper.querySelector(`[data-blk="${i}"]`);
    if (!el) return;
    const top = el.getBoundingClientRect().top - previewPane.getBoundingClientRect().top
      + previewPane.scrollTop;
    previewPane.scrollTo({ top: Math.max(0, top - 80), behavior: "smooth" });
  }

  const schedulePreview = debounce(paintPreview, 160);

  function touched() {
    dirty = true;
    dirtyDot.hidden = false;
    schedulePreview();
  }

  /* ---------------- actions ---------------- */

  function renderActions() {
    const s = inv.status;
    const b = [];
    if (s === "draft") b.push(`<button class="btn ghost sm" data-save>Save</button>`);
    b.push(`<button class="btn ghost sm" data-print>Save as PDF</button>`);
    if (s === "draft") b.push(`<button class="btn sm" data-finalize>Finalize &amp; send</button>`);
    if (s === "sent") b.push(`<button class="btn sm" data-paid>Mark paid</button>`,
                             `<button class="btn ghost sm" data-reopen>Back to draft</button>`);
    if (s === "paid") b.push(`<button class="btn ghost sm" data-reopen>Reopen</button>`);
    b.push(`<button class="btn ghost sm" data-delete>Delete</button>`);
    actions.innerHTML = b.join("");
  }

  async function persist(extra = {}) {
    const t = totals();
    return updateInvoice(inv.id, {
      issue_date: issueDate || null,
      due_date: dueDate || null,
      prepared_by: preparedBy.trim() || null,
      apply_taxes: applyTaxes,
      sections: blocks,
      progress_lines: lines,
      tax_lines: t.taxLines,
      subtotal: t.subtotal, tax_total: t.taxTotal, total: t.total,
      ...extra,
    });
  }

  async function save() {
    if (!editable || !dirty) return;
    const btn = root.querySelector("[data-save]");
    if (btn) btn.disabled = true;
    try {
      inv = await persist();
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
  });

  on(root, "input", ".doc-details [data-f]", (e, el) => {
    const k = el.dataset.f;
    if (k === "issue_date") issueDate = el.value;
    else if (k === "due_date") dueDate = el.value;
    else if (k === "prepared_by") preparedBy = el.value;
    touched();
  });
  on(root, "change", ".doc-details input[type=date]", () => touched());
  on(root, "change", "[data-f=apply_taxes]", (e, el) => {
    applyTaxes = el.checked;
    touched();
  });

  /* ---- blocks ---- */
  on(root, "input", ".wb [data-k]", (e, el) => {
    const i = +el.closest(".wb").dataset.i;
    blocks[i][el.dataset.k] = el.value;
    if (el.tagName === "TEXTAREA") grow(el);
    touched();
  });
  on(root, "change", ".wb [data-brk]", (e, el) => {
    blocks[+el.closest(".wb").dataset.i].breakBefore = el.checked;
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
    scrollPreviewTo(i);
  });
  on(root, "click", ".wb [data-move]", (e, el) => {
    const i = +el.closest(".wb").dataset.i;
    const dir = Number(el.dataset.move);
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
    const what = blocks[i].heading || "this block";
    if (!(await confirmModal(`Delete “${what}”?`, { confirmText: "Delete" }))) return;
    blocks.splice(i, 1);
    activeBlk = -1;
    renderEditor();
    touched();
  });
  on(root, "click", "[data-add-block]", () => {
    let at = blocks.length;
    for (let i = blocks.length - 1; i >= 0; i--) if (inPart(i)) { at = i + 1; break; }
    blocks.splice(at, 0, { part, level: 0, heading: "", body: "" });
    activeBlk = at;
    renderEditor();
    editor.querySelector(`.wb[data-i="${at}"] textarea`)?.focus();
    touched();
  });

  /* ---- the progress lines ---- */

  function warn(msg) {
    const el = editor.querySelector("[data-cap-warn]");
    if (!el) return;
    el.textContent = msg;
    el.hidden = !msg;
  }

  // Redraws the computed cells in place, so the caret stays where it is.
  function refreshLines() {
    const t = totals();
    let sumBal = 0;
    lines.forEach((li, j) => {
      const prev = prevOf(li);
      const bal = lineBalance(li, prev);
      sumBal += bal;
      const tr = editor.querySelector(`#prog tr[data-j="${j}"]`);
      if (!tr) return;
      tr.querySelector(".bal").textContent = money(bal);
      const cur = tr.querySelector("[data-lk=amount]");
      if (cur) cur.max = lineRemaining(li, prev);
    });
    const curTotal = editor.querySelector("[data-cur-total]");
    if (curTotal) curTotal.textContent = money(t.subtotal);
    const balTotal = editor.querySelector("[data-bal-total]");
    if (balTotal) balTotal.textContent = money(sumBal);
    root.querySelector("[data-bar-total]").textContent = money(t.total);
  }

  on(root, "input", "#prog [data-lk]", (e, el) => {
    const j = +el.closest("tr").dataset.j;
    const k = el.dataset.lk;
    if (k === "description") {
      lines[j].description = el.value;
      touched();
      return;
    }

    let v = el.value === "" ? 0 : Number(el.value);
    if (!Number.isFinite(v) || v < 0) v = 0;

    if (k === "amount") {
      // The whole point of the column: you cannot draw more than the line has left.
      const rem = lineRemaining(lines[j], prevOf(lines[j]));
      if (v > rem) {
        v = rem;
        el.value = String(rem);
        el.classList.add("bad");
        warn(`“${lines[j].description || "That line"}” has ${money(rem)} left of its `
          + `${money(lines[j].budget)} budget — the amount was capped there.`);
        setTimeout(() => el.classList.remove("bad"), 1200);
      } else {
        warn("");
      }
      lines[j].amount = v;
    } else {
      lines[j].budget = v;
      // Lowering a budget below what is already drawn would push the balance negative.
      const rem = lineRemaining(lines[j], prevOf(lines[j]));
      if ((Number(lines[j].amount) || 0) > rem) {
        lines[j].amount = Math.max(0, rem);
        const cur = el.closest("tr").querySelector("[data-lk=amount]");
        if (cur) cur.value = String(lines[j].amount);
        warn(`Budget lowered — this invoice's draw came down to ${money(lines[j].amount)}.`);
      }
    }
    refreshLines();
    touched();
  });

  on(root, "click", "#prog [data-max]", (e, el) => {
    const j = +el.closest("tr").dataset.j;
    lines[j].amount = Math.max(0, lineRemaining(lines[j], prevOf(lines[j])));
    el.closest("tr").querySelector("[data-lk=amount]").value = String(lines[j].amount);
    warn("");
    refreshLines();
    touched();
  });

  on(root, "click", "[data-add-line]", () => {
    lines.push({ id: newLineId(), description: "", budget: 0, amount: 0 });
    renderEditor();
    touched();
  });
  on(root, "click", "[data-del-line]", (e, el) => {
    lines.splice(+el.closest("tr").dataset.j, 1);
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

    const src = v.slice(from, to).split("\n");
    let out;

    if (action === "indent" || action === "outdent") {
      out = src.map((l) => action === "indent" ? `  ${l}` : l.replace(/^ {1,2}|^\t/, ""));
    } else if (action === "bullet") {
      const all = src.every((l) => /^[ \t]*[•\-*][ \t]+/.test(l) || !l.trim());
      out = src.map((l) => {
        if (!l.trim()) return l;
        const ws = l.match(/^[ \t]*/)[0];
        const text = l.replace(MARKER, "").trim();
        return all ? ws + text : `${ws}• ${text}`;
      });
    } else {
      const all = src.every((l) => /^[ \t]*\d+[.)][ \t]+/.test(l) || !l.trim());
      let n = 0;
      out = src.map((l) => {
        if (!l.trim()) return l;
        const ws = l.match(/^[ \t]*/)[0];
        const text = l.replace(MARKER, "").trim();
        return all ? ws + text : `${ws}${++n}. ${text}`;
      });
    }

    ta.setRangeText(out.join("\n"), from, to, "select");   // keeps undo history intact
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.focus();
  }

  // Wraps the selection in the marker, or unwraps it if it is already wrapped, so the
  // button toggles the way a word processor's does.
  function wrapSelection(ta, mark) {
    const { selectionStart: a, selectionEnd: b, value: v } = ta;
    const sel = v.slice(a, b);
    const n = mark.length;
    const outside = v.slice(a - n, a) === mark && v.slice(b, b + n) === mark;
    const inside = sel.length >= n * 2 && sel.startsWith(mark) && sel.endsWith(mark);

    if (outside) {
      ta.setRangeText(sel, a - n, b + n, "select");
    } else if (inside) {
      ta.setRangeText(sel.slice(n, -n), a, b, "select");
    } else {
      ta.setRangeText(mark + sel + mark, a, b, "end");
      if (sel) ta.setSelectionRange(a + n, a + n + sel.length);
      else ta.setSelectionRange(a + n, a + n);
    }
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.focus();
  }

  on(root, "click", ".wb-format button", (e, btn) => {
    e.preventDefault();
    const ta = btn.closest(".wb").querySelector("textarea");
    if (!ta) return;
    if (btn.dataset.wrap) wrapSelection(ta, btn.dataset.wrap);
    else formatLines(ta, btn.dataset.fmt);
  });

  // Inside a body box, Tab indents the text rather than jumping to the next control.
  // Escape first, then Tab, to leave the field.
  on(root, "keydown", ".wb textarea", (e, ta) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.altKey) {
      const mark = { b: "**", i: "*", u: "__" }[e.key.toLowerCase()];
      if (mark) { e.preventDefault(); wrapSelection(ta, mark); return; }
    }
    if (e.key === "Escape") { ta.blur(); return; }
    if (e.key !== "Tab") return;

    e.preventDefault();
    const from = ta.value.lastIndexOf("\n", Math.max(0, ta.selectionStart - 1)) + 1;
    const eol = ta.value.indexOf("\n", from);
    const line = ta.value.slice(from, eol === -1 ? ta.value.length : eol);

    if (MARKER.test(line) || ta.selectionStart !== ta.selectionEnd) {
      formatLines(ta, e.shiftKey ? "outdent" : "indent");
    } else if (e.shiftKey) {
      formatLines(ta, "outdent");
    } else {
      ta.setRangeText("\t", ta.selectionStart, ta.selectionEnd, "end");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });

  /* ---- Bill To details, edited on the client record ---- */
  on(root, "click", "[data-edit-recipient]", async () => {
    const c = inv.project?.client || {};
    const person = clientPrimaryContact(c);
    const res = await openModal({
      title: `Bill to — ${c.name || "client"}`,
      confirmText: "Save to client",
      body: `<form class="form-grid">
        <div class="hint">Saved on the client record, so every invoice and proposal for
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
      inv = await getInvoice(inv.id);     // reread so the address and preview agree
      renderEditor();
      paintPreview();
      toastOk("Bill to updated");
    } catch (err) { toastErr(err.message); }
  });

  /* ---- status ---- */

  on(root, "click", "[data-save]", save);

  on(root, "click", "[data-finalize]", async () => {
    if (!lines.some((li) => Number(li.amount) > 0)) {
      return toastErr("Nothing is being billed — put an amount in the Current column first.");
    }
    const t = totals();
    const ok = await confirmModal(
      `Finalize this invoice for ${money(t.total)}? It gets the next invoice number, its `
      + `time entries are marked billed, and it can't be edited after.`,
      { title: "Finalize & send", confirmText: "Finalize", danger: false });
    if (!ok) return;
    try {
      inv = await persist();
      inv = await finalizeInvoice(inv);
      toastOk(`Invoice ${inv.number} finalized`);
      dirty = false;
      ctx.navigate(ctx.path);
    } catch (err) { toastErr(err.message); }
  });

  on(root, "click", "[data-paid]", async () => {
    const res = await openModal({
      title: "Mark invoice paid",
      confirmText: "Mark paid",
      body: `<form class="form-grid">
        ${field("paid_date", "Payment date", isoDate(), { type: "date", required: true })}
        <label class="lbl" for="pm">Method</label>
        <select id="pm" name="payment_method">
          ${["e-transfer", "cheque", "cash", "credit card", "other"]
            .map((m) => `<option value="${m}">${m}</option>`).join("")}
        </select>
      </form>`,
      onConfirm: (dlg) => {
        const f = new FormData(dlg.querySelector("form"));
        return { paid_date: f.get("paid_date"), payment_method: f.get("payment_method") };
      },
    });
    if (!res) return;
    try { inv = await markInvoicePaid(inv.id, res); toastOk("Marked paid"); ctx.navigate(ctx.path); }
    catch (err) { toastErr(err.message); }
  });

  on(root, "click", "[data-reopen]", async () => {
    const back = inv.status === "sent";
    const ok = await confirmModal(
      back ? "Put this invoice back to draft? Its number stays with it."
           : "Reopen this invoice? It goes back to sent.",
      { title: "Reopen", confirmText: "Reopen", danger: false });
    if (!ok) return;
    try {
      inv = back ? await updateInvoice(inv.id, { status: "draft" }) : await reopenInvoice(inv.id);
      toastOk("Reopened");
      ctx.navigate(ctx.path);
    } catch (err) { toastErr(err.message); }
  });

  on(root, "click", "[data-print]", () => printInvoice(live(), settings, { previous: previousArr() }));

  on(root, "click", "[data-delete]", async () => {
    const ok = await confirmModal(
      inv.status === "draft"
        ? "Delete this draft invoice?"
        : `Delete invoice ${inv.number}? Its time entries are released back to unbilled, `
          + `and this will leave a gap in your invoice numbers.`,
      { title: "Delete invoice", confirmText: "Delete" });
    if (!ok) return;
    try { dirty = false; await deleteInvoice(inv.id); toastOk("Invoice deleted"); ctx.navigate("/invoices"); }
    catch (err) { toastErr(err.message); }
  });

  /* ---- preview chrome ---- */

  zoomSel.addEventListener("change", () => {
    zoomMode = zoomSel.value;
    localStorage.setItem(ZOOM_KEY, zoomMode);
    applyZoom();
  });

  on(root, "click", "[data-tab-btn]", (e, btn) => {
    builder.dataset.tab = btn.dataset.tabBtn;
    root.querySelectorAll("[data-tab-btn]").forEach((b) => b.classList.toggle("active", b === btn));
    if (btn.dataset.tabBtn === "preview") applyZoom();
  });

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
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = e.shiftKey ? 64 : 16;
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
