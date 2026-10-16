// Finding invoices filed in Google Drive and reading what's on them.
//
// Each project folder in 06_Projects keeps its invoices in an Invoice(s) folder (usually
// 00_Administrative/Invoice), named with the invoice number: "Invoice_26102-001.pdf",
// "23-05-06 Rainbow Park Irrigation Drawings - 2251-002.pdf". A revised invoice carries
// r1, r2… after the number, and the latest revision is the one that counts.

import { drive } from "@/lib/books";
import { extractPdf, type PdfDoc } from "@/lib/pdf-import";

type DriveFile = { id: string; name: string; mimeType: string; parents?: string[]; webViewLink?: string };
const FOLDER = "application/vnd.google-apps.folder";
const isPdf = (f: DriveFile) => /\.pdf$/i.test(f.name);

// "26102_M ConnectLA Website" → { number, scope, title }
export function readFolderName(name: string) {
  const m = /^(\d{4,5})[\s_-]*([ML])?[\s_-]+(.*)$/.exec(name.trim());
  if (!m) return null;
  return { number: m[1], scope: m[2] === "M" ? "multimedia" : m[2] === "L" ? "landscape" : null, title: m[3].trim() };
}

// "…2251-002r2.pdf" → { number: "2251-002", rev: 2 }
export function readInvoiceName(name: string) {
  const m = /(\d{4,5}-\d{2,3})(?:\s*r(\d+))?/i.exec(name);
  return m ? { number: m[1], rev: m[2] ? Number(m[2]) : 0 } : null;
}

export type FiledInvoice = { number: string; rev: number; file: DriveFile };
export type ProjectFolder = { number: string; title: string; folder: DriveFile; invoices: FiledInvoice[] };

/* Every PDF inside a folder whose name says invoice, plus any PDF named as an invoice,
   up to two levels into the project folder. One per number: the latest revision, and
   the copy in an Invoice folder over one sent out from Project OUT. */
async function invoicesIn(folderId: string) {
  const found: (FiledInvoice & { inInvoiceFolder: boolean })[] = [];
  const walk = async (id: string, depth: number, inInvoiceFolder: boolean) => {
    const kids = await drive.listChildren(id);
    for (const f of kids) {
      if (f.mimeType === FOLDER) {
        if (depth < 2) await walk(f.id, depth + 1, inInvoiceFolder || /^invoices?$/i.test(f.name.trim()) || /invoice/i.test(f.name));
        continue;
      }
      if (!isPdf(f) || !(inInvoiceFolder || /invoice|^inv[-_ ]/i.test(f.name))) continue;
      const n = readInvoiceName(f.name);
      if (n) found.push({ ...n, file: f, inInvoiceFolder: /invoice/i.test(f.name) || inInvoiceFolder });
    }
  };
  await walk(folderId, 0, false);
  const best = new Map<string, FiledInvoice & { inInvoiceFolder: boolean }>();
  for (const f of found) {
    const cur = best.get(f.number);
    if (!cur || f.rev > cur.rev) best.set(f.number, f);
  }
  return [...best.values()].sort((a, b) => a.number.localeCompare(b.number)).map(({ number, rev, file }) => ({ number, rev, file }));
}

export async function scanProjectInvoices(projectsFolderId: string, { from }: { from?: string } = {}): Promise<ProjectFolder[]> {
  const kids = await drive.listChildren(projectsFolderId, { folders: true });
  const out: ProjectFolder[] = [];
  for (const folder of kids) {
    const p = readFolderName(folder.name);
    if (!p || (from && p.number < from)) continue;
    out.push({ number: p.number, title: p.title, folder, invoices: await invoicesIn(folder.id) });
  }
  return out.sort((a, b) => b.number.localeCompare(a.number));
}

/* ---------------- reading an invoice PDF ---------------- */

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const toISO = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const money = (s: string) => Number(s.replace(/[^\d.-]/g, "")) || 0;

export type ReadInvoice = { number: string; date: string; total: number | null; currency: "CAD" | "PHP"; warnings: string[] };

export async function readInvoicePdf(file: File, fallbackNumber: string): Promise<ReadInvoice> {
  const doc: PdfDoc = await extractPdf(file);
  // pdf text sometimes splits a word ("Dat e", "Proje ct"); squeeze spaces out of labels
  const text = doc.text.replace(/\b([A-Z][a-z]{0,5}) ([a-z]{1,4})\b/g, "$1$2");
  const warnings: string[] = [];

  const number = /No\.?\s+(\d{4,5}-\d{2,3})/.exec(text)?.[1]
    ?? readInvoiceName(file.name)?.number
    ?? /Project\s+(\d{4,5}-\d{2,3})/.exec(text)?.[1]                // the 2021 layout: "Project 2102-01"
    ?? fallbackNumber;

  let date = "";
  const dm = /Date\s+([A-Z][a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(text);
  if (dm && MONTHS[dm[1].slice(0, 3).toLowerCase()]) date = toISO(+dm[3], MONTHS[dm[1].slice(0, 3).toLowerCase()], +dm[2]);
  if (!date) {
    const fm = /^(\d{2})-(\d{2})-(\d{2})\b/.exec(file.name);          // "23-05-06 …" filing date
    if (fm) date = toISO(2000 + +fm[1], +fm[2], +fm[3]);
  }

  // the last amount after TOTAL DUE, else after Subtotal
  let total: number | null = null;
  let totalText = "";
  for (const label of [/TOTAL\s+DUE/i, /\bTOTAL\b(?!\s+DUE)/, /Subtotal/i]) {
    const re = new RegExp(label.source + "[^\\n$\\d-]*?((?:Php\\s*|\\$)?-?[\\d,]+\\.\\d{2})", "g" + (label.flags.includes("i") ? "i" : ""));
    const hits = [...text.matchAll(re)];
    if (hits.length) { totalText = hits[hits.length - 1][1]; total = money(totalText); break; }
  }
  // the total's own currency: one "Php 0.00" line elsewhere doesn't make it a peso invoice
  const currency = /Php/i.test(totalText) || (!totalText && /\bPhp\s*[\d,]+\.\d\d/.test(doc.text)) ? "PHP" : "CAD";

  if (doc.text.trim().length < 100) warnings.push("This PDF has almost no text, so nothing could be read from it.");
  if (total == null) warnings.push("The total couldn't be read — the invoice's table may be a picture. Type it in from the PDF.");
  if (currency === "PHP") warnings.push("This invoice is in Philippine pesos. The portal records amounts as dollars, so enter the CAD amount you were paid.");
  if (!date) warnings.push("The invoice date couldn't be read.");
  if (fallbackNumber && number !== fallbackNumber) warnings.push(`The PDF says ${number}, but the file is named ${fallbackNumber}. Check which is right.`);
  return { number, date, total, currency, warnings };
}
