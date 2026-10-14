import * as React from "react";
import {
  flexRender, getCoreRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

/* A sortable table. Click a header to sort; click a row to open it. Columns can set
   meta.className (applied to both header and cells) and meta.align = "right". */
type Meta = { className?: string; align?: "right" };

export function DataTable<T>({ data, columns, onRowClick, initialSort, empty }: {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  onRowClick?: (row: T) => void;
  initialSort?: SortingState;
  empty?: React.ReactNode;
}) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSort ?? []);
  const table = useReactTable({
    data, columns, state: { sorting }, onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(),
  });

  if (!data.length && empty) return <>{empty}</>;

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full border-collapse text-sm">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-border bg-bg/60">
              {hg.headers.map((h) => {
                const meta = (h.column.columnDef.meta ?? {}) as Meta;
                const sorted = h.column.getIsSorted();
                return (
                  <th key={h.id}
                      className={cn("whitespace-nowrap px-4 py-2.5 text-left text-[11.5px] font-medium uppercase tracking-wide text-ink-faint",
                        meta.align === "right" && "text-right", meta.className)}>
                    {h.isPlaceholder ? null : h.column.getCanSort() ? (
                      <button type="button" onClick={h.column.getToggleSortingHandler()}
                              className={cn("inline-flex items-center gap-1 uppercase hover:text-ink", sorted && "text-ink")}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {sorted === "asc" ? <ArrowUp className="size-3" /> : sorted === "desc" ? <ArrowDown className="size-3" /> : null}
                      </button>
                    ) : flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}
                onClick={onRowClick ? (e) => {
                  // a click on something interactive inside the row is that thing's, not the row's
                  if ((e.target as HTMLElement).closest("button, a, input, textarea, select, [data-stop]")) return;
                  onRowClick(row.original);
                } : undefined}
                className={cn("border-b border-border/70 last:border-0", onRowClick && "cursor-pointer hover:bg-bg/60")}>
              {row.getVisibleCells().map((cell) => {
                const meta = (cell.column.columnDef.meta ?? {}) as Meta;
                return (
                  <td key={cell.id} className={cn("px-4 py-3 align-top", meta.align === "right" && "text-right tabular-nums", meta.className)}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/50 px-6 py-14 text-center">
      <div className="font-heading text-lg text-ink">{title}</div>
      {children && <div className="mt-1 text-sm text-ink-soft">{children}</div>}
    </div>
  );
}
