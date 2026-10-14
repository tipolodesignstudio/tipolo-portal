// Development only: open the app with ?mock to run it against sample data instead of
// the live database, signed in as a stand-in user. main.tsx imports this only when
// import.meta.env.DEV is true, so it never reaches the published build.
//
import { defaultSections, defaultLineItems } from "@/lib/doc";
import { defaultInvoiceSections } from "@/lib/invoice-doc";

// It answers just enough of Supabase's REST API (select with embeds, eq/in/ilike/or
// filters, ordering, insert/update/delete) for the rebuilt screens to work.

type Row = Record<string, unknown> & { id: string };
const now = () => new Date().toISOString();
const thisWeek = (i: number) => {       // Monday + i, local time
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + i);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const ago = (days: number) => new Date(Date.now() - days * 864e5).toISOString();
let seq = 100;
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

const db: Record<string, Row[]> = {
  client_categories: [
    { id: "cat-la", name: "Landscape Architecture", sort_order: 1 },
    { id: "cat-co", name: "Contractor", sort_order: 2 },
    { id: "cat-re", name: "Residential", sort_order: 3 },
  ],
  clients: [
    { id: "c1", name: "Connect Landscape Architecture", is_individual: false, is_internal: false, status: "active",
      category_id: "cat-la", email: "info@connectla.ca", phone: "+1.604.555.0142", street: "1200 W 73rd Ave",
      city: "Vancouver", province: "BC", postal_code: "V6P 6G5", default_rate: null, tags: ["referral"],
      latest_note: "Task 1 presented Sept 25 — they want a second round on the homepage hero.", latest_note_at: ago(2),
      created_at: ago(40) },
    { id: "c2", name: "Stone Bear Hardscapes", is_individual: false, is_internal: false, status: "active",
      category_id: "cat-co", email: "office@stonebear.ca", phone: null, street: null, city: "Port Moody",
      province: "BC", postal_code: null, default_rate: 95, tags: [], latest_note: null, latest_note_at: null,
      created_at: ago(12) },
    { id: "c3", name: "Maria Santos", is_individual: true, is_internal: false, status: "active",
      category_id: "cat-re", email: "maria@example.com", phone: "+1.778.555.0199", street: "26 Axford Bay",
      city: "Port Moody", province: "BC", postal_code: "V3H 5J2", default_rate: null, tags: ["backyard"],
      latest_note: "Wants planting plan before spring.", latest_note_at: ago(9), created_at: ago(20) },
    { id: "c4", name: "Methods Cleaning", is_individual: false, is_internal: false, status: "archived",
      category_id: null, email: null, phone: null, street: null, city: null, province: null, postal_code: null,
      default_rate: null, tags: [], latest_note: "Branding wrapped 2020.", latest_note_at: ago(1900), created_at: ago(2100) },
    { id: "c0", name: "Tipolo Design Studio", is_internal: true, is_individual: false, status: "active", created_at: ago(60) },
  ],
  client_contacts: [
    { id: "ct1", client_id: "c1", name: "Dana Whitfield", title: "Principal", email: "dana@connectla.ca", phone: "+1.604.555.0142", is_primary: true, created_at: ago(40) },
    { id: "ct2", client_id: "c1", name: "Owen Lee", title: "Marketing", email: "owen@connectla.ca", phone: null, is_primary: false, created_at: ago(30) },
    { id: "ct3", client_id: "c2", name: "Rick Bauer", title: "Owner", email: "rick@stonebear.ca", phone: "+1.604.555.0177", is_primary: true, created_at: ago(12) },
    { id: "ct4", client_id: "c3", name: "Maria Santos", title: null, email: "maria@example.com", phone: "+1.778.555.0199", is_primary: true, created_at: ago(20) },
  ],
  client_notes: [
    { id: "n1", client_id: "c1", body: "Task 1 presented Sept 25 — they want a second round on the homepage hero.", created_at: ago(2) },
    { id: "n2", client_id: "c1", body: "Deposit cheque received.", created_at: ago(18) },
    { id: "n3", client_id: "c1", body: "Signed the proposal at the kickoff meeting.", created_at: ago(30) },
    { id: "n4", client_id: "c3", body: "Wants planting plan before spring.", created_at: ago(9) },
  ],
  projects: [
    { id: "p1", client_id: "c1", number: "26102", title: "ConnectLA Website", scope: "multimedia", status: "active",
      start_date: "2026-09-08", due_date: "2026-11-30", budget: null, hourly_rate: null, contact_id: null,
      description: "Five-page website on Squarespace, branding refresh.", source_pdf_path: null,
      deliverables: [{ label: "Template exploration & mock-ups", done: true }, { label: "Homepage design", done: false }, { label: "Inner pages", done: false }],
      updated_at: ago(2) },
    { id: "p2", client_id: "c3", number: "26105", title: "Santos Backyard", scope: "landscape", status: "lead",
      start_date: null, due_date: null, budget: 3200, hourly_rate: 95, contact_id: null, description: null, deliverables: [], updated_at: ago(4) },
    { id: "p3", client_id: "c4", number: "20007", title: "Methods Cleaning Branding", scope: "multimedia", status: "complete",
      start_date: "2020-02-01", due_date: "2020-04-01", budget: 1800, hourly_rate: null, contact_id: null, description: null, deliverables: [], updated_at: ago(1900) },
  ],
  time_entries: [
    { id: "te1", project_id: "p1", entry_date: "2026-10-09", minutes: 210, billable: true, rate: 85, invoice_id: null, description: "Homepage hero options", created_at: ago(4) },
    { id: "te2", project_id: "p1", entry_date: "2026-10-07", minutes: 150, billable: true, rate: 85, invoice_id: null, description: "Client call + revisions", created_at: ago(6) },
    { id: "te3", project_id: "p1", entry_date: "2026-09-12", minutes: 480, billable: true, rate: 85, invoice_id: "i1", description: "Template exploration", created_at: ago(31) },
    { id: "te4", project_id: "p1", entry_date: "2026-10-10", minutes: 45, billable: false, rate: 85, invoice_id: null, description: "Internal file setup", created_at: ago(3) },
    // this week, so the timesheet has something on it
    { id: "te5", project_id: "p1", entry_date: thisWeek(0), minutes: 240, billable: true, rate: 85, invoice_id: null, description: "Inner page layouts", created_by: "u-mock", created_at: ago(2) },
    { id: "te6", project_id: "p1", entry_date: thisWeek(0), minutes: 60, billable: true, rate: 85, invoice_id: null, description: "Image research", created_by: "u-other", created_at: ago(2) },
    { id: "te7", project_id: "p2", entry_date: thisWeek(1), minutes: 90, billable: true, rate: 95, invoice_id: null, description: "Site visit", created_by: "u-mock", created_at: ago(1) },
    { id: "te8", project_id: "p2", entry_date: thisWeek(1), minutes: 30, billable: false, rate: 95, invoice_id: null, description: "Travel", created_by: "u-mock", created_at: ago(1) },
  ],
  expenses: [
    { id: "ex1", project_id: "p1", expense_date: "2026-09-20", description: "Stock photography", amount: 64.5, category_id: "ec-mk", billable: true, markup_pct: 10, invoice_id: null, payment_method: "Tipolo Credit Card", created_at: ago(24) },
    { id: "ex2", project_id: null, expense_date: "2026-08-17", description: "BC Name Registry", amount: 31.5, category_id: "ec-pl", billable: false, markup_pct: 0, invoice_id: null, payment_method: "Personal Credit Card", created_at: ago(58), receipt_drive_url: "https://drive.google.com/file/d/abc/view", receipt_name: "26-08-17 BC Name Registry.pdf" },
    { id: "ex3", project_id: null, expense_date: "2026-09-17", description: "Office Table", amount: 148.95, category_id: "ec-eq", billable: false, markup_pct: 0, invoice_id: null, payment_method: "Personal Credit Card", created_at: ago(27) },
    { id: "ex4", project_id: null, expense_date: "2026-10-05", description: "Adobe Creative Cloud", amount: 91.69, category_id: "ec-sw", billable: false, markup_pct: 0, invoice_id: null, payment_method: "Tipolo Credit Card", created_at: ago(9) },
  ],
  expense_categories: [
    { id: "ec-pl", name: "Permits & Licenses", sort_order: 1 }, { id: "ec-eq", name: "Equipment & Tools", sort_order: 4 },
    { id: "ec-sw", name: "Software & Subscription", sort_order: 5 }, { id: "ec-mk", name: "Marketing", sort_order: 6 },
    { id: "ec-in", name: "Insurance", sort_order: 12 }, { id: "ec-ot", name: "Other", sort_order: 99 },
  ],
  income: [
    { id: "in1", income_date: "2026-09-20", client_id: "c1", project_id: "p1", invoice_id: "i1", description: "Task 1: Template exploration", amount: 970, payment_method: "Cheque", created_at: ago(24) },
  ],
  fixed_costs: [
    { id: "fc1", item: "Business Insurance", category_id: "ec-in", annual_cost: 1150, notes: "PLI $1m/$1m ($650), CGI $1m ($500)", sort_order: 1, created_at: ago(30) },
    { id: "fc2", item: "Software Subscriptions", category_id: "ec-sw", annual_cost: 4040, notes: "Vectorworks, SketchUp, Adobe CC, Claude", sort_order: 2, created_at: ago(30) },
  ],
  proposals: [
    { id: "pr1", client_id: "c1", number: "26102", title: "Website Redesign", subtotal: 4845, status: "accepted",
      doc_mode: "builder", project_scope: "multimedia", sections: [], line_items: [{ description: "Task 1: Template exploration", qty: 1, unit_price: 1020 }],
      converted_project_id: "p1", sent_date: "2026-09-01", valid_until: "2027-09-01", created_at: ago(35) },
    { id: "pr2", client_id: "c2", number: "26103", title: "Axford Bay Residence", subtotal: 2040, status: "sent",
      doc_mode: "pdf", project_scope: "landscape", sections: [],
      line_items: [{ description: "Site analysis", qty: 1, unit_price: 840 }, { description: "Concept plan", qty: 1, unit_price: 1200 }],
      source_pdf_path: `${location.origin}/@fs${import.meta.env.VITE_SAMPLE_PDF ?? ""}`,
      sent_date: "2026-10-03", valid_until: "2027-10-03", created_at: ago(10) },
    { id: "pr3", client_id: "c3", number: "26104", title: "Backyard Planting Plan", subtotal: 0, status: "draft",
      doc_mode: "builder", project_scope: "landscape", sections: defaultSections(), line_items: defaultLineItems(),
      created_at: ago(1) },
  ],
  proposal_revisions: [
    { id: "rv1", proposal_id: "pr2", revised_on: "2026-10-08", note: "Fees revised after the site visit", created_at: ago(5) },
  ],
  proposal_templates: [
    { id: "t1", name: "Website design", sections: [{ part: "workplan", level: 1, heading: "Work Plan", body: "Website for {{client.name}}." }],
      default_line_items: [{ description: "Discovery", qty: 1, unit_price: 600 }] },
  ],
  staff_tiers: [{ id: "st1", name: "Principal Designer", hourly_rate: 85, is_default: true, sort_order: 0 }],
  app_settings: [{ id: "1", business_name: "Tipolo Design Studio", email: "hello@tipolo.ca", phone: "604.729.0597",
    address: "Port Moody, BC", hours_per_day: 8, currency: "CAD", gst_number: "", pst_number: "",
    job_seq_year: 2026, job_seq_next: 104, job_seq_start: 101, logo_url: null, signature_url: null,
    tax_lines: [{ label: "GST", rate: 5, enabled: true }, { label: "PST", rate: 7, enabled: true }],
    income_payment_methods: ["Business card", "E-transfer", "Cheque"],
    expense_payment_methods: ["Tipolo Credit Card", "Personal Credit Card", "Cash"],
    drive_folder_id: "ACCTFOLDER01", drive_receipts_folder_id: "RCPTFOLDER01", drive_tracker_file_id: "TRACKERFILE1",
    books_changed_at: ago(0), tracker_synced_at: ago(1) }],
  invoices: [
    { id: "i1", project_id: "p1", number: "26102-001", status: "paid", total: 970, subtotal: 970, issue_date: "2026-09-09", due_date: "2026-10-09",
      paid_date: "2026-09-20", created_at: ago(35), sections: defaultInvoiceSections(), apply_taxes: false,
      progress_lines: [{ id: "L1", description: "Task 1: Template exploration & mock-ups", budget: 1020, amount: 970 }] },
    { id: "i2", project_id: "p1", number: "26102-002", status: "sent", total: 1250, subtotal: 1250, issue_date: "2026-09-25", due_date: "2026-10-10",
      created_at: ago(19), sections: defaultInvoiceSections(), apply_taxes: false,
      progress_lines: [{ id: "L1", description: "Task 1: Template exploration & mock-ups", budget: 1020, amount: 50 },
                       { id: "L2", description: "Task 2: Homepage design", budget: 2000, amount: 1200 }] },
    { id: "i3", project_id: "p1", number: null, status: "draft", total: 0, subtotal: 0, issue_date: "2026-10-14", due_date: null,
      created_at: ago(0), sections: defaultInvoiceSections(), apply_taxes: false, prepared_by: "Jim Dema-ala",
      progress_lines: [{ id: "L1", description: "Task 1: Template exploration & mock-ups", budget: 1020, amount: 0 },
                       { id: "L2", description: "Task 2: Homepage design", budget: 2000, amount: 0 },
                       { id: "L3", description: "Task 3: Inner pages", budget: 1825, amount: 0 }] },
  ],
};
(window as unknown as { __mockDb: typeof db }).__mockDb = db;

