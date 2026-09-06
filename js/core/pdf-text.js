// Text extraction from a PDF, using the vendored pdf.js.
//
// Returns a light structural model — lines with their font size and position — rather
// than a flat string, because the proposal parser leans on font size to tell headings
// from body copy.
//
//   const doc = await extractPdf(file);
//   doc.pages[0].lines  ->  [{ text, size, x, y, caps, font }]
//   doc.text            ->  the whole document as plain text
//   doc.bodySize        ->  the dominant (body copy) font size

import * as pdfjs from "../../vendor/pdf.min.mjs";

pdfjs.GlobalWorkerOptions.workerSrc =
  new URL("../../vendor/pdf.worker.min.mjs", import.meta.url).href;

const MAX_PAGES = 40;

export async function extractPdf(file) {
  const buf = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const task = pdfjs.getDocument({
    data: new Uint8Array(buf),
    isEvalSupported: false,
    disableFontFace: true,
  });
  const pdf = await task.promise;

  const pages = [];
  const count = Math.min(pdf.numPages, MAX_PAGES);
  for (let i = 1; i <= count; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push({ index: i, lines: toLines(content.items) });
    page.cleanup();
  }
  pdf.destroy();

  stripRunningHeaders(pages);

  const all = pages.flatMap((p) => p.lines);
  return {
    pages,
    lines: all,
    bodySize: dominantSize(all),
    text: pages.map((p) => p.lines.map((l) => l.text).join("\n")).join("\n\n"),
    pageCount: pdf.numPages,
    truncated: pdf.numPages > count,
  };
}

/* ---- item -> line assembly ---- */

// pdf.js emits one item per run of same-styled glyphs. Items sharing a baseline (within
// half a line height) belong to the same visual line.
function toLines(items) {
  const kept = items.filter((it) => it.str != null && it.str.trim() !== "");
  const rows = [];

  for (const it of kept) {
    const size = it.height || Math.abs(it.transform?.[3]) || 10;
    const x = it.transform?.[4] ?? 0;
    const y = it.transform?.[5] ?? 0;
    const tol = Math.max(2, size * 0.5);
    const row = rows.find((r) => Math.abs(r.y - y) <= tol);
    if (row) {
      row.items.push({ str: it.str, x, size, w: it.width || 0, font: it.fontName });
      row.y = (row.y * (row.items.length - 1) + y) / row.items.length;
    } else {
      rows.push({ y, items: [{ str: it.str, x, size, w: it.width || 0, font: it.fontName }] });
    }
  }

  rows.sort((a, b) => b.y - a.y); // PDF origin is bottom-left: high y = top of page

  return rows.map((r) => {
    r.items.sort((a, b) => a.x - b.x);
    let text = "";
    let prevEnd = null;
    for (const it of r.items) {
      if (prevEnd != null) {
        const gap = it.x - prevEnd;
        // A gap wider than a space usually means a column break or tab stop.
        if (gap > it.size * 0.22 && !/\s$/.test(text) && !/^\s/.test(it.str)) text += " ";
        if (gap > it.size * 1.6) text += "\t";
      }
      text += it.str;
      prevEnd = it.x + it.w;
    }
    text = text.replace(/[ \t]+\t/g, "\t").replace(/\s+$/, "").replace(/^\s+/, "");
    const size = Math.max(...r.items.map((i) => i.size));
    const letters = text.replace(/[^A-Za-z]/g, "");
    return {
      text,
      size: Math.round(size * 10) / 10,
      x: r.items[0].x,
      y: r.y,
      font: r.items[0].font,
      caps: letters.length >= 3 && letters === letters.toUpperCase(),
    };
  }).filter((l) => l.text !== "");
}

// The most common font size, weighted by how much text is set in it — i.e. body copy.
function dominantSize(lines) {
  const weight = new Map();
  for (const l of lines) {
    weight.set(l.size, (weight.get(l.size) || 0) + l.text.length);
  }
  let best = 10;
  let most = -1;
  for (const [size, w] of weight) if (w > most) { most = w; best = size; }
  return best;
}

// Drop repeated page furniture (running headers/footers, page numbers) so they don't
// turn into spurious headings or fee lines.
function stripRunningHeaders(pages) {
  if (pages.length < 3) return;
  const seen = new Map();
  for (const p of pages) {
    const uniq = new Set(p.lines.map((l) => norm(l.text)));
    for (const t of uniq) seen.set(t, (seen.get(t) || 0) + 1);
  }
  const threshold = Math.max(3, Math.ceil(pages.length * 0.6));
  const repeated = new Set([...seen].filter(([t, n]) => t && n >= threshold).map(([t]) => t));
  for (const p of pages) {
    p.lines = p.lines.filter((l) => {
      const t = norm(l.text);
      if (repeated.has(t)) return false;
      if (/^(page\s*)?\d{1,3}(\s*(of|\/)\s*\d{1,3})?$/i.test(l.text.trim())) return false;
      return true;
    });
  }
}

const norm = (s) => s.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
