// {{token}} substitution for proposal templates.
import { money, date, isoDate } from "./format.js";

// ctx: { client, proposal, settings }
export function buildTokenMap({ client = {}, proposal = {}, settings = {} }) {
  const subtotal = (proposal.line_items || []).reduce(
    (s, li) => s + (Number(li.qty) || 0) * (Number(li.unit_price) || 0), 0);
  return {
    "client.name": client.name || "",
    "client.contact": client.is_individual ? client.name : (client.contact_name || ""),
    "client.email": client.email || "",
    "project.title": proposal.title || "",
    "project.scope": proposal.project_scope || "",
    "proposal.number": proposal.number || "",
    "proposal.validUntil": proposal.valid_until ? date(proposal.valid_until) : "",
    "date.today": date(isoDate()),
    "fee.subtotal": money(subtotal),
    "business.name": settings.business_name || "Tipolo Design Studio",
    "business.email": settings.email || "",
  };
}

export function resolveTokens(text, map) {
  return String(text || "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, key) =>
    key in map ? map[key] : m);
}

export function resolveSections(sections, map) {
  return (sections || []).map((s) => ({
    heading: resolveTokens(s.heading, map),
    body: resolveTokens(s.body, map),
  }));
}

export const TOKEN_HELP = [
  "{{client.name}}", "{{client.contact}}", "{{project.title}}", "{{project.scope}}",
  "{{proposal.number}}", "{{proposal.validUntil}}", "{{date.today}}", "{{fee.subtotal}}",
  "{{business.name}}",
];
