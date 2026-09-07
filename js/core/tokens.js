// {{token}} substitution for proposal templates.
import { money, date, isoDate } from "./format.js";

// ctx: { client, proposal, settings }
export function buildTokenMap({ client = {}, proposal = {}, settings = {} }) {
  const subtotal = (proposal.line_items || []).reduce(
    (s, li) => s + (Number(li.qty) || 0) * (Number(li.unit_price) || 0), 0);
  const contacts = client.contacts || [];
  const primary = contacts.find((c) => c.is_primary) || contacts[0] || null;
  return {
    "client.name": client.name || "",
    "client.contact": client.is_individual ? client.name : (primary?.name || ""),
    "client.firstName": ((client.is_individual ? client.name : primary?.name) || "")
      .trim().split(/\s+/)[0] || "[First Name]",
    "client.email": primary?.email || client.email || "",
    "project.title": proposal.title || "",
    "project.scope": proposal.project_scope || "",
    "proposal.number": proposal.number || "",
    "proposal.validUntil": proposal.valid_until ? date(proposal.valid_until) : "",
    "date.today": date(isoDate()),
    "fee.subtotal": money(subtotal),
    "business.name": settings.business_name || "Tipolo Design Studio",
    "business.email": settings.email || "",
    // Settings → Default hourly rate. Unset falls back to a bracket so it prints red
    // rather than leaving a silent gap in the fee section.
    "rate.hourly": settings.default_hourly_rate
      ? money(settings.default_hourly_rate) : "[set the hourly rate in Settings]",
    // A day is eight hours unless Settings overrides it.
    "rate.daily": settings.default_day_rate
      ? money(settings.default_day_rate)
      : settings.default_hourly_rate
        ? money(settings.default_hourly_rate * 8) : "[set the hourly rate in Settings]",
    "date.year": String(new Date().getFullYear()),
  };
}

export function resolveTokens(text, map) {
  return String(text || "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, key) =>
    key in map ? map[key] : m);
}

// Resolves the text and keeps everything else. A proposal block carries part, level,
// kind, rows and breakBefore as well as heading/body; rebuilding it from two fields
// would flatten a structured template back into a plain list of sections.
export function resolveSections(sections, map) {
  return (sections || []).map((s) => ({
    ...s,
    ...(s.heading === undefined ? {} : { heading: resolveTokens(s.heading, map) }),
    ...(s.body === undefined ? {} : { body: resolveTokens(s.body, map) }),
    ...(s.rows ? { rows: s.rows.map((r) => ({ ...r })) } : {}),
  }));
}

export const TOKEN_HELP = [
  "{{client.name}}", "{{client.contact}}", "{{client.firstName}}", "{{project.title}}", "{{project.scope}}",
  "{{proposal.number}}", "{{proposal.validUntil}}", "{{date.today}}", "{{date.year}}",
  "{{fee.subtotal}}", "{{rate.hourly}}", "{{rate.daily}}", "{{business.name}}",
];
