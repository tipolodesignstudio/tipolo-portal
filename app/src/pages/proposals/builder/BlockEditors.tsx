import * as React from "react";
import { ArrowDown, ArrowUp, Bold, Italic, List, ListOrdered, IndentDecrease, IndentIncrease, Plus, Trash2, Underline, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { money } from "@/lib/format";
import {
  KIND_LABEL, LEVELS, lineAmount,
  type Block, type LineItem, type OptionalRow, type PaymentRow, type ScheduleRow,
} from "@/lib/doc";
import { formatLines, handleKey, wrapSelection, type LineAction } from "./text-format";

const cell = "h-8 w-full rounded border border-transparent bg-transparent px-2 text-[13px] hover:border-border focus:border-accent/50 focus:bg-card focus:outline-none read-only:hover:border-transparent";
const th = "px-1 pb-1 text-left text-[11px] font-medium uppercase tracking-wide text-ink-faint";

/* ---------------- the frame every block sits in ---------------- */

export function BlockFrame({ block, editable, active, onFocus, onChange, onMove, onDelete, children }: {
  block: Block; editable: boolean; active: boolean;
  onFocus: () => void; onChange: (patch: Partial<Block>) => void;
  onMove: (dir: -1 | 1) => void; onDelete: () => void; children: React.ReactNode;
}) {
  const level = block.level ?? (block.heading ? 2 : 0);
  return (
    <div onFocusCapture={onFocus}
      className={cn("group relative rounded-md border px-4 py-3 transition-colors",
        active ? "border-border bg-card shadow-sm" : "border-transparent hover:bg-card/60",
        block.kind && "border-border/70 bg-card/40")}>
      {editable && (
        <div className={cn("absolute -top-3 right-3 flex items-center gap-1 rounded-md border border-border bg-card px-1 py-0.5 shadow-sm transition-opacity",
          active ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
          {!block.kind && (
            <select value={level} title="Level"
              onChange={(e) => { const l = Number(e.target.value); onChange(l === 0 ? { level: 0, heading: "" } : { level: l }); }}
              className="h-6 rounded bg-transparent px-1 text-[12px] text-ink-soft focus:outline-none">
              {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          )}
          <label className="flex items-center gap-1 px-1 text-[12px] text-ink-soft" title="Start this block on a new page">
            <input type="checkbox" className="size-3 accent-accent" checked={!!block.breakBefore}
                   onChange={(e) => onChange({ breakBefore: e.target.checked })} />page
          </label>
          <IconBtn title="Move up" onClick={() => onMove(-1)}><ArrowUp /></IconBtn>
          <IconBtn title="Move down" onClick={() => onMove(1)}><ArrowDown /></IconBtn>
          <IconBtn title="Delete" onClick={onDelete} danger><Trash2 /></IconBtn>
        </div>
      )}
      {block.kind && <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ink-faint">{KIND_LABEL[block.kind]}</div>}
      {children}
    </div>
  );
}

function IconBtn({ children, danger, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return (
    <button type="button" {...props}
      className={cn("grid size-6 place-items-center rounded text-ink-faint hover:bg-bg-alt [&_svg]:size-3.5",
        danger ? "hover:text-bad" : "hover:text-ink")}>
      {children}
    </button>
  );
}

/* ---------------- text ---------------- */

const HEADING = ["", "font-heading text-[19px] font-medium", "font-heading text-[15.5px] font-medium", "text-[13.5px] font-bold"];

export function TextBlock({ block, editable, active, onChange }: {
  block: Block; editable: boolean; active: boolean; onChange: (patch: Partial<Block>) => void;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const level = block.level ?? (block.heading ? 2 : 0);
  const fmt = (fn: (ta: HTMLTextAreaElement) => void) => (e: React.MouseEvent) => {
    e.preventDefault();                       // keep the selection in the textarea
    if (ref.current) fn(ref.current);
  };
  const lines: [LineAction, React.ReactNode, string][] = [
    ["bullet", <List key="b" />, "Bullet list"], ["number", <ListOrdered key="n" />, "Numbered list"],
    ["outdent", <IndentDecrease key="o" />, "Outdent (⇧Tab)"], ["indent", <IndentIncrease key="i" />, "Indent (Tab)"],
  ];
  return (
    <>
      {level > 0 && (
        <input value={block.heading ?? ""} readOnly={!editable} placeholder={`Heading ${level}`}
          onChange={(e) => onChange({ heading: e.target.value })}
          className={cn("mb-1 w-full bg-transparent text-ink outline-none placeholder:text-ink-faint/60", HEADING[level])} />
      )}
      <textarea ref={ref} value={block.body ?? ""} readOnly={!editable} placeholder="Write here…"
        onChange={(e) => onChange({ body: e.target.value })}
        onKeyDown={(e) => { if (editable) handleKey(e); }}
        className="field-sizing-content min-h-6 w-full resize-none bg-transparent text-[13.5px] leading-relaxed text-ink outline-none placeholder:text-ink-faint/60" />
      {editable && active && (
        <div className="mt-2 flex items-center gap-0.5 border-t border-border/60 pt-2">
          <IconBtn title="Bold (⌘B)" onMouseDown={fmt((ta) => wrapSelection(ta, "**"))}><Bold /></IconBtn>
          <IconBtn title="Italic (⌘I)" onMouseDown={fmt((ta) => wrapSelection(ta, "*"))}><Italic /></IconBtn>
          <IconBtn title="Underline (⌘U)" onMouseDown={fmt((ta) => wrapSelection(ta, "__"))}><Underline /></IconBtn>
          <span className="mx-1 h-4 w-px bg-border" />
          {lines.map(([a, icon, title]) => (
            <IconBtn key={a} title={title} onMouseDown={fmt((ta) => formatLines(ta, a))}>{icon}</IconBtn>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------------- tables ---------------- */

function RowButtons({ editable, onAdd, label }: { editable: boolean; onAdd: () => void; label: string }) {
  if (!editable) return null;
  return (
    <button type="button" onClick={onAdd} className="mt-1 inline-flex items-center gap-1 rounded px-2 py-1 text-[12.5px] text-accent hover:bg-bg-alt">
      <Plus className="size-3.5" />{label}
    </button>
  );
}

function DelRow({ editable, onClick }: { editable: boolean; onClick: () => void }) {
  return editable ? <IconBtn title="Remove" onClick={onClick} danger><X /></IconBtn> : null;
}

function useRows<T>(block: Block, onChange: (p: Partial<Block>) => void) {
  const rows = (block.rows ?? []) as T[];
  return {
    rows,
    set: (j: number, patch: Partial<T>) => onChange({ rows: rows.map((r, k) => (k === j ? { ...r, ...patch } : r)) as Block["rows"] }),
    add: (row: T) => onChange({ rows: [...rows, row] as Block["rows"] }),
    del: (j: number) => onChange({ rows: rows.filter((_, k) => k !== j) as Block["rows"] }),
  };
}

// Percentages are typed; the amounts are worked out from the base-scope total, so the
// two can never disagree.
export function PaymentEditor({ block, editable, subtotal, onChange }: {
  block: Block; editable: boolean; subtotal: number; onChange: (p: Partial<Block>) => void;
}) {
  const { rows, set, add, del } = useRows<PaymentRow>(block, onChange);
  const pct = rows.reduce((t, r) => t + (Number(r.pct) || 0), 0);
  return (
    <div>
      <table className="w-full"><thead><tr>
        <th className={cn(th, "w-20")}>%</th><th className={th}>Milestone</th><th className={cn(th, "w-28 text-right")}>Amount</th><th className="w-8" />
      </tr></thead><tbody>
        {rows.map((r, j) => (
          <tr key={j}>
            <td><input className={cn(cell, "text-right tabular-nums")} type="number" step="0.5" min="0" max="100" readOnly={!editable}
                       value={r.pct ?? ""} placeholder="—" onChange={(e) => set(j, { pct: e.target.value === "" ? "" : Number(e.target.value) })} /></td>
            <td><input className={cell} readOnly={!editable} value={r.label ?? ""} onChange={(e) => set(j, { label: e.target.value })} /></td>
            <td className="px-2 text-right text-[13px] tabular-nums text-ink-soft">{r.pct === "" || r.pct == null ? "—" : money(subtotal * Number(r.pct) / 100)}</td>
            <td><DelRow editable={editable} onClick={() => del(j)} /></td>
          </tr>
        ))}
      </tbody></table>
      <RowButtons editable={editable} label="Add milestone" onAdd={() => add({ pct: "", label: "" })} />
      <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-2 text-[13px]">
        <span className={cn("text-ink-soft", Math.abs(pct - 100) > 0.001 && "text-warn")}>
          {pct}% of {money(subtotal)} (A. Base Scope){Math.abs(pct - 100) > 0.001 && " — doesn't add up to 100%"}
        </span>
        <strong className="tabular-nums">{money(subtotal * pct / 100)}</strong>
      </div>
    </div>
  );
}

const isoOnly = (v: string | undefined) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? "") ? v! : "");

export function ScheduleEditor({ block, editable, onChange }: {
  block: Block; editable: boolean; onChange: (p: Partial<Block>) => void;
}) {
  const { rows, set, add, del } = useRows<ScheduleRow>(block, onChange);
  const scale = block.scale ?? "week";
  const dated = rows.some((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.start || r.due || ""));
  return (
    <div>
      <div className="mb-2 flex items-center gap-3 text-[13px] text-ink-soft">
        Chart by
        {(["week", "day"] as const).map((s) => (
          <label key={s} className="flex items-center gap-1">
            <input type="radio" className="accent-accent" disabled={!editable} checked={scale === s} onChange={() => onChange({ scale: s })} />
            {s === "week" ? "Weeks" : "Working days"}
          </label>
        ))}
      </div>
      <table className="w-full"><thead><tr>
        <th className={th}>Task</th><th className={cn(th, "w-36")}>Start</th><th className={cn(th, "w-36")}>Due</th><th className="w-8" />
      </tr></thead><tbody>
        {rows.map((r, j) => (
          <tr key={j}>
            <td><input className={cell} readOnly={!editable} value={r.task ?? ""} onChange={(e) => set(j, { task: e.target.value })} /></td>
            <td><input className={cell} type="date" readOnly={!editable} value={isoOnly(r.start)} onChange={(e) => set(j, { start: e.target.value })} /></td>
            <td><input className={cell} type="date" readOnly={!editable} value={isoOnly(r.due)} onChange={(e) => set(j, { due: e.target.value })} /></td>
            <td><DelRow editable={editable} onClick={() => del(j)} /></td>
          </tr>
        ))}
      </tbody></table>
      <RowButtons editable={editable} label="Add row" onAdd={() => add({ task: "", start: "", due: "" })} />
      <p className="mt-2 text-[12px] text-ink-faint">
        {dated ? "Leave Due empty for a milestone — it plots as a diamond." : "Set dates to draw the chart; until then it prints as a plain table."} Weeks run Monday–Friday.
      </p>
    </div>
  );
}

export function OptionalEditor({ block, editable, onChange }: {
  block: Block; editable: boolean; onChange: (p: Partial<Block>) => void;
}) {
  const { rows, set, add, del } = useRows<OptionalRow>(block, onChange);
  return (
    <div>
      <table className="w-full"><thead><tr>
        <th className={cn(th, "w-14")}>Ref</th><th className={th}>Description</th><th className={cn(th, "w-28")}>Fee</th><th className="w-8" />
      </tr></thead><tbody>
        {rows.map((r, j) => (
          <tr key={j}>
            <td><input className={cell} readOnly={!editable} value={r.code ?? ""} onChange={(e) => set(j, { code: e.target.value })} /></td>
            <td><input className={cell} readOnly={!editable} value={r.description ?? ""} onChange={(e) => set(j, { description: e.target.value })} /></td>
            <td><input className={cell} readOnly={!editable} value={r.fee ?? ""} onChange={(e) => set(j, { fee: e.target.value })} /></td>
            <td><DelRow editable={editable} onClick={() => del(j)} /></td>
          </tr>
        ))}
      </tbody></table>
      <RowButtons editable={editable} label="Add row" onAdd={() => add({ code: "", description: "", fee: "" })} />
    </div>
  );
}

/* The base-scope fee lines. They're the proposal's line_items, not a block's rows: they
   set the subtotal, the payment schedule's amounts, and later the project's budget. */
export function FeeEditor({ items, editable, onChange }: {
  items: LineItem[]; editable: boolean; onChange: (items: LineItem[]) => void;
}) {
  const set = (j: number, patch: Partial<LineItem>) => onChange(items.map((li, k) => (k === j ? { ...li, ...patch } : li)));
  const total = items.reduce((s, li) => s + lineAmount(li), 0);
  return (
    <div>
      <table className="w-full"><thead><tr>
        <th className={th}>Task description and timeline</th><th className={cn(th, "w-20 text-right")}>Hrs</th>
        <th className={cn(th, "w-28 text-right")}>Rate</th><th className={cn(th, "w-28 text-right")}>Fee</th><th className="w-8" />
      </tr></thead><tbody>
        {items.map((li, j) => (
          <tr key={j}>
            <td><input className={cell} readOnly={!editable} value={li.description ?? ""} onChange={(e) => set(j, { description: e.target.value })} /></td>
            <td><input className={cn(cell, "text-right tabular-nums")} type="number" step="0.5" min="0" readOnly={!editable}
                       value={li.qty ?? 1} onChange={(e) => set(j, { qty: Number(e.target.value) })} /></td>
            <td><input className={cn(cell, "text-right tabular-nums")} type="number" step="0.01" min="0" readOnly={!editable}
                       value={li.unit_price ?? 0} onChange={(e) => set(j, { unit_price: Number(e.target.value) })} /></td>
            <td className="px-2 text-right text-[13px] tabular-nums">{money(lineAmount(li))}</td>
            <td><DelRow editable={editable} onClick={() => onChange(items.filter((_, k) => k !== j))} /></td>
          </tr>
        ))}
      </tbody></table>
      <RowButtons editable={editable} label="Add task" onAdd={() => onChange([...items, { description: "", qty: 1, unit_price: 0 }])} />
      <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-2 text-[13px]">
        <span className="text-ink-soft">Total</span><strong className="tabular-nums">{money(total)}</strong>
      </div>
    </div>
  );
}
