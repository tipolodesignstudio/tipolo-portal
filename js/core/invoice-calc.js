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

/* ---- progress invoices ----
   A progress invoice bills against a budget: each line carries the agreed fee, what
   earlier invoices already drew, and what this one draws. Only the draw is typed. */

export const progressSubtotal = (lines = []) =>
  round2(lines.reduce((s, li) => s + (Number(li.amount) || 0), 0));

// How much of `line` earlier invoices on the same project have already billed.
// `previous` is looked up by the caller, which is the only place that knows the
// project's other invoices.
export const lineBalance = (line, previous = 0) =>
  round2((Number(line.budget) || 0) - previous - (Number(line.amount) || 0));

// The most this line may still be billed. Typing more than this is what the builder
// rejects — it would put the balance below zero.
export const lineRemaining = (line, previous = 0) =>
  round2((Number(line.budget) || 0) - previous);

// Same shape as computeTotals, from progress lines. Tax can be turned off per invoice;
// the .docx template shows a subtotal and nothing else.
export function computeProgressTotals(lines = [], taxLineDefs = [], applyTaxes = true) {
  const subtotal = progressSubtotal(lines);
  const taxLines = !applyTaxes ? [] : taxLineDefs
    .filter((t) => t.enabled)
    .map((t) => ({
      label: t.label,
      rate: Number(t.rate) || 0,
      amount: round2((subtotal * (Number(t.rate) || 0)) / 100),
    }));
  const taxTotal = round2(taxLines.reduce((s, t) => s + t.amount, 0));
  return { subtotal, taxLines, taxTotal, total: round2(subtotal + taxTotal) };
}
