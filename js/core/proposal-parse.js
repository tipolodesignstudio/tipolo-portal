// Rule-based reading of a proposal PDF into the fields the portal stores.
//
// This runs entirely in the browser on the structural model from pdf-text.js. It is
// tuned for Tipolo's own proposals (InDesign / Word exports with a consistent layout);
// when it comes up short, the import screen's review form is filled in by hand.
//
//   parseProposal(doc, { clients }) -> draft (see shape at the bottom of this file)

const LABELS = {
  client: /^(prepared\s+for|client|for|to|attention|attn|issued\s+to)\s*[:–-]\s*/i,
  title: /^(project|re|subject|proposal\s+for|project\s+(name|title))\s*[:–-]\s*/i,
  date: /^(date|dated|issued|prepared\s+on)\s*[:–-]\s*/i,
  valid: /^(valid\s+(until|through|for)|expires?|expiry|valid)\s*[:–-]\s*/i,
};

const FEE_HEADING = /\b(fee|fees|pricing|price|investment|cost|costs|budget|compensation|schedule\s+of\s+fees|fee\s+schedule|scope\s+(and|&)\s+fee)\b/i;
const TOTAL_LINE = /\b(sub\s*-?\s*total|total|gst|pst|hst|tax(es)?|deposit|retainer|balance|amount\s+due)\b/i;
const SUBTOTAL_LINE = /\b(sub\s*-?\s*total|total\s+(fee|fees|investment|cost|proposal)|(fee|project)\s+total|grand\s+total|total)\b/i;

const SCOPE_WORDS = {
  landscape: ["landscape", "landscaping", "planting", "plant", "garden", "hardscape",
    "softscape", "patio", "irrigation", "grading", "site plan", "arborist", "streetscape",
    "horticultur", "tree", "shrub", "paving", "retaining wall", "lawn", "terrace",
    "courtyard", "park", "plaza", "playground", "stormwater", "permeable"],
  multimedia: ["video", "animation", "animate", "motion", "render", "rendering",
    "visualization", "visualisation", "3d", "film", "footage", "edit", "graphic",
    "brand", "branding", "logo", "website", "web design", "photograph", "photo",
    "drone", "storyboard", "voiceover", "walkthrough", "flythrough"],
};

const CORP_SUFFIX = /\b(ltd|ltd\.|limited|inc|inc\.|incorporated|corp|corp\.|corporation|llc|llp|co|co\.|company|group|holdings|developments?|construction|contracting|design|studio)\b/g;

export function parseProposal(doc, { clients = [], businessName = "" } = {}) {
  const lines = doc.lines.filter((l) => l.text.trim() !== "");
  const body = doc.bodySize || 10;
  const warnings = [];

  const headingIdx = findHeadings(lines, body);
  const isHeading = new Set(headingIdx);

  const labelled = readLabels(lines);
  const title = pickTitle(lines, labelled, body, businessName, headingIdx);
  const clientName = labelled.client || guessClientFromText(lines, clients, businessName);
  const match = matchClient(clientName, clients);
  const scope = classifyScope(doc.text);
  const sections = buildSections(lines, headingIdx);
  const fee = extractFee(lines, isHeading);

  if (!title.value) warnings.push("Couldn't find a project title — type one in.");
  if (!clientName) warnings.push("Couldn't find a client name in the document.");
  else if (!match.client) warnings.push(`“${clientName}” doesn't match an existing client.`);
  if (!fee.lineItems.length) warnings.push("No fee lines were recognised.");
  else if (fee.mismatch) {
    warnings.push(`The fee lines add up to ${fee.sum.toLocaleString("en-CA", { style: "currency", currency: "CAD" })}, ` +
      `but the document's total reads ${fee.subtotal.toLocaleString("en-CA", { style: "currency", currency: "CAD" })}.`);
  }
  if (!sections.length) warnings.push("No headings were detected, so there are no sections.");
  if (doc.truncated) warnings.push(`Only the first ${doc.pages.length} pages were read.`);

  return {
    title: title.value,
    client_name: clientName || "",
    client_id: match.client?.id || "",
    client_score: match.score,
    project_scope: scope.value,
    sections,
    line_items: fee.lineItems,
    subtotal: fee.subtotal,
    dated: labelled.date || "",
    valid_until: labelled.valid || "",
    conf: {
      title: title.conf,
      client_name: clientName ? (match.score >= 0.62 ? 0.9 : 0.55) : 0,
      project_scope: scope.conf,
      sections: sections.length ? Math.min(0.9, 0.4 + sections.length * 0.1) : 0,
      line_items: fee.conf,
    },
    warnings,
  };
}

