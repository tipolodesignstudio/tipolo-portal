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
import { paginate } from "./paginate.js";

// Set verbatim from the letterhead. Settings has no field that matches these two
// lines (its `email` is the accounts address, not the one printed here), so they live
// as constants — change them here and both the preview and the print follow.
const TAGLINE = "Port Moody, BC • tipolo.ca";
const CONTACT = "hello@tipolo.ca | 604.729.0597";

// Inline formatting, written the way a writer would type it and applied AFTER escaping,
// so the only tags in the output are the ones produced here — the stored text stays
// plain and can never inject markup.
//   **bold**   *italic*   __underline__
function inline(escaped) {
  // The outer pairs match up to their closing marker rather than to the next single
  // one, so *italic* nested inside **bold** survives instead of splitting it.
  return escaped
    .replace(/\*\*((?:(?!\*\*)[^\n])+)\*\*/g, "<b>$1</b>")
    .replace(/__((?:(?!__)[^\n])+)__/g, "<u>$1</u>")
    .replace(/\*([^*\n]+)\*/g, "<i>$1</i>");
}

// Anything still in [brackets] is unfilled, so it prints red — impossible to send by
// accident without noticing. The character class stops it swallowing the tags above.
function marks(html) {
  return html.replace(/\[[^\[\]<>]*\]/g, (m) => `<span class="ph">${m}</span>`);
}

const esc = (t) => marks(inline(escapeHtml(t ?? "")));

/* Body copy -> paragraphs and lists.

   A line beginning "• ", "- ", "1. " or "a) " is a list item ("*" is italic, not a
   bullet); two leading spaces (or a
   tab) step it in one level, matching the source document's 18pt indents. A following
   line that is indented but carries no marker is the same item wrapped onto a second
   line, not a new one — that is what the builder's Bullet/Number buttons produce and
   what a writer types by hand. Prose and lists can sit in the same paragraph. */
const LIST_RE = /^([ \t]*)([•\u2022-]|\d+[.)]|[A-Za-z][.)])[ \t]+(.*)$/;
const CONT_RE = /^[ \t]+\S/;

const indentOf = (ws) => Math.min(Math.floor(ws.replace(/\t/g, "  ").length / 2), 3);

function prose(text, map, blkTag = "") {
  const src = resolveTokens(text || "", map);
  if (!src.trim()) return "";
  const out = [];

  for (const para of src.split(/\n{2,}/)) {
    let buf = [];      // plain lines waiting to become a <p>
    let items = [];    // the run of list items being built

    const flushText = () => {
      if (!buf.length) return;
      out.push(`<p${blkTag}>${buf.map((l) => esc(l.trim())).join("<br>")}</p>`);
      buf = [];
    };
    const flushList = () => { out.push(...items); items = []; };

    for (const line of para.split("\n")) {
      const m = line.match(LIST_RE);
      if (m) {
        flushText();
        const marker = m[2] === "-" ? "•" : m[2];
        items.push(`<div class="li lvl${indentOf(m[1])}"${blkTag}>`
          + `<span class="mk">${escapeHtml(marker)}</span>`
          + `<span class="tx">${esc(m[3])}</span></div>`);
      } else if (items.length && CONT_RE.test(line)) {
        // wrapped continuation of the item above
        items[items.length - 1] = items[items.length - 1]
          .replace(/<\/span><\/div>$/, ` ${esc(line.trim())}</span></div>`);
      } else {
        flushList();
        buf.push(line);
      }
    }
    flushText();
    flushList();
  }
  return out.join("");
}

