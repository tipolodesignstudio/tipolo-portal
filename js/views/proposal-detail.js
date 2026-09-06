// Proposal builder — a split workspace: the form on the left, the printed page on the
// right, updating as you type.
//
// The preview is not a mock-up of the output. It is the output: proposalDocHtml() builds
// the same markup printProposal() sends to the printer, styled by the same document.css,
// laid into a Letter-sized sheet. If it looks right here it prints right.

import { escapeHtml, money, num, date, debounce } from "../core/format.js";
import { on } from "../core/render.js";
import {
  getProposal, updateProposal, deleteProposal, setProposalStatus, convertProposal,
  getSettings, proposalSourceUrl,
} from "../core/api.js";
import { lineAmount } from "../core/invoice-calc.js";
import { TOKEN_HELP } from "../core/tokens.js";
import { openModal, confirmModal } from "../components/modal.js";
import { field } from "../components/form.js";
import { toastOk, toastErr } from "../components/toast.js";
import { printProposal } from "../print/proposal-print.js";
import { proposalDocHtml } from "../print/proposal-doc.js";

const TONE = { draft: "grey", sent: "amber", accepted: "green", declined: "red" };
const LABEL = { draft: "Draft", sent: "Sent", accepted: "Accepted", declined: "Declined" };
const SCOPES = ["landscape", "multimedia", "other"];

// Letter at 96dpi. The letterhead's band and bar repeat on every printed page, so the
// room left for body copy is what remains between them.
const PAGE_H = 11 * 96;
const PAGE_W = 8.5 * 96;
const BAND_H = 1.75 * 96;   // cream header band
const BAR_H = 0.47 * 96;    // dark footer bar
const CONTENT_H = PAGE_H - BAND_H - BAR_H;

