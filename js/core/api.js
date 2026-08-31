// Data-access layer. Views call these helpers; they never touch `supabase` directly.
import { supabase } from "./supabase.js";
import { isoDate } from "./format.js";

const isoToday = () => isoDate();
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
function addDaysIso(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

function unwrap({ data, error }) {
  if (error) {
    console.error("[api]", error);
    throw new Error(error.message || "Request failed");
  }
  return data;
}

/* ---------------- settings ---------------- */

export async function getSettings() {
  const { data, error } = await supabase
    .from("app_settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw new Error(error.message);
  return data || defaultSettings();
}

export async function saveSettings(patch) {
  return unwrap(
    await supabase.from("app_settings")
      .update(patch).eq("id", 1).select().single()
  );
}

function defaultSettings() {
  return {
    id: 1, currency: "CAD",
    job_seq_year: new Date().getFullYear(), job_seq_next: 1,
    tax_lines: [
      { label: "GST", rate: 5, enabled: true },
      { label: "PST", rate: 7, enabled: true },
    ],
    business_name: "", address: "", email: "", phone: "",
    gst_number: "", pst_number: "", logo_url: "",
    default_hourly_rate: null, payment_terms: "", proposal_terms: "",
  };
}

/* ---------------- profiles ---------------- */

export async function getMyProfile() {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await supabase
    .from("profiles").select("*").eq("id", u.user.id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/* ---------------- client categories (managed list) ---------------- */

export async function listCategories() {
  return unwrap(await supabase.from("client_categories").select("*")
    .order("sort_order").order("name"));
}
export async function createCategory(name) {
  const { data: max } = await supabase.from("client_categories")
    .select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  return unwrap(await supabase.from("client_categories")
    .insert({ name: name.trim(), sort_order: (max?.sort_order ?? 0) + 1 }).select().single());
}
export async function updateCategory(id, patch) {
  return unwrap(await supabase.from("client_categories").update(patch).eq("id", id).select().single());
}
export async function deleteCategory(id) {
  // unset it on any client that uses it, then delete
  await supabase.from("clients").update({ category_id: null }).eq("category_id", id);
  const { error } = await supabase.from("client_categories").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/* ---------------- clients ---------------- */

const CLIENT_SELECT =
  "*, projects(count), category:category_id(id, name), " +
  "contacts:client_contacts(id, name, title, email, phone, is_primary)";

export async function listClients({ search = "", status = "active", categoryId = "" } = {}) {
  let q = supabase.from("clients").select(CLIENT_SELECT).order("name", { ascending: true });
  if (status && status !== "all") q = q.eq("status", status);
  if (categoryId) q = q.eq("category_id", categoryId);
  if (search.trim()) {
    const s = `%${search.trim()}%`;
    q = q.or(`name.ilike.${s},email.ilike.${s}`);
  }
  const rows = unwrap(await q);
  return rows.map((r) => ({
    ...r,
    project_count: r.projects?.[0]?.count ?? 0,
    primary_contact: (r.contacts || []).find((c) => c.is_primary) || (r.contacts || [])[0] || null,
  }));
}

/* ---------------- client notes (CRM timeline) ---------------- */

export async function listClientNotes(clientId) {
  return unwrap(await supabase.from("client_notes")
    .select("*").eq("client_id", clientId).order("created_at", { ascending: false }));
}
export async function addClientNote(clientId, body) {
  return unwrap(await supabase.from("client_notes")
    .insert({ client_id: clientId, body: body.trim() }).select().single());
}
// bulk-commit inline edits from the list: [{ clientId, body }]
export async function commitClientNotes(changes) {
  const rows = changes.filter((c) => c.body != null && c.body.trim())
    .map((c) => ({ client_id: c.clientId, body: c.body.trim() }));
  if (!rows.length) return 0;
  const { error } = await supabase.from("client_notes").insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

export async function getClient(id) {
  const row = unwrap(await supabase.from("clients").select(CLIENT_SELECT).eq("id", id).single());
  row.primary_contact = (row.contacts || []).find((c) => c.is_primary) || (row.contacts || [])[0] || null;
  return row;
}

export async function createClient(patch) {
  return unwrap(await supabase.from("clients").insert(patch).select().single());
}
export async function updateClient(id, patch) {
  return unwrap(await supabase.from("clients").update(patch).eq("id", id).select().single());
}

export async function listClientContacts(clientId) {
  return unwrap(await supabase.from("client_contacts").select("*").eq("client_id", clientId)
    .order("is_primary", { ascending: false }).order("created_at"));
}

// Reconcile a client's contacts against a form list. `rows` = [{id?, name, title, email, phone, is_primary}]
export async function saveClientContacts(clientId, rows) {
  const existing = unwrap(await supabase.from("client_contacts").select("id").eq("client_id", clientId));
  const keepIds = new Set(rows.filter((r) => r.id).map((r) => r.id));
  const toDelete = existing.filter((e) => !keepIds.has(e.id)).map((e) => e.id);
  if (toDelete.length) {
    const { error } = await supabase.from("client_contacts").delete().in("id", toDelete);
    if (error) throw new Error(error.message);
  }
  let anyPrimary = rows.some((r) => r.is_primary);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const payload = {
      client_id: clientId,
      name: r.name.trim(),
      title: r.title?.trim() || null,
      email: r.email?.trim() || null,
      phone: r.phone?.trim() || null,
      is_primary: anyPrimary ? !!r.is_primary : i === 0,
    };
    if (r.id) {
      const { error } = await supabase.from("client_contacts").update(payload).eq("id", r.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("client_contacts").insert(payload);
      if (error) throw new Error(error.message);
    }
  }
}

/* ---------------- projects ---------------- */

const PROJECT_SELECT =
  "*, client:clients(id, name, is_individual, default_rate, " +
  "contacts:client_contacts(id, name, title, email, phone, is_primary)), " +
  "contact:contact_id(id, name, title, email, phone)";

export async function listProjects({ search = "", status = "", scope = "", clientId = "" } = {}) {
  let q = supabase.from("projects").select(PROJECT_SELECT).order("updated_at", { ascending: false });
  if (status && status !== "all") q = q.eq("status", status);
  if (scope && scope !== "all") q = q.eq("scope", scope);
  if (clientId) q = q.eq("client_id", clientId);
  if (search.trim()) {
    const s = `%${search.trim()}%`;
    q = q.or(`title.ilike.${s},description.ilike.${s}`);
  }
  return unwrap(await q);
}

export async function getProject(id) {
  return unwrap(await supabase.from("projects").select(PROJECT_SELECT).eq("id", id).single());
}

export async function createProject(patch) {
  return unwrap(await supabase.from("projects").insert(patch).select(PROJECT_SELECT).single());
}

export async function updateProject(id, patch) {
  return unwrap(await supabase.from("projects").update(patch).eq("id", id).select(PROJECT_SELECT).single());
}

/* who an invoice/proposal is addressed to: project contact -> client primary contact */
export function billingContact(project) {
  if (!project) return null;
  if (project.contact) return project.contact;
  const cs = project.client?.contacts || [];
  return cs.find((c) => c.is_primary) || cs[0] || null;
}
export function clientPrimaryContact(client) {
  const cs = client?.contacts || [];
  return cs.find((c) => c.is_primary) || cs[0] || null;
}

/* effective hourly rate: project override -> client default -> settings default */
export function effectiveRate(project, settings) {
  return (
    project?.hourly_rate ??
    project?.client?.default_rate ??
    settings?.default_hourly_rate ??
    null
  );
}

/* ---------------- dashboard ---------------- */

export async function getDashboardStats() {
  const [clientsActive, projects] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("projects").select("id, status, title, updated_at, client:clients(name)")
      .order("updated_at", { ascending: false }),
  ]);
  if (clientsActive.error) throw new Error(clientsActive.error.message);
  if (projects.error) throw new Error(projects.error.message);

  const rows = projects.data || [];
  const byStatus = {};
  for (const p of rows) byStatus[p.status] = (byStatus[p.status] || 0) + 1;

  // unbilled billable time this month + all-time (Phase 2)
  let unbilled = { minutesMonth: 0, valueMonth: 0, minutesAll: 0, valueAll: 0 };
  try {
    const monthStart = new Date();
    monthStart.setDate(1);
    const te = await supabase
      .from("time_entries")
      .select("minutes, rate, entry_date")
      .is("invoice_id", null)
      .eq("billable", true);
    if (!te.error) {
      const ms = monthStart.toISOString().slice(0, 10);
      for (const e of te.data || []) {
        const val = (e.minutes / 60) * (e.rate || 0);
        unbilled.minutesAll += e.minutes;
        unbilled.valueAll += val;
        if (e.entry_date >= ms) { unbilled.minutesMonth += e.minutes; unbilled.valueMonth += val; }
      }
    }
  } catch { /* time_entries table may not exist yet */ }

  // open proposals (Phase 4)
  let openProposals = 0;
  try {
    const pr = await supabase.from("proposals")
      .select("id", { count: "exact", head: true }).in("status", ["draft", "sent"]);
    if (!pr.error) openProposals = pr.count ?? 0;
  } catch { /* proposals table may not exist yet */ }

  // invoice figures (Phase 3)
  let invoices = { outstanding: 0, overdueCount: 0, paidThisMonth: 0 };
  try {
    const inv = await supabase.from("invoices").select("total, status, due_date, paid_date");
    if (!inv.error) {
      const today = isoToday();
      const ms = today.slice(0, 8) + "01";
      for (const i of inv.data || []) {
        if (i.status === "sent") {
          invoices.outstanding += Number(i.total || 0);
          if (i.due_date && i.due_date < today) invoices.overdueCount += 1;
        }
        if (i.status === "paid" && i.paid_date && i.paid_date >= ms) {
          invoices.paidThisMonth += Number(i.total || 0);
        }
      }
    }
  } catch { /* invoices table may not exist yet */ }

  return {
    activeClients: clientsActive.count ?? 0,
    activeProjects: byStatus.active || 0,
    totalProjects: rows.length,
    byStatus,
    recent: rows.slice(0, 6),
    unbilled,
    invoices,
    openProposals,
  };
}

/* ---------------- time entries ---------------- */

const TE_SELECT = "*, project:projects(id, title, scope, client:clients(id, name))";

export async function listTimeEntries({ from, to, projectId = "", billable = "", billed = "" } = {}) {
  let q = supabase.from("time_entries").select(TE_SELECT).order("entry_date", { ascending: false });
  if (from) q = q.gte("entry_date", from);
  if (to) q = q.lte("entry_date", to);
  if (projectId) q = q.eq("project_id", projectId);
  if (billable === "yes") q = q.eq("billable", true);
  if (billable === "no") q = q.eq("billable", false);
  if (billed === "unbilled") q = q.is("invoice_id", null);
  if (billed === "billed") q = q.not("invoice_id", "is", null);
  return unwrap(await q);
}

export async function listProjectTime(projectId) {
  return unwrap(
    await supabase.from("time_entries").select("*").eq("project_id", projectId)
      .order("entry_date", { ascending: false })
  );
}

export async function createTimeEntry(patch) {
  return unwrap(await supabase.from("time_entries").insert(patch).select(TE_SELECT).single());
}

export async function updateTimeEntry(id, patch) {
  return unwrap(await supabase.from("time_entries").update(patch).eq("id", id).select(TE_SELECT).single());
}

export async function deleteTimeEntry(id) {
  const { error } = await supabase.from("time_entries").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/* projects the user can log against (not archived/complete), lightweight */
export async function listActiveProjectsLite() {
  return unwrap(
    await supabase.from("projects")
      .select("id, title, scope, hourly_rate, client:clients(id, name, default_rate)")
      .not("status", "in", "(archived,complete)")
      .order("title")
  );
}

/* ---------------- invoices ---------------- */
// One invoice = one project. Client is reached through the project.

const INVOICE_SELECT =
  "*, project:projects(id, number, title, scope, contact:contact_id(name, title, email, phone), " +
  "client:clients(id, name, is_individual, email, street, city, province, postal_code, " +
  "contacts:client_contacts(name, title, email, phone, is_primary)))";

export async function listInvoices({ status = "", projectId = "" } = {}) {
  let q = supabase.from("invoices").select(INVOICE_SELECT).order("issue_date", { ascending: false });
  if (status && status !== "all") {
    if (status === "overdue") q = q.eq("status", "sent").lt("due_date", isoToday());
    else q = q.eq("status", status);
  }
  if (projectId) q = q.eq("project_id", projectId);
  return unwrap(await q);
}

export async function getInvoice(id) {
  return unwrap(await supabase.from("invoices").select(INVOICE_SELECT).eq("id", id).single());
}

export async function listProjectInvoices(projectId) {
  return unwrap(
    await supabase.from("invoices").select(INVOICE_SELECT)
      .eq("project_id", projectId).order("issue_date", { ascending: false })
  );
}

export async function createInvoice(patch) {
  return unwrap(await supabase.from("invoices").insert(patch).select(INVOICE_SELECT).single());
}

export async function updateInvoice(id, patch) {
  return unwrap(await supabase.from("invoices").update(patch).eq("id", id).select(INVOICE_SELECT).single());
}

// Finalize a draft: assign the next number (YYNNN-XX), link its time entries, set status.
export async function finalizeInvoice(inv) {
  const { data: number, error: numErr } =
    await supabase.rpc("next_invoice_number", { p_project_id: inv.project_id });
  if (numErr) throw new Error(numErr.message);

  const teIds = (inv.line_items || []).flatMap((li) => li.source_time_entry_ids || []);
  if (teIds.length) {
    const { error } = await supabase.from("time_entries")
      .update({ invoice_id: inv.id }).in("id", teIds);
    if (error) throw new Error(error.message);
  }
  return updateInvoice(inv.id, {
    number, status: "sent", sent_date: isoToday(),
    due_date: inv.due_date || addDaysIso(isoToday(), 30),
  });
}

export async function markInvoicePaid(id, { paid_date, payment_method }) {
  return updateInvoice(id, {
    status: "paid",
    paid_date: paid_date || isoToday(),
    payment_method: payment_method || null,
  });
}

export async function reopenInvoice(id) {
  return updateInvoice(id, { status: "sent", paid_date: null });
}

// Delete an invoice; time entries are released automatically by the FK (on delete set null).
export async function deleteInvoice(id) {
  const { error } = await supabase.from("invoices").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// Unbilled billable time for ONE project, grouped into draft line items by rate.
export async function buildTimeLineItems(projectId) {
  const proj = unwrap(
    await supabase.from("projects").select("id, title").eq("id", projectId).single()
  );
  const entries = unwrap(
    await supabase.from("time_entries")
      .select("id, minutes, rate")
      .eq("project_id", projectId)
      .is("invoice_id", null)
      .eq("billable", true)
  );

  const groups = new Map(); // key: rate
  for (const e of entries) {
    const rate = Number(e.rate || 0);
    if (!groups.has(rate)) groups.set(rate, { rate, minutes: 0, ids: [] });
    const g = groups.get(rate);
    g.minutes += e.minutes;
    g.ids.push(e.id);
  }

  const lineItems = [...groups.values()].map((g) => ({
    description: `${proj.title} — professional services`,
    qty: round2(g.minutes / 60),
    unit_price: round2(g.rate),
    kind: "time",
    source_time_entry_ids: g.ids,
  }));

  return { lineItems, entryCount: entries.length };
}

// projects for the invoice picker: "YYNNN · Title — Client"
export async function listProjectsForInvoicing() {
  return unwrap(
    await supabase.from("projects")
      .select("id, number, title, status, client:clients(name)")
      .order("number", { ascending: false })
  );
}

/* ---------------- proposal templates ---------------- */

export async function listTemplates() {
  return unwrap(await supabase.from("proposal_templates").select("*").order("name"));
}
export async function getTemplate(id) {
  return unwrap(await supabase.from("proposal_templates").select("*").eq("id", id).single());
}
export async function createTemplate(patch) {
  return unwrap(await supabase.from("proposal_templates").insert(patch).select().single());
}
export async function updateTemplate(id, patch) {
  return unwrap(await supabase.from("proposal_templates").update(patch).eq("id", id).select().single());
}
export async function deleteTemplate(id) {
  const { error } = await supabase.from("proposal_templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/* ---------------- proposals ---------------- */

const PROPOSAL_SELECT =
  "*, client:clients(id, name, is_individual, email, street, city, province, postal_code, " +
  "contacts:client_contacts(name, title, email, phone, is_primary)), " +
  "converted_project:converted_project_id(id, number, status)";

export async function listProposals({ status = "", clientId = "" } = {}) {
  let q = supabase.from("proposals").select(PROPOSAL_SELECT).order("created_at", { ascending: false });
  if (status && status !== "all") q = q.eq("status", status);
  if (clientId) q = q.eq("client_id", clientId);
  return unwrap(await q);
}
export async function getProposal(id) {
  return unwrap(await supabase.from("proposals").select(PROPOSAL_SELECT).eq("id", id).single());
}
export async function listProjectProposals(projectId) {
  return unwrap(
    await supabase.from("proposals").select("id, number, title, status, subtotal")
      .eq("converted_project_id", projectId).order("created_at")
  );
}
export async function createProposal(patch) {
  return unwrap(await supabase.from("proposals").insert(patch).select(PROPOSAL_SELECT).single());
}
export async function updateProposal(id, patch) {
  return unwrap(await supabase.from("proposals").update(patch).eq("id", id).select(PROPOSAL_SELECT).single());
}
export async function deleteProposal(id) {
  const { error } = await supabase.from("proposals").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
export async function setProposalStatus(id, status) {
  const patch = { status };
  if (status === "sent") patch.sent_date = isoToday();
  if (status === "accepted" || status === "declined") patch.decided_date = isoToday();
  return updateProposal(id, patch);
}

// Convert an accepted proposal to a project. The project takes the proposal's number.
export async function convertProposal(proposal, { status = "lead", start_date = null,
                                                  due_date = null, deliverables = [] } = {}) {
  const project = unwrap(await supabase.from("projects").insert({
    number: proposal.number,               // trigger skips because it's set
    client_id: proposal.client_id,
    title: proposal.title,
    scope: proposal.project_scope,
    status,
    start_date,
    due_date,
    deliverables,
  }).select("*, client:clients(id, name)").single());

  await updateProposal(proposal.id, { converted_project_id: project.id });
  return project;
}

/* ---------------- storage (branding logo) ---------------- */

export async function uploadLogo(file) {
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `logo-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("branding").upload(path, file, { upsert: true, cacheControl: "3600" });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("branding").getPublicUrl(path);
  return data.publicUrl;
}
