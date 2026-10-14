// Settings: the studio's details, rates, taxes, numbering, the managed lists, and the
// Google Drive connection. Lists save as you edit them; the forms have a Save button.
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Plus, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox, Field, Textarea } from "@/components/ui/fields";
import { useConfirm } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";
import { money } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import {
  categoryCreate, categoryDelete, categoryList, categoryRename, createTier, deleteTier, saveSettings, setDefaultTier,
  settingsQuery, updateTier, uploadBranding, type Settings as S,
} from "@/lib/data/settings";
import { booksKeys, booksStateQuery, setBooksState } from "@/lib/data/books";
import { drive, linkAccountingFolder, linkFolder } from "@/lib/books";

const TABS = [["business", "Business"], ["rates", "Rates"], ["taxes", "Taxes"], ["numbering", "Numbering"], ["lists", "Categories & lists"], ["drive", "Google Drive"]] as const;
type Tab = (typeof TABS)[number][0];
const TAB_KEY = "tipolo.settings.tab";

export function Settings() {
  const { data: s, isLoading, error } = useQuery(settingsQuery);
  const [tab, setTab] = React.useState<Tab>(() => {
    try { const t = localStorage.getItem(TAB_KEY); return (TABS.find(([id]) => id === t)?.[0] ?? "business"); } catch { return "business"; }
  });
  const choose = (t: Tab) => { setTab(t); try { localStorage.setItem(TAB_KEY, t); } catch { /* */ } };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-ink-soft">These details appear on your proposals and invoices.</p>
      </div>
      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => choose(id)} className={cn("-mb-px border-b-2 px-3 py-2 text-[13.5px]", tab === id ? "border-accent font-medium" : "border-transparent text-ink-soft hover:text-ink")}>{label}</button>
        ))}
      </div>
      {error ? <div className="rounded-md bg-bad-bg px-4 py-3 text-sm text-bad">{(error as Error).message}</div>
        : isLoading || !s ? <div className="h-64 animate-pulse rounded-lg bg-card" />
        : (
          <div className="max-w-3xl">
            {tab === "business" && <Business s={s} />}
            {tab === "rates" && <Rates s={s} />}
            {tab === "taxes" && <Taxes s={s} />}
            {tab === "numbering" && <Numbering s={s} />}
            {tab === "lists" && <Lists />}
            {tab === "drive" && <DriveTab />}
          </div>
        )}
    </div>
  );
}

function useSave() {
  const qc = useQueryClient();
  const [busy, setBusy] = React.useState(false);
  const save = async (patch: Parameters<typeof saveSettings>[0], msg = "Settings saved") => {
    setBusy(true);
    try { await saveSettings(patch); await qc.invalidateQueries({ queryKey: settingsQuery.queryKey }); toast.success(msg); return true; }
    catch (e) { toast.error((e as Error).message); return false; }
    finally { setBusy(false); }
  };
  return { save, busy };
}

/* ---------------- Business ---------------- */

function Business({ s }: { s: S }) {
  const { save, busy } = useSave();
  const [f, setF] = React.useState({
    business_name: s.business_name ?? "", email: s.email ?? "", phone: s.phone ?? "", currency: s.currency ?? "CAD",
    address: s.address ?? "", gst_number: s.gst_number ?? "", pst_number: s.pst_number ?? "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const nul = (v: string) => v.trim() || null;
  return (
    <div className="space-y-6">
      <Card>
        <CardTitle>Business identity</CardTitle>
        <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save({
          business_name: nul(f.business_name), email: nul(f.email), phone: nul(f.phone), currency: (f.currency || "CAD").toUpperCase(),
          address: nul(f.address), gst_number: nul(f.gst_number), pst_number: nul(f.pst_number) }); }}>
          <Field label="Business name"><Input value={f.business_name} onChange={set("business_name")} placeholder="Tipolo Design Studio" /></Field>
          <Field label="Billing email"><Input type="email" value={f.email} onChange={set("email")} /></Field>
          <Field label="Phone"><Input value={f.phone} onChange={set("phone")} /></Field>
          <Field label="Currency"><Input value={f.currency} onChange={set("currency")} /></Field>
          <Field label="Address" className="sm:col-span-2"><Textarea rows={2} value={f.address} onChange={set("address")} /></Field>
          <Field label="GST number"><Input value={f.gst_number} onChange={set("gst_number")} /></Field>
          <Field label="PST number"><Input value={f.pst_number} onChange={set("pst_number")} /></Field>
          <div className="sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button></div>
        </form>
      </Card>
      <ImageSetting s={s} field="logo_url" prefix="logo" title="Logo" hint="Shown on documents where a logo is used." box="h-16 w-32" />
      <ImageSetting s={s} field="signature_url" prefix="signature" title="Signature"
        hint="Printed on a proposal's cover letter between “Sincerely,” and your name. A PNG with a transparent background works best." box="h-20 w-48" />
    </div>
  );
}

