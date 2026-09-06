// The proposal document, as markup — built to the Tipolo letterhead
// (04_Templates/Letterhead Design/Tipolo Letterhead.docx).
//
// This is the single source of truth for what a proposal looks like on paper. The
// builder's preview pane and the print path both call it, so the preview isn't a
// lookalike — it's the same HTML under the same stylesheet (css/document.css).
//
// The letterhead is a Word header/footer pair, so its band and bar repeat on every
// page. Here that is a <thead>/<tfoot>, which is the one construct browsers repeat
// across printed pages.
//
// Three placeholders in the .docx are wired to real data:
//     YYNNN            -> proposal number   (DRAFT until one is drawn)
//     [Project Name]   -> proposal title
//     Month DD, YYYY   -> sent date, else the date it was created
//
// Tokens in section text are resolved here too, so the page shows the client's real
// name rather than {{client.name}}.

import { escapeHtml, money, num, date, longDate } from "../core/format.js";
import { lineAmount } from "../core/invoice-calc.js";
import { buildTokenMap, resolveSections } from "../core/tokens.js";
import { clientPrimaryContact } from "../core/api.js";

// Set verbatim from the letterhead. Settings has no field that matches these two
// lines (its `email` is the accounts address, not the one printed here), so they live
// as constants — change them here and both the preview and the print follow.
const TAGLINE = "Port Moody, BC • tipolo.ca";
const CONTACT = "hello@tipolo.ca | 604.729.0597";

export function proposalDocHtml(p, settings = {}) {
  const c = p.client || {};
  const contact = clientPrimaryContact(c);
  const map = buildTokenMap({ client: c, proposal: p, settings });
  const sections = resolveSections(p.sections, map);
  const items = p.line_items || [];
  const subtotal = items.reduce((s, li) => s + lineAmount(li), 0);

  // "Tipolo Design Studio" -> TIPOLO (semibold, dark) + DESIGN STUDIO (medium, muted).
  const words = (settings.business_name || "Tipolo Design Studio").trim().split(/\s+/);
  const markLead = words.shift() || "";
  const markRest = words.join(" ");

  const clientAddress = [
    c.street, c.city, [c.province, c.postal_code].filter(Boolean).join("  "),
  ].filter(Boolean);

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

  const body = `
    <div class="parties">
      <div>
        <h4>Prepared for</h4>
        <div>${escapeHtml(c.name || "")}</div>
        ${!c.is_individual && contact
          ? `<div>Attn: ${escapeHtml(contact.name)}${contact.title ? `, ${escapeHtml(contact.title)}` : ""}</div>`
          : ""}
        <div style="white-space:pre-line">${clientAddress.map(escapeHtml).join("\n")}</div>
      </div>
      ${p.valid_until ? `<div><h4>Valid until</h4><div>${escapeHtml(date(p.valid_until))}</div></div>` : ""}
    </div>

    ${sections.map((s, i) => `
      <div class="section" data-sec="${i}">
        ${s.heading ? `<h3>${escapeHtml(s.heading)}</h3>` : ""}
        <div class="body" style="white-space:pre-wrap">${escapeHtml(s.body || "")}</div>
      </div>`).join("")}

    ${items.length ? `
      <div class="section" data-fee>
        <h3>Fee schedule</h3>
        <table class="lines"><thead><tr>
          <th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th>
        </tr></thead><tbody>
          ${items.map((li) => `<tr>
            <td>${escapeHtml(li.description || "")}</td>
            <td class="num">${num(li.qty, 2)}</td>
            <td class="num">${money(li.unit_price)}</td>
            <td class="num">${money(lineAmount(li))}</td></tr>`).join("")}
        </tbody></table>
        <div class="totals">
          <div class="row grand"><span>Estimated fee</span><span>${money(subtotal)}</span></div>
          <div class="row"><span></span><span>plus applicable taxes</span></div>
        </div>
      </div>` : ""}

    <div class="doc-foot">Accepted by _______________________________   Date ______________</div>`;

  // thead/tfoot rather than divs: browsers repeat them on every printed page, which is
  // what the Word header and footer do.
  return `
    <div class="doc letterhead">
      <table class="sheet">
        <thead><tr><td class="lh-head-cell">${head}</td></tr></thead>
        <tfoot><tr><td class="lh-foot-cell">${foot}</td></tr></tfoot>
        <tbody><tr><td class="lh-body-cell"><div class="lh-body">${body}</div></td></tr></tbody>
      </table>
    </div>`;
}