/* ---------------- labels ---------------- */

function readLabels(lines) {
  const out = {};
  for (let i = 0; i < Math.min(lines.length, 80); i++) {
    const raw = lines[i].text.replace(/\t+/g, " ").trim();
    for (const [key, re] of Object.entries(LABELS)) {
      if (out[key]) continue;
      const m = raw.match(re);
      if (!m) continue;
      let value = raw.slice(m[0].length).trim();
      // "Prepared for:" alone on its line — the value is the next line.
      if (!value && lines[i + 1]) value = lines[i + 1].text.replace(/\t+/g, " ").trim();
      value = value.replace(/[.,;]$/, "").trim();
      if (value && value.length <= 120) out[key] = value;
    }
  }
  if (out.date) out.date = toIso(out.date) || "";
  if (out.valid) out.valid = toIso(out.valid) || "";
  return out;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july",
  "august", "september", "october", "november", "december"];

function toIso(s) {
  const t = String(s).trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return t;
  m = t.match(/([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/);
  if (m) {
    const mi = MONTHS.findIndex((x) => x.startsWith(m[1].toLowerCase().slice(0, 3)));
    if (mi >= 0) return `${m[3]}-${pad(mi + 1)}-${pad(m[2])}`;
  }
  m = t.match(/(\d{1,2})\s+([A-Za-z]{3,9}),?\s+(\d{4})/);
  if (m) {
    const mi = MONTHS.findIndex((x) => x.startsWith(m[2].toLowerCase().slice(0, 3)));
    if (mi >= 0) return `${m[3]}-${pad(mi + 1)}-${pad(m[1])}`;
  }
  m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/); // assume D/M/Y is rare here: M/D/Y
  if (m) return `${m[3]}-${pad(m[1])}-${pad(m[2])}`;
  return null;
}
const pad = (n) => String(Number(n)).padStart(2, "0");

/* ---------------- headings & sections ---------------- */

function findHeadings(lines, body) {
  const idx = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const t = l.text.replace(/\t/g, " ").trim();
    if (!t || t.length > 90) continue;
    if (/[.;]$/.test(t)) continue;                 // sentences aren't headings
    if (/\$|\d[.,]\d{2}\s*$/.test(t)) continue;    // priced rows aren't headings either
    if (Object.values(LABELS).some((re) => re.test(t))) continue;
    const words = t.split(/\s+/).length;
    const big = l.size >= body * 1.16;
    const capsy = l.caps && l.size >= body * 0.98 && words <= 9;
    // Numbered headings are short. Longer numbered lines are list items, not headings.
    const numbered = /^(\d{1,2}[.)]|[IVX]{1,4}[.)]|section\s+\d)/i.test(t) && words <= 8 && l.size >= body;
    if (big || capsy || numbered) idx.push(i);
  }
  return idx;
}

function buildSections(lines, headingIdx) {
  const out = [];
  for (let h = 0; h < headingIdx.length; h++) {
    const start = headingIdx[h];
    const end = h + 1 < headingIdx.length ? headingIdx[h + 1] : lines.length;
    const heading = lines[start].text.replace(/\t/g, " ").replace(/\s+/g, " ").trim();
    // The fee table is captured as line items, so keep only its prose (if any).
    const dropAmounts = FEE_HEADING.test(heading);
    const bodyText = joinBody(lines.slice(start + 1, end), { dropAmounts });
    // A heading with nothing under it is kept only when it's a parent of the heading
    // that follows ("Work Plan" over "Task 1: …"). A cover-page title also sits above
    // smaller headings, so require its level to repeat later in the document.
    const size = lines[start].size;
    const next = headingIdx[h + 1];
    const isParent = next != null && lines[next].size < size
      && headingIdx.slice(h + 1).some((j) => lines[j].size >= size);
    if (!bodyText && !isParent) continue;
    if (bodyText && bodyText.length < 25 && !isParent) continue;
    out.push({ heading, body: bodyText });
  }
  return out.slice(0, 30);
}

