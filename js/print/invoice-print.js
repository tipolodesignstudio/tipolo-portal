// Builds a printable invoice document into #print-root and triggers the browser's
// print dialog ("Save as PDF"). Styling lives in css/print.css (.doc rules).
import { escapeHtml, money, num, date } from "../core/format.js";
import { computeTotals, lineAmount } from "../core/invoice-calc.js";
import { billingContact } from "../core/api.js";

export function printInvoice(inv, settings = {}) {
  const t = computeTotals(inv.line_items || [], settings.tax_lines || []);
  const biz = settings || {};
  const c = (inv.project && inv.project.client) || {};
  const contact = billingContact(inv.project);

  const bizLines = [
    biz.address, // legacy single line, if present
    [biz.email, biz.phone].filter(Boolean).join("  ·  "),
    [biz.gst_number && `GST ${biz.gst_number}`, biz.pst_number && `PST ${biz.pst_number}`]
      .filter(Boolean).join("   "),
  ].filter(Boolean);

  const clientAddr = [
    c.street, c.city,
    [c.province, c.postal_code].filter(Boolean).join("  "),
  ].filter(Boolean);

  const host = document.createElement("div");
  host.id = "print-root";
  host.innerHTML = `
    <div class="doc">
      <div class="doc-head">
        <div class="biz">
          ${biz.logo_url ? `<img src="${escapeHtml(biz.logo_url)}" style="max-height:54px;margin-bottom:6px" />`
            : `<div class="name">${escapeHtml(biz.business_name || "Tipolo Design Studio")}</div>`}
          <div class="doc-meta" style="white-space:pre-line">${bizLines.map(escapeHtml).join("\n")}</div>
        </div>
        <div style="text-align:right">
          <div class="doc-title">Invoice</div>
          <div class="doc-meta">
            ${inv.number ? `<div><strong>${escapeHtml(inv.number)}</strong></div>` : "<div>DRAFT</div>"}
            ${inv.project?.title ? `<div>${escapeHtml(inv.project.title)}</div>` : ""}
            <div>Issued ${inv.issue_date ? date(inv.issue_date) : "—"}</div>
            ${inv.due_date ? `<div>Due ${date(inv.due_date)}</div>` : ""}
          </div>
        </div>
      </div>

      <div class="parties">
        <div>
          <h4>Bill to</h4>
          <div>${escapeHtml(c.name || "")}</div>
          ${!c.is_individual && contact ? `<div>Attn: ${escapeHtml(contact.name)}${contact.title ? `, ${escapeHtml(contact.title)}` : ""}</div>` : ""}
          <div style="white-space:pre-line">${clientAddr.map(escapeHtml).join("\n")}</div>
          ${(contact && contact.email) || c.email ? `<div>${escapeHtml((contact && contact.email) || c.email)}</div>` : ""}
        </div>
      </div>

      <table class="lines">
        <thead><tr>
          <th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th>
        </tr></thead>
        <tbody>
          ${(inv.line_items || []).map((li) => `
            <tr>
              <td>${escapeHtml(li.description || "")}</td>
              <td class="num">${num(li.qty, 2)}</td>
              <td class="num">${money(li.unit_price)}</td>
              <td class="num">${money(lineAmount(li))}</td>
            </tr>`).join("")}
        </tbody>
      </table>

      <div class="totals">
        <div class="row"><span>Subtotal</span><span>${money(t.subtotal)}</span></div>
        ${t.taxLines.map((tx) => `<div class="row"><span>${escapeHtml(tx.label)} (${num(tx.rate, tx.rate % 1 ? 2 : 0)}%)</span><span>${money(tx.amount)}</span></div>`).join("")}
        <div class="row grand"><span>Total due</span><span>${money(t.total)}</span></div>
      </div>

      ${inv.status === "paid" ? `<div class="section"><strong>Paid</strong> ${date(inv.paid_date)}${inv.payment_method ? ` · ${escapeHtml(inv.payment_method)}` : ""}</div>` : ""}
      ${inv.notes ? `<div class="doc-foot">${escapeHtml(inv.notes)}</div>` : ""}
    </div>`;

  document.body.appendChild(host);
  const cleanup = () => { host.remove(); window.removeEventListener("afterprint", cleanup); };
  window.addEventListener("afterprint", cleanup);
  window.print();
  // Safari sometimes doesn't fire afterprint
  setTimeout(cleanup, 60000);
}
