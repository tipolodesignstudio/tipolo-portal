// Settings — business identity, rates, taxes, numbering and the managed lists.
//
// Five tabs rather than one long scroll. The tabbed panels are all inside one form and
// share the Save button; the managed lists (staff tiers, client and expense categories)
// are rows in their own tables, so they save as you edit them and need no Save.

import { escapeHtml, money, setCurrency } from "../core/format.js";
import { on } from "../core/render.js";
import {
  getSettings, saveSettings, uploadLogo, uploadSignature,
  listStaffTiers, createStaffTier, updateStaffTier, deleteStaffTier, setDefaultStaffTier,
  listCategories, createCategory, updateCategory, deleteCategory,
  listExpenseCategories, createExpenseCategory, updateExpenseCategory, deleteExpenseCategory,
  setBooksState,
} from "../core/api.js";
import * as drive from "../core/gdrive.js";
import { linkDrive, TRACKER_NAME } from "../core/books.js";
import { confirmModal } from "../components/modal.js";
import { toastOk, toastErr } from "../components/toast.js";

const TABS = [
  { id: "business", label: "Business" },
  { id: "rates", label: "Rates" },
  { id: "taxes", label: "Taxes" },
  { id: "numbering", label: "Numbering" },
  { id: "categories", label: "Categories" },
  { id: "drive", label: "Google Drive" },
];
// tabs made of lists that save themselves — the Save button has nothing to do there
const SELF_SAVING = ["categories", "drive"];
const TAB_KEY = "tipolo.settings.tab";

let taxLines = [];