function ImageSetting({ s, field, prefix, title, hint, box }: {
  s: S; field: "logo_url" | "signature_url"; prefix: "logo" | "signature"; title: string; hint: string; box: string;
}) {
  const { save } = useSave();
  const [busy, setBusy] = React.useState(false);
  const url = s[field];
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      <p className="mt-1 text-[13px] text-ink-soft">{hint}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className={cn("grid place-items-center overflow-hidden rounded-md border border-border bg-bg", box)}>
          {url ? <img src={url} alt={title} className="max-h-full max-w-full" /> : <span className="text-[12px] text-ink-faint">None</span>}
        </div>
        <label>
          <input type="file" accept="image/*" hidden onChange={async (e) => {
            const file = e.target.files?.[0]; e.target.value = "";
            if (!file) return;
            setBusy(true);
            try { await save({ [field]: await uploadBranding(file, prefix) }, `${title} updated`); }
            catch (err) { toast.error((err as Error).message); }
            finally { setBusy(false); }
          }} />
          <Button asChild variant="outline" size="sm"><span><Upload />{busy ? "Uploading…" : "Upload image"}</span></Button>
        </label>
        {url && <Button variant="ghost" size="sm" onClick={() => save({ [field]: null }, `${title} removed`)}><X />Remove</Button>}
      </div>
    </Card>
  );
}

/* ---------------- Rates ---------------- */

function Rates({ s }: { s: S }) {
  const qc = useQueryClient();
  const { save } = useSave();
  const confirm = useConfirm();
  const [name, setName] = React.useState("");
  const [hoursPerDay, setHoursPerDay] = React.useState(String(s.hours_per_day ?? 8));
  const refresh = () => qc.invalidateQueries({ queryKey: settingsQuery.queryKey });
  const run = async (fn: () => Promise<unknown>, msg?: string) => { try { await fn(); await refresh(); if (msg) toast.success(msg); } catch (e) { toast.error((e as Error).message); } };
  const def = s.staff_tiers.find((t) => t.is_default) ?? s.staff_tiers[0];
  const hours = Number(hoursPerDay) || 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardTitle>Staff rates</CardTitle>
        <p className="mt-1 text-[13px] text-ink-soft">One row per tier. The <strong>default</strong> tier is the rate a proposal quotes and the one a project falls back to when neither it nor its client sets a rate. The whole list prints as the proposal's rate card.</p>
        <ul className="mt-4 divide-y divide-border/60">
          {s.staff_tiers.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 py-2">
              <Input className="min-w-40 flex-1" defaultValue={t.name} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== t.name && run(() => updateTier(t.id, { name: e.target.value.trim() }))} />
              <span className="text-ink-faint">$</span>
              <Input className="w-24 text-right tabular-nums" type="number" step="0.01" min="0" defaultValue={t.hourly_rate ?? ""}
                onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== (t.hourly_rate ?? null)) run(() => updateTier(t.id, { hourly_rate: v })); }} />
              <span className="text-[12.5px] text-ink-faint">/ hour</span>
              <label className="ml-2 flex items-center gap-1.5 text-[13px]">
                <input type="radio" name="default-tier" className="accent-accent" checked={!!t.is_default} onChange={() => run(() => setDefaultTier(t.id), "Default rate set")} />default
              </label>
              <button title="Delete" className="ml-auto text-ink-faint hover:text-bad" onClick={async () => {
                if (await confirm({ title: "Delete tier", message: `Delete “${t.name}”? Proposals already written keep the rate they printed.`, confirm: "Delete", danger: true })) run(() => deleteTier(t.id), "Deleted");
              }}><Trash2 className="size-3.5" /></button>
            </li>
          ))}
          {!s.staff_tiers.length && <li className="py-2 text-sm text-ink-faint">No tiers yet — the proposal's rate card prints a placeholder.</li>}
        </ul>
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) run(() => createTier(name), "Tier added").then(() => setName("")); }}>
          <Input className="max-w-xs" placeholder="New tier, e.g. Junior Designer" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" variant="subtle" disabled={!name.trim()}><Plus />Add tier</Button>
        </form>
      </Card>
      <Card>
        <CardTitle>Length of a day</CardTitle>
        <div className="mt-3 flex items-end gap-3">
          <Field label="Hours in a working day"><Input className="w-28" type="number" step="0.25" min="0.25" value={hoursPerDay} onChange={(e) => setHoursPerDay(e.target.value)}
            onBlur={() => { const v = Math.max(0.25, Number(hoursPerDay) || 8); if (v !== Number(s.hours_per_day)) save({ hours_per_day: v }, "Saved"); }} /></Field>
        </div>
        <p className="mt-2 text-[13px] text-ink-soft">A day rate is the hourly rate times this, so there's no second figure to keep in step.
          {def?.hourly_rate != null && hours > 0 && <> At {money(def.hourly_rate)}/hour that's <strong>{money(Number(def.hourly_rate) * hours)}</strong> a day.</>}</p>
      </Card>
    </div>
  );
}

