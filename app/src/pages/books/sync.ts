// Keeping the Excel tracker in step. After any change to the books, the "changed" stamp
// moves (a database trigger does it); if Google Drive is connected, the workbook is
// rewritten a moment later, so several quick edits make one write.
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { booksKeys, booksStateQuery } from "@/lib/data/books";
import { drive, isBehind, syncTracker } from "@/lib/books";

let timer: ReturnType<typeof setTimeout> | null = null;
let running: Promise<unknown> | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

export function useBooksSync() {
  const qc = useQueryClient();
  const { data: state } = useQuery(booksStateQuery);
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => { listeners.add(force); const off = drive.onConnectionChange(force); return () => { listeners.delete(force); off(); }; }, []);

  const linked = drive.configured() && !!state?.drive_tracker_file_id;

  const syncNow = React.useCallback(async () => {
    if (running) return running;
    running = syncTracker().finally(() => { running = null; qc.invalidateQueries({ queryKey: booksKeys.state }); notify(); });
    notify();
    return running;
  }, [qc]);

  // after a change: refresh what the books say, and write the workbook shortly after
  const changed = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: booksKeys.all });
    qc.invalidateQueries({ queryKey: ["projects"] });
    if (!linked || !drive.connected()) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { syncNow().catch(() => { /* the chip shows Excel is behind */ }); }, 1200);
  }, [qc, linked, syncNow]);

  return {
    state, linked, changed, syncNow,
    syncing: !!running,
    behind: state ? isBehind(state) : false,
    configured: drive.configured(),
    connected: drive.connected(),
  };
}
