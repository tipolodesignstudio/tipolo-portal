// Branded proposal document -> browser print dialog ("Save as PDF").
// Tokens in section text are resolved at print time against current data.
import { escapeHtml, money, num, date } from "../core/format.js";
import { lineAmount } from "../core/invoice-calc.js";
import { buildTokenMap, resolveSections } from "../core/tokens.js";
import { clientPrimaryContact } from "../core/api.js";

export function printProposal(p, settings = {}) {
  const c = p.client || {};
  const contact = clientPrimaryContact(c);
  const map = buildTokenMap({ client: c, proposal: p, settings });
  const sections = resolveSections(p.sections, map);
  const subtotal = (p.line_items || []).reduce((s, li) => s + lineAmount(li), 0);

  const bizLines = [
    settings.address,
    [settings.email, settings.phone].filter(Boolean).join("  ·  "),
  ].filter(Boolean);

  const host = document.createElement("div");
  host.id = "print-root";
  host.innerHTML = `
    <div class="doc">
      <div class="doc-head">
        <div class="biz">
          ${settings.logo_url ? `<img src="${escapeHtml(settings.logo_url)}" style="max-height:54px;margin-bottom:6px" />`
            : `<div class="name">${escapeHtml(settings.business_name || "Tipolo Design Studio")}</div>`}
          <div class="doc-meta" style="white-space:pre-line">${bizLines.map(escapeHtml).join("\n")}</div>
        </div>
        <div style="text-align:right">
          <div class="doc-title">Proposal</div>
          <div class="doc-meta">
            <div><strong>${escapeHtml(p.number || "DRAFT")}</strong></div>
            <div>${date(p.created_at || new Date())}</div>
            ${p.valid_until ? `<div>Valid until ${date(p.valid_until)}</div>` : ""}
          </div>
        </div>
      </div>

      <div class="parties">
        <div>
          <h4>Prepared for</h4>
          <div>${escapeHtml(c.name || "")}</div>
          ${!c.is_individual && contact ? `<div>Attn: ${escapeHtml(contact.name)}${contact.title ? `, ${escapeHtml(contact.title)}` : ""}</div>` : ""}
          <div style="white-space:pre-line">${[c.street, c.city, [c.province, c.postal_code].filter(Boolean).join("  ")].filter(Boolean).map(escapeHtml).join("\n")}</div>
        </div>
        <div><h4>Project</h4><div>${escapeHtml(p.title || "")}</div><div>${escapeHtml(p.project_scope || "")}</div></div>
      </div>

      ${sections.map((s) => `
        <div class="section">
          ${s.heading ? `<h3>${escapeHtml(s.heading)}</h3>` : ""}
          <div style="white-space:pre-wrap">${escapeHtml(s.body || "")}</div>
        </div>`).join("")}

      ${(p.line_items || []).length ? `
        <div class="section">
          <h3>Fee schedule</h3>
          <table class="lines"><thead><tr>
            <th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th>
          </tr></thead><tbody>
            ${p.line_items.map((li) => `<tr>
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

      <div class="doc-foot">Accepted by _______________________________   Date ______________</div>
    </div>`;

  document.body.appendChild(host);
  const cleanup = () => { host.remove(); window.removeEventListener("afterprint", cleanup); };
  window.addEventListener("afterprint", cleanup);
  window.print();
  setTimeout(cleanup, 60000);
}
