// Settings: business identity, tax lines, numbering, client categories, terms, logo.
import { escapeHtml, setCurrency } from "../core/format.js";
import { on } from "../core/render.js";
import {
  getSettings, saveSettings, uploadLogo,
  listCategories, createCategory, updateCategory, deleteCategory,
} from "../core/api.js";
import { confirmModal } from "../components/modal.js";
import { toastOk, toastErr } from "../components/toast.js";

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

  root.innerHTML = `
    <div class="page-head">
      <div><h1>Settings</h1>
        <div class="muted">These details appear on your invoices and proposals.</div></div>
    </div>

    <form id="settings-form" class="stack">
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
        <h2>Tax lines</h2>
        <div class="muted" style="margin-bottom:10px">Applied to invoice subtotals in order.</div>
        <div id="tax-rows" class="stack" style="gap:8px"></div>
        <button type="button" class="btn ghost sm" id="tax-add" style="margin-top:10px">+ Add tax line</button>
      </div>

      <div class="card">
        <h2>Numbering</h2>
        <div class="muted" style="margin-bottom:10px">
          Jobs are numbered <code>YYNNN</code> (e.g. <code>${String(new Date().getFullYear()).slice(2)}001</code>) —
          a proposal or project draws the next number, and a converted proposal keeps its
          number as the project number. The sequence resets each January.
          Invoices are <code>YYNNN-XX</code> — the project number plus a per-project
          count starting at <code>01</code>.
        </div>
        <div class="form-grid cols-2">
          ${number("default_hourly_rate", "Default hourly rate", s.default_hourly_rate, "0.01")}
          ${number("job_seq_year", "Sequence year", s.job_seq_year ?? new Date().getFullYear(), "1")}
          ${number("job_seq_next", "Next job number", s.job_seq_next ?? 1, "1")}
        </div>
        <div class="hint">Adjust "Next job number" only to line the portal up with numbers you've already issued elsewhere.</div>
      </div>

      <div class="card">
        <h2>Client categories</h2>
        <div class="muted" style="margin-bottom:10px">Assignable on each client and filterable on the Clients list.</div>
        <div id="cat-list" class="stack" style="gap:8px"></div>
        <form class="cluster" id="cat-add" style="margin-top:10px">
          <input type="text" name="name" placeholder="New category…" style="max-width:220px" />
          <button class="btn subtle sm" type="submit">Add category</button>
        </form>
      </div>

      <div class="card">
        <h2>Boilerplate</h2>
        <div class="form-grid">
          ${textarea("payment_terms", "Invoice payment terms", s.payment_terms, 3)}
          ${textarea("proposal_terms", "Proposal default terms", s.proposal_terms, 3)}
        </div>
      </div>

      <div class="cluster">
        <button type="submit" class="btn">Save settings</button>
        <span id="save-state" class="faint"></span>
      </div>
    </form>`;

  renderTaxRows(root);
  wireCategories(root);

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

  root.querySelector("#settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button[type=submit]");
    const stateEl = root.querySelector("#save-state");
    const fd = new FormData(e.target);
    const patch = {
      business_name: fd.get("business_name") || null,
      email: fd.get("email") || null,
      phone: fd.get("phone") || null,
      address: fd.get("address") || null,
      currency: (fd.get("currency") || "CAD").toUpperCase(),
      gst_number: fd.get("gst_number") || null,
      pst_number: fd.get("pst_number") || null,
      logo_url: fd.get("logo_url") || null,
      default_hourly_rate: fd.get("default_hourly_rate") ? Number(fd.get("default_hourly_rate")) : null,
      job_seq_year: Math.max(2000, Number(fd.get("job_seq_year")) || new Date().getFullYear()),
      job_seq_next: Math.max(1, Number(fd.get("job_seq_next")) || 1),
      payment_terms: fd.get("payment_terms") || null,
      proposal_terms: fd.get("proposal_terms") || null,
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

async function wireCategories(root) {
  const host = root.querySelector("#cat-list");
  if (!host) return;

  async function refresh() {
    let cats = [];
    try { cats = await listCategories(); }
    catch (err) { host.innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`; return; }
    host.innerHTML = cats.length ? cats.map((c) => `
      <div class="cluster" data-cat="${c.id}" style="gap:8px">
        <input value="${escapeHtml(c.name)}" data-cat-name style="max-width:220px" />
        <button type="button" class="btn ghost sm" data-cat-save>Rename</button>
        <button type="button" class="btn link" data-cat-del>delete</button>
      </div>`).join("")
      : `<p class="faint" style="font-size:.9rem">No categories.</p>`;
  }

  on(root, "click", "[data-cat-save]", async (e, btn) => {
    const wrap = btn.closest("[data-cat]");
    const name = wrap.querySelector("[data-cat-name]").value.trim();
    if (!name) return;
    try { await updateCategory(wrap.dataset.cat, { name }); toastOk("Renamed"); refresh(); }
    catch (err) { toastErr(err.message); }
  });
  on(root, "click", "[data-cat-del]", async (e, btn) => {
    const ok = await confirmModal("Delete this category? It's removed from any clients that have it.",
      { title: "Delete category", confirmText: "Delete" });
    if (!ok) return;
    try { await deleteCategory(btn.closest("[data-cat]").dataset.cat); toastOk("Deleted"); refresh(); }
    catch (err) { toastErr(err.message); }
  });
  root.querySelector("#cat-add").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = e.target.elements.name;
    const name = input.value.trim();
    if (!name) return;
    try { await createCategory(name); input.value = ""; toastOk("Category added"); refresh(); }
    catch (err) { toastErr(err.message); }
  });

  await refresh();
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
