// Shared invoice math — used by the editor, the list, and the print view so the
// numbers always agree.

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const lineAmount = (li) =>
  round2((Number(li.qty) || 0) * (Number(li.unit_price) || 0));

// taxLineDefs: from app_settings.tax_lines — [{ label, rate, enabled }]
export function computeTotals(lineItems = [], taxLineDefs = []) {
  const subtotal = round2(lineItems.reduce((s, li) => s + lineAmount(li), 0));
  const taxLines = taxLineDefs
    .filter((t) => t.enabled)
    .map((t) => ({
      label: t.label,
      rate: Number(t.rate) || 0,
      amount: round2((subtotal * (Number(t.rate) || 0)) / 100),
    }));
  const taxTotal = round2(taxLines.reduce((s, t) => s + t.amount, 0));
  return { subtotal, taxLines, taxTotal, total: round2(subtotal + taxTotal) };
}