/* ---------------- Taxes ---------------- */

type TaxLine = { label: string; rate: number; enabled: boolean };

function Taxes({ s }: { s: S }) {
  const { save, busy } = useSave();
  const [rows, setRows] = React.useState<TaxLine[]>(() => ((s.tax_lines as TaxLine[] | null) ?? []).map((t) => ({ ...t })));
  const set = (i: number, p: Partial<TaxLine>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...p } : x)));
  return (
    <Card>
      <CardTitle>Tax lines</CardTitle>
      <p className="mt-1 text-[13px] text-ink-soft">Offered on invoices, applied to the subtotal in this order. The house invoice leaves them off unless you tick them.</p>
      <ul className="mt-4 space-y-2">
        {rows.map((t, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <Input className="w-40" placeholder="Label (e.g. GST)" value={t.label} onChange={(e) => set(i, { label: e.target.value })} />
            <Input className="w-24 text-right" type="number" step="0.01" min="0" value={t.rate} onChange={(e) => set(i, { rate: Number(e.target.value) })} />
            <span className="text-ink-faint">%</span>
            <Checkbox className="ml-2" label="enabled" checked={t.enabled} onChange={(e) => set(i, { enabled: e.target.checked })} />
            <button title="Remove" className="ml-auto text-ink-faint hover:text-bad" onClick={() => setRows((r) => r.filter((_, k) => k !== i))}><Trash2 className="size-3.5" /></button>
          </li>
        ))}
        {!rows.length && <li className="text-sm text-ink-faint">No tax lines — invoices show subtotal = total.</li>}
      </ul>
      <div className="mt-4 flex gap-2">
        <Button variant="subtle" onClick={() => setRows((r) => [...r, { label: "", rate: 0, enabled: true }])}><Plus />Add tax line</Button>
        <Button disabled={busy} onClick={() => save({ tax_lines: rows.filter((t) => t.label.trim()).map((t) => ({ label: t.label.trim(), rate: Number(t.rate) || 0, enabled: !!t.enabled })) })}>{busy ? "Saving…" : "Save"}</Button>
      </div>
    </Card>
  );
}

/* ---------------- Numbering ---------------- */

/* The year follows the calendar and isn't typed. The next number shown is the one
   next_job_number() would hand out now, worked out the same way, so this page can't
   promise a number the database won't give. */
function Numbering({ s }: { s: S }) {
  const { save, busy } = useSave();
  const [now] = React.useState(() => new Date().getFullYear());
  const yy = String(now).slice(2);
  const start0 = Number(s.job_seq_start) || 101;
  const rolled = Number(s.job_seq_year) !== now;
  const next0 = rolled ? start0 : Math.max(Number(s.job_seq_next) || start0, start0);
  const [start, setStart] = React.useState(String(start0));
  const [next, setNext] = React.useState(String(next0));
  const st = Math.max(1, Number(start) || 101);
  return (
    <div className="space-y-6">
      <Card>
        <CardTitle>Job numbers</CardTitle>
        <p className="mt-1 text-[13px] text-ink-soft">Jobs are numbered <code>YYNNN</code>: a proposal draws the next one and keeps it as the project number when converted. Invoices are <code>YYNNN-XXX</code>, the project number plus a count from 001.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><div className="text-[13px] text-ink-soft">Sequence year</div><div className="mt-1 font-heading text-2xl">{now}</div></div>
          <div><div className="text-[13px] text-ink-soft">Next job number</div><div className="mt-1 font-heading text-2xl tabular-nums">{yy}{String(next0).padStart(3, "0")}</div></div>
        </div>
        {rolled && <p className="mt-2 text-[12.5px] text-ink-faint">The counter still reads {s.job_seq_year}; it rolls over on the next number drawn.</p>}
      </Card>
      <Card>
        <CardTitle>The January reset</CardTitle>
        <p className="mt-1 text-[13px] text-ink-soft">On the first job number of a new year the count restarts and <code>{yy}001</code> is created as that year's internal project, the one you log studio time against. Client work starts at the number below, so the range beneath it stays with the studio.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Client work starts at"><Input type="number" min="1" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Override the next number" hint="Only to line up with numbers already issued elsewhere."><Input type="number" min="1" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
        </div>
        <Button className="mt-4" disabled={busy} onClick={() => save({ job_seq_start: st, job_seq_year: now, job_seq_next: Math.max(st, Number(next) || st) })}>{busy ? "Saving…" : "Save"}</Button>
      </Card>
    </div>
  );
}

