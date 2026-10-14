import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, FolderSearch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/data-table";
import { supabase } from "@/lib/supabase";
import { legacy } from "@/lib/utils";
import { settingsQuery } from "@/lib/data/settings";
import {
  drive, extractPdf, fileFromDrive, parseProposal, scanProjects, scanProposals,
  type ParsedProposal, type ProjectFolder, type ProposalFolder,
} from "@/lib/pdf-import";
import { ImportReview, importClientsQuery } from "./ImportReview";

const FROM_KEY = "tipolo.driveImport.from";

/* 05_Proposals and 06_Projects are named by job number, so the portal can line its own
   records up against the folders and show what's missing. Nothing in Drive is changed. */
export function FromDrive() {
  const navigate = useNavigate();
  const { data: settings, isLoading } = useQuery(settingsQuery);
  const { data: clients = [] } = useQuery(importClientsQuery);
  const known = useQuery({
    queryKey: ["drive-import", "known"],
    queryFn: async () => {
      const [pr, pj, inv] = await Promise.all([
        supabase.from("proposals").select("id, number, title"),
        supabase.from("projects").select("id, number, title"),
        supabase.from("invoices").select("id, number"),
      ]);
      return { proposals: pr.data ?? [], projects: pj.data ?? [], invoices: inv.data ?? [] };
    },
  });

  const [from, setFrom] = React.useState(() => { try { return localStorage.getItem(FROM_KEY) || "26000"; } catch { return "26000"; } });
  const [scan, setScan] = React.useState<{ proposals: ProposalFolder[]; projects: ProjectFolder[] } | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [reading, setReading] = React.useState<string | null>(null);
  const [review, setReview] = React.useState<{ entry: ProposalFolder; file: File; parsed: ParsedProposal; pages: number } | null>(null);

  React.useEffect(() => { drive.loadGoogle().catch(() => {}); }, []);

  const proposalsFolder = settings?.drive_proposals_folder_id ?? null;
  const projectsFolder = settings?.drive_projects_folder_id ?? null;

  const run = () => {
    // Google's popup has to open inside the click, before anything is awaited.
    const go = drive.connected() ? Promise.resolve("") : drive.connect();
    setScanning(true);
    go.then(async () => {
      const [proposals, projects] = await Promise.all([
        proposalsFolder ? scanProposals(proposalsFolder, { from }) : [],
        projectsFolder ? scanProjects(projectsFolder, { from }) : [],
      ]);
      setScan({ proposals, projects });
    }).catch((e) => toast.error((e as Error).message)).finally(() => setScanning(false));
  };

  const open = async (entry: ProposalFolder) => {
    if (!entry.pdf) return;
    setReading(entry.number);
    try {
      const file = await fileFromDrive(entry.pdf);
      const doc = await extractPdf(file);
      const parsed = parseProposal(doc, { clients, businessName: settings?.business_name ?? "" });
      parsed.title ||= entry.title;
      parsed.project_scope ||= entry.scope ?? "other";
      if (doc.text.trim().length < 200) parsed.warnings.unshift("This PDF has almost no text — it's probably a scan, so the fees couldn't be read. Type them in.");
      setReview({ entry, file, parsed, pages: doc.pageCount });
    } catch (e) { toast.error(`Couldn't read ${entry.pdf.name}: ${(e as Error).message}`); }
    finally { setReading(null); }
  };

  const k = known.data ?? { proposals: [], projects: [], invoices: [] };
  const hasProposal = (n: string) => k.proposals.find((p) => p.number === n);
  const hasProject = (n: string) => k.projects.find((p) => p.number === n);
  const hasInvoice = (n: string | null) => n && k.invoices.find((i) => i.number === n);

  const setup = !drive.configured()
    ? "Google Drive isn't switched on: it needs the Google client ID in config.js (SETUP.md → Google Drive)."
    : !isLoading && !proposalsFolder && !projectsFolder
      ? "Point the portal at your folders first: Settings → Google Drive takes a link to 05_Proposals and 06_Projects."
      : "";

  return (
    <div className="space-y-5">
      <div>
        <Link to="/proposals" className="inline-flex items-center gap-1 text-[13px] text-ink-faint hover:text-ink"><ArrowLeft className="size-3.5" />Proposals</Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl">Import from Google Drive</h1>
            <p className="mt-1 text-sm text-ink-soft">Lines 05_Proposals and 06_Projects up against the portal by job number. Nothing in Drive is changed.</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[13px] text-ink-soft">From job number</label>
            <Input className="w-24" value={from} onChange={(e) => { setFrom(e.target.value); try { localStorage.setItem(FROM_KEY, e.target.value); } catch { /* */ } }} />
            <Button onClick={run} disabled={!!setup || scanning}><FolderSearch />{scanning ? "Reading Drive…" : "Scan Drive"}</Button>
          </div>
        </div>
      </div>

      {setup ? (
        <EmptyState title="Not set up yet">{setup} {!drive.configured() ? null : <a className="text-accent underline" href={legacy("/settings")} onClick={() => { try { localStorage.setItem("tipolo.settings.tab", "drive"); } catch { /* */ } }}>Open Settings</a>}</EmptyState>
      ) : !scan ? (
        <EmptyState title="Ready to scan">Reads the folders numbered {from} and up.{drive.connected() ? "" : " You'll be asked to connect Google first."}</EmptyState>
      ) : (
        <>
          <section className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="text-[15px]">Proposals <span className="text-ink-faint">· 05_Proposals</span></h2>
              <span className="text-sm text-ink-faint">{scan.proposals.filter((p) => !hasProposal(p.number)).length} not in the portal</span>
            </div>
            {scan.proposals.length === 0 ? <p className="px-5 pb-5 text-sm text-ink-faint">Nothing numbered {from} or higher.</p> : (
              <ul className="divide-y divide-border/70 border-t border-border/70">
                {scan.proposals.map((p) => {
                  const here = hasProposal(p.number);
                  return (
                    <li key={p.folder.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                      <span className="w-14 tabular-nums text-ink-faint">{p.number}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{p.title}</div>
                        <div className="truncate text-[12.5px] text-ink-faint">{p.pdf ? p.pdf.name : "No proposal PDF in this folder"}</div>
                      </div>
                      {here ? <Link to="/proposals/$id" params={{ id: here.id }} className="text-[13px] text-accent hover:underline">{here.title}</Link>
                        : p.pdf ? <Button size="sm" onClick={() => open(p)} disabled={reading === p.number}>{reading === p.number ? "Reading…" : "Import"}</Button>
                        : <Badge tone="red">no PDF</Badge>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card">
            <div className="px-5 py-4">
              <h2 className="text-[15px]">Projects <span className="text-ink-faint">· 06_Projects</span></h2>
              <p className="mt-1 text-[13px] text-ink-soft">A project is created by accepting its proposal and converting it, so these are shown to check against, not imported.</p>
            </div>
            {scan.projects.length === 0 ? <p className="px-5 pb-5 text-sm text-ink-faint">Nothing numbered {from} or higher.</p> : (
              <ul className="divide-y divide-border/70 border-t border-border/70">
                {scan.projects.map((p) => {
                  const here = hasProject(p.number);
                  return (
                    <li key={p.folder.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                      <span className="w-14 tabular-nums text-ink-faint">{p.number}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 truncate">{p.title}{p.scope && <Badge>{p.scope}</Badge>}</div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {p.invoices.map((inv) => (
                            <Badge key={inv.file.id} tone={hasInvoice(inv.number) ? "green" : "amber"}>
                              {inv.number ?? inv.file.name} {hasInvoice(inv.number) ? "in portal" : "not in portal"}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      {here ? <Link to="/projects/$id" params={{ id: here.id }} className="text-[13px] text-accent hover:underline">{here.title}</Link> : <Badge tone="amber">not yet</Badge>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}

      {review && (
        <Dialog open wide onOpenChange={(v) => !v && setReview(null)} title={`Import ${review.entry.number}`}>
          <ImportReview file={review.file} parsed={review.parsed} pageCount={review.pages} number={review.entry.number}
            onCreated={(p) => { setReview(null); known.refetch(); navigate({ to: "/proposals/$id", params: { id: p.id } }); }} />
        </Dialog>
      )}
    </div>
  );
}