/* ---------------- a tiny PostgREST ---------------- */

function splitTop(s: string) {           // split on commas not inside brackets
  const out: string[] = []; let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const FK: Record<string, Record<string, { table: string; on: string; many?: boolean }>> = {
  clients: {
    projects: { table: "projects", on: "client_id", many: true },
    category: { table: "client_categories", on: "category_id" },
    contacts: { table: "client_contacts", on: "client_id", many: true },
  },
  projects: {
    client: { table: "clients", on: "client_id" }, clients: { table: "clients", on: "client_id" },
    contact: { table: "client_contacts", on: "contact_id" },
  },
  expenses: { category: { table: "expense_categories", on: "category_id" }, project: { table: "projects", on: "project_id" } },
  income: { client: { table: "clients", on: "client_id" }, project: { table: "projects", on: "project_id" }, invoice: { table: "invoices", on: "invoice_id" } },
  fixed_costs: { category: { table: "expense_categories", on: "category_id" } },
  time_entries: { project: { table: "projects", on: "project_id" } },
  invoices: { project: { table: "projects", on: "project_id" } },
  proposals: {
    client: { table: "clients", on: "client_id" }, clients: { table: "clients", on: "client_id" },
    converted_project: { table: "projects", on: "converted_project_id" },
  },
};

function project(table: string, row: Row, select: string): Record<string, unknown> {
  if (!select || select === "*") return { ...row };
  const out: Record<string, unknown> = {};
  for (const part of splitTop(select)) {
    if (part === "*") { Object.assign(out, row); continue; }
    const m = /^(?:(\w+):)?(\w+)(?:\(([\s\S]*)\))?$/.exec(part);
    if (!m) continue;
    const [, alias, name, inner] = m;
    if (inner === undefined) { out[alias ?? name] = row[name]; continue; }
    const rel = FK[table]?.[alias ?? name] ?? FK[table]?.[name]
      ?? { table: name.replace(/_id$/, "") === "category" ? "client_categories" : name, on: name };
    const target = rel.table.replace(/^client_contacts$/, "client_contacts");
    if (rel.many) {
      const kids = db[target].filter((k) => k[rel.on] === row.id);
      out[alias ?? name] = inner.trim() === "count" ? [{ count: kids.length }] : kids.map((k) => project(target, k, inner));
    } else {
      const parent = db[target].find((p) => p.id === row[rel.on]);
      out[alias ?? name] = parent ? project(target, parent, inner) : null;
    }
  }
  return out;
}

function matches(row: Row, key: string, expr: string): boolean {
  if (key === "or") {
    return splitTop(expr.replace(/^\(|\)$/g, "")).some((cond) => {
      const [k, op, ...v] = cond.split(".");
      return matches(row, k, `${op}.${v.join(".")}`);
    });
  }
  if (expr.startsWith("not.")) return !matches(row, key, expr.slice(4));
  const [op, ...rest] = expr.split(".");
  const val = rest.join(".");
  const cell = row[key];
  switch (op) {
    case "eq": return String(cell) === val;
    case "neq": return String(cell) !== val;
    case "is": return val === "null" ? cell == null : String(cell) === val;
    case "in": return val.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/"/g, "")).includes(String(cell));
    case "ilike": {
      const re = new RegExp("^" + val.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$", "i");
      return re.test(String(cell ?? ""));
    }
    case "lt": return String(cell) < val;
    case "gte": return String(cell) >= val;
    case "lte": return String(cell) <= val;
    default: return true;
  }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
  if (url.pathname.startsWith("/storage/v1/object/")) {           // uploads: accept and forget
    return json({ Key: url.pathname.split("/object/")[1], Id: uid() });
  }
  if (!url.pathname.startsWith("/rest/v1/")) {
    if (url.pathname.startsWith("/auth/v1/")) return json({});
    return realFetch(input, init);
  }
  await new Promise((r) => setTimeout(r, 120));        // feel like a network
  const table = url.pathname.split("/").pop()!;
  if (url.pathname.includes("/rpc/")) {                       // database functions
    if (table === "next_invoice_number") {
      const n = db.invoices.filter((i) => i.number).length + 1;
      return json(`26102-${String(n).padStart(3, "0")}`);
    }
    return json(null);
  }
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  const single = /vnd\.pgrst\.object/.test(headers.get("accept") ?? "");
  const rows = db[table] ?? (db[table] = []);
  const params = [...url.searchParams.entries()];
  const filters = params.filter(([k]) => !["select", "order", "limit", "offset", "columns", "on_conflict"].includes(k));
  const pick = () => rows.filter((r) => filters.every(([k, v]) => matches(r, k, v)));

  if (method === "GET" || method === "HEAD") {
    let out = pick();
    for (const o of (url.searchParams.get("order") ?? "").split(",").filter(Boolean).reverse()) {
      const [col, dir] = o.split(".");
      out = [...out].sort((a, b) => String(a[col] ?? "").localeCompare(String(b[col] ?? ""), undefined, { numeric: true }) * (dir === "desc" ? -1 : 1));
    }
    const limit = Number(url.searchParams.get("limit")) || out.length;
    const shaped = out.slice(0, limit).map((r) => project(table, r, url.searchParams.get("select") ?? "*"));
    const range = { "content-range": `0-${Math.max(0, shaped.length - 1)}/${out.length}` };
    if (method === "HEAD") return new Response(null, { status: 200, headers: range });
    return json(single ? shaped[0] ?? null : shaped, 200, range);
  }
  const body = init.body ? JSON.parse(String(init.body)) : {};
  const sel = url.searchParams.get("select") ?? "*";
  if (method === "POST") {
    const added = (Array.isArray(body) ? body : [body]).map((b) => ({ id: uid(), created_at: now(), ...b }));
    rows.push(...added);
    if (table === "client_notes") for (const n of added) {        // the trigger the real database has
      const c = db.clients.find((x) => x.id === n.client_id);
      if (c) Object.assign(c, { latest_note: n.body, latest_note_at: n.created_at });
    }
    const shaped = added.map((r) => project(table, r, sel));
    return json(single ? shaped[0] : shaped, 201);
  }
  if (method === "PATCH") {
    const hit = pick();
    hit.forEach((r) => Object.assign(r, body, { updated_at: now() }));
    const shaped = hit.map((r) => project(table, r, sel));
    return json(single ? shaped[0] : shaped);
  }
  if (method === "DELETE") {
    const hit = pick();
    db[table] = rows.filter((r) => !hit.includes(r));
    return json(hit.map((r) => project(table, r, sel)));
  }
  return json({ message: "mock: unhandled" }, 400);
};

// a signed-in stand-in, so the app skips the sign-in screen
localStorage.setItem("tipolo-portal-auth", JSON.stringify({
  access_token: "mock", refresh_token: "mock", token_type: "bearer",
  expires_at: Math.floor(Date.now() / 1000) + 86400, expires_in: 86400,
  user: { id: "u-mock", email: "jim@tipolo.ca", aud: "authenticated", role: "authenticated" },
}));
console.info("[mock] sample data, stand-in session");