/* ---------------- Categories & lists ---------------- */

function CategoryList({ table, title, hint }: { table: "client_categories" | "expense_categories"; title: string; hint: string }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: rows = [] } = useQuery({ queryKey: ["settings", table], queryFn: () => categoryList(table) });
  const [name, setName] = React.useState("");
  const refresh = () => { qc.invalidateQueries({ queryKey: ["settings", table] }); qc.invalidateQueries({ queryKey: table === "client_categories" ? ["client_categories"] : booksKeys.categories }); };
  const run = async (fn: () => Promise<unknown>) => { try { await fn(); refresh(); } catch (e) { toast.error((e as Error).message); } };
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      <p className="mt-1 text-[13px] text-ink-soft">{hint}</p>
      <ul className="mt-3 divide-y divide-border/60">
        {rows.map((c) => (
          <li key={c.id} className="flex items-center gap-2 py-1.5">
            <Input className="h-8 flex-1 border-transparent hover:border-border" defaultValue={c.name}
              onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== c.name && run(() => categoryRename(table, c.id, e.target.value))}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
            <button title="Delete" className="text-ink-faint hover:text-bad" onClick={async () => {
              if (await confirm({ title: "Delete category", message: `Delete “${c.name}”? It's cleared from anything that uses it.`, confirm: "Delete", danger: true })) run(() => categoryDelete(table, c.id));
            }}><Trash2 className="size-3.5" /></button>
          </li>
        ))}
      </ul>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) run(() => categoryCreate(table, name)).then(() => setName("")); }}>
        <Input className="max-w-xs" placeholder="New category…" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" variant="subtle" disabled={!name.trim()}><Plus />Add</Button>
      </form>
    </Card>
  );
}

function MethodList({ field, title }: { field: "expense_payment_methods" | "income_payment_methods"; title: string }) {
  const qc = useQueryClient();
  const { data: st } = useQuery(booksStateQuery);
  const items = (st?.[field] as string[] | null) ?? [];
  const [name, setName] = React.useState("");
  const write = async (next: string[]) => {
    const clean = [...new Set(next.map((v) => v.trim()).filter(Boolean))];
    try { await setBooksState({ [field]: clean }); qc.invalidateQueries({ queryKey: booksKeys.state }); } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <div>
      <div className="mb-1 text-[13px] font-medium text-ink-soft">{title}</div>
      <ul className="divide-y divide-border/60">
        {items.map((m, i) => (
          <li key={m + i} className="flex items-center gap-2 py-1">
            <Input className="h-8 flex-1 border-transparent hover:border-border" defaultValue={m}
              onBlur={(e) => e.target.value !== m && write(items.map((x, k) => (k === i ? e.target.value : x)))} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
            <button title="Delete" className="text-ink-faint hover:text-bad" onClick={() => write(items.filter((_, k) => k !== i))}><Trash2 className="size-3.5" /></button>
          </li>
        ))}
      </ul>
      <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { write([...items, name]); setName(""); } }}>
        <Input className="h-8" placeholder="Add…" value={name} onChange={(e) => setName(e.target.value)} />
      </form>
    </div>
  );
}

function Lists() {
  return (
    <div className="space-y-6">
      <CategoryList table="client_categories" title="Client categories" hint="One per client; filterable on the Clients list." />
      <CategoryList table="expense_categories" title="Expense categories" hint="Used on expenses and fixed costs, and as the Excel tracker's Category dropdown." />
      <Card>
        <CardTitle>Payment methods</CardTitle>
        <p className="mt-1 text-[13px] text-ink-soft">The choices on an expense or a payment, and the dropdowns in the Excel tracker.</p>
        <div className="mt-3 grid gap-6 sm:grid-cols-2">
          <MethodList field="expense_payment_methods" title="Expenses" />
          <MethodList field="income_payment_methods" title="Income" />
        </div>
      </Card>
    </div>
  );
}

/* ---------------- Google Drive ---------------- */

