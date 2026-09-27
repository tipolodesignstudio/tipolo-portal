// Reading the studio's own filing in Google Drive.
//
// 05_Proposals and 06_Projects are named by job number, which is the whole trick:
// "26102 Connect LA Website" and "26102_M ConnectLA Website" are the same job, and the
// portal already knows that number. So a scan is: list the folders, pull the number off
// each name, and say which ones the portal has never seen.
//
// This only reads. Importing is the caller's business (js/views/drive-import.js).

import * as drive from "./gdrive.js";

const FOLDER = "application/vnd.google-apps.folder";
const isFolder = (f) => f.mimeType === FOLDER;
const isPdf = (f) => /\.pdf$/i.test(f.name);

// "26102 Connect LA Website" / "26102_M ConnectLA Website" / "22051_L Bayside"
// -> { number: "26102", scope: "multimedia"|"landscape"|null, title: "Connect LA Website" }
export function readFolderName(name) {
  const m = /^(\d{4,5})[\s_-]*([ML])?[\s_-]+(.*)$/.exec(String(name).trim());
  if (!m) return null;
  return {
    number: m[1],
    scope: m[2] === "M" ? "multimedia" : m[2] === "L" ? "landscape" : null,
    title: m[3].trim(),
  };
}

// "Invoice_26102-001.pdf" / "INV-26102-001.docx" / "Invoice 2251-002"
export const readInvoiceNumber = (name) =>
  (/(\d{4,5}-\d{2,3})/.exec(String(name)) || [])[1] || null;

/* The proposal to attach, out of everything in the folder. A signed or executed copy is
   the one that was agreed, so it wins; "GIS Information.pdf" and the deck alongside it
   are not proposals at all. */
export function pickProposalPdf(files) {
  const pdfs = files.filter(isPdf);
  const score = (f) => {
    const n = f.name.toLowerCase();
    if (/(gis|information|site|survey|photo)/.test(n) && !/proposal|agreement/.test(n)) return -1;
    let s = 0;
    if (/proposal|agreement/.test(n)) s += 4;
    if (/executed/.test(n)) s += 3;
    else if (/signed/.test(n)) s += 2;
    if (/presentation|deck|slides/.test(n)) s -= 3;
    return s;
  };
  return pdfs.map((f) => ({ f, s: score(f) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s || a.f.name.localeCompare(b.f.name))[0]?.f || null;
}

/* ---------------- scans ---------------- */

// [{ number, title, folder, pdf, pdfs, subfolders }] — newest job number first
export async function scanProposals(folderId, { from } = {}) {
  const kids = await drive.listChildren(folderId);
  const out = [];
  for (const folder of kids.filter(isFolder)) {
    const parsed = readFolderName(folder.name);
    if (!parsed) continue;
    if (from && parsed.number < from) continue;
    const files = await drive.listChildren(folder.id);
    out.push({
      ...parsed, folder,
      pdf: pickProposalPdf(files),
      pdfs: files.filter(isPdf),
      subfolders: files.filter(isFolder),
    });
  }
  return out.sort((a, b) => b.number.localeCompare(a.number));
}

// [{ number, scope, title, folder, invoices: [{ file, number }] }]
export async function scanProjects(folderId, { from } = {}) {
  const kids = await drive.listChildren(folderId);
  const out = [];
  for (const folder of kids.filter(isFolder)) {
    const parsed = readFolderName(folder.name);
    if (!parsed) continue;
    if (from && parsed.number < from) continue;
    out.push({ ...parsed, folder, invoices: await findInvoices(folder.id) });
  }
  return out.sort((a, b) => b.number.localeCompare(a.number));
}

// Invoices hide a couple of levels down (00_Administrative/Invoice/…), so this walks a
// little way in rather than guessing one fixed path.
async function findInvoices(folderId, depth = 2) {
  const found = [];
  const seen = new Set();
  const walk = async (id, left) => {
    if (seen.has(id)) return;
    seen.add(id);
    const kids = await drive.listChildren(id);
    for (const f of kids) {
      if (isPdf(f) && /invoice|^inv[-_ ]/i.test(f.name)) {
        found.push({ file: f, number: readInvoiceNumber(f.name) });
      }
    }
    if (left <= 0) return;
    for (const sub of kids.filter(isFolder)) {
      if (/invoice|admin/i.test(sub.name) || left > 1) await walk(sub.id, left - 1);
    }
  };
  await walk(folderId, depth);
  return found;
}

// What the portal already holds, by number, so a scan can say "already here".
export function markKnown(rows, known) {
  const have = new Map(known.map((k) => [String(k.number || ""), k]));
  return rows.map((r) => ({ ...r, existing: have.get(r.number) || null }));
}

// Drive hands back a file; the importer wants something that behaves like a picked file.
export async function fileFromDrive(meta) {
  const buf = await drive.download(meta.id);
  return new File([buf], meta.name, { type: "application/pdf" });
}
