// The invoice document, as markup — the Tipolo letterhead + the house invoice format
// (04_Templates/Invoice/Invoice Down Payment Template.docx).
//
// As with the proposal, this is the single source of truth for what an invoice looks
// like on paper: the builder's preview pane and the print path both call it, so the
// preview isn't a lookalike — it's the same HTML under the same stylesheet.
//
// The letterhead placeholders are wired to real data:
//     No.              -> YYNNN-XXX  (DRAFT until the invoice is finalized)
//     Project          -> the project's title
//     Month DD, YYYY   -> the issue date
//
// The table is the point of the document. Description and Budget come from the
// proposal's fee schedule; Previous Invoice is summed from the project's earlier
// invoices; only Current Invoice is typed, and Balance is what is left.

import { escapeHtml, num, longDate } from "../core/format.js";
import { resolveTokens } from "../core/tokens.js";
import { esc, prose } from "./doc-text.js";
import { clientPrimaryContact } from "../core/api.js";
import { normaliseInvoiceSections } from "../core/invoice-template.js";
import { computeProgressTotals, lineBalance } from "../core/invoice-calc.js";
import { paginate } from "./paginate.js";

// Set verbatim from the letterhead, as in proposal-doc.js.
const TAGLINE = "Port Moody, BC • tipolo.ca";
const CONTACT = "hello@tipolo.ca | 604.729.0597";

export function buildInvoiceTokenMap(inv, settings = {}) {
  const project = inv.project || {};
  const client = project.client || {};
  const person = client.is_individual ? null : clientPrimaryContact(client);
  return {
    "invoice.number": inv.number || "DRAFT",
    "invoice.issueDate": inv.issue_date ? longDate(inv.issue_date) : "[Month DD, YYYY]",
    "invoice.dueDate": inv.due_date ? longDate(inv.due_date) : "[Month DD, YYYY]",
    "invoice.preparedBy": inv.prepared_by || "[Prepared by]",
    "project.number": project.number || "",
    "project.title": project.title || "[Project Name]",
    "client.name": client.name || "",
    "client.contact": person?.name || client.name || "",
    "client.firstName": ((person?.name || client.name || "").trim().split(/\s+/)[0]) || "[First Name]",
    "business.name": settings.business_name || "Tipolo Design Studio",
  };
}

export const INVOICE_TOKEN_HELP = [
  "{{invoice.number}}", "{{invoice.issueDate}}", "{{invoice.dueDate}}",
  "{{invoice.preparedBy}}", "{{project.title}}", "{{client.name}}", "{{client.contact}}",
];

/* Money in the accounting layout the .docx uses: the currency sign pinned to the left
   of the cell, the figure to the right, and a bare dash for nil.

   A zero prints as an empty cell in the two columns that record a draw — that is how
   the .docx sets an untouched line — but Budget, Balance and the totals row always
   carry a figure, because there "nothing" and "nil" are not the same thing. */
function acct(value, { always = false } = {}) {
  const n = Math.round((Number(value) || 0) * 100) / 100;
  if (!n && !always) return "";
  return `<div class="acct"><span class="c">$</span><span class="n">${n ? num(n, 2) : "-"}</span></div>`;
}

/* The progress table. Five columns at the .docx's widths (7in overall: description
   3.4in, then four money columns of 0.9in). */
function progressTable(lines, previous, totals) {
  const rows = lines.map((li, i) => {
    const prev = Number(previous[i]) || 0;
    return `<tr${i === lines.length - 1 ? ` class="last"` : ""}>
      <td class="d">${esc(li.description)}</td>
      <td class="m bud">${acct(li.budget, { always: true })}</td>
      <td class="m prev">${acct(prev)}</td>
      <td class="m cur">${acct(li.amount)}</td>
      <td class="m bal">${acct(lineBalance(li, prev), { always: true })}</td>
    </tr>`;
  }).join("");

  const sum = (fn) => lines.reduce((s, li, i) => s + fn(li, Number(previous[i]) || 0), 0);
  const foot = `<tr class="sub">
      <td class="d">SUBTOTAL</td>
      <td class="m bud">${acct(sum((li) => Number(li.budget) || 0), { always: true })}</td>
      <td class="m prev">${acct(sum((li, p) => p), { always: true })}</td>
      <td class="m cur">${acct(totals.subtotal, { always: true })}</td>
      <td class="m bal">${acct(sum(lineBalance), { always: true })}</td>
    </tr>`;

  // Tax is off in the .docx — it shows a subtotal and nothing else. These rows appear
  // only when the invoice actually carries tax.
  const tax = totals.taxLines.map((t) => `<tr class="sub tax">
      <td class="d">${escapeHtml(t.label)} ${num(t.rate, t.rate % 1 ? 2 : 0)}%</td>
      <td class="m"></td><td class="m"></td>
      <td class="m cur">${acct(t.amount, { always: true })}</td>
      <td class="m"></td>
    </tr>`).join("");
  const due = totals.taxLines.length ? `<tr class="sub due">
      <td class="d">TOTAL DUE</td>
      <td class="m"></td><td class="m"></td>
      <td class="m cur">${acct(totals.total, { always: true })}</td>
      <td class="m"></td>
    </tr>` : "";

  return `<table class="inv">
    <thead><tr>
      <th class="d">DESCRIPTION</th>
      <th>BUDGET</th>
      <th>PREVIOUS<br>INVOICE</th>
      <th>CURRENT<br>INVOICE</th>
      <th>BALANCE</th>
    </tr></thead>
    <tbody>${rows || `<tr class="last"><td class="d empty" colspan="5">No line items yet.</td></tr>`}
    ${foot}${tax}${due}</tbody>
  </table>`;
}

