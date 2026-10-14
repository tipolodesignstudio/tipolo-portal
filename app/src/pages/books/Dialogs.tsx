import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { FileUp, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox, Field, Select, Textarea } from "@/components/ui/fields";
import { localISO } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import {
  booksStateQuery, categoriesQuery, pickerClientsQuery, pickerProjectsQuery, saveExpense, saveIncome,
  type Expense, type Income,
} from "@/lib/data/books";
import { drive, refileReceipt, uploadReceipt, type ReceiptRef } from "@/lib/books";

const DEFAULT_EXPENSE_METHODS = ["Tipolo Credit Card", "Personal Credit Card", "Cash", "E-transfer", "Cheque"];
const DEFAULT_INCOME_METHODS = ["Business card", "Personal card", "Cash", "E-transfer", "Cheque"];
const withCurrent = (list: string[], v: string | null | undefined) => (v && !list.includes(v) ? [...list, v] : list);

export const receiptLink = (e: Pick<Expense, "receipt_drive_url" | "receipt_url">) => e.receipt_drive_url || e.receipt_url || "";

// Drive links open as they are; an older receipt in the portal's private bucket needs a
// fresh signed link. The tab opens first, or the popup blocker steps in.
export async function openReceipt(link: string) {
  const w = window.open("", "_blank");
  try {
    let url = link;
    if (!/^https:\/\/(drive|docs)\.google\.com\//.test(link)) {
      const m = link.match(/\/object\/(?:public|sign|authenticated)\/receipts\/([^?]+)/);
      const path = m ? decodeURIComponent(m[1]) : link;
      if (!/^https?:\/\//.test(path)) {
        const { data, error } = await supabase.storage.from("receipts").createSignedUrl(path, 3600);
        if (error) throw new Error(error.message);
        url = data.signedUrl;
      }
    }
    if (w) w.location.href = url; else window.location.href = url;
  } catch (e) { w?.close(); toast.error(`Couldn't open the receipt: ${(e as Error).message}`); }
}

export function ExpenseDialog({ expense, prefill, onClose, onSaved }: {
  expense?: Expense; prefill?: { project_id?: string }; onClose: () => void; onSaved: () => void;
}) {
  const e = expense;
  const { data: categories = [] } = useQuery(categoriesQuery);
  const { data: projects = [] } = useQuery(pickerProjectsQuery);
  const { data: books } = useQuery(booksStateQuery);
  const linked = drive.configured() && !!books?.drive_receipts_folder_id;
  const methods = withCurrent((books?.expense_payment_methods as string[] | null)?.length ? books!.expense_payment_methods as string[] : DEFAULT_EXPENSE_METHODS, e?.payment_method);

  const [f, setF] = React.useState({
    expense_date: e?.expense_date ?? localISO(), description: e?.description ?? e?.vendor ?? "",
    project_id: e?.project_id ?? prefill?.project_id ?? "", amount: e?.amount != null ? String(e.amount) : "",
    category_id: e?.category_id ?? "", payment_method: e?.payment_method ?? "",
    tax_amount: e?.tax_amount ? String(e.tax_amount) : "", markup_pct: e?.markup_pct ? String(e.markup_pct) : "",
    billable: e?.billable ?? false, notes: e?.notes ?? "",
  });
  const [file, setFile] = React.useState<File | null>(null);
  const [more, setMore] = React.useState(!!(e?.billable || Number(e?.tax_amount) || e?.notes));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const set = (k: keyof typeof f) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((x) => ({ ...x, [k]: ev.target.type === "checkbox" ? (ev.target as HTMLInputElement).checked : ev.target.value }));

  const save = async () => {
    if (!f.description.trim()) return setError("Describe the expense.");
    if (!(Number(f.amount) > 0)) return setError("Enter an amount.");
    const moved = !!e?.receipt_drive_id && (f.expense_date !== e.expense_date || f.description.trim() !== (e.description || e.vendor || ""));
    // Google's sign-in popup has to open inside this click, before anything is awaited.
    const auth = (file || moved) && !drive.connected() ? drive.connect() : Promise.resolve("");
    setBusy(true); setError("");
    try {
      let receipt: Partial<ReceiptRef> = {};
      if (file) { await auth; receipt = await uploadReceipt(file, { date: f.expense_date, description: f.description }); }
      else if (moved) {
        try { await auth; receipt = (await refileReceipt(e!, { date: f.expense_date, description: f.description })) ?? {}; }
        catch (err) { toast.error(`Saved, but the receipt wasn't renamed in Drive: ${(err as Error).message}`); }
      }
      await saveExpense(e?.id, {
        expense_date: f.expense_date, description: f.description.trim(), category_id: f.category_id || null,
        project_id: f.project_id || null, amount: Number(f.amount), tax_amount: f.tax_amount ? Number(f.tax_amount) : 0,
        billable: f.billable, markup_pct: f.markup_pct ? Number(f.markup_pct) : 0,
        payment_method: f.payment_method || null, notes: f.notes.trim() || null, ...receipt,
      });
      toast.success(e ? "Expense saved" : "Expense added");
      onSaved(); onClose();
    } catch (err) { setError((err as Error).message); setBusy(false); }
  };

  return (
    <Dialog open wide onOpenChange={(v) => !v && onClose()} title={e ? "Edit expense" : "New expense"}
      footer={<>{error && <div className="mr-auto text-sm text-bad">{error}</div>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : e ? "Save" : "Add expense"}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date"><Input type="date" value={f.expense_date} onChange={set("expense_date")} /></Field>
        <Field label="Description *"><Input autoFocus value={f.description} onChange={set("description")} placeholder="Office table" /></Field>
        <Field label="Client / Project">
          <Select value={f.project_id} onChange={set("project_id")}>
            <option value="">N/A (business expense)</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{[p.number, p.title].filter(Boolean).join(" · ")}</option>)}
          </Select>
        </Field>
        <Field label="Amount (tax incl.) *"><Input type="number" step="0.01" min="0" value={f.amount} onChange={set("amount")} /></Field>
        <Field label="Category">
          <Select value={f.category_id} onChange={set("category_id")}>
            <option value="">Uncategorized</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Payment method">
          <Select value={f.payment_method} onChange={set("payment_method")}>
            <option value="">—</option>{methods.map((m) => <option key={m}>{m}</option>)}
          </Select>
        </Field>
        <Field label="Receipt" className="sm:col-span-2"
          hint={linked ? "Filed in Google Drive under Receipts / year / month, named by date and description."
            : drive.configured() ? "Link Google Drive in Settings to attach receipts." : "Google Drive isn't set up yet."}>
          <div className="flex flex-wrap items-center gap-2">
            <label className={linked ? "" : "pointer-events-none opacity-50"}>
              <input type="file" accept="image/*,application/pdf" hidden onChange={(ev) => setFile(ev.target.files?.[0] ?? null)} />
              <Button asChild variant="outline" size="sm"><span><FileUp />{e && receiptLink(e) ? "Replace" : "Attach"}</span></Button>
            </label>
            {file ? <span className="text-[13px] text-ink-soft">{file.name} — files to Drive when you save</span>
              : e && receiptLink(e) ? <button type="button" onClick={() => openReceipt(receiptLink(e))} className="inline-flex items-center gap-1 text-[13px] text-accent hover:underline">{e.receipt_name || "current receipt"}<ExternalLink className="size-3" /></button>
              : <span className="text-[13px] text-ink-faint">none</span>}
          </div>
        </Field>
      </div>
      <button type="button" className="mt-4 text-[13px] text-ink-faint hover:text-ink" onClick={() => setMore((v) => !v)}>
        {more ? "▾" : "▸"} Tax, billing and notes
      </button>
      {more && (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Tax portion" hint="For your input tax credits"><Input type="number" step="0.01" min="0" value={f.tax_amount} onChange={set("tax_amount")} /></Field>
          <Field label="Markup %" hint="Added when billed to the client"><Input type="number" step="0.5" min="0" value={f.markup_pct} onChange={set("markup_pct")} /></Field>
          <Checkbox className="sm:col-span-2" label="Billable to the client" checked={f.billable} onChange={set("billable")} />
          <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} value={f.notes} onChange={set("notes")} /></Field>
        </div>
      )}
      {e?.invoice_id && <p className="mt-4 rounded-md bg-bg-alt px-3 py-2 text-[13px] text-ink-soft">This expense is on an invoice.</p>}
    </Dialog>
  );
}