// Rejoin wrapped lines into paragraphs: a line that doesn't end a sentence flows into
// the next one. Bullets and tabbed rows keep their own line.
function joinBody(lines, { dropAmounts = false } = {}) {
  const parts = [];
  let buf = "";
  const flush = () => { if (buf.trim()) parts.push(buf.trim()); buf = ""; };
  for (const l of lines) {
    const t = l.text.replace(/\t+/g, "  ").trim();
    if (!t) { flush(); continue; }
    // "Prepared for: …", "Date: …" belong to the header block, not to prose.
    if (Object.values(LABELS).some((re) => re.test(t))) { flush(); continue; }
    if (dropAmounts && AMOUNT.test(t.replace(/\.{2,}/g, " "))) { flush(); continue; }
    const bullet = /^[•·▪◦\-–—*]\s+/.test(t) || /^\(?[a-z0-9]{1,3}[.)]\s+/i.test(t);
    if (bullet) { flush(); parts.push(t.replace(/^[•·▪◦*]\s+/, "– ")); continue; }
    buf = buf ? `${buf} ${t}` : t;
    if (/[.:!?]$/.test(t)) flush();
  }
  flush();
  return parts.join("\n").trim();
}

/* ---------------- title ---------------- */

function pickTitle(lines, labelled, body, businessName, headingIdx) {
  if (labelled.title) return { value: titleCase(clean(labelled.title)), conf: 0.92 };

  const bn = normName(businessName);
  const skip = /^(proposal|project\s+proposal|design\s+proposal|fee\s+proposal|quotation|quote|statement\s+of\s+work|scope\s+of\s+work)$/i;

  // Largest type on page one that isn't the studio's own name or the word "Proposal".
  const firstPage = lines.slice(0, 40);
  const candidates = firstPage
    .map((l, i) => ({ ...l, i }))
    .filter((l) => {
      const t = clean(l.text);
      if (!t || t.length < 4 || t.length > 90) return false;
      if (skip.test(t)) return false;
      if (bn && normName(t) === bn) return false;
      if (/@|www\.|https?:|^\+?[\d.\s()-]{7,}$/.test(t)) return false;
      if (Object.values(LABELS).some((re) => re.test(t))) return false;
      return l.size >= body * 1.15;
    })
    .sort((a, b) => b.size - a.size || a.i - b.i);

  if (candidates.length) return { value: titleCase(clean(candidates[0].text)), conf: 0.7 };
  if (headingIdx.length) return { value: titleCase(clean(lines[headingIdx[0]].text)), conf: 0.4 };
  return { value: "", conf: 0 };
}

const clean = (s) => s.replace(/\t/g, " ").replace(/\s+/g, " ").trim();

// Cover pages and "RE:" lines are often set in capitals; a title reads better cased.
const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of",
  "on", "or", "the", "to", "with", "vs"]);

function titleCase(s) {
  const letters = s.replace(/[^A-Za-z]/g, "");
  if (letters.length < 4 || letters !== letters.toUpperCase()) return s; // already cased
  return s.toLowerCase().split(/(\s+)/).map((w, i) => {
    if (/^\s+$/.test(w)) return w;
    if (i > 0 && SMALL_WORDS.has(w)) return w;
    return w.replace(/[a-z]/, (c) => c.toUpperCase());
  }).join("");
}

/* ---------------- client matching ---------------- */

function guessClientFromText(lines, clients, businessName) {
  // No explicit label — see whether a known client's name appears near the front.
  const head = lines.slice(0, 60).map((l) => clean(l.text)).join("\n");
  const bn = normName(businessName);
  let best = null;
  for (const c of clients) {
    const n = normName(c.name);
    if (!n || n === bn || n.length < 4) continue;
    if (normName(head).includes(n)) {
      if (!best || c.name.length > best.length) best = c.name;
    }
  }
  return best || "";
}

export function matchClient(name, clients) {
  if (!name) return { client: null, score: 0 };
  let best = null;
  let score = 0;
  for (const c of clients) {
    const s = similarity(name, c.name);
    if (s > score) { score = s; best = c; }
    for (const ct of c.contacts || []) {
      const s2 = similarity(name, ct.name) * 0.9;
      if (s2 > score) { score = s2; best = c; }
    }
  }
  return score >= 0.62 ? { client: best, score } : { client: null, score, near: best };
}

// Dice coefficient over normalised word tokens, with a containment bonus.
function similarity(a, b) {
  const na = normName(a);
  const nb = normName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const ta = new Set(na.split(" ").filter((w) => w.length > 1));
  const tb = new Set(nb.split(" ").filter((w) => w.length > 1));
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const w of ta) if (tb.has(w)) hit++;
  return (2 * hit) / (ta.size + tb.size);
}