// The schedule always prints as a gantt chart. With no dates set it draws the frame and
// says so, rather than dropping back to a table.
function scheduleTable(rows = [], scale = "week") {
  if (!rows.length) return "";
  const g = buildGantt(rows, scale);

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
    const label = `<div class="g-task" style="grid-row:${row};grid-column:1">${esc(b.task)}</div>`;
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
    ${g.truncated ? `<p class="g-note">Chart truncated — the schedule runs past the columns shown.</p>` : ""}
    ${g.undated ? `<p class="g-note"><span class="ph">[Set the task dates to plot the schedule.]</span></p>` : ""}`;
}

// Percentages are typed; the amounts follow the Base Scope total so they can never
// drift from the fee table above them.
function paymentTable(rows = [], subtotal = 0) {
  if (!rows.length) return "";
  return rows.map((r) => {
    const pct = r.pct === "" || r.pct == null ? null : Number(r.pct);
    const amount = pct == null ? "" : ` - ${money(subtotal * pct / 100)}`;
    return `<div class="li lvl0"><span class="mk">•</span><span class="tx">`
      + `${pct == null ? "" : `${num(pct, pct % 1 ? 1 : 0)}% `}${esc(r.label)}${amount}`
      + `</span></div>`;
  }).join("");
}

// Hours have their own column rather than being written into each description, so the
// figure the builder holds is the figure that prints and the two cannot disagree.
function feeTable(items) {
  const subtotal = items.reduce((s, li) => s + lineAmount(li), 0);
  const hours = items.reduce((s, li) => s + (Number(li.qty) || 0), 0);
  const hrs = (n) => (Number(n) ? num(Number(n), Number(n) % 1 ? 1 : 0) : "");
  return `<table class="fees"><thead><tr>
      <th class="ix"></th><th>Task Description and Timeline</th>
      <th class="hrs">Approx. Hrs</th><th class="fee">Fee</th>
    </tr></thead><tbody>
    ${items.map((li, i) => `<tr>
      <td class="ix">${i + 1}</td>
      <td>${esc(li.description)}</td>
      <td class="hrs">${hrs(li.qty)}</td>
      <td class="fee">${money(lineAmount(li))}</td></tr>`).join("")}
    <tr class="total">
      <td class="ix"></td>
      <td>TOTAL</td>
      <td class="hrs">${hrs(hours)}</td>
      <td class="fee">${money(subtotal)}</td></tr>
  </tbody></table>`;
}

function optionalTable(rows = []) {
  if (!rows.length) return "";
  return `<table class="fees"><thead><tr>
      <th class="ix"></th><th>Description</th><th class="hrs"></th><th class="fee">Fee</th>
    </tr></thead><tbody>
    ${rows.map((r) => `<tr>
      <td class="ix">${esc(r.code)}</td>
      <td>${esc(r.description)}</td>
      <td class="hrs"></td>
      <td class="fee">${esc(r.fee)}</td></tr>`).join("")}
  </tbody></table>`;
}

function signatureBlock(settings) {
  const designer = settings.business_name || "Tipolo Design Studio";
  // Room to sign above each rule, and the caption underneath it.
  const line = (cap, over = "", cls = "") =>
    `<div class="sig-field ${cls}">
       <div class="sig-over">${over ? escapeHtml(over) : ""}</div>
       <div class="sig-cap">${escapeHtml(cap)}</div>
     </div>`;
  return `<div class="sig">
    <p>Agreed,</p>
    <div class="sig-set">
      ${line("Client")}
      ${line("Date", "", "short")}
    </div>
    <div class="sig-set">
      ${line("Designer", `Jim Dema-ala, ${designer}`)}
      ${line("Date", "", "short")}
    </div>
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
          <span class="k">Project</span><span class="v">${esc(p.title)}</span>
          <span class="k">Date</span><span class="v">${escapeHtml(longDate(p.sent_date || p.created_at || new Date()))}</span>
        </div>
      </div>
      <div class="lh-brand">
        <div class="lh-wordmark"><b>${escapeHtml(markLead)}</b>${markRest ? ` <span>${escapeHtml(markRest)}</span>` : ""}</div>
        <div class="lh-tagline">${escapeHtml(TAGLINE)}</div>
      </div>
    </div>`;

  // The page number rides on the contact line itself, at the right margin.
  const foot = (n) => `<div class="lh-bar">
      <span>${escapeHtml(CONTACT)}</span><span class="pageno">${n}</span>
    </div>`;

  /* ---- cover letter: the addressee and RE: line come from the record ---- */

  // Recipient, in the order Jim writes them:
  //   name (bold) / position, company / street / city, province / email | phone
  // Everything comes from the client record so it cannot go stale; the builder's
  // Cover Letter tab edits that record in place when a line is missing.
  const cover = blocks.map((b, i) => [b, i]).filter(([b]) => (b.part || "workplan") === "cover");
  const person = c.is_individual ? null : contact;
  const recipient = [
    { cls: "who", text: (person?.name || c.name || "") },
    { text: [person?.title, c.is_individual ? "" : c.name].filter(Boolean).join(", ") },
    { text: c.street ? `${c.street},` : "" },
    { text: [c.city, c.province].filter(Boolean).join(", ") },
    { text: [person?.email || c.email, person?.phone || c.phone].filter(Boolean).join(" | ") },
  ].filter((l) => l.text);

  const coverHtml = `
    <div class="addressee">${recipient.map((l) =>
      `<div${l.cls ? ` class="${l.cls}"` : ""}>${esc(l.text)}</div>`).join("")}</div>
    <p class="re">RE: ${esc((p.title || "").toUpperCase())}</p>
    ${cover.map(([b, i]) => prose(b.body, map, ` data-blk="${i}"`)).join("")}
    <p class="closing">Sincerely,</p>
    <div class="sig-slot"></div>
    <p class="signoff">${settings.signature_url
      ? `<span class="sig-mark"><img src="${escapeHtml(settings.signature_url)}" alt="" /></span>` : ""
      }<b>Jim Dema-ala</b>, Principal Designer | ${escapeHtml(settings.business_name || "Tipolo Design Studio")}</p>
    <div class="pagebreak"></div>`;

  /* ---- everything after the cover ----
     Emitted as a flat run of units (a heading, a paragraph, a list item, a table) rather
     than nested sections, because paginate() lays out one unit at a time. data-blk lets
     the builder mark the block your cursor is in; it is inert in print. */

  const rest = blocks.map((b, i) => [b, i]).filter(([b]) => (b.part || "workplan") !== "cover")
    .map(([b, i]) => {
      const tag = ` data-blk="${i}"`;
      // "Start on a new page" on a heading block
      const brk = b.breakBefore ? `<div class="pagebreak"></div>` : "";
      if (b.kind === "schedule") {
        // A chart too wide for the portrait column gets a landscape page of its own.
        const wide = buildGantt(b.rows || [], b.scale).needsLandscape;
        return brk + `<div class="unit"${tag}${wide ? ` data-landscape="1"` : ""}>`
          + `${scheduleTable(b.rows, b.scale)}</div>`;
      }
      if (b.kind === "fees") return brk + `<div class="unit"${tag}>${feeTable(items)}</div>`;
      if (b.kind === "optional-fees") return brk + `<div class="unit"${tag}>${optionalTable(b.rows)}</div>`;
      if (b.kind === "signature") return brk + `<div class="unit"${tag}>${signatureBlock(settings)}</div>`;
      if (b.kind === "payment") {
        const sub = items.reduce((t, li) => t + lineAmount(li), 0);
        return brk + `<div class="unit"${tag}>${paymentTable(b.rows, sub)}</div>`;
      }

      const lvl = b.level ?? (b.heading ? 2 : 0);
      const h = b.heading
        ? `<h${lvl === 1 ? 1 : lvl === 2 ? 2 : 3}${tag}>${esc(resolveTokens(b.heading, map))}</h${lvl === 1 ? 1 : lvl === 2 ? 2 : 3}>`
        : "";
      return brk + h + prose(b.body, map, tag);
    }).join("");

  /* ---- lay it onto Letter pages ---- */

  const pages = paginate(coverHtml + rest);
  const sheets = pages.map((pg, n) => `
    <div class="sheet-page${pg.landscape ? " landscape" : ""}">
      ${head}
      <div class="lh-body">${pg.units.join("")}</div>
      <div class="lh-foot">${foot(n + 1)}</div>
    </div>`).join("");

  return `<div class="doc letterhead">${sheets}</div>`;
}
