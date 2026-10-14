// Display formatting shared across screens. Ported from the previous portal's
// js/core/format.js so both versions print the same way.

const cad = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
export const money = (n: number | string | null | undefined) => cad.format(Number(n) || 0);

const asDate = (value: string | Date) =>
  value instanceof Date ? value : new Date(value + (String(value).length === 10 ? "T00:00:00" : ""));

const shortFmt = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "short", day: "numeric" });
export function date(value: string | Date | null | undefined) {
  if (!value) return "";
  const d = asDate(value);
  return isNaN(d.getTime()) ? "" : shortFmt.format(d);
}

export function relTime(value: string | null | undefined) {
  if (!value) return "";
  const mins = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return date(value);
}

// "+1.604.555.0123", formatted as you type. The +1 is assumed (Canada/US).
export function formatPhone(input: string | null | undefined, cc = "1") {
  let digits = String(input ?? "").replace(/\D/g, "");
  if (digits.startsWith(cc)) digits = digits.slice(cc.length);
  digits = digits.slice(0, 10);
  if (!digits) return "";
  const parts = [`+${cc}`, digits.slice(0, 3)];
  if (digits.length > 3) parts.push(digits.slice(3, 6));
  if (digits.length > 6) parts.push(digits.slice(6, 10));
  return parts.join(".");
}

export type Tone = "grey" | "amber" | "green" | "red";

export const STATUS: Record<string, { label: string; tone: Tone }> = {
  lead: { label: "Lead", tone: "grey" },
  proposal: { label: "Proposal", tone: "amber" },
  active: { label: "Active", tone: "green" },
  on_hold: { label: "On hold", tone: "amber" },
  complete: { label: "Complete", tone: "grey" },
  archived: { label: "Archived", tone: "grey" },
  draft: { label: "Draft", tone: "grey" },
  sent: { label: "Sent", tone: "amber" },
  accepted: { label: "Accepted", tone: "green" },
  declined: { label: "Declined", tone: "red" },
  paid: { label: "Paid", tone: "green" },
  overdue: { label: "Overdue", tone: "red" },
};
