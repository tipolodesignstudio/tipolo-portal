import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox, Field, Select, Textarea } from "@/components/ui/fields";
import { localISO, minutesToHM, parseDuration } from "@/lib/format";
import { settingsQuery } from "@/lib/data/settings";
import { activeProjectsQuery, useTimeEntryMutations, type TimeEntry } from "@/lib/data/projects";

export type TimePrefill = { project_id?: string; entry_date?: string; minutes?: number; description?: string };

/* Log or edit a time entry. The rate is snapshotted when the time is logged:
   the project's own rate, else the client's, else the studio default. */
export function TimeEntryDialog(props: { entry?: TimeEntry; prefill?: TimePrefill; onClose: () => void; onSaved?: () => void }) {
  return <Form {...props} />;
}

function Form({ entry, prefill = {}, onClose, onSaved }: { entry?: TimeEntry; prefill?: TimePrefill; onClose: () => void; onSaved?: () => void }) {
  const { data: projects = [], isLoading } = useQuery(activeProjectsQuery);
  const { data: settings } = useQuery(settingsQuery);
  const m = useTimeEntryMutations();
  const isNew = !entry;

  const [projectId, setProjectId] = React.useState(entry?.project_id ?? prefill.project_id ?? "");
  const [day, setDay] = React.useState(entry?.entry_date ?? prefill.entry_date ?? localISO());
  const [duration, setDuration] = React.useState(entry ? minutesToHM(entry.minutes) : prefill.minutes != null ? minutesToHM(prefill.minutes) : "");
  const [description, setDescription] = React.useState(entry?.description ?? prefill.description ?? "");
  const [rate, setRate] = React.useState<string>(entry?.rate != null ? String(entry.rate) : "");
  const [rateTouched, setRateTouched] = React.useState(!!entry);
  const [billable, setBillable] = React.useState(entry?.billable ?? true);
  const [error, setError] = React.useState("");

  const chosen = projectId || projects[0]?.id || "";
  const project = projects.find((p) => p.id === chosen);
  const client = Array.isArray(project?.client) ? project.client[0] : project?.client;
  const inherited = project?.hourly_rate ?? client?.default_rate ?? settings?.default_hourly_rate ?? null;
  const shownRate = rateTouched ? rate : inherited != null ? String(inherited) : "";
  const parsed = parseDuration(duration);

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!chosen) return setError("Pick a project.");
    if (parsed == null || parsed <= 0) return setError("Enter a duration like 1:30, 1.5h or 90m.");
    try {
      await m.save.mutateAsync({ id: entry?.id, patch: {
        project_id: chosen, entry_date: day, minutes: parsed, billable,
        description: description.trim() || null, rate: shownRate === "" ? null : Number(shownRate),
      } });
      toast.success(isNew ? "Time logged" : "Entry saved");
      onSaved?.();
      onClose();
    } catch (err) { setError((err as Error).message); }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={isNew ? "Log time" : "Edit time entry"}
      footer={<>
        {error && <div className="mr-auto text-sm text-bad">{error}</div>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => save()} disabled={m.save.isPending || isLoading}>{m.save.isPending ? "Saving…" : isNew ? "Add entry" : "Save"}</Button>
      </>}>
      {!isLoading && !projects.length ? (
        <p className="text-sm text-ink-soft">There are no open projects to log time against. A project is created by converting an accepted proposal.</p>
      ) : (
        <form onSubmit={save} className="space-y-4">
          <Field label="Project">
            <Select value={chosen} onChange={(e) => { setProjectId(e.target.value); }}>
              {projects.map((p) => {
                const c = Array.isArray(p.client) ? p.client[0] : p.client;
                return <option key={p.id} value={p.id}>{[p.number, p.title].filter(Boolean).join(" · ")}{c?.name ? ` — ${c.name}` : ""}</option>;
              })}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date"><Input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></Field>
            <Field label="Duration" hint={parsed ? `= ${minutesToHM(parsed)} h` : "1:30, 1.5h or 90m"}>
              <Input autoFocus value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="1:30" />
            </Field>
          </div>
          <Field label="What did you work on?">
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div className="grid items-end gap-4 sm:grid-cols-2">
            <Field label="Rate ($/hr)" hint={rateTouched ? undefined : "From the project, client or studio default"}>
              <Input type="number" step="0.01" min="0" value={shownRate} onChange={(e) => { setRateTouched(true); setRate(e.target.value); }} />
            </Field>
            <Checkbox className="pb-2" label="Billable" checked={billable} onChange={(e) => setBillable(e.target.checked)} />
          </div>
          {entry?.invoice_id && <p className="rounded-md bg-bg-alt px-3 py-2 text-[13px] text-ink-soft">This entry is on an invoice — editing it won't change the invoice.</p>}
          <button type="submit" hidden />
        </form>
      )}
    </Dialog>
  );
}
