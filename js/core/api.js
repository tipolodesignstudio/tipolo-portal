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
    q = q.or(`name.ilike.${s},company.ilike.${s},email.ilike.${s}`);
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

const PROJECT_SELECT = "*, client:clients(id, name, company, default_rate)";

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

  return {
    activeClients: clientsActive.count ?? 0,
    activeProjects: byStatus.active || 0,
    totalProjects: rows.length,
    byStatus,
    recent: rows.slice(0, 6),
  };
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
