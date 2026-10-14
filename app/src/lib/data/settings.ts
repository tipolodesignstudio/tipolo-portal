// Studio settings, with the default rate worked out from the staff tiers the same way
// the previous portal does (js/core/api.js → withRates), since the printed documents
// read `default_hourly_rate` and `default_day_rate`.
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";

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
