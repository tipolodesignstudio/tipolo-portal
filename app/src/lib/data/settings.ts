// Studio settings, with the default rate worked out from the staff tiers the same way
// the previous portal does (js/core/api.js → withRates), since the printed documents
// read `default_hourly_rate` and `default_day_rate`.
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables, TablesUpdate } from "@/lib/database.types";

export type StaffTier = Tables<"staff_tiers">;
export type Settings = Tables<"app_settings"> & {
  staff_tiers: StaffTier[];
  default_hourly_rate: number | null;
  default_day_rate: number | null;
};

export const settingsQuery = queryOptions({
  queryKey: ["settings"],
  staleTime: 5 * 60_000,
  queryFn: async (): Promise<Settings> => {
    const [row, tiers] = await Promise.all([
      supabase.from("app_settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("staff_tiers").select("*").order("sort_order").order("name"),
    ]);
    if (row.error) throw new Error(row.error.message);
    const t = tiers.data ?? [];
    const def = t.find((x) => x.is_default) ?? t[0] ?? null;
    const hourly = def?.hourly_rate != null ? Number(def.hourly_rate) : null;
    const hours = Number(row.data?.hours_per_day) || 8;
    return {
      ...(row.data as Tables<"app_settings">),
      staff_tiers: t,
      hours_per_day: hours,
      default_hourly_rate: hourly,
      default_day_rate: hourly == null ? null : Math.round(hourly * hours * 100) / 100,
    };
  },
});

/* ---------------- changes ---------------- */

function unwrap<T>({ data, error }: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}

export async function saveSettings(patch: TablesUpdate<"app_settings">) {
  return unwrap(await supabase.from("app_settings").update(patch).eq("id", 1).select("id").single());
}

/* Staff rate tiers. One is the default: the rate a proposal quotes and a project falls
   back to. A partial unique index allows only one, so the old default is cleared first. */
export async function createTier(name: string) {
  const { data: rows } = await supabase.from("staff_tiers").select("id");
  return unwrap(await supabase.from("staff_tiers").insert({ name: name.trim(), sort_order: rows?.length ?? 0, is_default: !rows?.length }).select().single());
}
export const updateTier = async (id: string, patch: TablesUpdate<"staff_tiers">) =>
  unwrap(await supabase.from("staff_tiers").update(patch).eq("id", id).select().single());
export async function setDefaultTier(id: string) {
  unwrap(await supabase.from("staff_tiers").update({ is_default: false }).eq("is_default", true).neq("id", id).select("id"));
  return updateTier(id, { is_default: true });
}
export async function deleteTier(id: string) {
  unwrap(await supabase.from("staff_tiers").delete().eq("id", id).select("id"));
  const { data: rows } = await supabase.from("staff_tiers").select("id, is_default").order("sort_order");
  if (rows?.length && !rows.some((t) => t.is_default)) await setDefaultTier(rows[0].id);   // never leave it without a default
}

/* Client and expense categories. Deleting one clears it from whatever used it first. */
type CatTable = "client_categories" | "expense_categories";
export const categoryList = async (t: CatTable) => unwrap(await supabase.from(t).select("*").order("sort_order").order("name"));
export async function categoryCreate(t: CatTable, name: string) {
  const { data: max } = await supabase.from(t).select("sort_order").order("sort_order", { ascending: false }).limit(1);
  return unwrap(await supabase.from(t).insert({ name: name.trim(), sort_order: (max?.[0]?.sort_order ?? 0) + 1 }).select().single());
}
export const categoryRename = async (t: CatTable, id: string, name: string) =>
  unwrap(await supabase.from(t).update({ name: name.trim() }).eq("id", id).select().single());
export async function categoryDelete(t: CatTable, id: string) {
  if (t === "client_categories") await supabase.from("clients").update({ category_id: null }).eq("category_id", id);
  else await supabase.from("expenses").update({ category_id: null }).eq("category_id", id);
  unwrap(await supabase.from(t).delete().eq("id", id).select("id"));
}

/* Logo and signature: the public branding bucket. Returns the public URL. */
export async function uploadBranding(file: File, prefix: "logo" | "signature") {
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
  const { error } = await supabase.storage.from("branding").upload(path, file, { cacheControl: "3600" });
  if (error) throw new Error(/row-level security|Unauthorized|AccessDenied/i.test(error.message)
    ? "Storage refused the upload — sign out and back in, then try again." : error.message);
  return supabase.storage.from("branding").getPublicUrl(path).data.publicUrl;
}
