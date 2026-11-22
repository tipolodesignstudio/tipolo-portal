/* The invoice's status as a switch: click it to flip between unpaid and paid, and set or
   correct the day it was paid. Paying adds the income entry, unpaying removes it, and a
   new date or method is carried onto the income entry too (database triggers). Drafts
   aren't switched here; they're finalized in the builder, where they get their number. */

import * as React from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Field, Segmented, Select } from "@/components/ui/fields";
import { localISO } from "@/lib/format";
import { settingsQuery } from "@/lib/data/settings";
import { effectiveStatus, useInvoiceUpdate } from "@/lib/data/invoices";

type Inv = { id: string; number: string | null; status: string; due_date: string | null; paid_date: string | null; payment_method: string | null };
const FALLBACK = ["E-transfer", "Cheque", "Cash", "Credit card", "Other"];

export function PaymentStatus({ inv }: { inv: Inv }) {
  const btn = React.useRef<HTMLButtonElement>(null);
  const [at, setAt] = React.useState<{ top: number; left: number } | null>(null);
  const st = effectiveStatus(inv);
  if (inv.status === "draft") return <StatusBadge status={st} />;

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();   // inside a clickable table row
    if (at) return setAt(null);
    const r = btn.current!.getBoundingClientRect();
    setAt({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 296)) });
  };
  return (
    <>
      <button ref={btn} type="button" onClick={toggle} title="Change payment status"
        className="inline-flex items-center gap-0.5 rounded-full hover:opacity-80">
        <StatusBadge status={st} /><ChevronDown className="size-3.5 text-ink-faint" />
      </button>
      {at && createPortal(<Panel inv={inv} at={at} onClose={() => setAt(null)} />, document.body)}
    </>
  );
}

function Panel({ inv, at, onClose }: { inv: Inv; at: { top: number; left: number }; onClose: () => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const save = useInvoiceUpdate();
  const { data: settings } = useQuery(settingsQuery);
  const listed = (settings?.income_payment_methods as string[] | undefined) ?? [];
  const methods = listed.length ? listed : FALLBACK;
  const wasPaid = inv.status === "paid";
  const [paid, setPaid] = React.useState<"paid" | "unpaid">(wasPaid ? "paid" : "unpaid");
  const [day, setDay] = React.useState(inv.paid_date ?? localISO());
  const [method, setMethod] = React.useState(inv.payment_method ?? methods[0]);

  React.useEffect(() => {
    const out = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const t = setTimeout(() => document.addEventListener("mousedown", out));
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", onClose, true);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", out); document.removeEventListener("keydown", key); window.removeEventListener("scroll", onClose, true); };
  }, [onClose]);

  const changed = paid === "paid"
    ? !wasPaid || day !== inv.paid_date || method !== inv.payment_method
    : wasPaid;
  const go = () => save.mutate(
    { id: inv.id, patch: paid === "paid" ? { status: "paid", paid_date: day, payment_method: method } : { status: "sent", paid_date: null } },
    {
      onSuccess: () => { toast.success(paid === "unpaid" ? "Marked unpaid — income entry removed" : wasPaid ? "Payment updated" : "Marked paid — added to Income"); onClose(); },
      onError: (e) => toast.error(e.message),
    });

  return (
    <div ref={ref} onClick={(e) => e.stopPropagation()} style={{ top: at.top, left: at.left }}
      className="fixed z-50 w-72 space-y-3 rounded-lg border border-border bg-card p-4 shadow-lg">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium tabular-nums">{inv.number}</span>
        <Segmented value={paid} onChange={setPaid} options={[{ value: "unpaid", label: "Unpaid" }, { value: "paid", label: "Paid" }]} />
      </div>
      {paid === "paid" ? (
        <div className="grid gap-3">
          <Field label="Date paid"><Input type="date" value={day} max={localISO()} onChange={(e) => setDay(e.target.value)} /></Field>
          <Field label="Method"><Select value={method} onChange={(e) => setMethod(e.target.value)}>{[...new Set([...methods, method])].map((m) => <option key={m}>{m}</option>)}</Select></Field>
        </div>
      ) : wasPaid ? <p className="text-[12.5px] text-ink-soft">Its income entry will be removed.</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={go} disabled={!changed || !day || save.isPending}>Save</Button>
      </div>
    </div>
  );
}