/* Bill To, exactly as the .docx sets it:
     Name | Position            italic
     Company                    bold
     Street, City, Province     plain                                        */
function billTo(project) {
  const c = project.client || {};
  const person = c.is_individual ? null : clientPrimaryContact(c);
  const lines = [
    { cls: "who", text: [person?.name, person?.title].filter(Boolean).join(" | ") },
    { cls: "org", text: c.is_individual ? c.name : (c.name || "") },
    { text: [c.street, c.city, c.province].filter(Boolean).join(", ") },
  ].filter((l) => l.text);
  if (!lines.length) lines.push({ text: "[Client name and address]" });
  return `<h3>Bill To:</h3>
    <div class="billto">${lines.map((l) =>
      `<div${l.cls ? ` class="${l.cls}"` : ""}>${esc(l.text)}</div>`).join("")}</div>`;
}

export function invoiceDocHtml(inv, settings = {}, { previous = [] } = {}) {
  const project = inv.project || {};
  const map = buildInvoiceTokenMap(inv, settings);
  const blocks = normaliseInvoiceSections(inv.sections);
  const lines = inv.progress_lines || [];
  const totals = computeProgressTotals(lines, settings.tax_lines || [], inv.apply_taxes !== false);

  // "Tipolo Design Studio" -> TIPOLO (semibold, dark) + DESIGN STUDIO (medium, muted).
  const words = (settings.business_name || "Tipolo Design Studio").trim().split(/\s+/);
  const markLead = words.shift() || "";
  const markRest = words.join(" ");

  const head = `
    <div class="lh-band">
      <div class="lh-meta">
        <div class="lh-doctype">Invoice</div>
        <div class="lh-fields">
          <span class="k">No.</span><span class="v">${escapeHtml(inv.number || "DRAFT")}</span>
          <span class="k">Project</span><span class="v">${esc(project.title || "[Project Name]")}</span>
          <span class="k">Date</span><span class="v">${escapeHtml(longDate(inv.issue_date || inv.created_at || new Date()))}</span>
        </div>
      </div>
      <div class="lh-brand">
        <div class="lh-wordmark"><b>${escapeHtml(markLead)}</b>${markRest ? ` <span>${escapeHtml(markRest)}</span>` : ""}</div>
        <div class="lh-tagline">${escapeHtml(TAGLINE)}</div>
      </div>
    </div>`;

  const foot = (n) => `<div class="lh-bar">
      <span>${escapeHtml(CONTACT)}</span><span class="pageno">${n}</span>
    </div>`;

  /* The flow: Bill To, then the editable blocks in order, with the table dropped in
     where its block sits. Emitted as flat units — a heading, a paragraph, the table —
     because paginate() lays out one unit at a time. data-blk lets the builder scroll
     the preview to the block you are editing; it is inert in print. */
  const body = blocks.map((b, i) => {
    const tag = ` data-blk="${i}"`;
    const brk = b.breakBefore ? `<div class="pagebreak"></div>` : "";
    if (b.kind === "progress") {
      return brk + `<div class="unit"${tag}>${progressTable(lines, previous, totals)}</div>`;
    }
    const lvl = b.level ?? (b.heading ? 3 : 0);
    const h = b.heading && lvl > 0
      ? `<h3${tag}>${esc(resolveTokens(b.heading, map))}</h3>`
      : "";
    return brk + h + prose(b.body, map, tag);
  }).join("");

  const pages = paginate(billTo(project) + body);
  const sheets = pages.map((pg, n) => `
    <div class="sheet-page">
      ${head}
      <div class="lh-body">${pg.units.join("")}</div>
      <div class="lh-foot">${foot(n + 1)}</div>
    </div>`).join("");

  return `<div class="doc letterhead invoice">${sheets}</div>`;
}

// What Chrome offers as the filename in "Save as PDF".
export const invoiceFileName = (inv) => `Invoice_${inv.number || "DRAFT"}`;
