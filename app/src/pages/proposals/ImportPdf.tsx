import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, FileUp, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { settingsQuery } from "@/lib/data/settings";
import { extractPdf, parseProposal, type ParsedProposal } from "@/lib/pdf-import";
import { ImportReview, importClientsQuery } from "./ImportReview";

type Read = { file: File; parsed: ParsedProposal; pages: number };

/* Import a finished proposal from a PDF. The PDF becomes the proposal; the reader only
   fills in a form — client, title, scope, fees — for you to check before anything is
   created. It all happens in the browser; the PDF isn't sent anywhere to be read. */
export function ImportPdf() {
  const navigate = useNavigate();
  const { data: clients = [] } = useQuery(importClientsQuery);
  const { data: settings } = useQuery(settingsQuery);
  const [read, setRead] = React.useState<Read | null>(null);
  const [busy, setBusy] = React.useState("");
  const [error, setError] = React.useState("");
  const [over, setOver] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);

  async function start(file: File) {
    setError("");
    if (!/pdf/i.test(file.type) && !/\.pdf$/i.test(file.name)) return setError("That doesn't look like a PDF.");
    if (file.size > 25_000_000) return setError("That PDF is over 25 MB — too large to read here.");
    setBusy(`Reading ${file.name}…`);
    try {
      const doc = await extractPdf(file);
      const parsed = parseProposal(doc, { clients, businessName: settings?.business_name ?? "" });
      if (doc.text.trim().length < 200) {
        parsed.warnings.unshift("This PDF has almost no text — it's probably a scan, so there was nothing to read. Fill the fields in by hand, or re-export it with text.");
      }
      setRead({ file, parsed, pages: doc.pageCount });
    } catch (e) {
      setError(`Couldn't open that PDF: ${(e as Error).message}`);
    } finally { setBusy(""); }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link to="/proposals" className="inline-flex items-center gap-1 text-[13px] text-ink-faint hover:text-ink"><ArrowLeft className="size-3.5" />Proposals</Link>
        <h1 className="mt-2 text-3xl">Import a proposal</h1>
        <p className="mt-1 text-sm text-ink-soft">The PDF becomes the proposal. Only the client and the fees come into the portal — check them over before creating it.</p>
      </div>

      {error && <div className="rounded-md bg-bad-bg px-4 py-3 text-sm text-bad">{error}</div>}

      {read ? (
        <ImportReview key={read.file.name + read.file.size} file={read.file} parsed={read.parsed} pageCount={read.pages}
          onCreated={(p) => navigate({ to: "/proposals/$id", params: { id: p.id } })}
          footerExtra={<Button variant="ghost" className="mr-auto" onClick={() => setRead(null)}><RotateCcw />Choose another PDF</Button>} />
      ) : (
        <button type="button" onClick={() => input.current?.click()} disabled={!!busy}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) start(f); }}
          className={cn("flex w-full flex-col items-center rounded-lg border-2 border-dashed px-6 py-16 text-center transition-colors",
            over ? "border-accent bg-accent/5" : "border-border bg-card hover:bg-bg-alt/50")}>
          <FileUp className="size-8 text-ink-faint" />
          <div className="mt-3 font-heading text-lg">{busy || "Drop a finished proposal PDF here"}</div>
          <div className="mt-1 text-sm text-ink-soft">…or click to choose one. Nothing is saved until you've checked it.</div>
          <div className="mt-4 text-[12px] text-ink-faint">Needs a PDF with selectable text (exported from InDesign, Word or Pages). A scan comes back blank.</div>
        </button>
      )}
      <input ref={input} type="file" accept="application/pdf,.pdf" hidden
             onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) start(f); }} />
    </div>
  );
}
