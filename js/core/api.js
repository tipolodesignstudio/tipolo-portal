// Data-access layer. Views call these helpers; they never touch `supabase` directly.
import { supabase } from "./supabase.js";

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
    id: 1, currency: "CAD", invoice_prefix: "TIP", invoice_year_reset: true,
    invoice_next_seq: 1, tax_lines: [
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

/* ---------------- clients ---------------- */

export async function listClients({ search = "", status = "active" } = {}) {
  let q = supabase
    .from("clients")
    .select("*, projects(count)")
    .order("name", { ascending: true });
  if (status && status !== "all") q = q.eq("status", status);
  if (search.trim()) {
    const s = `%${search.trim()}%`;
    q = q.or(`name.ilike.${s},contact_name.ilike.${s},email.ilike.${s}`);
  }
  const rows = unwrap(await q);
  return rows.map((r) => ({ ...r, project_count: r.projects?.[0]?.count ?? 0 }));
}

export async function getClient(id) {
  return unwrap(await supabase.from("clients").select("*").eq("id", id).single());
}

export async function createClient(patch) {
  return unwrap(await supabase.from("clients").insert(patch).select().single());
}

export async function updateClient(id, patch) {
  return unwrap(await supabase.from("clients").update(patch).eq("id", id).select().single());
}

/* ---------------- projects ---------------- */

const PROJECT_SELECT = "*, client:clients(id, name, contact_name, is_individual, default_rate)";

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

  return {
    activeClients: clientsActive.count ?? 0,
    activeProjects: byStatus.active || 0,
    totalProjects: rows.length,
    byStatus,
    recent: rows.slice(0, 6),
    unbilled,
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
