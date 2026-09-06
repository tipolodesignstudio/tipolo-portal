// The proposal document, as markup — the Tipolo letterhead + the house proposal format
// (04_Templates/Letterhead Design/Tipolo Letterhead.docx and the ConnectLA proposal).
//
// This is the single source of truth for what a proposal looks like on paper. The
// builder's preview pane and the print path both call it, so the preview isn't a
// lookalike — it's the same HTML under the same stylesheet (css/document.css).
//
// The letterhead is a Word header/footer, so its band and bar repeat on every page.
// Here that is a <thead>/<tfoot>, which is the one construct browsers repeat across
// printed pages.
//
// Three placeholders from the .docx are wired to real data:
//     YYNNN            -> proposal number   (DRAFT until one is drawn)
//     [Project Name]   -> proposal title
//     Month DD, YYYY   -> sent date, else the date it was created
//
// Tokens in section text are resolved here too, so the page shows the client's real
// name rather than {{client.name}}.

import { escapeHtml, money, num, date, longDate } from "../core/format.js";
import { lineAmount } from "../core/invoice-calc.js";
import { buildTokenMap, resolveTokens } from "../core/tokens.js";
import { clientPrimaryContact } from "../core/api.js";
import { normaliseSections } from "../core/proposal-template.js";
import { buildGantt } from "../core/gantt.js";

// Set verbatim from the letterhead. Settings has no field that matches these two
// lines (its `email` is the accounts address, not the one printed here), so they live
// as constants — change them here and both the preview and the print follow.
const TAGLINE = "Port Moody, BC • tipolo.ca";
const CONTACT = "hello@tipolo.ca | 604.729.0597";

/* Body copy: blank lines separate paragraphs; a line starting "• " is a bullet, and
   each two spaces in front of it steps the indent in one more level (18pt), the way
   the source document nests its lists. "1." and "A." lead lines keep their marker. */
function prose(text, map) {
  const src = resolveTokens(text || "", map);
  if (!src.trim()) return "";
  return src.split(/\n{2,}/).map((para) => {
    const lines = para.split("\n");
    const isList = lines.every((l) => /^\s*(?:[•\-*]|\d+\.|[A-Z]\.)\s/.test(l));
    if (!isList) {
      return `<p>${lines.map((l) => escapeHtml(l.trim())).join("<br>")}</p>`;
    }
    return lines.map((l) => {
      const indent = Math.floor((l.match(/^ */)[0].length) / 2);
      const m = l.trim().match(/^([•\-*]|\d+\.|[A-Z]\.)\s+(.*)$/);
      const marker = m[1] === "-" || m[1] === "*" ? "•" : m[1];
      return `<div class="li lvl${Math.min(indent, 3)}">`
        + `<span class="mk">${escapeHtml(marker)}</span>`
        + `<span>${escapeHtml(m[2])}</span></div>`;
    }).join("");
  }).join("");
}