function normName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[.,'’&]/g, " ")
    .replace(CORP_SUFFIX, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------------- scope ---------------- */

function classifyScope(text) {
  const t = text.toLowerCase();
  const score = {};
  for (const [scope, words] of Object.entries(SCOPE_WORDS)) {
    score[scope] = words.reduce((n, w) => n + countOf(t, w), 0);
  }
  const ranked = Object.entries(score).sort((a, b) => b[1] - a[1]);
  const [top, topN] = ranked[0];
  const runnerUp = ranked[1]?.[1] || 0;
  if (topN < 3) return { value: "other", conf: 0.2 };
  const margin = (topN - runnerUp) / topN;
  return { value: top, conf: margin > 0.5 ? 0.85 : 0.55 };
}

function countOf(hay, needle) {
  let n = 0;
  let i = 0;
  while ((i = hay.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
  return n;
}

/* ---------------- fee schedule ---------------- */

const AMOUNT = /(?:\$\s*)?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{2}|\$\s*\d+)\s*$/;

function extractFee(lines, isHeading) {
  const zone = feeZone(lines, isHeading);
  const pool = zone.length ? zone : lines;
  const lineItems = [];
  let subtotal = null;

  for (const l of pool) {
    const raw = l.text
      .replace(/\.{2,}/g, " ")
      .replace(/^\s*(?:\d{1,2}|[A-Za-z])\t/, "")   // leading index column ("1 ⇥ Task…")
      .replace(/\t+/g, "  ")
      .trim();
    const m = raw.match(AMOUNT);
    if (!m) continue;
    const amount = money(m[1]);
    if (amount == null || amount < 1) continue;
    const desc = raw.slice(0, raw.length - m[0].length).replace(/[\s:–-]+$/, "").trim();

    if (SUBTOTAL_LINE.test(desc) && desc.split(/\s+/).length <= 5) {
      // The base fee table ends at its own total; anything past it is optional scope.
      subtotal = amount;
      break;
    }
    if (TOTAL_LINE.test(desc) && desc.split(/\s+/).length <= 5) continue; // GST/PST/deposit
    if (desc.length < 3 || !/[a-z]{3}/i.test(desc)) continue;
    if (desc.split(/\s+/).length > 18) continue;                          // prose, not a row

    const qty = qtyFrom(desc);
    lineItems.push({
      description: qty.description,
      qty: qty.qty,
      unit_price: qty.qty === 1 ? amount : round2(amount / qty.qty),
    });
    if (lineItems.length >= 40) break;
  }

  const sum = round2(lineItems.reduce((s, li) => s + li.qty * li.unit_price, 0));
  if (subtotal == null) subtotal = sum;
  const mismatch = lineItems.length > 0 && Math.abs(sum - subtotal) > 0.02;

  let conf = 0;
  if (lineItems.length) conf = zone.length ? 0.8 : 0.5;
  if (mismatch) conf = Math.min(conf, 0.45);

  return { lineItems, subtotal, sum, mismatch, conf };
}

// Prefer lines inside a "Fee / Pricing / Investment" section — far fewer false hits.
function feeZone(lines, isHeading) {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!isHeading.has(i)) continue;
    if (FEE_HEADING.test(lines[i].text)) { start = i + 1; break; }
  }
  if (start < 0) return [];
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (isHeading.has(i)) { end = i; break; }
  }
  return lines.slice(start, end);
}

// "Site visits (3)" / "3 x concept boards" / "Meetings – 4" -> qty
function qtyFrom(desc) {
  let m = desc.match(/^(\d{1,3})\s*(?:x|×)\s*(.+)$/i);
  if (m) return { qty: Number(m[1]), description: m[2].trim() };
  m = desc.match(/^(.+?)\s*[\(\[]\s*(?:x\s*)?(\d{1,3})\s*[\)\]]$/i);
  if (m && Number(m[2]) <= 200) return { qty: Number(m[2]), description: m[1].trim() };
  return { qty: 1, description: desc };
}

function money(s) {
  const n = Number(String(s).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? round2(n) : null;
}
const round2 = (n) => Math.round(n * 100) / 100;

/* ---------------- shape ----------------
{
  title, client_name, client_id, client_score, project_scope,
  sections:   [{ heading, body }],
  line_items: [{ description, qty, unit_price }],
  subtotal, dated, valid_until,
  conf: { title, client_name, project_scope, sections, line_items },  // 0..1
  warnings: [string],
}
------------------------------------------ */
