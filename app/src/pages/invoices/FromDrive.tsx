import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, FolderSearch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox, Field, Segmented, Select } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/data-table";
import { supabase } from "@/lib/supabase";
import { date, localISO, money } from "@/lib/format";
import { drive } from "@/lib/books";
import { settingsQuery } from "@/lib/data/settings";
import { importDriveInvoice, invoiceKeys, linkInvoicePdf, unlinkedIncomeFor, type DriveLink } from "@/lib/data/invoices";
import { readInvoicePdf, scanProjectInvoices, type FiledInvoice, type ProjectFolder, type ReadInvoice } from "@/lib/invoice-import";

const FROM_KEY = "tipolo.driveImport.invoicesFrom";
type Known = { id: string; number: string | null; project_id: string; source_drive_id: string | null };
type PortalProject = { id: string; number: string | null; title: string };

const linkOf = (f: FiledInvoice["file"]): DriveLink => ({
  source_drive_id: f.id, source_name: f.name,
  source_drive_url: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
});
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return localISO(d); };

/* Each project folder's Invoice folder, lined up against the portal by invoice number.
   An invoice already here gets its PDF linked; one that isn't can be brought in from the
   PDF. Nothing in Drive is changed. */
export function FromDrive() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery(settingsQuery);
  const known = useQuery({
    queryKey: ["drive-import", "invoices"],
    queryFn: async () => {
      const [pj, inv] = await Promise.all([
        supabase.from("projects").select("id, number, title"),
        supabase.from("invoices").select("id, number, project_id, source_drive_id"),
      ]);
      return { projects: (pj.data ?? []) as PortalProject[], invoices: (inv.data ?? []) as Known[] };
    },
  });

  const [from, setFrom] = React.useState(() => { try { return localStorage.getItem(FROM_KEY) || "26000"; } catch { return "26000"; } });
  const [scan, setScan] = React.useState<ProjectFolder[] | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [review, setReview] = React.useState<{ project: PortalProject; filed: FiledInvoice; file: File; read: ReadInvoice } | null>(null);

  React.useEffect(() => { drive.loadGoogle().catch(() => {}); }, []);
  const projectsFolder = settings?.drive_projects_folder_id ?? null;

  const run = () => {
    // Google's popup has to open inside the click, before anything is awaited.
    const go = drive.connected() ? Promise.resolve("") : drive.connect();
    setScanning(true);
    go.then(async () => setScan(await scanProjectInvoices(projectsFolder!, { from })))
      .catch((e) => toast.error((e as Error).message)).finally(() => setScanning(false));
  };

  const refresh = () => { known.refetch(); qc.invalidateQueries({ queryKey: invoiceKeys.all }); qc.invalidateQueries({ queryKey: ["projects"] }); };

  const link = async (inv: Known, filed: FiledInvoice) => {
    setBusy(filed.file.id);
    try { await linkInvoicePdf(inv.id, linkOf(filed.file)); toast.success(`${inv.number} linked to ${filed.file.name}`); refresh(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };

  const open = async (project: PortalProject, filed: FiledInvoice) => {
    setBusy(filed.file.id);
    try {
      const file = new File([await drive.download(filed.file.id)], filed.file.name, { type: "application/pdf" });
      setReview({ project, filed, file, read: await readInvoicePdf(file, filed.number) });
    } catch (e) { toast.error(`Couldn't read ${filed.file.name}: ${(e as Error).message}`); }
    finally { setBusy(null); }
  };

  const k = known.data ?? { projects: [], invoices: [] };
  const setup = !drive.configured()
    ? "Google Drive isn't switched on: it needs the Google client ID in config.js (SETUP.md → Google Drive)."
    : !isLoading && !projectsFolder ? "Point the portal at 06_Projects first: Settings → Google Drive." : "";
  const missing = scan?.reduce((n, f) => n + f.invoices.filter((i) => !k.invoices.some((x) => x.number === i.number)).length, 0) ?? 0;

  return (
    <div className="space-y-5">
      <div>
        <Link to="/invoices" className="inline-flex items-center gap-1 text-[13px] text-ink-faint hover:text-ink"><ArrowLeft className="size-3.5" />Invoices</Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl">Invoices from Google Drive</h1>
            <p className="mt-1 text-sm text-ink-soft">Finds the PDFs in each project's Invoice folder and matches them by invoice number. Nothing in Drive is changed.</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[13px] text-ink-soft">From job number</label>
            <Input className="w-24" value={from} onChange={(e) => { setFrom(e.target.value); try { localStorage.setItem(FROM_KEY, e.target.value); } catch { /* */ } }} />
            <Button onClick={run} disabled={!!setup || scanning}><FolderSearch />{scanning ? "Reading Drive…" : "Scan Drive"}</Button>
          </div>
        </div>
      </div>

      {setup ? (
        <EmptyState title="Not set up yet">{setup} {drive.configured() && <Link className="text-accent underline" to="/settings" onClick={() => { try { localStorage.setItem("tipolo.settings.tab", "drive"); } catch { /* */ } }}>Open Settings</Link>}</EmptyState>
      ) : !scan ? (
        <EmptyState title="Ready to scan">Reads the project folders numbered {from} and up.{drive.connected() ? "" : " You'll be asked to connect Google first."}</EmptyState>
      ) : (
        <section className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="text-[15px]">Projects <span className="text-ink-faint">· 06_Projects</span></h2>
            <span className="text-sm text-ink-faint">{missing} invoice{missing === 1 ? "" : "s"} not in the portal</span>
          </div>
          {scan.length === 0 ? <p className="px-5 pb-5 text-sm text-ink-faint">Nothing numbered {from} or higher.</p> : (
            <ul className="divide-y divide-border/70 border-t border-border/70">
              {scan.map((f) => {
                const project = k.projects.find((p) => p.number === f.number);
                return (
                  <li key={f.folder.id} className="px-5 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="w-14 tabular-nums text-ink-faint">{f.number}</span>
                      <div className="min-w-0 flex-1 truncate">{f.title}</div>
                      {project ? <Link to="/projects/$id" params={{ id: project.id }} className="text-[13px] text-accent hover:underline">{project.title}</Link>
                        : <Badge tone="amber">no project in the portal</Badge>}
                    </div>
                    {f.invoices.length === 0 ? <p className="mt-1 pl-[68px] text-[12.5px] text-ink-faint">No invoices filed yet.</p> : (
                      <ul className="mt-2 space-y-1.5 pl-[68px]">
                        {f.invoices.map((filed) => {
                          const here = k.invoices.find((x) => x.number === filed.number);
                          return (
                            <li key={filed.file.id} className="flex flex-wrap items-center gap-3">
                              <span className="w-24 tabular-nums">{filed.number}{filed.rev ? <span className="text-ink-faint"> r{filed.rev}</span> : null}</span>
                              <a href={filed.file.webViewLink} target="_blank" rel="noreferrer" className="inline-flex min-w-0 flex-1 items-center gap-1 truncate text-[12.5px] text-ink-faint hover:text-ink">
                                {filed.file.name}<ExternalLink className="size-3 shrink-0" />
                              </a>
                              {here ? (
                                <>
                                  {here.source_drive_id === filed.file.id ? <Badge tone="green">linked</Badge>
                                    : <Button size="sm" variant="outline" disabled={busy === filed.file.id} onClick={() => link(here, filed)}>{here.source_drive_id ? "Link this revision" : "Link PDF"}</Button>}
                                  <Link to="/invoices/$id" params={{ id: here.id }} className="text-[13px] text-accent hover:underline">Open</Link>
                                </>
                              ) : project ? (
                                <Button size="sm" disabled={busy === filed.file.id} onClick={() => open(project, filed)}>{busy === filed.file.id ? "Reading…" : "Import"}</Button>
                              ) : <span className="text-[12.5px] text-ink-faint">Convert its proposal to a project first</span>}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {review && <ImportInvoice {...review} taken={k.invoices.map((i) => i.number).filter((n): n is string => !!n)} methods={(settings?.income_payment_methods as string[] | undefined) ?? []}
        onClose={() => setReview(null)} onDone={() => { setReview(null); refresh(); }} />}
    </div>
  );
}

function ImportInvoice({ project, filed, file, read, methods, taken, onClose, onDone }: {
  project: PortalProject; filed: FiledInvoice; file: File; read: ReadInvoice; methods: string[]; taken: string[];
  onClose: () => void; onDone: () => void;
}) {
  const navigate = useNavigate();
  const [url] = React.useState(() => URL.createObjectURL(file));
  React.useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const issue0 = read.date || localISO();
  const [number, setNumber] = React.useState(read.number);
  const [issue, setIssue] = React.useState(issue0);
  const [due, setDue] = React.useState(addDays(issue0, 30));
  const [total, setTotal] = React.useState(read.total != null && read.currency === "CAD" ? String(read.total) : "");
  const [status, setStatus] = React.useState<"sent" | "paid">("sent");
  const [paid, setPaid] = React.useState(localISO());
  const [method, setMethod] = React.useState(methods[0] ?? "");
  const [useIncome, setUseIncome] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const amount = Number(total.replace(/[^\d.-]/g, "")) || 0;

  const income = useQuery({
    queryKey: ["income", "unlinked", project.id, amount],
    queryFn: () => unlinkedIncomeFor(project.id, amount),
    enabled: status === "paid" && amount > 0,
  });
  const match = income.data?.[0];

  const go = async () => {
    if (!number.trim() || !amount) return toast.error("The invoice needs a number and a total.");
    if (taken.includes(number.trim())) return toast.error(`${number.trim()} is already in the portal. Use Link PDF on it instead.`);
    setBusy(true);
    try {
      const inv = await importDriveInvoice({
        project, number: number.trim(), issue_date: issue, due_date: due || null, total: amount, status,
        paid_date: status === "paid" ? (match && useIncome ? match.income_date : paid) : null,
        payment_method: status === "paid" ? (match && useIncome ? match.payment_method : method) || null : null,
        link: linkOf(filed.file), incomeId: status === "paid" && match && useIncome ? match.id : null,
      });
      toast.success(`${inv.number} imported`);
      onDone();
      navigate({ to: "/invoices/$id", params: { id: inv.id } });
    } catch (e) { toast.error((e as Error).message); setBusy(false); }
  };

  return (
    <Dialog open wide onOpenChange={(v) => !v && onClose()} title={`Import ${filed.number}`}
      description={`${project.number} · ${project.title}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={go} disabled={busy}>{busy ? "Importing…" : "Import invoice"}</Button></>}>
      <div className="grid gap-5 md:grid-cols-[1fr_300px]">
        <iframe src={url} title={filed.file.name} className="h-[60vh] w-full rounded-md border border-border bg-bg-alt" />
        <div className="space-y-3">
          {read.warnings.map((w) => <div key={w} className="rounded-md bg-warn-bg px-3 py-2 text-[13px] text-warn">{w}</div>)}
          <Field label="Invoice number"><Input value={number} onChange={(e) => setNumber(e.target.value)} /></Field>
          {taken.includes(number.trim()) && <p className="-mt-2 text-[12.5px] text-bad">{number.trim()} is already in the portal.</p>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Issued"><Input type="date" value={issue} onChange={(e) => setIssue(e.target.value)} /></Field>
            <Field label="Due"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
          </div>
          <Field label={read.currency === "PHP" && read.total != null ? `Total (CAD) — the PDF says Php ${read.total.toLocaleString()}` : "Total"}>
            <Input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="0.00" />
          </Field>
          <Segmented value={status} onChange={setStatus} options={[{ value: "sent", label: "Unpaid" }, { value: "paid", label: "Paid" }]} />
          {status === "paid" && (match ? (
            <div className="rounded-md border border-border px-3 py-2 text-[13px]">
              <Checkbox checked={useIncome} onChange={(e) => setUseIncome(e.target.checked)}
                label={`Use the income already entered: ${money(match.amount)} on ${date(match.income_date)}${match.description ? ` (${match.description})` : ""}`} />
            </div>
          ) : null)}
          {status === "paid" && !(match && useIncome) && (
            <>
              <Field label="Paid on"><Input type="date" value={paid} onChange={(e) => setPaid(e.target.value)} /></Field>
              {methods.length > 0 && <Field label="Paid by"><Select value={method} onChange={(e) => setMethod(e.target.value)}>{methods.map((m) => <option key={m}>{m}</option>)}</Select></Field>}
              <p className="text-[12.5px] text-ink-faint">Adds the payment to Income & Expenses.</p>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