// The schedule prints as a gantt chart. Until dates are filled in there is nothing to
// plot, so it falls back to the plain task/start/due table rather than an empty grid.
function scheduleTable(rows = [], scale = "week") {
  if (!rows.length) return "";
  const g = buildGantt(rows, scale);
  if (!g) return plainSchedule(rows);

  const head = g.scale === "day"
    ? `${g.weeks.map((w) => `<div class="g-wk" style="grid-row:1;grid-column:${2 + w.startCol}/span ${w.span}">
          <b>${escapeHtml(w.label)}</b><span>${escapeHtml(w.sub)}</span></div>`).join("")}
       ${g.cols.map((c) => `<div class="g-dy" style="grid-row:2;grid-column:${2 + c.i}">
          <b>${escapeHtml(c.label)}</b><span>${escapeHtml(c.sub)}</span></div>`).join("")}`
    : g.weeks.map((w) => `<div class="g-wk" style="grid-row:1;grid-column:${2 + w.startCol}/span ${w.span}">
          <b>${escapeHtml(w.label)}</b><span>${escapeHtml(w.sub)}</span></div>`).join("");

  const headRows = g.scale === "day" ? 2 : 1;
  const body = g.bars.map((b, i) => {
    const row = headRows + 1 + i;
    const cells = Array.from({ length: g.colCount }, (_, c) =>
      `<div class="g-cell${(c + 1) % (g.scale === "day" ? 5 : 1) === 0 ? " wk-end" : ""}"
            style="grid-row:${row};grid-column:${2 + c}"></div>`).join("");
    const label = `<div class="g-task" style="grid-row:${row};grid-column:1">${escapeHtml(b.task)}</div>`;
    if (b.empty) return label + cells;
    const bar = b.milestone
      ? `<div class="g-mile" style="grid-row:${row};grid-column:${2 + b.startCol}">
           <i></i><span>${escapeHtml(b.startLabel)}</span></div>`
      : `<div class="g-bar${b.clipped ? " clipped" : ""}"
              style="grid-row:${row};grid-column:${2 + b.startCol}/${3 + b.endCol}">
           <span class="s">${escapeHtml(b.startLabel)}</span>
           <span class="d">${escapeHtml(b.dueLabel)}</span></div>`;
    return label + cells + bar;
  }).join("");

  return `<div class="gantt sc-${g.scale}" style="grid-template-columns:1.55in repeat(${g.colCount},1fr)">
      <div class="g-corner" style="grid-row:1/span ${headRows};grid-column:1">Task</div>
      ${head}${body}
    </div>
    ${g.truncated ? `<p class="g-note">Chart truncated — the schedule runs past the columns shown.</p>` : ""}`;
}

function plainSchedule(rows) {
  return `<table class="sched"><thead><tr>
      <th>Task</th><th class="dt">Start</th><th class="dt">Due</th>
    </tr></thead><tbody>
    ${rows.map((r) => `<tr>
      <td>${escapeHtml(r.task || "")}</td>
      <td class="dt">${escapeHtml(r.start || "")}</td>
      <td class="dt">${escapeHtml(r.due || "")}</td></tr>`).join("")}
  </tbody></table>`;
}

function feeTable(items) {
  const subtotal = items.reduce((s, li) => s + lineAmount(li), 0);
  const hours = items.reduce((s, li) => s + (Number(li.qty) || 0), 0);
  return `<table class="fees"><thead><tr>
      <th class="ix"></th><th>Task Description and Timeline</th><th class="fee">Fee</th>
    </tr></thead><tbody>
    ${items.map((li, i) => `<tr>
      <td class="ix">${i + 1}</td>
      <td>${escapeHtml(li.description || "")}</td>
      <td class="fee">${money(lineAmount(li))}</td></tr>`).join("")}
    <tr class="total">
      <td class="ix"></td>
      <td>TOTAL${hours ? ` (approx. ${num(hours, 0)} hrs)` : ""}</td>
      <td class="fee">${money(subtotal)}</td></tr>
  </tbody></table>`;
}

function optionalTable(rows = []) {
  if (!rows.length) return "";
  return `<table class="fees"><thead><tr>
      <th class="ix"></th><th>Description</th><th class="fee">Fee</th>
    </tr></thead><tbody>
    ${rows.map((r) => `<tr>
      <td class="ix">${escapeHtml(r.code || "")}</td>
      <td>${escapeHtml(r.description || "")}</td>
      <td class="fee">${escapeHtml(r.fee || "")}</td></tr>`).join("")}
  </tbody></table>`;
}

function signatureBlock(settings) {
  const designer = settings.business_name || "Tipolo Design Studio";
  return `<div class="sig">
    <p>Agreed,</p>
    <div class="sig-row"><span class="rule"></span><span class="cap">Client</span></div>
    <div class="sig-row short"><span class="rule"></span><span class="cap">Date</span></div>
    <div class="sig-row named"><span class="name">Jim Dema-ala, ${escapeHtml(designer)}</span><span class="cap">Designer</span></div>
    <div class="sig-row short"><span class="rule"></span><span class="cap">Date</span></div>
  </div>`;
}

