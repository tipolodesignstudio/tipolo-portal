// The house invoice, transcribed from 04_Templates/Invoice/Invoice Down Payment
// Template.docx — the same letterhead as the proposal, a Bill To block, the progress
// table, and the payment information underneath.
//
// Everything except the Bill To block and the table itself is ordinary prose the
// builder edits. Project specifics are left in [brackets] so they print red until
// they are filled in.

export const PARTS = [
  { id: "details", label: "Bill To" },
  { id: "lines", label: "Invoice Details" },
  { id: "payment", label: "Payment Information" },
];

// Heading levels an invoice uses. The document's h3 is body size but bold, which is
// exactly how "INVOICE DETAILS" and "Payment Information" are set in the .docx.
export const LEVELS = [
  { value: 0, label: "Body text" },
  { value: 3, label: "Heading" },
];

export function defaultInvoiceSections() {
  return [
    { part: "lines", level: 3, heading: "INVOICE DETAILS", body: "" },
    { part: "lines", kind: "progress" },

    { part: "payment", level: 3, heading: "Payment Information", body: "" },
    {
      part: "payment", level: 0, body:
        "**Deposit Due Date:** {{invoice.dueDate}}, or upon receipt of this invoice, "
        + "whichever is earlier. This deposit secures your project start date.",
    },
    {
      part: "payment", level: 0, body:
        "**Cheques:** should be made payable to “Jim Dema-ala” and delivered to "
        + "308-3131 St. Johns Street, Port Moody, BC V3H 0L2, or paid in person.",
    },
    {
      part: "payment", level: 0, body:
        "**Electronic Funds Transfer (EFT):** should be sent to accounting@tipolo.ca "
        + "only. Please submit a copy of payment transmission records or email "
        + "confirmation from the bank for verification.",
    },
    { part: "payment", level: 0, body: "**Prepared By:**\n{{invoice.preparedBy}}" },
  ];
}

// An invoice saved before 0020 has no sections; give it the house ones so it opens in
// the builder rather than as a blank page.
export function normaliseInvoiceSections(sections) {
  const s = Array.isArray(sections) ? sections : [];
  if (!s.length) return defaultInvoiceSections();
  // The table has to be somewhere, or the figures would simply not print.
  return s.some((b) => b.kind === "progress")
    ? s
    : [...s, { part: "lines", kind: "progress" }];
}

export const partOf = (b) => b.part || "lines";

// A progress line's identity, so the same line can be followed across the project's
// invoices. Older lines have no id, so fall back to the description.
export const lineKey = (li) => li.id || `d:${(li.description || "").trim().toLowerCase()}`;

export function newLineId() {
  return crypto.randomUUID ? crypto.randomUUID() : `l-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// The fee schedule of the proposal this project came from becomes the budget column.
export function budgetLinesFromProposal(lineItems = []) {
  return lineItems
    .filter((li) => (li.description || "").trim() || Number(li.qty) * Number(li.unit_price))
    .map((li) => ({
      id: newLineId(),
      description: li.description || "",
      budget: Math.round((Number(li.qty) || 0) * (Number(li.unit_price) || 0) * 100) / 100,
      amount: 0,
    }));
}