export function IncomeDialog({ income, onClose, onSaved }: { income?: Income; onClose: () => void; onSaved: () => void }) {
  const i = income;
  const { data: clients = [] } = useQuery(pickerClientsQuery);
  const { data: projects = [] } = useQuery(pickerProjectsQuery);
  const { data: books } = useQuery(booksStateQuery);
  const methods = withCurrent((books?.income_payment_methods as string[] | null)?.length ? books!.income_payment_methods as string[] : DEFAULT_INCOME_METHODS, i?.payment_method);
  const [f, setF] = React.useState({
    income_date: i?.income_date ?? localISO(), amount: i?.amount != null ? String(i.amount) : "",
    client_id: i?.client_id ?? "", project_id: i?.project_id ?? "", description: i?.description ?? "", payment_method: i?.payment_method ?? "",
  });
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const set = (k: keyof typeof f) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: ev.target.value }));
  const save = async () => {
    if (!(Number(f.amount) > 0)) return setError("Enter an amount.");
    setBusy(true);
    try {
      await saveIncome(i?.id, { income_date: f.income_date, amount: Number(f.amount), client_id: f.client_id || null,
        project_id: f.project_id || null, description: f.description.trim() || null, payment_method: f.payment_method || null });
      toast.success(i ? "Income saved" : "Income added");
      onSaved(); onClose();
    } catch (err) { setError((err as Error).message); setBusy(false); }
  };
  return (
    <Dialog open wide onOpenChange={(v) => !v && onClose()} title={i ? "Edit income" : "New income"}
      footer={<>{error && <div className="mr-auto text-sm text-bad">{error}</div>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{i ? "Save" : "Add income"}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date"><Input type="date" value={f.income_date} onChange={set("income_date")} /></Field>
        <Field label="Amount *"><Input autoFocus type="number" step="0.01" min="0" value={f.amount} onChange={set("amount")} /></Field>
        <Field label="Client"><Select value={f.client_id} onChange={set("client_id")}><option value="">—</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Project"><Select value={f.project_id} onChange={set("project_id")}><option value="">—</option>{projects.map((p) => <option key={p.id} value={p.id}>{[p.number, p.title].filter(Boolean).join(" · ")}</option>)}</Select></Field>
        <Field label="Description" className="sm:col-span-2"><Input value={f.description} onChange={set("description")} placeholder="Task 1: Template exploration & mock-ups" /></Field>
        <Field label="Payment method"><Select value={f.payment_method} onChange={set("payment_method")}><option value="">—</option>{methods.map((m) => <option key={m}>{m}</option>)}</Select></Field>
      </div>
      {i?.invoice && <p className="mt-4 rounded-md bg-bg-alt px-3 py-2 text-[13px] text-ink-soft">From invoice {i.invoice.number}, added when it was marked paid.</p>}
    </Dialog>
  );
}
