// Formatting + small shared utilities. No dependencies.

let _currency = "CAD";
export function setCurrency(code) { if (code) _currency = code; }

export function money(amount, { blankZero = false } = {}) {
  const n = Number(amount || 0);
  if (blankZero && n === 0) return "";
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: _currency,
  }).format(n);
}

export function num(n, digits = 2) {
  return new Intl.NumberFormat("en-CA", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(n || 0));
}

const _dateFmt = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "short", day: "numeric" });
export function date(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value + (String(value).length === 10 ? "T00:00:00" : ""));
  if (isNaN(d)) return "";
  return _dateFmt.format(d);
}

export function isoDate(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
}

export function relTime(value) {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return date(value);
}

// minutes <-> "h:mm" display / flexible parse ("1:30", "1.5", "1.5h", "90m")
export function minutesToHM(mins) {
  const m = Math.max(0, Math.round(Number(mins) || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${h}:${String(r).padStart(2, "0")}`;
}
export function minutesToHours(mins, digits = 2) {
  return num((Number(mins) || 0) / 60, digits);
}
export function parseDuration(input) {
  if (input == null) return null;
  const s = String(input).trim().toLowerCase();
  if (!s) return null;
  let m;
  if ((m = s.match(/^(\d+):([0-5]?\d)$/))) return (+m[1]) * 60 + (+m[2]);
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*h(?:ours?)?$/))) return Math.round(parseFloat(m[1]) * 60);
  if ((m = s.match(/^(\d+)\s*m(?:in(?:utes?)?)?$/))) return +m[1];
  if ((m = s.match(/^(\d+(?:\.\d+)?)$/))) return Math.round(parseFloat(m[1]) * 60); // bare number = hours
  return null;
}

export function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// tagged-template helper: interpolations are HTML-escaped unless wrapped in raw()
export function html(strings, ...values) {
  return strings.reduce((out, s, i) => {
    if (i === 0) return s;
    const v = values[i - 1];
    const chunk = v && v.__raw ? v.value : Array.isArray(v) ? v.join("") : escapeHtml(v);
    return out + chunk + s;
  }, "");
}
export const raw = (value) => ({ __raw: true, value: value ?? "" });

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function titleCase(s) {
  return String(s || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const STATUS_LABELS = {
  lead: "Lead", proposal: "Proposal", active: "Active", on_hold: "On hold",
  complete: "Complete", archived: "Archived",
  draft: "Draft", sent: "Sent", paid: "Paid", overdue: "Overdue",
  accepted: "Accepted", declined: "Declined",
};
export const STATUS_TONE = {
  lead: "grey", proposal: "amber", active: "green", on_hold: "amber",
  complete: "grey", archived: "grey",
  draft: "grey", sent: "amber", paid: "green", overdue: "red",
  accepted: "green", declined: "red",
};
