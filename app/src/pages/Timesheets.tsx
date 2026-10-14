import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Segmented, Select } from "@/components/ui/fields";
import { useConfirm } from "@/components/ui/confirm";
import { TimeEntryDialog, type TimePrefill } from "@/components/time/TimeEntryDialog";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { hours, localISO, minutesToHM, money } from "@/lib/format";
import { activeProjectsQuery, useTimeEntryMutations, type TimeEntry } from "@/lib/data/projects";
import { mondayOf, shiftWeek, weekDays, weekQuery, type TimeFilters, type WeekEntry } from "@/lib/data/time";

const dayLabel = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-CA", opts);

export function Timesheets() {
  const { session } = useAuth();
  const [monday, setMonday] = React.useState(() => localISO(mondayOf()));
  const [view, setView] = React.useState<"grid" | "list">(() => { try { return (localStorage.getItem("tipolo.time.view") as "grid" | "list") || "grid"; } catch { return "grid"; } });
  const [f, setF] = React.useState<TimeFilters>({ projectId: "", billable: "", billed: "", mine: false });
  const [dialog, setDialog] = React.useState<{ entry?: TimeEntry; prefill?: TimePrefill } | null>(null);
  const [cell, setCell] = React.useState<{ project: WeekEntry["project"]; day: string } | null>(null);
  const { data: projects = [] } = useQuery(activeProjectsQuery);
  const { data: entries = [], isLoading, error } = useQuery({ ...weekQuery(monday, f, session?.user.id), placeholderData: (p) => p });

  const days = weekDays(monday);
  const today = localISO();
  const thisWeek = monday === localISO(mondayOf());
  const total = entries.reduce((s, e) => s + e.minutes, 0);
  const billable = entries.filter((e) => e.billable).reduce((s, e) => s + e.minutes, 0);
  const value = entries.filter((e) => e.billable).reduce((s, e) => s + (e.minutes / 60) * (Number(e.rate) || 0), 0);
  const setViewSaved = (v: "grid" | "list") => { setView(v); try { localStorage.setItem("tipolo.time.view", v); } catch { /* */ } };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Timesheets</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {dayLabel(days[0], { month: "short", day: "numeric" })} – {dayLabel(days[6], { month: "short", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <Button onClick={() => setDialog({ prefill: { entry_date: days.includes(today) ? today : days[0], project_id: f.projectId || undefined } })}><Plus />Log time</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-border bg-card">
          <button className="px-2 py-1.5 text-ink-soft hover:text-ink" title="Previous week" onClick={() => setMonday(shiftWeek(monday, -1))}><ChevronLeft className="size-4" /></button>
          <button className={cn("border-x border-border px-3 text-[13px]", thisWeek ? "text-ink-faint" : "text-ink hover:bg-bg-alt")} disabled={thisWeek} onClick={() => setMonday(localISO(mondayOf()))}>This week</button>
          <button className="px-2 py-1.5 text-ink-soft hover:text-ink" title="Next week" onClick={() => setMonday(shiftWeek(monday, 1))}><ChevronRight className="size-4" /></button>
        </div>
        <Segmented value={f.mine ? "mine" : "all"} onChange={(v) => setF((x) => ({ ...x, mine: v === "mine" }))}
          options={[{ value: "all", label: "Everyone" }, { value: "mine", label: "Mine" }]} />
        <Select className="w-52" value={f.projectId} onChange={(e) => setF((x) => ({ ...x, projectId: e.target.value }))}>
          <option value="">All projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{[p.number, p.title].filter(Boolean).join(" · ")}</option>)}
        </Select>
        <Select className="w-40" value={f.billable} onChange={(e) => setF((x) => ({ ...x, billable: e.target.value as TimeFilters["billable"] }))}>
          <option value="">Billable + not</option><option value="yes">Billable</option><option value="no">Non-billable</option>
        </Select>
        <Select className="w-36" value={f.billed} onChange={(e) => setF((x) => ({ ...x, billed: e.target.value as TimeFilters["billed"] }))}>
          <option value="">Billed or not</option><option value="unbilled">Unbilled</option><option value="billed">Billed</option>
        </Select>
        <div className="ml-auto"><Segmented value={view} onChange={setViewSaved} options={[{ value: "grid", label: "Grid" }, { value: "list", label: "By day" }]} /></div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Week total", `${hours(total, 2)} h`, minutesToHM(total)],
          ["Billable", `${hours(billable, 2)} h`, total ? `${Math.round((billable / total) * 100)}% of the week` : "—"],
          ["Billable value", money(value), "at the rates logged"],
        ].map(([k, v, d]) => (
          <div key={k} className="rounded-lg border border-border bg-card px-5 py-4">
            <div className="text-[12px] uppercase tracking-wide text-ink-faint">{k}</div>
            <div className="mt-1 font-heading text-2xl tabular-nums">{v}</div>
            <div className="text-[12.5px] text-ink-soft">{d}</div>
          </div>
        ))}
      </div>

      {error ? <div className="rounded-md bg-bad-bg px-4 py-3 text-sm text-bad">{(error as Error).message}</div>
        : isLoading ? <div className="h-64 animate-pulse rounded-lg border border-border bg-card" />
        : view === "grid"
          ? <Grid days={days} today={today} entries={entries}
              onCell={(project, day, list) => list.length ? setCell({ project, day }) : setDialog({ prefill: { project_id: project?.id, entry_date: day } })} />
          : <ByDay days={days} today={today} entries={entries} onEdit={(e) => setDialog({ entry: e })} onAdd={(day) => setDialog({ prefill: { entry_date: day } })} />}

      {cell && <CellDialog project={cell.project} day={cell.day}
        entries={entries.filter((e) => e.project_id === cell.project?.id && e.entry_date === cell.day)}
        onEdit={(e) => { setCell(null); setDialog({ entry: e }); }}
        onAdd={() => { setCell(null); setDialog({ prefill: { project_id: cell.project?.id, entry_date: cell.day } }); }}
        onClose={() => setCell(null)} />}
      {dialog && <TimeEntryDialog entry={dialog.entry} prefill={dialog.prefill} onClose={() => setDialog(null)} />}
    </div>
  );
}

