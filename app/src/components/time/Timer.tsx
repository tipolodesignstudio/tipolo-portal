import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Play, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Select } from "@/components/ui/fields";
import { useConfirm } from "@/components/ui/confirm";
import { activeProjectsQuery } from "@/lib/data/projects";
import { clock, readTimer, TIMER_KEY, writeTimer, type TimerState } from "@/lib/data/time";
import { TimeEntryDialog, type TimePrefill } from "./TimeEntryDialog";

/* The running timer, in the sidebar. Stopping it opens the time-entry dialog with the
   elapsed time filled in. */
export function Timer() {
  const [state, setState] = React.useState<TimerState | null>(readTimer);
  const [now, setNow] = React.useState(() => Date.now());
  const [starting, setStarting] = React.useState(false);
  const [logging, setLogging] = React.useState<TimePrefill | null>(null);
  const confirm = useConfirm();

  React.useEffect(() => {
    const sync = (e: StorageEvent) => { if (!e.key || e.key === TIMER_KEY) setState(readTimer()); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  React.useEffect(() => {
    if (!state) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [state]);

  const stop = () => {
    if (!state) return;
    const minutes = Math.max(1, Math.round((Date.now() - new Date(state.startedAt).getTime()) / 60000));
    writeTimer(null);                // the clock stops even if the dialog is dismissed
    setState(null);
    setLogging({ project_id: state.projectId, minutes });
  };
  const discard = async () => {
    if (await confirm({ title: "Discard timer", message: "Discard the running timer without logging any time?", confirm: "Discard", danger: true })) {
      writeTimer(null); setState(null);
    }
  };

  return (
    <>
      {state ? (
        <div className="mb-3 rounded-md border border-accent/30 bg-accent/5 px-2.5 py-2">
          <div className="flex items-center gap-2">
            <span className="size-2 animate-pulse rounded-full bg-accent" />
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-soft" title={state.projectTitle}>{state.projectTitle}</span>
            <button title="Discard" onClick={discard} className="text-ink-faint hover:text-bad"><X className="size-3.5" /></button>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="font-heading text-lg tabular-nums">{clock(now - new Date(state.startedAt).getTime())}</span>
            <Button size="sm" onClick={stop}><Square className="fill-current" />Stop</Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="mb-3 w-full justify-start" onClick={() => setStarting(true)}>
          <Play />Start timer
        </Button>
      )}
      {starting && <StartDialog onClose={() => setStarting(false)} onStart={(s) => { writeTimer(s); setState(s); setNow(Date.now()); setStarting(false); }} />}
      {logging && <TimeEntryDialog prefill={logging} onClose={() => setLogging(null)} />}
    </>
  );
}

function StartDialog({ onClose, onStart }: { onClose: () => void; onStart: (s: TimerState) => void }) {
  const { data: projects = [], isLoading } = useQuery(activeProjectsQuery);
  const [id, setId] = React.useState("");
  const chosen = id || projects[0]?.id || "";
  const start = () => {
    const p = projects.find((x) => x.id === chosen);
    if (!p) return;
    onStart({ projectId: p.id, projectTitle: [p.number, p.title].filter(Boolean).join(" · "), startedAt: new Date().toISOString() });
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title="Start timer"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={start} disabled={!chosen}><Play />Start</Button></>}>
      {!isLoading && !projects.length ? <p className="text-sm text-ink-soft">There are no open projects to time.</p> : (
        <Field label="Project">
          <Select value={chosen} onChange={(e) => setId(e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.id}>{[p.number, p.title].filter(Boolean).join(" · ")}</option>)}
          </Select>
        </Field>
      )}
    </Dialog>
  );
}