const ZOOM_KEY = "tipolo.builder.zoom";
const SPLIT_KEY = "tipolo.builder.split";

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

  let sections = (p.sections || []).map((s) => ({ ...s }));
  let items = (p.line_items || []).map((li) => ({ ...li }));
  let title = p.title || "";
  let scope = p.project_scope || "other";
  let dirty = false;
  let activeSec = -1;

  const editable = p.status === "draft";
  const subtotal = () => items.reduce((s, li) => s + lineAmount(li), 0);

  // The proposal as it stands in the editor right now — what the preview draws.
  const live = () => ({ ...p, title, project_scope: scope, sections, line_items: items });

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
        <div class="pane pane-edit" id="edit"></div>
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
  const editPane = root.querySelector("#edit");
  const previewPane = root.querySelector("#preview");
  const paper = root.querySelector("#paper");
  const pagesLabel = root.querySelector("[data-pages]");
  const zoomSel = root.querySelector("[data-zoom]");
  const actions = root.querySelector("#actions");
  const dirtyDot = root.querySelector("[data-dirty]");
  const split = root.querySelector(".builder-split");

  /* ---------------- editor pane ---------------- */

  function editorHtml() {
    return `
      <div class="b-card">
        <div class="form-grid cols-2">
          <div class="field">
            <label class="lbl" for="b_title">Project title</label>
            ${editable
              ? `<input id="b_title" data-f="title" value="${escapeHtml(title)}" required />`
              : `<div class="ro-value">${escapeHtml(title)}</div>`}
          </div>
          <div class="field">
            <label class="lbl" for="b_scope">Scope</label>
            ${editable
              ? `<select id="b_scope" data-f="project_scope">${SCOPES.map((s) =>
                  `<option value="${s}" ${scope === s ? "selected" : ""}>${s[0].toUpperCase() + s.slice(1)}</option>`).join("")}</select>`
              : `<div class="ro-value">${escapeHtml(scope)}</div>`}
          </div>
          <div class="field">
            <label class="lbl">Valid until</label>
            <div class="ro-value">${p.valid_until ? date(p.valid_until)
              : `<span class="faint">set to 1 year after “sent”</span>`}</div>
          </div>
          <div class="field">
            <label class="lbl">Client</label>
            <div class="ro-value"><a href="#/clients/${p.client?.id}">${escapeHtml(p.client?.name || "—")}</a></div>
          </div>
        </div>
      </div>

      <div class="b-card">
        <div class="between">
          <h2>Sections <span class="count" data-sec-count></span></h2>
          ${editable ? `<button class="btn subtle sm" data-add-section>+ Add section</button>` : ""}
        </div>
        <div id="sections"></div>
        ${editable ? `<div class="hint" style="margin-top:10px">
          Tokens fill themselves in on the page opposite:
          ${TOKEN_HELP.map((t) => `<code>${escapeHtml(t)}</code>`).join(" ")}
        </div>` : ""}
      </div>

      <div class="b-card">
        <div class="between">
          <h2>Fee schedule <span class="count" data-line-count></span></h2>
          ${editable ? `<button class="btn subtle sm" data-add-line>+ Add line</button>` : ""}
        </div>
        <table class="fee-table"><thead><tr>
          <th>Description</th>
          <th class="num" style="width:74px">Qty</th>
          <th class="num" style="width:110px">Unit price</th>
          <th class="num" style="width:104px">Amount</th>
          ${editable ? `<th style="width:28px"></th>` : ""}
        </tr></thead><tbody id="lines"></tbody></table>
        <div class="fee-foot">
          <span>Estimated fee <span class="faint" style="font-size:.82rem">plus applicable taxes</span></span>
          <span class="total" data-fee-total>${money(subtotal())}</span>
        </div>
      </div>`;
  }

  function renderSections() {
    const host = root.querySelector("#sections");
    host.innerHTML = sections.length ? sections.map((s, i) => `
      <div class="sec-card ${i === activeSec ? "is-active" : ""}" data-i="${i}">
        ${editable ? `
          <div class="sec-top">
            <input class="sec-head" data-k="heading" value="${escapeHtml(s.heading || "")}"
                   placeholder="Section heading" />
            <button class="icon-btn" data-move="-1" ${i === 0 ? "disabled" : ""} title="Move up" aria-label="Move up">↑</button>
            <button class="icon-btn" data-move="1" ${i === sections.length - 1 ? "disabled" : ""} title="Move down" aria-label="Move down">↓</button>
            <button class="icon-btn" data-del-sec title="Remove section" aria-label="Remove section">✕</button>
          </div>
          <textarea data-k="body" placeholder="Section text…">${escapeHtml(s.body || "")}</textarea>
        ` : `
          <h3>${escapeHtml(s.heading || "")}</h3>
          <div class="ro-body">${escapeHtml(s.body || "")}</div>
        `}
      </div>`).join("")
      : `<p class="faint" style="font-size:.9rem">${editable
          ? "No sections yet — add one, or start a proposal from a template."
          : "No sections."}</p>`;

    root.querySelector("[data-sec-count]").textContent = sections.length || "";
    host.querySelectorAll("textarea").forEach(grow);
  }

  function renderLines() {
    const tbody = root.querySelector("#lines");
    tbody.innerHTML = items.length ? items.map((li, i) => `
      <tr data-i="${i}">
        <td>${editable
          ? `<input data-k="description" value="${escapeHtml(li.description || "")}" placeholder="What it covers" />`
          : escapeHtml(li.description || "")}</td>
        <td class="num">${editable
          ? `<input data-k="qty" type="number" step="0.01" min="0" value="${li.qty ?? 1}" style="text-align:right" />`
          : num(li.qty, 2)}</td>
        <td class="num">${editable
          ? `<input data-k="unit_price" type="number" step="0.01" min="0" value="${li.unit_price ?? 0}" style="text-align:right" />`
          : money(li.unit_price)}</td>
        <td class="num amt">${money(lineAmount(li))}</td>
        ${editable ? `<td><button class="icon-btn" data-del-line="${i}" title="Remove line" aria-label="Remove line">✕</button></td>` : ""}
      </tr>`).join("")
      : `<tr><td colspan="${editable ? 5 : 4}" class="faint" style="text-align:center;padding:14px">No fee lines yet.</td></tr>`;

    root.querySelector("[data-line-count]").textContent = items.length || "";
    root.querySelector("[data-fee-total]").textContent = money(subtotal());
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
    paper.innerHTML = proposalDocHtml(live(), settings) + `<div class="page-guides"></div>`;
    paintGuides();
    highlightPreview();
  }

  function paintGuides() {
    // Measure the content, not its cell: the cell is stretched to the sheet height so
    // the footer bar lands on the bottom edge, which would feed back into the count.
    const bodyEl = paper.querySelector(".lh-body");
    const layer = paper.querySelector(".page-guides");
    if (!bodyEl || !layer) return;
    // On the narrow layout the preview pane is display:none behind the Edit tab, where
    // everything measures 0. Leave the last good count; the tab handler repaints.
    if (!previewPane.clientWidth) return;
    // getBoundingClientRect is in device pixels, so undo the zoom to get paper pixels.
    const h = bodyEl.getBoundingClientRect().height / (zoom || 1);
    const pages = Math.max(1, Math.ceil(h / CONTENT_H));

    layer.innerHTML = "";
    for (let n = 1; n < pages; n++) {
      const g = document.createElement("div");
      g.className = "guide";
      g.style.top = `${BAND_H + n * CONTENT_H}px`;
      g.innerHTML = `<span>Page ${n + 1}</span>`;
      layer.append(g);
    }
    // A fixed height (not min-height) so the sheet's footer bar sits on the bottom edge.
    paper.style.height = `${BAND_H + pages * CONTENT_H + BAR_H}px`;
    pagesLabel.textContent = `${pages} page${pages === 1 ? "" : "s"}`;
  }

  function highlightPreview() {
    paper.querySelectorAll(".section.hi").forEach((el) => el.classList.remove("hi"));
    if (activeSec < 0) return;
    paper.querySelector(`.section[data-sec="${activeSec}"]`)?.classList.add("hi");
  }

  function scrollPreviewTo(i) {
    const el = paper.querySelector(`.section[data-sec="${i}"]`);
    if (!el) return;
    const top = el.getBoundingClientRect().top - previewPane.getBoundingClientRect().top
      + previewPane.scrollTop;
    previewPane.scrollTo({ top: Math.max(0, top - 80), behavior: "smooth" });
  }

  // Repainting the whole sheet on every keystroke is wasteful and makes the caret
  // stutter; one frame behind the typing is imperceptible and keeps input smooth.
  const schedulePreview = debounce(paintPreview, 140);

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
      sections,
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

  on(root, "input", "[data-f]", (e, el) => {
    const k = el.dataset.f;
    if (k === "title") {
      title = el.value;
      root.querySelector("[data-bar-title]").textContent = title || "Untitled proposal";
    } else if (k === "project_scope") scope = el.value;
    touched();
  });
  on(root, "change", "select[data-f]", (e, el) => {
    if (el.dataset.f === "project_scope") { scope = el.value; touched(); }
  });

  // sections
  on(root, "input", "#sections [data-k]", (e, el) => {
    const i = +el.closest(".sec-card").dataset.i;
    sections[i][el.dataset.k] = el.value;
    if (el.tagName === "TEXTAREA") grow(el);
    touched();
  });
  on(root, "focusin", ".sec-card", (e, card) => {
    const i = +card.dataset.i;
    if (i === activeSec) return;
    activeSec = i;
    root.querySelectorAll(".sec-card").forEach((c) => c.classList.toggle("is-active", +c.dataset.i === i));
    highlightPreview();
    scrollPreviewTo(i);
  });
  on(root, "click", "[data-add-section]", () => {
    sections.push({ heading: "", body: "" });
    activeSec = sections.length - 1;
    renderSections();
    root.querySelector(`.sec-card[data-i="${activeSec}"] .sec-head`)?.focus();
    touched();
  });
  on(root, "click", "[data-del-sec]", (e, el) => {
    sections.splice(+el.closest(".sec-card").dataset.i, 1);
    activeSec = -1;
    renderSections();
    touched();
  });
  on(root, "click", "[data-move]", (e, el) => {
    const i = +el.closest(".sec-card").dataset.i;
    const j = i + Number(el.dataset.move);
    if (j < 0 || j >= sections.length) return;
    [sections[i], sections[j]] = [sections[j], sections[i]];
    activeSec = j;
    renderSections();
    touched();
  });

  // fee lines
  on(root, "input", "#lines input", (e, el) => {
    const i = +el.closest("tr").dataset.i;
    const k = el.dataset.k;
    items[i][k] = k === "description" ? el.value : Number(el.value);
    if (k !== "description") {
      el.closest("tr").querySelector(".amt").textContent = money(lineAmount(items[i]));
      root.querySelector("[data-fee-total]").textContent = money(subtotal());
    }
    touched();
  });
  on(root, "click", "[data-add-line]", () => {
    items.push({ description: "", qty: 1, unit_price: 0 });
    renderLines();
    root.querySelector(`#lines tr[data-i="${items.length - 1}"] input`)?.focus();
    touched();
  });
  on(root, "click", "[data-del-line]", (e, el) => {
    items.splice(+el.dataset.delLine, 1);
    renderLines();
    touched();
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

  // zoom
  zoomSel.addEventListener("change", () => {
    zoomMode = zoomSel.value;
    localStorage.setItem(ZOOM_KEY, zoomMode);
    applyZoom();
    paintGuides();
  });

  // narrow-screen tabs
  on(root, "click", "[data-tab-btn]", (e, btn) => {
    const t = btn.dataset.tabBtn;
    builder.dataset.tab = t;
    root.querySelectorAll("[data-tab-btn]").forEach((b) => b.classList.toggle("active", b === btn));
    if (t === "preview") { applyZoom(); paintGuides(); }
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
      paintGuides();
    };
    splitter.addEventListener("pointermove", move);
    splitter.addEventListener("pointerup", up);
  });
  // keyboard-accessible resize
  splitter.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 64 : 16;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const box = split.getBoundingClientRect();
    const cur = root.querySelector(".pane-edit").getBoundingClientRect().width;
    const px = Math.min(Math.max(cur + (e.key === "ArrowRight" ? step : -step), 340), box.width - 380);
    split.style.setProperty("--edit-w", `${px}px`);
    localStorage.setItem(SPLIT_KEY, `${px}px`);
    applyZoom(); paintGuides();
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
    if (zoomMode === "fit") { applyZoom(); paintGuides(); }
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

  editPane.innerHTML = editorHtml();
  renderSections();
  renderLines();
  renderActions();
  applyZoom();
  paintPreview();
}
