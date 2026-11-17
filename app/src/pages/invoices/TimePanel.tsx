/* The project's unbilled time, beside the invoice. When the invoice goes out, the database
   posts every billable hour logged on or before its date to it (0028), so nothing here is
   required. A draft can bill some of the hours as an hourly line first; the rest are
   settled by the fee it bills. */

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { date, minutesToHM, money } from "@/lib/format";
import { coverTime, invoiceTimeQuery, releaseTime, timeLines, type Invoice, type InvoiceTimeEntry } from "@/lib/data/invoices";

const value = (l: InvoiceTimeEntry[]) => l.reduce((s, e) => s + (e.minutes / 60) * (Number(e.rate) || 0), 0);
const mins = (l: InvoiceTimeEntry[]) => l.reduce((s, e) => s + e.minutes, 0);

export function TimePanel({ inv, issueDate, onLines, inLines = [] }: {
  inv: Invoice;
  issueDate: string;
  // a draft built here can take the time as hourly lines; a PDF or finalized invoice can't
  onLines?: (lines: ReturnType<typeof timeLines>) => void;
  inLines?: string[];
}) {
  const qc = useQueryClient();
  const { data } = useQuery(invoiceTimeQuery({ id: inv.id, project_id: inv.project_id, issue_date: issueDate }));
  const [open, setOpen] = React.useState(false);
  const [picked, setPicked] = React.useState<Set<string> | null>(null);
  const [busy, setBusy] = React.useState(false);

  const taken = new Set(inLines);
  const waiting = (data?.open ?? []).filter((e) => !taken.has(e.id));
  const covered = data?.covered ?? [];
  const later = data?.later ?? [];
  const sel = picked ?? new Set(waiting.map((e) => e.id));
  const chosen = waiting.filter((e) => sel.has(e.id));
  if (!data || (!waiting.length && !covered.length && !taken.size && !later.length)) return null;

  const refresh = () => {
    setPicked(null);
    qc.invalidateQueries({ queryKey: ["time"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
  };
  const run = async (fn: () => Promise<void>, done: string) => {
    setBusy(true);
    try { await fn(); toast.success(done); refresh(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const toggle = (id: string) => { const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); setPicked(n); };

  return (
    <div className={cn("rounded-md border bg-card", waiting.length ? "border-warn/40" : "border-border")}>
      <button className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px]" onClick={() => setOpen(!open)}>
        <Clock className="size-4 text-ink-faint" />
        <span className="flex-1">
          {waiting.length
            ? <><strong className="text-warn">{minutesToHM(mins(waiting))} unbilled</strong> <span className="text-ink-soft">({money(value(waiting))}) logged up to {date(issueDate)}{inv.status === "draft" ? " — posted to this invoice when it's finalized" : ""}</span></>
            : <span className="text-ink-soft">No unbilled time up to {date(issueDate)}</span>}
          {covered.length > 0 && <span className="text-ink-faint"> · {minutesToHM(mins(covered))} posted to this invoice</span>}
          {taken.size > 0 && <span className="text-ink-faint"> · {taken.size} entr{taken.size === 1 ? "y" : "ies"} on hourly lines</span>}
        </span>
        {open ? <ChevronDown className="size-4 text-ink-faint" /> : <ChevronRight className="size-4 text-ink-faint" />}
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-4 py-3">
          {waiting.length > 0 && (
            <>
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {waiting.map((e) => (
                  <li key={e.id}>
                    <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                      <input type="checkbox" className="accent-accent" checked={sel.has(e.id)} onChange={() => toggle(e.id)} />
                      <span className="w-20 shrink-0 tabular-nums text-ink-faint">{date(e.entry_date)}</span>
                      <span className="min-w-0 flex-1 truncate">{e.description || "—"}</span>
                      <span className="tabular-nums">{minutesToHM(e.minutes)}</span>
                      <span className="w-16 text-right tabular-nums text-ink-faint">{e.rate ? `$${Number(e.rate)}/h` : "no rate"}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-auto text-[12.5px] text-ink-soft">{chosen.length} selected · {minutesToHM(mins(chosen))} · {money(value(chosen))}</span>
                {onLines && <Button size="sm" variant="outline" disabled={!chosen.length || busy}
                  onClick={() => { onLines(timeLines(chosen, inv.project?.title ?? "Project")); setPicked(null); toast.success("Added as hourly lines — save to keep them"); }}>Bill as hourly line</Button>}
                <Button size="sm" disabled={!chosen.length || busy}
                  onClick={() => run(() => coverTime(inv.id, chosen.map((e) => e.id)), `${minutesToHM(mins(chosen))} posted to this invoice`)}>Post to this invoice</Button>
              </div>
              <p className="text-[12px] text-ink-faint">
                {onLines ? <><strong>Bill as hourly line</strong> charges the hours at their rates. Whatever isn't billed as a line is settled by this invoice's fee when it's finalized — no extra charge.</>
                  : <><strong>Post to this invoice</strong> marks the hours as billed by it, at no extra charge.</>}
              </p>
            </>
          )}
          {later.length > 0 && <p className="text-[12px] text-ink-faint">{minutesToHM(mins(later))} more is logged after this invoice's date, so it's left for the next one.</p>}
          {covered.length > 0 && (
            <div className="flex items-center gap-2 border-t border-border/70 pt-3 text-[13px]">
              <span className="flex-1 text-ink-soft">{covered.length} entr{covered.length === 1 ? "y" : "ies"} ({minutesToHM(mins(covered))}) posted to this invoice.</span>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => releaseTime(covered.map((e) => e.id)), "Released back to unbilled")}>Release</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