function DriveTab() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const { data: st } = useQuery(booksStateQuery);
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => { drive.loadGoogle().catch(() => {}); return drive.onConnectionChange(force); }, []);
  const on = drive.connected();
  const ids = [st?.drive_folder_id, st?.drive_receipts_folder_id, st?.drive_tracker_file_id, st?.drive_proposals_folder_id, st?.drive_projects_folder_id];
  const names = useQuery({
    queryKey: ["drive-names", ...ids, on],
    enabled: on && ids.some(Boolean),
    queryFn: async () => Promise.all(ids.map((id) => (id ? drive.getFile(id).catch(() => null) : null))),
  });
  const [folder, receipts, tracker, proposals, projects] = names.data ?? [];
  const refresh = () => { qc.invalidateQueries({ queryKey: booksKeys.state }); qc.invalidateQueries({ queryKey: settingsQuery.queryKey }); };

  if (!drive.configured()) {
    return <Card><p className="text-sm text-ink-soft">Google Drive isn't switched on: it needs a Google OAuth client ID in <code>config.js</code> (SETUP.md → Google Drive).</p></Card>;
  }
  return (
    <div className="space-y-6">
      <Card>
        <CardTitle>Connection</CardTitle>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Badge tone={on ? "green" : "grey"}>{on ? "Connected" : "Not connected"}</Badge>
          {on ? <Button variant="ghost" size="sm" onClick={() => drive.disconnect()}>Disconnect</Button>
            : <Button size="sm" onClick={() => drive.connect({ email: session?.user.email }).catch((e) => toast.error((e as Error).message))}>Connect Google Drive</Button>}
          <span className="text-[12.5px] text-ink-faint">Each person connects once per browser session.</span>
        </div>
      </Card>
      <FolderCard title="Accounting folder" connected={on} linked={!!st?.drive_folder_id}
        detail={folder ? <>
          <a href={folder.webViewLink} target="_blank" rel="noopener" className="text-accent hover:underline">{folder.name}</a>
          {receipts && <> · receipts in {receipts.name}</>}
          {tracker && <> · tracker <a href={tracker.webViewLink} target="_blank" rel="noopener" className="text-accent hover:underline">{tracker.name}</a></>}
        </> : null}
        hint="01_Admin → Accounting. Receipts are filed in it and the Excel tracker there is kept in step. The first time, a copy of the tracker is saved alongside as “(before portal)”."
        onLink={async (link) => { const r = await linkAccountingFolder(link); refresh(); return r.folder.name; }} />
      <FolderCard title="05_Proposals folder" connected={on} linked={!!st?.drive_proposals_folder_id}
        detail={proposals ? <a href={proposals.webViewLink} target="_blank" rel="noopener" className="text-accent hover:underline">{proposals.name}</a> : null}
        hint="For Proposals → From Drive."
        onLink={async (link) => { const f = await linkFolder("drive_proposals_folder_id", link); refresh(); return f.name; }} />
      <FolderCard title="06_Projects folder" connected={on} linked={!!st?.drive_projects_folder_id}
        detail={projects ? <a href={projects.webViewLink} target="_blank" rel="noopener" className="text-accent hover:underline">{projects.name}</a> : null}
        hint="For checking project folders and their invoices against the portal."
        onLink={async (link) => { const f = await linkFolder("drive_projects_folder_id", link); refresh(); return f.name; }} />
    </div>
  );
}

function FolderCard({ title, connected, linked, detail, hint, onLink }: {
  title: string; connected: boolean; linked: boolean; detail: React.ReactNode; hint: string; onLink: (link: string) => Promise<string>;
}) {
  const [link, setLink] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  return (
    <Card>
      <div className="flex items-center justify-between"><CardTitle>{title}</CardTitle>{linked && <Badge tone="green">linked</Badge>}</div>
      <div className="mt-2 text-sm text-ink-soft">{detail ?? (linked ? (connected ? "Linked." : "Linked. Connect to see the folder.") : "Not linked yet.")}</div>
      <form className="mt-3 flex flex-wrap gap-2" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true);
        try { const name = await onLink(link); toast.success(`Linked ${name}`); setLink(""); } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
      }}>
        <Input className="min-w-64 flex-1" placeholder="https://drive.google.com/drive/folders/…" value={link} onChange={(e) => setLink(e.target.value)} />
        <Button type="submit" variant="subtle" disabled={!connected || !link.trim() || busy}><ExternalLink />{busy ? "Linking…" : linked ? "Re-link" : "Link folder"}</Button>
      </form>
      <p className="mt-2 text-[12.5px] text-ink-faint">{hint}</p>
    </Card>
  );
}