/* Projects down the side, days across: the week at a glance. A cell is that project's
   hours that day; click it to see or add the entries behind it. */
function Grid({ days, today, entries, onCell }: {
  days: string[]; today: string; entries: WeekEntry[];
  onCell: (project: WeekEntry["project"], day: string, list: WeekEntry[]) => void;
}) {
  const rows = new Map<string, { project: WeekEntry["project"]; byDay: Record<string, WeekEntry[]> }>();
  for (const e of entries) {
    const key = e.project_id;
    if (!rows.has(key)) rows.set(key, { project: e.project, byDay: {} });
    (rows.get(key)!.byDay[e.entry_date] ||= []).push(e);
  }
  const sum = (l: WeekEntry[] = []) => l.reduce((s, e) => s + e.minutes, 0);
  const dayTotal = (d: string) => sum(entries.filter((e) => e.entry_date === d));
  const weekend = (i: number) => i >= 5;

  if (!rows.size) {
    return <div className="rounded-lg border border-dashed border-border bg-card/50 px-6 py-14 text-center text-sm text-ink-soft">No time logged this week. Use <strong>Log time</strong>, or start the timer in the sidebar.</div>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-bg/60">
            <th className="px-4 py-2.5 text-left text-[11.5px] font-medium uppercase tracking-wide text-ink-faint">Project</th>
            {days.map((d, i) => (
              <th key={d} className={cn("w-20 px-2 py-2.5 text-center text-[11.5px] font-medium uppercase tracking-wide",
                d === today ? "text-accent" : "text-ink-faint", weekend(i) && "bg-bg-alt/40")}>
                {dayLabel(d, { weekday: "short" })}<div className="text-[11px] normal-case tracking-normal">{dayLabel(d, { day: "numeric" })}</div>
              </th>
            ))}
            <th className="w-20 px-3 py-2.5 text-right text-[11.5px] font-medium uppercase tracking-wide text-ink-faint">Total</th>
          </tr>
        </thead>
        <tbody>
          {[...rows.values()].map(({ project, byDay }) => {
            const rowTotal = Object.values(byDay).reduce((s, l) => s + sum(l), 0);
            return (
              <tr key={project?.id} className="border-b border-border/70 last:border-0">
                <td className="px-4 py-2.5">
                  {project ? <Link to="/projects/$id" params={{ id: project.id }} className="hover:text-accent">
                    <span className="tabular-nums text-ink-faint">{project.number}</span> {project.title}
                  </Link> : "—"}
                  {project?.client && <div className="text-[12px] text-ink-faint">{project.client.name}</div>}
                </td>
                {days.map((d, i) => {
                  const list = byDay[d] ?? [];
                  const m = sum(list);
                  const unbillable = list.length > 0 && list.every((e) => !e.billable);
                  return (
                    <td key={d} className={cn("p-1 text-center", weekend(i) && "bg-bg-alt/40")}>
                      <button onClick={() => onCell(project, d, list)}
                        className={cn("h-9 w-full rounded-md text-[13px] tabular-nums transition-colors",
                          m ? (unbillable ? "bg-bg-alt text-ink-soft hover:bg-border/60" : "bg-accent/10 text-ink hover:bg-accent/20")
                            : "text-transparent hover:bg-bg-alt hover:text-ink-faint")}>
                        {m ? minutesToHM(m) : "+"}
                      </button>
                    </td>
                  );
                })}
                <td className="px-3 text-right font-medium tabular-nums">{minutesToHM(rowTotal)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-border bg-bg/60">
            <td className="px-4 py-2.5 text-[12px] uppercase tracking-wide text-ink-faint">Day total</td>
            {days.map((d, i) => <td key={d} className={cn("px-2 text-center text-[13px] tabular-nums text-ink-soft", weekend(i) && "bg-bg-alt/40")}>{dayTotal(d) ? minutesToHM(dayTotal(d)) : "—"}</td>)}
            <td className="px-3 text-right font-medium tabular-nums">{minutesToHM(sum(entries))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function EntryRow({ e, onEdit }: { e: WeekEntry; onEdit: (e: WeekEntry) => void }) {
  const m = useTimeEntryMutations();
  const confirm = useConfirm();
  return (
    <li className="group flex items-center gap-3 px-4 py-2.5 text-sm">
      <button className="min-w-0 flex-1 text-left" onClick={() => onEdit(e)}>
        <div className="truncate">{e.description || <span className="text-ink-faint">(no description)</span>}</div>
        <div className="truncate text-[12px] text-ink-faint">{[e.project?.number, e.project?.title].filter(Boolean).join(" · ")}{e.project?.client ? ` · ${e.project.client.name}` : ""}</div>
      </button>
      {!e.billable && <Badge>non-billable</Badge>}
      {e.invoice_id && <Badge tone="green">billed</Badge>}
      <span className="w-12 text-right tabular-nums">{minutesToHM(e.minutes)}</span>
      <div className="flex opacity-0 group-hover:opacity-100">
        <button title="Edit" className="grid size-7 place-items-center rounded text-ink-faint hover:text-ink" onClick={() => onEdit(e)}><Pencil className="size-3.5" /></button>
        <button title="Delete" className="grid size-7 place-items-center rounded text-ink-faint hover:text-bad"
          onClick={async () => {
            if (await confirm({ title: "Delete time entry", message: "Delete this time entry? This can't be undone.", confirm: "Delete", danger: true }))
              m.remove.mutate(e.id, { onSuccess: () => toast.success("Entry deleted"), onError: (er) => toast.error(er.message) });
          }}><Trash2 className="size-3.5" /></button>
      </div>
    </li>
  );
}

function ByDay({ days, today, entries, onEdit, onAdd }: {
  days: string[]; today: string; entries: WeekEntry[]; onEdit: (e: WeekEntry) => void; onAdd: (day: string) => void;
}) {
  return (
    <div className="space-y-3">
      {days.map((d) => {
        const list = entries.filter((e) => e.entry_date === d);
        const m = list.reduce((s, e) => s + e.minutes, 0);
        return (
          <div key={d} className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border/70 px-4 py-2">
              <span className={cn("text-[13px] font-medium", d === today && "text-accent")}>{dayLabel(d, { weekday: "long", month: "short", day: "numeric" })}</span>
              <span className="flex items-center gap-2 text-[13px] tabular-nums text-ink-soft">
                {m ? minutesToHM(m) : "—"}
                <button title="Log time on this day" onClick={() => onAdd(d)} className="grid size-6 place-items-center rounded text-ink-faint hover:bg-bg-alt hover:text-ink"><Plus className="size-3.5" /></button>
              </span>
            </div>
            {list.length ? <ul className="divide-y divide-border/60">{list.map((e) => <EntryRow key={e.id} e={e} onEdit={onEdit} />)}</ul>
              : <p className="px-4 py-2.5 text-[13px] text-ink-faint">No entries</p>}
          </div>
        );
      })}
    </div>
  );
}

function CellDialog({ project, day, entries, onEdit, onAdd, onClose }: {
  project: WeekEntry["project"]; day: string; entries: WeekEntry[];
  onEdit: (e: WeekEntry) => void; onAdd: () => void; onClose: () => void;
}) {
  React.useEffect(() => { if (!entries.length) onClose(); }, [entries.length, onClose]);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}
      title={`${project?.title ?? "Project"} · ${dayLabel(day, { weekday: "short", month: "short", day: "numeric" })}`}
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button><Button onClick={onAdd}><Plus />Add entry</Button></>}>
      <ul className="-mx-4 divide-y divide-border/60">{entries.map((e) => <EntryRow key={e.id} e={e} onEdit={onEdit} />)}</ul>
    </Dialog>
  );
}