export async function render(root, ctx) {
  ctx.setCrumbs?.("Settings");
  root.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading settings…</div>`;

  let s;
  try { s = await getSettings(); }
  catch (err) { root.innerHTML = errBox(err); return; }

  taxLines = Array.isArray(s.tax_lines) && s.tax_lines.length
    ? s.tax_lines.map((t) => ({ ...t }))
    : [{ label: "GST", rate: 5, enabled: true }, { label: "PST", rate: 7, enabled: true }];

  /* Numbering is no longer typed in. The year follows the calendar, and the next number
     is whatever next_job_number() would hand out right now — worked out the same way
     here so the page cannot promise a number the database won't give. */
  const year = new Date().getFullYear();
  const yy = String(year).slice(2);
  const start = Number(s.job_seq_start) || 101;
  const rolled = Number(s.job_seq_year) !== year;
  const nextSeq = rolled ? start : Math.max(Number(s.job_seq_next) || start, start);

  let tab = localStorage.getItem(TAB_KEY);
  if (!TABS.some((t) => t.id === tab)) tab = TABS[0].id;

  root.innerHTML = `
    <div class="page-head">
      <div><h1>Settings</h1>
        <div class="muted">These details appear on your invoices and proposals.</div></div>
    </div>

    <div class="part-nav" id="settings-tabs">
      ${TABS.map((t) => `<button type="button" data-tab="${t.id}"
        class="${t.id === tab ? "active" : ""}">${escapeHtml(t.label)}</button>`).join("")}
    </div>

    <form id="settings-form" class="stack">

      <div data-panel="business" class="stack">
        <div class="card">
          <h2>Business identity</h2>
          <div class="form-grid cols-2">
            ${text("business_name", "Business name", s.business_name, "Tipolo Design Studio")}
            ${text("email", "Billing email", s.email, "accounts@tipolo.ca")}
            ${text("phone", "Phone", s.phone)}
            ${text("currency", "Currency code", s.currency || "CAD")}
          </div>
          <div class="form-grid" style="margin-top:14px">
            ${textarea("address", "Address", s.address, 2)}
          </div>
          <div class="form-grid cols-2" style="margin-top:14px">
            ${text("gst_number", "GST number", s.gst_number)}
            ${text("pst_number", "PST number", s.pst_number)}
          </div>
        </div>

        <div class="card">
          <h2>Logo</h2>
          <div class="cluster">
            <div id="logo-preview" style="width:120px;height:60px;border:1px solid var(--border);
                 border-radius:8px;display:grid;place-items:center;background:var(--bg);overflow:hidden">
              ${s.logo_url ? `<img src="${escapeHtml(s.logo_url)}" style="max-width:100%;max-height:100%">`
                           : `<span class="faint" style="font-size:.8rem">No logo</span>`}
            </div>
            <label class="btn subtle sm">
              Upload image<input type="file" id="logo-file" accept="image/*" hidden />
            </label>
            <input type="hidden" name="logo_url" value="${escapeHtml(s.logo_url || "")}" />
            ${s.logo_url ? `<button type="button" class="btn link" id="logo-clear">Remove</button>` : ""}
          </div>
          <div class="hint">Requires a public Storage bucket named <code>branding</code> (see SETUP.md).</div>
        </div>

        <div class="card">
          <h2>Signature</h2>
          <div class="muted" style="margin-bottom:10px">
            Printed on a proposal's cover letter, between “Sincerely,” and your name.
            A PNG with a transparent background works best.
          </div>
          <div class="cluster">
            <div id="sig-preview" style="width:190px;height:70px;border:1px solid var(--border);
                 border-radius:8px;display:grid;place-items:center;background:var(--bg);overflow:hidden">
              ${s.signature_url ? `<img src="${escapeHtml(s.signature_url)}" style="max-width:100%;max-height:100%">`
                                : `<span class="faint" style="font-size:.8rem">No signature</span>`}
            </div>
            <label class="btn subtle sm">
              Upload image<input type="file" id="sig-file" accept="image/*" hidden />
            </label>
            <input type="hidden" name="signature_url" value="${escapeHtml(s.signature_url || "")}" />
            ${s.signature_url ? `<button type="button" class="btn link" id="sig-clear">Remove</button>` : ""}
          </div>
        </div>
      </div>

      <div data-panel="rates" class="stack">
        <div class="card">
          <h2>Staff rates</h2>
          <div class="muted" style="margin-bottom:10px">
            One row per tier. The tier marked <strong>default</strong> is the rate a
            proposal quotes and the one a project falls back to when neither it nor the
            client sets its own. The whole list prints as the proposal's rate card.
          </div>
          <div id="tier-list"></div>
          <div class="cluster" style="margin-top:10px">
            <input type="text" id="tier-new" placeholder="New tier, e.g. Junior Designer"
                   style="max-width:260px" />
            <button type="button" class="btn subtle sm" id="tier-add">Add tier</button>
          </div>
        </div>

        <div class="card">
          <h2>Length of a day</h2>
          <div class="form-grid cols-2">
            ${number("hours_per_day", "Hours in a working day", s.hours_per_day ?? 8, "0.25")}
          </div>
          <div class="hint">A day rate is the hourly rate times this — there is no second
            figure to keep in step. <span id="day-example"></span></div>
        </div>
      </div>

      <div data-panel="taxes" class="stack">
        <div class="card">
          <h2>Tax lines</h2>
          <div class="muted" style="margin-bottom:10px">Applied to invoice subtotals in order.</div>
          <div id="tax-rows" class="stack" style="gap:8px"></div>
          <button type="button" class="btn ghost sm" id="tax-add" style="margin-top:10px">+ Add tax line</button>
        </div>
      </div>

      <div data-panel="numbering" class="stack">
        <div class="card">
          <h2>Job numbers</h2>
          <div class="muted" style="margin-bottom:10px">
            Jobs are numbered <code>YYNNN</code> — a proposal or project draws the next
            one, and a converted proposal keeps its number as the project number.
            Invoices are <code>YYNNN-XXX</code>: the project number plus a per-project
            count from <code>001</code>.
          </div>
          <div class="form-grid cols-2">
            <div class="field">
              <label class="lbl">Sequence year</label>
              <span class="ro-box">${year}</span>
            </div>
            <div class="field">
              <label class="lbl">Next job number</label>
              <span class="ro-box"><code>${yy}${String(nextSeq).padStart(3, "0")}</code></span>
            </div>
          </div>
          <div class="hint" style="margin-top:8px">
            The year follows the calendar on its own${rolled
              ? ` — the counter still reads ${escapeHtml(String(s.job_seq_year))} and rolls over on the next number drawn`
              : ""}.
          </div>
        </div>

        <div class="card">
          <h2>The January reset</h2>
          <div class="muted" style="margin-bottom:10px">
            On the first job number of a new year the count restarts, and
            <code>${yy}001</code> is created as that year's internal project — the one
            you log studio time against. Client work begins at the number below, so the
            range beneath it stays with the studio.
          </div>
          <div class="form-grid cols-2">
            ${number("job_seq_start", "Client work starts at", start, "1")}
            ${number("job_seq_next", "Override the next number", nextSeq, "1")}
          </div>
          <div class="hint">Change the override only to line the portal up with numbers
            you have already issued elsewhere; it is stamped with this year.</div>
        </div>
      </div>

      <div data-panel="categories" class="stack">
        <div class="card">
          <h2>Client categories</h2>
          <div class="muted" style="margin-bottom:10px">
            Assignable on each client and filterable on the Clients list.</div>
          <div id="cat-list"></div>
          <div class="cluster" style="margin-top:10px">
            <input type="text" id="cat-new" placeholder="New category…" style="max-width:240px" />
            <button type="button" class="btn subtle sm" id="cat-add">Add</button>
          </div>
        </div>

        <div class="card">
          <h2>Expense categories</h2>
          <div class="muted" style="margin-bottom:10px">Used when logging an expense.</div>
          <div id="ecat-list"></div>
          <div class="cluster" style="margin-top:10px">
            <input type="text" id="ecat-new" placeholder="New category…" style="max-width:240px" />
            <button type="button" class="btn subtle sm" id="ecat-add">Add</button>
          </div>
        </div>

        <div class="card">
          <h2>Payment methods</h2>
          <div class="muted" style="margin-bottom:10px">
            The choices on an expense or a payment, and the dropdowns in the Excel tracker.</div>
          <div class="form-grid cols-2">
            <div><div class="lbl">Expenses</div><div id="pm-expense"></div></div>
            <div><div class="lbl">Income</div><div id="pm-income"></div></div>
          </div>
        </div>
      </div>

      <div data-panel="drive" class="stack">
        <div class="card">
          <h2>Google Drive</h2>
          <div class="muted" style="margin-bottom:12px">
            Receipts are filed in the Accounting folder, and the ${escapeHtml(TRACKER_NAME)}
            there is rewritten after every change to the books.</div>
          <div id="drive-panel"></div>
        </div>
      </div>

      <div class="cluster" id="save-bar">
        <button type="submit" class="btn">Save settings</button>
        <span id="save-state" class="faint"></span>
      </div>
    </form>`;

  const form = root.querySelector("#settings-form");

  /* ---- tabs ---- */
  function showTab(id) {
    tab = id;
    localStorage.setItem(TAB_KEY, id);
    root.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === id));
    root.querySelectorAll("[data-panel]").forEach((p) => { p.hidden = p.dataset.panel !== id; });
    // The lists save themselves, so the Save button has nothing to do on that tab.
    root.querySelector("#save-bar").hidden = SELF_SAVING.includes(id);
  }
  on(root, "click", "[data-tab]", (e, btn) => showTab(btn.dataset.tab));
  showTab(tab);

  /* ---- staff tiers ---- */
  const tiers = editableList(root, {
    listEl: "#tier-list", newEl: "#tier-new", addEl: "#tier-add", attr: "tier",
    placeholder: "No tiers yet — the proposal's rate card will print a placeholder.",
    list: listStaffTiers,
    create: (name) => createStaffTier(name),
    update: updateStaffTier,
    del: deleteStaffTier,
    delMsg: "Delete this tier? Proposals already written keep the rate they printed.",
    columns: (t) => `
      <input data-tier-field="name" value="${escapeHtml(t.name || "")}"
             placeholder="Tier name" style="flex:1;min-width:140px" />
      <span class="faint">$</span>
      <input data-tier-field="hourly_rate" type="number" step="0.01" min="0"
             value="${t.hourly_rate ?? ""}" placeholder="rate" style="max-width:100px;text-align:right" />
      <span class="faint" style="font-size:.8rem">/hour</span>
      <label style="display:flex;gap:6px;align-items:center;font-size:.85rem">
        <input type="radio" name="tier-default" data-tier-default ${t.is_default ? "checked" : ""}
               style="width:auto" /> default
      </label>`,
    onChange: refreshDayExample,
  });

  on(root, "change", "[data-tier-default]", async (e, el) => {
    const id = el.closest("[data-tier]").dataset.tier;
    try { await setDefaultStaffTier(id); toastOk("Default rate set"); tiers.refresh(); }
    catch (err) { toastErr(err.message); }
  });

  /* ---- categories ---- */
  editableList(root, {
    listEl: "#cat-list", newEl: "#cat-new", addEl: "#cat-add", attr: "cat",
    placeholder: "No categories.",
    list: listCategories, create: createCategory, update: updateCategory, del: deleteCategory,
    delMsg: "Delete this category? It's removed from any clients that have it.",
    columns: (c) => `<input data-cat-field="name" value="${escapeHtml(c.name || "")}"
      placeholder="Category name" style="flex:1;min-width:160px" />`,
  });
  editableList(root, {
    listEl: "#ecat-list", newEl: "#ecat-new", addEl: "#ecat-add", attr: "ecat",
    placeholder: "No categories.",
    list: listExpenseCategories, create: createExpenseCategory,
    update: updateExpenseCategory, del: deleteExpenseCategory,
    delMsg: "Delete this category? It's removed from any expenses that have it.",
    columns: (c) => `<input data-ecat-field="name" value="${escapeHtml(c.name || "")}"
      placeholder="Category name" style="flex:1;min-width:160px" />`,
  });

  /* ---- payment methods (plain lists on app_settings) ---- */
  stringList(root, "#pm-expense", s, "expense_payment_methods");
  stringList(root, "#pm-income", s, "income_payment_methods");

  /* ---- Google Drive ---- */
  drivePanel(root.querySelector("#drive-panel"), s);

  /* ---- the worked example under "length of a day" ---- */
  function refreshDayExample() {
    const el = root.querySelector("#day-example");
    if (!el) return;
    const hours = Number(root.querySelector("[name=hours_per_day]")?.value) || 0;
    const def = (tiers.rows() || []).find((t) => t.is_default) || (tiers.rows() || [])[0];
    const rate = def && def.hourly_rate != null ? Number(def.hourly_rate) : null;
    el.textContent = rate && hours
      ? `At ${money(rate)}/hour that is ${money(rate * hours)} a day.`
      : "";
  }
  on(root, "input", "[name=hours_per_day]", refreshDayExample);

  /* ---- tax lines ---- */
  renderTaxRows(root);
  on(root, "click", "#tax-add", () => {
    taxLines.push({ label: "", rate: 0, enabled: true });
    renderTaxRows(root);
  });
  on(root, "click", "[data-tax-del]", (e, node) => {
    taxLines.splice(Number(node.dataset.taxDel), 1);
    renderTaxRows(root);
  });
  on(root, "input", "[data-tax-field]", (e, node) => {
    const i = Number(node.dataset.i);
    const f = node.dataset.taxField;
    taxLines[i][f] = f === "rate" ? Number(node.value) : f === "enabled" ? node.checked : node.value;
  });

  /* ---- images ---- */
  const fileInput = root.querySelector("#logo-file");
  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const url = await uploadLogo(file);
      root.querySelector("[name=logo_url]").value = url;
      root.querySelector("#logo-preview").innerHTML =
        `<img src="${escapeHtml(url)}" style="max-width:100%;max-height:100%">`;
      toastOk("Logo uploaded");
    } catch (err) { toastErr("Upload failed: " + err.message); }
  });
  root.querySelector("#logo-clear")?.addEventListener("click", () => {
    root.querySelector("[name=logo_url]").value = "";
    root.querySelector("#logo-preview").innerHTML =
      `<span class="faint" style="font-size:.8rem">No logo</span>`;
  });

  const sigInput = root.querySelector("#sig-file");
  sigInput?.addEventListener("change", async () => {
    const file = sigInput.files[0];
    if (!file) return;
    try {
      const url = await uploadSignature(file);
      root.querySelector("[name=signature_url]").value = url;
      root.querySelector("#sig-preview").innerHTML =
        `<img src="${escapeHtml(url)}" style="max-width:100%;max-height:100%">`;
      toastOk("Signature uploaded — Save to keep it");
    } catch (err) { toastErr("Upload failed: " + err.message); }
  });
  root.querySelector("#sig-clear")?.addEventListener("click", () => {
    root.querySelector("[name=signature_url]").value = "";
    root.querySelector("#sig-preview").innerHTML =
      `<span class="faint" style="font-size:.8rem">No signature</span>`;
  });

  /* ---- save ---- */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button[type=submit]");
    const stateEl = root.querySelector("#save-state");
    const fd = new FormData(e.target);
    const seqStart = Math.max(1, Number(fd.get("job_seq_start")) || 101);
    const patch = {
      business_name: fd.get("business_name") || null,
      email: fd.get("email") || null,
      phone: fd.get("phone") || null,
      address: fd.get("address") || null,
      currency: (fd.get("currency") || "CAD").toUpperCase(),
      gst_number: fd.get("gst_number") || null,
      pst_number: fd.get("pst_number") || null,
      logo_url: fd.get("logo_url") || null,
      signature_url: fd.get("signature_url") || null,
      hours_per_day: Math.max(0.25, Number(fd.get("hours_per_day")) || 8),
      job_seq_start: seqStart,
      // The override is stamped with this year, which is what makes the year automatic:
      // saying "next is N" can only mean this year's N.
      job_seq_year: year,
      job_seq_next: Math.max(seqStart, Number(fd.get("job_seq_next")) || seqStart),
      tax_lines: taxLines
        .filter((t) => t.label.trim())
        .map((t) => ({ label: t.label.trim(), rate: Number(t.rate) || 0, enabled: !!t.enabled })),
    };
    btn.disabled = true; stateEl.textContent = "Saving…";
    try {
      const saved = await saveSettings(patch);
      setCurrency(saved.currency);
      stateEl.textContent = "Saved ✓";
      toastOk("Settings saved");
      setTimeout(() => (stateEl.textContent = ""), 2500);
    } catch (err) {
      stateEl.textContent = "";
      toastErr("Save failed: " + err.message);
    } finally { btn.disabled = false; }
  });
}

/* A list of plain names kept on app_settings — one input per entry, saved as you
   leave it. Emptying an entry removes it. */
function stringList(root, sel, s, key) {
  const host = root.querySelector(sel);
  let items = Array.isArray(s[key]) ? [...s[key]] : [];
  const paint = () => {
    host.innerHTML = `<div class="list-rows">${items.map((v, i) => `
        <div class="list-row"><input data-sl="${i}" value="${escapeHtml(v)}" style="flex:1" />
          <button type="button" class="icon-btn" data-sl-del="${i}" title="Delete">✕</button></div>`).join("")}
        <div class="list-row"><input data-sl-new placeholder="Add…" style="flex:1" /></div></div>`;
  };
  const save = async (next) => {
    const clean = [...new Set(next.map((v) => v.trim()).filter(Boolean))];
    if (JSON.stringify(clean) === JSON.stringify(items)) { paint(); return; }
    try { await setBooksState({ [key]: clean }); items = clean; }
    catch (err) { toastErr(/column/.test(err.message) ? "Run migration 0025 in Supabase first." : err.message); }
    paint();
  };
  host.addEventListener("focusout", (e) => {
    const el = e.target;
    if (el.dataset.sl != null) { const next = [...items]; next[+el.dataset.sl] = el.value; save(next); }
    else if (el.hasAttribute("data-sl-new") && el.value.trim()) save([...items, el.value]);
  });
  host.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); e.target.blur(); } });
  host.addEventListener("click", (e) => {
    const del = e.target.closest("[data-sl-del]");
    if (del) save(items.filter((_, i) => i !== +del.dataset.slDel));
  });
  paint();
}

/* Connect this browser to Google, and point the portal at the Accounting folder. */
function drivePanel(host, s) {
  let st = { drive_folder_id: s.drive_folder_id, drive_receipts_folder_id: s.drive_receipts_folder_id,
             drive_tracker_file_id: s.drive_tracker_file_id };
  let names = null;

  async function paint() {
    if (!drive.configured()) {
      host.innerHTML = `<div class="alert info">Google Drive isn't switched on yet. It needs a Google
        OAuth client ID in <code>config.js</code> — SETUP.md → “Google Drive” has the steps.</div>`;
      return;
    }
    drive.loadGoogle().catch(() => {});
    const on = drive.connected();
    if (on && st.drive_folder_id && !names) {
      try {
        const [f, r, t] = await Promise.all([st.drive_folder_id, st.drive_receipts_folder_id, st.drive_tracker_file_id]
          .map((id) => (id ? drive.getFile(id) : null)));
        names = { folder: f?.name, receipts: r?.name, tracker: t?.name, link: f?.webViewLink, tlink: t?.webViewLink };
      } catch (err) { names = { error: err.message }; }
    }
    host.innerHTML = `
      <div class="stack">
        <div class="cluster">
          <span class="badge ${on ? "green" : "grey"}">${on ? "Connected" : "Not connected"}</span>
          ${on ? `<button type="button" class="btn link sm" data-drive-off>disconnect</button>`
               : `<button type="button" class="btn subtle sm" data-drive-on>Connect Google Drive</button>`}
          <span class="faint" style="font-size:.85rem">Each person connects once per browser session.</span>
        </div>
        <div>
          <div class="lbl">Accounting folder</div>
          ${st.drive_folder_id ? `
            <div style="margin:4px 0 10px">
              ${names?.error ? `<span class="alert error" style="display:block">${escapeHtml(names.error)}</span>`
                : names ? `<a href="${escapeHtml(names.link || "#")}" target="_blank" rel="noopener">${escapeHtml(names.folder || "")}</a>
                    <span class="faint"> · receipts in ${escapeHtml(names.receipts || "Receipts")}
                    · tracker <a href="${escapeHtml(names.tlink || "#")}" target="_blank" rel="noopener">${escapeHtml(names.tracker || "")}</a></span>`
                : `<span class="faint">Linked. Connect to see the folder.</span>`}
            </div>` : `<div class="faint" style="margin:4px 0 10px">Not linked yet.</div>`}
          <div class="cluster">
            <input type="text" id="drive-link" placeholder="https://drive.google.com/drive/folders/…" style="flex:1;min-width:260px" />
            <button type="button" class="btn subtle sm" data-drive-link ${on ? "" : "disabled"}>${st.drive_folder_id ? "Re-link" : "Link folder"}</button>
          </div>
          <div class="hint">Open 01_Admin → Accounting in Google Drive and copy its link from the address bar.
            The first time, a copy of the tracker is saved alongside it as “(before portal)”.</div>
        </div>
      </div>`;
  }

  // Enter in the link box links it, rather than submitting the settings form around it
  host.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.id === "drive-link") { e.preventDefault(); host.querySelector("[data-drive-link]")?.click(); }
  });
  host.addEventListener("click", async (e) => {
    if (e.target.closest("[data-drive-on]")) {
      drive.connect().then(() => { names = null; paint(); }).catch((err) => toastErr(err.message));
    }
    if (e.target.closest("[data-drive-off]")) { drive.disconnect(); paint(); }
    const linkBtn = e.target.closest("[data-drive-link]");
    if (linkBtn) {
      const link = host.querySelector("#drive-link").value;
      linkBtn.disabled = true; linkBtn.innerHTML = `<span class="spinner"></span>`;
      try {
        const res = await linkDrive(link);
        st = { drive_folder_id: res.folder.id, drive_receipts_folder_id: res.receipts.id, drive_tracker_file_id: res.tracker.id };
        names = null;
        toastOk(`Linked ${res.folder.name}`);
      } catch (err) { toastErr(err.message); }
      paint();
    }
  });
  paint();
}

