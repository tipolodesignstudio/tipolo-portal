// Time entries for the timesheet week, and the running timer.
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";
import { localISO } from "@/lib/format";

export type WeekEntry = Tables<"time_entries"> & {
  project: { id: string; number: string | null; title: string; client: { id: string; name: string } | null } | null;
};
export type TimeFilters = { projectId: string; billable: "" | "yes" | "no"; billed: "" | "unbilled" | "billed"; mine: boolean };

/* Weeks run Sunday to Saturday, in local time. */
export function weekStartOf(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  return x;
}
export function weekDays(startISO: string) {
  const start = new Date(startISO + "T00:00:00");
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return localISO(d); });
}
export function shiftWeek(startISO: string, weeks: number) {
  const d = new Date(startISO + "T00:00:00");
  d.setDate(d.getDate() + weeks * 7);
  return localISO(d);
}

export const weekQuery = (weekStart: string, f: TimeFilters, userId: string | undefined) => queryOptions({
  queryKey: ["time", "week", weekStart, f, f.mine ? userId : null],
  queryFn: async (): Promise<WeekEntry[]> => {
    const days = weekDays(weekStart);
    let q = supabase.from("time_entries")
      .select("*, project:projects(id, number, title, client:clients(id, name))")
      .gte("entry_date", days[0]).lte("entry_date", days[6])
      .order("entry_date").order("created_at");
    if (f.projectId) q = q.eq("project_id", f.projectId);
    if (f.billable === "yes") q = q.eq("billable", true);
    if (f.billable === "no") q = q.eq("billable", false);
    if (f.billed === "unbilled") q = q.is("invoice_id", null);
    if (f.billed === "billed") q = q.not("invoice_id", "is", null);
    if (f.mine && userId) q = q.eq("created_by", userId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data as unknown as WeekEntry[];
  },
});

/* ---- the running timer ----
   Kept in localStorage under the same key the previous portal used, so a timer started
   in either version shows in both, and it survives reloads. */
export const TIMER_KEY = "tipolo-timer";
export type TimerState = { projectId: string; projectTitle: string; startedAt: string };
export const readTimer = (): TimerState | null => {
  try { return JSON.parse(localStorage.getItem(TIMER_KEY) || "null"); } catch { return null; }
};
export const writeTimer = (s: TimerState | null) => {
  try {
    if (s) localStorage.setItem(TIMER_KEY, JSON.stringify(s));
    else localStorage.removeItem(TIMER_KEY);
    window.dispatchEvent(new StorageEvent("storage", { key: TIMER_KEY }));   // same-tab listeners too
  } catch { /* storage blocked */ }
};
export function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
