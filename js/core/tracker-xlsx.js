// The Income & Expense Tracker workbook, read and written in place.
//
// Writing never builds a workbook from scratch: it takes the current file as the
// template and swaps only the data rows. Fonts, column widths, dropdowns, the Summary
// formulas and the "How to use" notes all stay exactly as they were in Excel. Columns
// are found by their header text, so moving a column in Excel doesn't break the sync.
//
// Sheets and headers the portal works with:
//   Expenses     Date | Description | Client / Project | Amount | Category | Payment Method
//   Income       Date | Client / Project | Description | Amount | Payment Method | Invoice #
//   Fixed Costs  Cost Item | (category) | Annual Cost | Notes, down to the SUM row
//   Summary      formulas only — the portal fills in their cached values

import { unzip, zip, text } from "./zip.js";

export const SHEETS = { expenses: "Expenses", income: "Income", fixed: "Fixed Costs", summary: "Summary" };

/* ---------------- small XML helpers ---------------- */

const unesc = (s) => s.replace(/&(lt|gt|quot|apos|amp|#(\d+)|#x([0-9a-f]+));/gi, (m, n, d, h) =>
  d ? String.fromCodePoint(+d) : h ? String.fromCodePoint(parseInt(h, 16))
    : { lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" }[n.toLowerCase()]);
const esc = (s) => String(s)
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const attr = (attrs, name) => (new RegExp(`\\b${name}="([^"]*)"`).exec(attrs) || [])[1];

const colNum = (letters) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const colName = (n) => { let s = ""; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const splitRef = (ref) => { const m = /^([A-Z]+)(\d+)$/.exec(ref); return { col: m[1], row: +m[2] }; };

const EPOCH = Date.UTC(1899, 11, 30);
export const toSerial = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return (Date.UTC(y, m - 1, d) - EPOCH) / 864e5;
};
export const fromSerial = (n) => new Date(EPOCH + Math.round(n) * 864e5).toISOString().slice(0, 10);

/* ---------------- workbook structure ---------------- */

function sheetPaths(files) {
  const wb = text(files.get("xl/workbook.xml"));
  const rels = text(files.get("xl/_rels/workbook.xml.rels"));
  const target = {};
  for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    target[attr(m[1], "Id")] = attr(m[1], "Target");
  }
  const out = {};
  for (const m of wb.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = unesc(attr(m[1], "name") || "");
    const t = target[attr(m[1], "r:id")];
    if (t) out[name] = t.startsWith("/") ? t.slice(1) : "xl/" + t.replace(/^\.\//, "");
  }
  return out;
}

function sharedStrings(files) {
  const x = files.get("xl/sharedStrings.xml");
  if (!x) return [];
  return [...text(x).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unesc(t[1])).join(""));
}

// rows as [{ r, attrs, cells: [{ ref, col, attrs, s, t, value, formula, raw }] , raw }]
function parseRows(xml, ss) {
  const rows = [];
  const sd = /<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/.exec(xml);
  if (!sd) return rows;
  for (const m of sd[1].matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const cells = [];
    for (const c of (m[2] || "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(c[1], "r");
      const t = attr(c[1], "t");
      const inner = c[2] || "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
      const f = /<f\b[^>]*>([\s\S]*?)<\/f>|<f\b[^>]*\/>/.exec(inner);
      let value = null;
      if (t === "s" && v) value = ss[+v[1]] ?? "";
      else if (t === "inlineStr") value = [...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => unesc(x[1])).join("");
      else if (t === "str" || t === "e") value = v ? unesc(v[1]) : "";
      else if (t === "b") value = v ? v[1] === "1" : null;
      else if (v) value = Number(v[1]);
      cells.push({ ref, col: splitRef(ref).col, attrs: c[1], s: attr(c[1], "s"), t, value,
                   formula: f ? unesc(f[1] || "") : null, raw: c[0] });
    }
    rows.push({ r: +attr(m[1], "r"), attrs: m[1], cells, raw: m[0] });
  }
  return rows;
}

const cellText = (c) => (c && c.value != null ? String(c.value).trim() : "");

function headerMap(row) {
  const map = {};
  for (const c of row?.cells || []) if (cellText(c)) map[cellText(c).toLowerCase()] = c.col;
  return map;
}

/* ---------------- reading (Import from Excel) ---------------- */

function asDate(v) {
  if (typeof v === "number" && v > 0) return fromSerial(v);
  const s = String(v || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}
const asNum = (v) => (typeof v === "number" ? v : Number(String(v ?? "").replace(/[$,\s]/g, "")) || 0);

export async function readTracker(buffer) {
  const files = await unzip(buffer);
  const paths = sheetPaths(files);
  const ss = sharedStrings(files);
  const rowsOf = (name) => (paths[name] ? parseRows(text(files.get(paths[name])), ss) : null);

  const out = { expenses: [], income: [], fixed: [] };

  const listSheet = (rows, fields) => {
    if (!rows?.length) return [];
    const h = headerMap(rows[0]);
    const colOf = (label) => h[label.toLowerCase()];
    const list = [];
    for (const row of rows.slice(1)) {
      const get = (label) => row.cells.find((c) => c.col === colOf(label))?.value ?? null;
      const d = asDate(get("Date"));
      const amount = asNum(get("Amount"));
      if (!d || !amount) continue;             // blank rows and the "How to use" notes
      list.push(fields(get, d, amount));
    }
    return list;
  };

  out.expenses = listSheet(rowsOf(SHEETS.expenses), (get, d, amount) => ({
    date: d, amount,
    description: String(get("Description") ?? "").trim(),
    project: String(get("Client / Project") ?? "").trim(),
    category: String(get("Category") ?? "").trim(),
    payment_method: String(get("Payment Method") ?? "").trim(),
  }));

  out.income = listSheet(rowsOf(SHEETS.income), (get, d, amount) => ({
    date: d, amount,
    client: String(get("Client / Project") ?? "").trim(),
    description: String(get("Description") ?? "").trim(),
    payment_method: String(get("Payment Method") ?? "").trim(),
    invoice: String(get("Invoice #") ?? "").trim(),
  }));

  const fixed = rowsOf(SHEETS.fixed);
  const fx = fixed && fixedLayout(fixed);
  if (fx) {
    for (const row of fixed.filter((r) => r.r > fx.headerRow && r.r < fx.totalRow)) {
      const get = (col) => row.cells.find((c) => c.col === col)?.value ?? null;
      const item = String(get(fx.item) ?? "").trim();
      if (!item) continue;
      out.fixed.push({
        item,
        category: fx.category ? String(get(fx.category) ?? "").trim() : "",
        annual_cost: asNum(get(fx.cost)),
        notes: String(get(fx.notes) ?? "").trim(),
      });
    }
  }
  return out;
}

// where the Fixed Costs table sits: its header row, its SUM row, and its columns
function fixedLayout(rows) {
  const header = rows.find((r) => r.cells.some((c) => /^cost item$/i.test(cellText(c))));
  if (!header) return null;
  const h = headerMap(header);
  const item = h["cost item"], cost = h["annual cost"], notes = h["notes"];
  if (!item || !cost) return null;
  // the category column has no header; it's the first column between item and cost
  let category = null;
  for (let n = colNum(item) + 1; n < colNum(cost); n++) {
    if (!header.cells.some((c) => c.col === colName(n) && cellText(c))) { category = colName(n); break; }
  }
  const total = rows.find((r) => r.r > header.r &&
    r.cells.some((c) => c.col === cost && c.formula && /SUM\(/i.test(c.formula)));
  return { headerRow: header.r, totalRow: total ? total.r : null, item, category, cost, notes };
}

/* ---------------- writing (Sync to Excel) ---------------- */

function cellXml(ref, s, value) {
  const sa = s != null ? ` s="${s}"` : "";
  if (value == null || value === "") return `<c r="${ref}"${sa}/>`;
  if (typeof value === "number") return `<c r="${ref}"${sa}><v>${Math.round(value * 100) / 100}</v></c>`;
  if (value && value.serial != null) return `<c r="${ref}"${sa}><v>${value.serial}</v></c>`;
  return `<c r="${ref}"${sa} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}

const rowAttrs = (attrs, r) => attrs.replace(/\br="\d+"/, `r="${r}"`);

function styleMap(row) {
  const m = {};
  for (const c of row?.cells || []) m[c.col] = c.s;
  return m;
}

// Move a row (and every cell in it) to a new row number.
function moveRow(raw, from, to) {
  if (from === to) return raw;
  return raw
    .replace(/(<row\b[^>]*?\br=")\d+"/, `$1${to}"`)
    .replace(new RegExp(`(<c\\b[^>]*?\\br="[A-Z]+)${from}"`, "g"), `$1${to}"`);
}

function replaceSheetData(xml, rowsXml) {
  return xml.replace(/<sheetData\b[^>]*>[\s\S]*?<\/sheetData>|<sheetData\b[^>]*\/>/,
    () => `<sheetData>${rowsXml}</sheetData>`);
}

// Row-number references in sqref / ref / dimension attributes, shifted for rows >= at.
function shiftRefs(xml, at, delta, tags = ["mergeCell", "dataValidation", "conditionalFormatting"]) {
  if (!delta) return xml;
  const bump = (s) => s.replace(/([A-Z]+)(\d+)/g, (m, c, r) => (+r >= at ? c + (+r + delta) : m));
  for (const tag of tags) {
    xml = xml.replace(new RegExp(`(<${tag}\\b[^>]*?\\b(?:ref|sqref)=")([^"]*)"`, "g"),
      (m, head, v) => head + bump(v) + '"');
  }
  return xml;
}

// A dropdown's list, rewritten from the portal's list (Excel caps it at 255 characters).
function setValidationList(xml, col, items) {
  if (!items?.length) return xml;
  const list = items.join(",");
  if (list.length > 255 || /"/.test(list)) return xml;
  return xml.replace(/<dataValidation\b([^>]*)>([\s\S]*?)<\/dataValidation>/g, (m, a, inner) => {
    const sq = attr(a, "sqref") || "";
    if (attr(a, "type") !== "list") return m;
    if (!sq.split(/\s+/).some((part) => splitRef(part.split(":")[0]).col === col)) return m;
    return `<dataValidation${a}>${inner.replace(/<formula1>[\s\S]*?<\/formula1>/,
      `<formula1>"${esc(list)}"</formula1>`)}</dataValidation>`;
  });
}

function lastValidationRow(xml, col) {
  let max = 0;
  for (const m of xml.matchAll(/<dataValidation\b([^>]*)>/g)) {
    for (const part of (attr(m[1], "sqref") || "").split(/\s+/)) {
      const [a, b] = part.split(":");
      if (!a || splitRef(a).col !== col) continue;
      max = Math.max(max, splitRef(b || a).row);
    }
  }
  return max;
}

/* Expenses / Income: header on row 1, data from row 2 down to the end of the dropdowns
   (row 501 in the original), then a gap and the notes. Rows past the data keep their
   formatting and stay empty, so there's always room to type in Excel too. If the books
   outgrow that block, it grows and everything under it moves down. */
function writeListSheet(xml, ss, records, lists) {
  const rows = parseRows(xml, ss);
  const header = rows.find((r) => r.r === 1) || rows[0];
  const h = headerMap(header);
  const cols = Object.values(h);
  const anyCol = cols[0];

  let dataEnd = Math.max(0, ...cols.map((c) => lastValidationRow(xml, c)));
  if (!dataEnd) {
    const notes = rows.find((r) => r.r > 1 && r.cells.some((c) => /^how to use/i.test(cellText(c))));
    dataEnd = notes ? notes.r - 3 : Math.max(501, ...rows.map((r) => r.r));
  }
  const need = records.length + 1;
  const grow = need > dataEnd ? need + 100 - dataEnd : 0;
  const newEnd = dataEnd + grow;

  const byRow = new Map(rows.map((r) => [r.r, r]));
  const base = byRow.get(2) || byRow.get(dataEnd) || header;
  const baseStyle = styleMap(base);
  const plain = byRow.get(3) || base;

  let out = header.raw;
  for (let r = 2; r <= newEnd; r++) {
    const tmpl = byRow.get(r);
    const style = { ...baseStyle, ...styleMap(tmpl) };
    const rec = records[r - 2];
    const attrs = rowAttrs((tmpl && rec ? tmpl : plain).attrs, r);
    const cells = Object.entries(h)
      .sort((a, b) => colNum(a[1]) - colNum(b[1]))
      .map(([label, col]) => cellXml(col + r, style[col], rec ? rec[label] : null));
    out += `<row${attrs}>${cells.join("")}</row>`;
  }
  for (const row of rows.filter((x) => x.r > dataEnd)) out += moveRow(row.raw, row.r, row.r + grow);

  xml = replaceSheetData(xml, out);
  if (grow) {
    xml = xml.replace(/(<dataValidation\b[^>]*?\bsqref=")([^"]*)"/g, (m, head, v) =>
      head + v.replace(new RegExp(`([A-Z]+)${dataEnd}\\b`, "g"), `$1${newEnd}`) + '"');
    xml = shiftRefs(xml, dataEnd + 1, grow, ["mergeCell", "conditionalFormatting"]);
  }
  for (const [label, items] of Object.entries(lists || {})) {
    if (h[label.toLowerCase()]) xml = setValidationList(xml, h[label.toLowerCase()], items);
  }
  xml = xml.replace(/<dimension ref="[^"]*"\/>/, () => {
    const last = Math.max(newEnd, ...rows.map((r) => r.r + (r.r > dataEnd ? grow : 0)));
    const lastCol = colName(Math.max(...cols.map(colNum)));
    return `<dimension ref="A1:${lastCol}${last}"/>`;
  });
  return { xml, dataEnd, newEnd, anyCol };
}

/* Fixed Costs: rows between the header and the SUM row. An item already in the workbook
   keeps its row's formatting (a tall row for long notes stays tall). */
function writeFixedSheet(xml, ss, items, categories) {
  const rows = parseRows(xml, ss);
  const L = fixedLayout(rows);
  if (!L || !L.totalRow) return xml;
  const region = rows.filter((r) => r.r > L.headerRow && r.r < L.totalRow);
  const size = L.totalRow - L.headerRow - 1;
  const grow = Math.max(0, items.length - size);

  const byItem = new Map(region.map((r) => [cellText(r.cells.find((c) => c.col === L.item)).toLowerCase(), r]));
  const fallback = region[region.length - 1] || rows.find((r) => r.r === L.headerRow);
  const cols = [L.item, L.category, L.cost, L.notes].filter(Boolean);
  const plainStyle = styleMap(region.find((r) => !cellText(r.cells.find((c) => c.col === L.item))) || fallback);

  let out = "";
  for (const row of rows.filter((r) => r.r <= L.headerRow)) out += row.raw;
  for (let i = 0; i < size + grow; i++) {
    const r = L.headerRow + 1 + i;
    const it = items[i];
    const matched = it && byItem.get(String(it.item).toLowerCase());
    const tmpl = matched || rows.find((x) => x.r === r) || fallback;
    const style = { ...plainStyle, ...styleMap(tmpl) };
    // a matched item keeps its row height; anything else gets a standard row
    const attrs = rowAttrs(matched ? tmpl.attrs : tmpl.attrs.replace(/\bht="[^"]*"/, 'ht="15"'), r);
    const values = it
      ? { [L.item]: it.item, [L.category]: it.category || null, [L.cost]: Number(it.annual_cost) || 0, [L.notes]: it.notes || null }
      : {};
    out += `<row${attrs}>${cols.map((c) => cellXml(c + r, style[c], values[c])).join("")}</row>`;
  }
  const total = items.reduce((s, x) => s + (Number(x.annual_cost) || 0), 0);
  for (const row of rows.filter((r) => r.r >= L.totalRow)) {
    let raw = moveRow(row.raw, row.r, row.r + grow);
    if (row.r === L.totalRow) {
      const first = L.headerRow + 1, last = L.totalRow - 1 + grow;
      raw = raw.replace(new RegExp(`(<c\\b[^>]*?\\br="${L.cost}${row.r + grow}"[^>]*>)([\\s\\S]*?)(</c>)`),
        (m, open, inner, close) => open +
          `<f>SUM(${L.cost}${first}:${L.cost}${last})</f><v>${Math.round(total * 100) / 100}</v>` + close);
    }
    out += raw;
  }
  xml = replaceSheetData(xml, out);
  xml = shiftRefs(xml, L.totalRow, grow);
  if (grow) {                                  // the dropdown covers the new rows too
    xml = xml.replace(/(<dataValidation\b[^>]*?\bsqref=")([^"]*)"/g, (m, head, v) =>
      head + v.replace(new RegExp(`([A-Z]+)${L.totalRow - 1}\\b`, "g"), (x, c) => c + (L.totalRow - 1 + grow)) + '"');
  }
  if (L.category) xml = setValidationList(xml, L.category, categories);
  return xml;
}

/* Summary: the formulas stay; their cached results are filled in so the file reads
   right in Drive's preview before anyone opens it in Excel. Values are matched by the
   label in column A. */
function writeSummary(xml, ss, values, growth) {
  // the block under a sheet grew → formulas that stopped at its old last row follow it
  for (const g of growth) {
    if (!g.grow) continue;
    const sheet = g.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`((?:'${sheet}'|${sheet})!\\$?[A-Z]+\\$?\\d+:\\$?[A-Z]+\\$?)${g.dataEnd}\\b`, "g");
    xml = xml.replace(/<f\b([^>]*)>([\s\S]*?)<\/f>/g, (m, a, f) => `<f${a}>${f.replace(re, `$1${g.newEnd}`)}</f>`);
  }
  // Expenses data starts on row 2; a range that starts on row 3 skips the first entry
  xml = xml.replace(/<f\b([^>]*)>([\s\S]*?)<\/f>/g, (m, a, f) =>
    `<f${a}>${f.replace(/(Expenses!\$?[A-Z]+\$?)3:/g, "$12:")}</f>`);

  const rows = parseRows(xml, ss);
  for (const row of rows) {
    const label = cellText(row.cells[0]).toLowerCase();
    if (!(label in values)) continue;
    const target = row.cells.find((c) => c.formula != null && c !== row.cells[0]);
    if (!target) continue;
    const v = Math.round(values[label] * 100) / 100;
    const fx = /<f\b[^>]*>[\s\S]*?<\/f>|<f\b[^>]*\/>/.exec(target.raw)[0];
    const attrs = target.attrs.replace(/\s*\bt="[^"]*"/, "");
    xml = xml.replace(target.raw, () => `<c${attrs}>${fx}<v>${v}</v></c>`);
  }
  return xml;
}

/* data = {
     expenses: [{ Date, Description, "Client / Project", Amount, Category, "Payment Method" }],
     income:   [{ Date, "Client / Project", Description, Amount, "Payment Method", "Invoice #" }],
     fixed:    [{ item, category, annual_cost, notes }],
     summary:  { "today": n, "this month": n, ..., "<category name>": n },
     lists:    { categories: [...], expensePayment: [...], incomePayment: [...] } }
   Dates go in as { serial } (use toSerial). */
export async function writeTracker(buffer, data) {
  const files = await unzip(buffer);
  const paths = sheetPaths(files);
  const ss = sharedStrings(files);
  const missing = [SHEETS.expenses, SHEETS.income].filter((n) => !paths[n]);
  if (missing.length) throw new Error(`The workbook has no "${missing.join('" or "')}" tab.`);

  const growth = [];
  const lower = (recs) => recs.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toLowerCase(), v])));

  for (const [key, name, lists] of [
    ["expenses", SHEETS.expenses, { category: data.lists?.categories, "payment method": data.lists?.expensePayment }],
    ["income", SHEETS.income, { "payment method": data.lists?.incomePayment }],
  ]) {
    const res = writeListSheet(text(files.get(paths[name])), ss, lower(data[key] || []), lists);
    files.set(paths[name], res.xml);
    growth.push({ name, dataEnd: res.dataEnd, newEnd: res.newEnd, grow: res.newEnd - res.dataEnd });
  }
  if (paths[SHEETS.fixed]) {
    files.set(paths[SHEETS.fixed],
      writeFixedSheet(text(files.get(paths[SHEETS.fixed])), ss, data.fixed || [], data.lists?.categories));
  }
  if (paths[SHEETS.summary]) {
    files.set(paths[SHEETS.summary],
      writeSummary(text(files.get(paths[SHEETS.summary])), ss, data.summary || {}, growth));
  }

  // Excel rebuilds the calculation chain itself; a stale one makes it offer a "repair".
  if (files.has("xl/calcChain.xml")) {
    files.delete("xl/calcChain.xml");
    files.set("[Content_Types].xml", text(files.get("[Content_Types].xml"))
      .replace(/<Override\b[^>]*calcChain[^>]*\/>/, ""));
    files.set("xl/_rels/workbook.xml.rels", text(files.get("xl/_rels/workbook.xml.rels"))
      .replace(/<Relationship\b[^>]*calcChain[^>]*\/>/, ""));
  }
  // and recalculates everything the moment it opens
  let wb = text(files.get("xl/workbook.xml"));
  wb = /<calcPr\b[^>]*fullCalcOnLoad/.test(wb) ? wb
    : wb.replace(/<calcPr\b/, '<calcPr fullCalcOnLoad="1"');
  files.set("xl/workbook.xml", wb);

  return zip(files);
}