/* A managed list that saves as you edit it: type in a cell, and the row is written when
   you leave it or press Enter. No Rename button, no Save — the same feel as editing a
   spreadsheet, which is what these lists are. */
function editableList(root, cfg) {
  const host = root.querySelector(cfg.listEl);
  const a = cfg.attr;
  let rows = [];

  async function refresh() {
    try { rows = await cfg.list(); }
    catch (err) { host.innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`; return; }
    host.innerHTML = rows.length
      ? `<div class="list-rows">${rows.map((r) => `
          <div class="list-row" data-${a}="${r.id}">
            ${cfg.columns(r)}
            <button type="button" class="icon-btn" data-${a}-del title="Delete">✕</button>
          </div>`).join("")}</div>`
      : `<p class="faint" style="font-size:.9rem;margin:0">${escapeHtml(cfg.placeholder)}</p>`;
    cfg.onChange?.();
  }

  // Written on blur, and on Enter so the keyboard alone is enough.
  const commit = async (el) => {
    const wrap = el.closest(`[data-${a}]`);
    if (!wrap) return;
    const field = el.dataset[`${a}Field`];
    const row = rows.find((r) => r.id === wrap.dataset[a]);
    let value = el.value.trim();
    if (field === "name") {
      if (!value) { el.value = row?.name || ""; return; }
    } else {
      value = value === "" ? null : Number(value);
    }
    if (row && String(row[field] ?? "") === String(value ?? "")) return;   // untouched
    try {
      const saved = await cfg.update(wrap.dataset[a], { [field]: value });
      Object.assign(row || {}, saved);
      cfg.onChange?.();
    } catch (err) { toastErr(err.message); refresh(); }
  };

  // focusout, not blur: blur does not bubble, so it never reaches a delegated handler.
  on(root, "focusout", `[data-${a}-field]`, (e, el) => commit(el));
  on(root, "keydown", `[data-${a}-field]`, (e, el) => {
    if (e.key === "Enter") { e.preventDefault(); el.blur(); }
    if (e.key === "Escape") { refresh(); }
  });

  on(root, "click", `[data-${a}-del]`, async (e, btn) => {
    const ok = await confirmModal(cfg.delMsg, { title: "Delete", confirmText: "Delete" });
    if (!ok) return;
    try { await cfg.del(btn.closest(`[data-${a}]`).dataset[a]); toastOk("Deleted"); refresh(); }
    catch (err) { toastErr(err.message); }
  });

  const add = async () => {
    const input = root.querySelector(cfg.newEl);
    const name = input.value.trim();
    if (!name) return;
    try { await cfg.create(name); input.value = ""; refresh(); }
    catch (err) { toastErr(err.message); }
  };
  root.querySelector(cfg.addEl).addEventListener("click", add);
  root.querySelector(cfg.newEl).addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); add(); }
  });

  refresh();
  return { refresh, rows: () => rows };
}

function renderTaxRows(root) {
  const host = root.querySelector("#tax-rows");
  if (!taxLines.length) {
    host.innerHTML = `<div class="faint" style="font-size:.9rem">No tax lines — invoices will show subtotal = total.</div>`;
    return;
  }
  host.innerHTML = taxLines.map((t, i) => `
    <div class="cluster" style="gap:8px">
      <input data-tax-field="label" data-i="${i}"
             value="${escapeHtml(t.label)}" placeholder="Label (e.g. GST)" style="max-width:160px" />
      <input data-tax-field="rate" data-i="${i}" type="number" step="0.01" min="0"
             value="${t.rate}" style="max-width:90px" /> <span class="faint">%</span>
      <label style="display:flex;gap:6px;align-items:center;font-size:.85rem">
        <input type="checkbox" data-tax-field="enabled" data-i="${i}" ${t.enabled ? "checked" : ""}
               style="width:auto" /> on
      </label>
      <button type="button" class="btn link" data-tax-del="${i}">remove</button>
    </div>`).join("");
}

/* field helpers */
function text(name, label, val, ph = "") {
  return `<div class="field"><label class="lbl" for="f_${name}">${label}</label>
    <input id="f_${name}" name="${name}" type="text" value="${escapeHtml(val ?? "")}"
    placeholder="${escapeHtml(ph)}" /></div>`;
}
function number(name, label, val, step = "1") {
  return `<div class="field"><label class="lbl" for="f_${name}">${label}</label>
    <input id="f_${name}" name="${name}" type="number" step="${step}" min="0"
    value="${val ?? ""}" /></div>`;
}
function textarea(name, label, val, rows = 3) {
  return `<div class="field"><label class="lbl" for="f_${name}">${label}</label>
    <textarea id="f_${name}" name="${name}" rows="${rows}">${escapeHtml(val ?? "")}</textarea></div>`;
}
function errBox(err) {
  return `<div class="empty"><h3>Couldn't load settings</h3>
    <p class="faint">${escapeHtml(err.message || String(err))}</p></div>`;
}