export function proposalDocHtml(p, settings = {}) {
  const c = p.client || {};
  const contact = clientPrimaryContact(c);
  const map = buildTokenMap({ client: c, proposal: p, settings });
  const blocks = normaliseSections(p.sections || []);
  const items = p.line_items || [];

  // "Tipolo Design Studio" -> TIPOLO (semibold, dark) + DESIGN STUDIO (medium, muted).
  const words = (settings.business_name || "Tipolo Design Studio").trim().split(/\s+/);
  const markLead = words.shift() || "";
  const markRest = words.join(" ");

  const head = `
    <div class="lh-band">
      <div class="lh-meta">
        <div class="lh-doctype">Proposal</div>
        <div class="lh-fields">
          <span class="k">No.</span><span class="v">${escapeHtml(p.number || "DRAFT")}</span>
          <span class="k">Project</span><span class="v">${escapeHtml(p.title || "")}</span>
          <span class="k">Date</span><span class="v">${escapeHtml(longDate(p.sent_date || p.created_at || new Date()))}</span>
        </div>
      </div>
      <div class="lh-brand">
        <div class="lh-wordmark"><b>${escapeHtml(markLead)}</b>${markRest ? ` <span>${escapeHtml(markRest)}</span>` : ""}</div>
        <div class="lh-tagline">${escapeHtml(TAGLINE)}</div>
      </div>
    </div>`;

  const foot = `<div class="lh-bar"><span>${escapeHtml(CONTACT)}</span></div>`;

  /* ---- cover letter: the addressee and RE: line come from the record ---- */

  const addressee = [
    contact ? [contact.name, contact.title].filter(Boolean).join(" | ") : c.name,
    [c.street, c.city, c.province].filter(Boolean).join(", "),
    [contact?.email || c.email, contact?.phone || c.phone].filter(Boolean).join(" | "),
  ].filter(Boolean);

  const cover = blocks.filter((b) => (b.part || "workplan") === "cover");
  const coverHtml = `
    <section class="cover">
      <div class="addressee">${addressee.map((l) => `<div>${escapeHtml(l)}</div>`).join("")}</div>
      <p class="re">RE: ${escapeHtml((p.title || "").toUpperCase())}</p>
      ${cover.map((b) => prose(b.body, map)).join("")}
      <p class="closing">Sincerely,</p>
      <p class="signoff">Jim Dema-ala, Principal Designer | ${escapeHtml(settings.business_name || "Tipolo Design Studio")}</p>
    </section>`;

  /* ---- everything after the cover ---- */

  // data-blk lets the builder mark the block your cursor is in. It is inert in print.
  const rest = blocks.map((b, i) => [b, i]).filter(([b]) => (b.part || "workplan") !== "cover")
    .map(([b, i]) => {
    const tag = ` data-blk="${i}"`;
    if (b.kind === "schedule") return `<div${tag}>${scheduleTable(b.rows, b.scale)}</div>`;
    if (b.kind === "fees") return `<div${tag}>${feeTable(items)}</div>`;
    if (b.kind === "optional-fees") return `<div${tag}>${optionalTable(b.rows)}</div>`;
    if (b.kind === "signature") return `<div${tag}>${signatureBlock(settings)}</div>`;

    const lvl = b.level ?? (b.heading ? 2 : 0);
    const heading = b.heading
      ? (lvl === 1 ? `<h1>${escapeHtml(resolveTokens(b.heading, map))}</h1>`
        : lvl === 2 ? `<h2>${escapeHtml(resolveTokens(b.heading, map))}</h2>`
        : `<h3>${escapeHtml(resolveTokens(b.heading, map))}</h3>`)
      : "";
    return `<section class="blk lv${lvl}"${tag}>${heading}${prose(b.body, map)}</section>`;
  }).join("");

  // thead/tfoot rather than divs: browsers repeat them on every printed page, which is
  // what the Word header and footer do.
  return `
    <div class="doc letterhead">
      <table class="sheet">
        <thead><tr><td class="lh-head-cell">${head}</td></tr></thead>
        <tfoot><tr><td class="lh-foot-cell">${foot}</td></tr></tfoot>
        <tbody><tr><td class="lh-body-cell"><div class="lh-body">
          ${coverHtml}
          <div class="pagebreak"></div>
          ${rest}
        </div></td></tr></tbody>
      </table>
    </div>`;
}
