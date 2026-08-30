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
