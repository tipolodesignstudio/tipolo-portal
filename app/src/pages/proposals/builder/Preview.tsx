import * as React from "react";
import { FileUp } from "lucide-react";
import { toast } from "sonner";
import { Segmented, Select } from "@/components/ui/fields";
import { Button } from "@/components/ui/button";
import { proposalDocHtml } from "@/lib/doc";
import { sourceName, sourceUrl } from "@/lib/data/proposals";

const ZOOM_KEY = "tipolo.builder.zoom";
const PAGE_W = 8.5 * 96;

/* The preview is not a mock-up: it's proposalDocHtml(), the same markup the printer
   gets, laid out by the same document.css into real 8.5x11 sheets. If it looks right
   here it prints right. */
export function Preview({ doc, settings, sourcePath, pdfOnly, onAttach }: {
  doc: unknown; settings: unknown; sourcePath: string | null; pdfOnly: boolean;
  onAttach: (f: File) => Promise<void>;
}) {
  const pane = React.useRef<HTMLDivElement>(null);
  const paper = React.useRef<HTMLDivElement>(null);
  const [mode, setMode] = React.useState<"doc" | "pdf">(pdfOnly ? "pdf" : "doc");
  const [zoomMode, setZoomMode] = React.useState(() => { try { return localStorage.getItem(ZOOM_KEY) || "fit"; } catch { return "fit"; } });
  const [zoom, setZoom] = React.useState(1);
  const [pages, setPages] = React.useState("");

  // Repainting the sheets on every keystroke makes typing stutter; a beat behind is
  // imperceptible.
  const [html, setHtml] = React.useState("");
  React.useEffect(() => {
    if (mode !== "doc") return;
    const t = setTimeout(() => {
      try { setHtml(proposalDocHtml(doc, settings)); }
      catch (e) { setHtml(`<p style="padding:24px;color:#7A3F1D">Couldn't draw the preview: ${(e as Error).message}</p>`); }
    }, 160);
    return () => clearTimeout(t);
  }, [doc, settings, mode]);

  const fit = React.useCallback(() => {
    if (!pane.current || !paper.current) return;
    const widest = paper.current.querySelector(".sheet-page.landscape") ? 11 * 96 : PAGE_W;
    setZoom(zoomMode === "fit" ? Math.min(1, Math.max(0.3, (pane.current.clientWidth - 48) / widest)) : Number(zoomMode) || 1);
  }, [zoomMode]);

  React.useLayoutEffect(() => {
    if (!paper.current) return;
    const n = paper.current.querySelectorAll(".sheet-page").length;
    const land = paper.current.querySelectorAll(".sheet-page.landscape").length;
    setPages(n ? `${n} page${n === 1 ? "" : "s"}${land ? ` · ${land} landscape` : ""}` : "");
    fit();
  }, [html, fit]);

  React.useEffect(() => {
    if (!pane.current) return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(pane.current);
    return () => ro.disconnect();
  }, [fit]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#E9E5DA]">
      <div className="flex items-center gap-3 border-b border-border bg-bg-alt/80 px-4 py-2">
        {pdfOnly ? <span className="text-[12px] font-medium uppercase tracking-wide text-ink-faint">Original PDF</span>
          : <Segmented value={mode} onChange={setMode} options={[{ value: "doc", label: "Document" }, { value: "pdf", label: "Original PDF" }]} />}
        {mode === "doc" && <>
          <Select className="h-8 w-24 text-[13px]" value={zoomMode}
            onChange={(e) => { setZoomMode(e.target.value); try { localStorage.setItem(ZOOM_KEY, e.target.value); } catch { /* */ } }}>
            <option value="fit">Fit</option><option value="0.5">50%</option><option value="0.75">75%</option><option value="1">100%</option>
          </Select>
          <span className="ml-auto text-[12px] text-ink-faint">{pages}</span>
        </>}
      </div>
      <div ref={pane} className="min-h-0 flex-1 overflow-auto">
        {mode === "doc" ? (
          <div className="px-4 py-6">
            {/* `zoom`, not transform, so the scroll area measures the scaled size */}
            <div ref={paper} style={{ zoom }} className="mx-auto w-fit [&_.sheet-page]:mx-auto [&_.sheet-page]:shadow-[0_1px_3px_rgba(36,42,32,.16),0_10px_34px_rgba(36,42,32,.13)] [&_.sheet-page+.sheet-page]:mt-5"
                 dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        ) : <SourcePdf path={sourcePath} onAttach={onAttach} />}
      </div>
    </div>
  );
}

/* The PDF this proposal came from, in the browser's own viewer — it already scrolls,
   zooms and searches, and this is the document exactly as it was sent. */
function SourcePdf({ path, onAttach }: { path: string | null; onAttach: (f: File) => Promise<void> }) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!path) return;
    let live = true;
    sourceUrl(path).then((u) => live && setUrl(u)).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [path]);

  const attach = (
    <label className="mt-3 inline-block">
      <input type="file" accept="application/pdf,.pdf" hidden onChange={async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setBusy(true);
        try { await onAttach(f); toast.success("PDF attached"); }
        catch (err) { toast.error((err as Error).message); }
        finally { setBusy(false); }
      }} />
      <Button asChild variant="outline" size="sm"><span><FileUp />{busy ? "Uploading…" : "Attach a PDF"}</span></Button>
    </label>
  );

  if (!path || error) {
    return (
      <div className="mx-auto max-w-sm px-6 py-20 text-center">
        <div className="font-heading text-lg">{error ? "Couldn't open the PDF" : "No PDF attached"}</div>
        <p className="mt-1 text-sm text-ink-soft">{error || "Attach one and it shows here — and follows the proposal into its project."}</p>
        {attach}
      </div>
    );
  }
  if (!url) return <div className="p-10 text-center text-sm text-ink-faint">Opening the PDF…</div>;
  return <iframe src={`${url}#view=FitH`} title={sourceName(path) || "Original PDF"} className="h-full w-full border-0" />;
}
