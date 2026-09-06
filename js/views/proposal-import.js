// Import a proposal from a PDF: read it, review what was read, then create the draft.
//
// Nothing is written to the database until "Create draft proposal" is clicked — the
// reader only ever fills in a form for you to check.

import { escapeHtml, money } from "../core/format.js";
import { on } from "../core/render.js";
import {
  listClients, createClient, createProposal, uploadProposalSource, createTemplate, getSettings,
} from "../core/api.js";
import { extractPdf } from "../core/pdf-text.js";
import { parseProposal, matchClient } from "../core/proposal-parse.js";
import { aiParseProposal, aiAvailable } from "../core/proposal-ai.js";
import { lineAmount } from "../core/invoice-calc.js";
import { toastOk, toastErr } from "../components/toast.js";
import { openModal, confirmModal } from "../components/modal.js";
import { field } from "../components/form.js";

const SCOPES = ["landscape", "multimedia", "other"];
const NEW_CLIENT = "__new__";

export async function render(root, ctx) {
  ctx.setCrumbs?.("Proposals / Import");

  let clients = [];
  let settings = {};
  try {
    [clients, settings] = await Promise.all([
      listClients({ status: "all" }), getSettings().catch(() => ({})),
    ]);
  } catch (err) { toastErr(err.message); }

  let file = null;      // the chosen PDF
  let doc = null;       // extracted text model
  let draft = null;     // what the reader produced (then edited by hand)
  let dirty = false;    // has the draft been hand-edited since it was read?
  let aiOk = false;

  aiAvailable().then((v) => {
    aiOk = v;
    const btn = root.querySelector("[data-ai]");
    if (btn) btn.hidden = !v;
  });

  root.innerHTML = `
    <div class="page-head">
      <div>
        <div class="faint" style="font-size:.85rem"><a href="#/proposals">← Proposals</a></div>
        <h1>Import a proposal</h1>
        <div class="muted">Read an existing proposal PDF into a draft — then check it over.</div>
      </div>
    </div>
    <div id="stage"></div>`;

  const stage = root.querySelector("#stage");

  /* ---------- step 1: pick a file ---------- */

  function pickStep(message = "") {
    stage.innerHTML = `
      ${message ? `<div class="alert error" style="margin-bottom:16px">${escapeHtml(message)}</div>` : ""}
      <div class="card">
        <div id="drop" class="empty" style="border:2px dashed var(--border);border-radius:10px;
             padding:38px 20px;cursor:pointer;transition:background .15s">
          <h3>Drop a proposal PDF here</h3>
          <p class="faint">…or click to choose one. Nothing is saved until you review it.</p>
        </div>
        <input type="file" accept="application/pdf,.pdf" id="pdf" hidden />
        <div class="hint" style="margin-top:12px">
          Works best on PDFs with selectable text (exported from InDesign, Word or Pages).
          A scan with no text layer needs the AI reader.
        </div>
      </div>`;

    const drop = stage.querySelector("#drop");
    const input = stage.querySelector("#pdf");
    drop.onclick = () => input.click();
    input.onchange = () => { if (input.files[0]) start(input.files[0]); };
    ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => {
      e.preventDefault(); drop.style.background = "var(--bg-alt)";
    }));
    ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => {
      e.preventDefault(); drop.style.background = "";
    }));
    drop.addEventListener("drop", (e) => {
      const f = e.dataTransfer?.files?.[0];
      if (f) start(f);
    });
  }

  function busy(text) {
    stage.innerHTML = `<div class="card"><div class="loading-row">
      <span class="spinner"></span> ${escapeHtml(text)}</div></div>`;
  }

  /* ---------- step 2: read ---------- */

  async function start(f) {
    if (f.type && !/pdf/i.test(f.type) && !/\.pdf$/i.test(f.name)) {
      return pickStep("That doesn't look like a PDF.");
    }
    if (f.size > 25_000_000) return pickStep("That PDF is over 25 MB — too large to read here.");

    file = f;
    busy(`Reading ${f.name}…`);
    try {
      doc = await extractPdf(f);
    } catch (err) {
      console.error(err);
      return pickStep(`Couldn't open that PDF: ${err.message}`);
    }

    draft = parseProposal(doc, { clients, businessName: settings.business_name || "" });
    dirty = false;

    if (doc.text.trim().length < 200) {
      draft.warnings.unshift(
        "This PDF has almost no text layer — it's probably a scan. " +
        "The local reader can't do much with it; try “Read with AI”.");
    }
    reviewStep();
  }

  /* ---------- step 3: review ---------- */

  const subtotal = () => draft.line_items.reduce((s, li) => s + lineAmount(li), 0);

  function chip(key) {
    const c = draft.conf?.[key] ?? 0;
    if (c >= 0.75) return `<span class="badge green" title="Read confidently">read</span>`;
    if (c >= 0.4) return `<span class="badge amber" title="Best guess — please check">guess</span>`;
    return `<span class="badge red" title="Not found in the document">not found</span>`;
  }

  function clientOptions() {
    const opts = clients.map((c) =>
      `<option value="${c.id}" ${draft.client_id === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`);
    const label = draft.client_name
      ? `Create new client “${draft.client_name}”`
      : "Create a new client";
    opts.unshift(`<option value="${NEW_CLIENT}" ${!draft.client_id ? "selected" : ""}>+ ${escapeHtml(label)}</option>`);
    return opts.join("");
  }

  function reviewStep() {
    const near = !draft.client_id && draft.client_name
      ? matchClient(draft.client_name, clients).near : null;

    stage.innerHTML = `
      <div class="cluster" style="margin-bottom:14px">
        <span class="faint">From <strong>${escapeHtml(file.name)}</strong>
          · ${doc.pageCount} page${doc.pageCount === 1 ? "" : "s"}</span>
        <span style="flex:1"></span>
        <button class="btn ghost sm" data-ai ${aiOk ? "" : "hidden"}>Read with AI</button>
        <button class="btn ghost sm" data-restart>Choose another PDF</button>
      </div>

      ${draft.warnings.length ? `<div class="alert warn" style="margin-bottom:16px">
        <strong>Check these:</strong>
        <ul style="margin:6px 0 0 18px">${draft.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>
      </div>` : ""}
      ${draft.notes ? `<div class="alert info" style="margin-bottom:16px">${escapeHtml(draft.notes)}</div>` : ""}

      <div class="card">
        <div class="form-grid cols-2">
          <div class="field">
            <label class="lbl" for="i_title">Project title * ${chip("title")}</label>
            <input id="i_title" data-f="title" value="${escapeHtml(draft.title)}" required />
          </div>
          <div class="field">
            <label class="lbl" for="i_scope">Scope ${chip("project_scope")}</label>
            <select id="i_scope" data-f="project_scope">
              ${SCOPES.map((s) => `<option value="${s}" ${draft.project_scope === s ? "selected" : ""}>${s[0].toUpperCase() + s.slice(1)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label class="lbl" for="i_client">Client * ${chip("client_name")}</label>
            <select id="i_client" data-f="client_id">${clientOptions()}</select>
            ${draft.client_name
              ? `<div class="hint">Document says “${escapeHtml(draft.client_name)}”${
                  draft.client_id ? " — matched to the client above."
                  : near ? ` — closest existing client is <em>${escapeHtml(near.name)}</em>.`
                  : "."}</div>`
              : `<div class="hint">No client name was found in the document — pick one.</div>`}
          </div>
          <div class="field" data-newclient ${draft.client_id ? "hidden" : ""}>
            <label class="lbl" for="i_newname">New client name *</label>
            <input id="i_newname" data-f="client_name" value="${escapeHtml(draft.client_name)}" />
            <div class="hint">A client record is created with this name.</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="between"><h2 class="mt-0">Sections ${chip("sections")}</h2>
          <button class="btn subtle sm" data-add-section>+ Add section</button></div>
        <div id="sections"></div>
      </div>

      <div class="card">
        <div class="between"><h2 class="mt-0">Fee schedule ${chip("line_items")}</h2>
          <button class="btn subtle sm" data-add-line>+ Add line</button></div>
        <div class="table-wrap">
          <table class="data" id="lines"><thead><tr>
            <th style="min-width:200px">Description</th>
            <th class="num" style="width:80px">Qty</th>
            <th class="num" style="width:120px">Unit price</th>
            <th class="num" style="width:120px">Amount</th>
            <th></th>
          </tr></thead><tbody></tbody></table>
        </div>
        <div class="totals-box"><div class="totals">
          <div class="row grand"><span>Estimated fee</span><span id="fee-total">${money(subtotal())}</span></div>
          ${draft.subtotal && Math.abs(draft.subtotal - subtotal()) > 0.02 ? `
            <div class="row faint" style="font-size:.85rem"><span>Document says</span>
              <span>${money(draft.subtotal)}</span></div>` : ""}
        </div></div>
      </div>

      <div class="cluster right" style="justify-content:flex-end;margin-top:8px">
        <label class="cluster" style="gap:6px;font-size:.9rem" title="Keeps the original PDF on the proposal.">
          <input type="checkbox" id="keep-pdf" checked /> Attach the original PDF
        </label>
        <button class="btn ghost" data-template>Save as template</button>
        <button class="btn" data-create>Create draft proposal</button>
      </div>`;

    renderSections();
    renderLines();
  }

  function renderSections() {
    const host = stage.querySelector("#sections");
    if (!host) return;
    host.innerHTML = draft.sections.length ? draft.sections.map((s, i) => `
      <div class="sec-block" data-i="${i}">
        <div class="cluster" style="gap:6px;margin-bottom:6px">
          <input data-k="heading" value="${escapeHtml(s.heading || "")}" placeholder="Section heading" style="flex:1" />
          <button class="btn link" data-move="-1" ${i === 0 ? "disabled" : ""}>↑</button>
          <button class="btn link" data-move="1" ${i === draft.sections.length - 1 ? "disabled" : ""}>↓</button>
          <button class="btn link" data-del-sec>remove</button>
        </div>
        <textarea data-k="body" rows="5" placeholder="Section text…">${escapeHtml(s.body || "")}</textarea>
      </div>`).join("")
      : `<p class="faint" style="font-size:.9rem">No sections were read from the document.</p>`;
  }

  function renderLines() {
    const tbody = stage.querySelector("#lines tbody");
    if (!tbody) return;
    tbody.innerHTML = draft.line_items.length ? draft.line_items.map((li, i) => `
      <tr data-i="${i}">
        <td><input data-k="description" value="${escapeHtml(li.description || "")}" /></td>
        <td class="num"><input data-k="qty" type="number" step="0.01" min="0" value="${li.qty ?? 1}" style="text-align:right" /></td>
        <td class="num"><input data-k="unit_price" type="number" step="0.01" min="0" value="${li.unit_price ?? 0}" style="text-align:right" /></td>
        <td class="num">${money(lineAmount(li))}</td>
        <td class="right"><button class="btn link" data-del-line="${i}">remove</button></td>
      </tr>`).join("")
      : `<tr><td colspan="5" class="faint" style="text-align:center;padding:16px">No fee lines were read.</td></tr>`;
    const total = stage.querySelector("#fee-total");
    if (total) total.textContent = money(subtotal());
  }

  /* ---------- wiring ---------- */

  on(root, "input", "[data-f]", (e, el) => {
    draft[el.dataset.f] = el.value;
    dirty = true;
  });

  on(root, "change", "[data-f=client_id]", (e, el) => {
    const isNew = el.value === NEW_CLIENT;
    draft.client_id = isNew ? "" : el.value;
    const box = stage.querySelector("[data-newclient]");
    if (box) box.hidden = !isNew;
    dirty = true;
  });

  on(root, "input", "#sections [data-k]", (e, el) => {
    draft.sections[+el.closest(".sec-block").dataset.i][el.dataset.k] = el.value;
    dirty = true;
  });
  on(root, "click", "[data-add-section]", () => {
    draft.sections.push({ heading: "", body: "" }); dirty = true; renderSections();
  });
  on(root, "click", "[data-del-sec]", (e, el) => {
    draft.sections.splice(+el.closest(".sec-block").dataset.i, 1); dirty = true; renderSections();
  });
  on(root, "click", "[data-move]", (e, el) => {
    const i = +el.closest(".sec-block").dataset.i;
    const j = i + Number(el.dataset.move);
    if (j < 0 || j >= draft.sections.length) return;
    [draft.sections[i], draft.sections[j]] = [draft.sections[j], draft.sections[i]];
    dirty = true; renderSections();
  });

  on(root, "input", "#lines input", (e, el) => {
    const i = +el.closest("tr").dataset.i;
    const k = el.dataset.k;
    draft.line_items[i][k] = k === "description" ? el.value : Number(el.value);
    dirty = true;
    if (k !== "description") {
      el.closest("tr").querySelector("td:nth-child(4)").textContent = money(lineAmount(draft.line_items[i]));
      stage.querySelector("#fee-total").textContent = money(subtotal());
    }
  });
  on(root, "click", "[data-add-line]", () => {
    draft.line_items.push({ description: "", qty: 1, unit_price: 0 }); dirty = true; renderLines();
  });
  on(root, "click", "[data-del-line]", (e, el) => {
    draft.line_items.splice(+el.dataset.delLine, 1); dirty = true; renderLines();
  });

  on(root, "click", "[data-restart]", async () => {
    if (dirty && !(await confirmModal("Discard what you've edited and start over?",
      { confirmText: "Discard" }))) return;
    file = null; doc = null; draft = null; dirty = false;
    pickStep();
  });

  /* ---- AI pass ---- */
  on(root, "click", "[data-ai]", async (e, btn) => {
    if (dirty && !(await confirmModal(
      "The AI reader replaces everything on this screen with what it reads. Your edits will be lost.",
      { confirmText: "Read anyway", danger: false }))) return;

    btn.disabled = true;
    const label = btn.textContent;
    btn.innerHTML = `<span class="spinner"></span>`;
    try {
      const ai = await aiParseProposal({ text: doc.text, file, clients });
      const match = ai.client_id && clients.some((c) => c.id === ai.client_id)
        ? { client: clients.find((c) => c.id === ai.client_id), score: 1 }
        : matchClient(ai.client_name, clients);

      draft = {
        title: ai.title || "",
        client_name: ai.client_name || "",
        client_id: match.client?.id || "",
        project_scope: ai.project_scope || "other",
        sections: (ai.sections || []).map((s) => ({ ...s })),
        line_items: (ai.line_items || []).map((li) => ({ ...li })),
        subtotal: ai.subtotal || 0,
        dated: ai.dated || "",
        valid_until: ai.valid_until || "",
        notes: ai.notes || "",
        conf: {
          title: ai.title ? 0.9 : 0,
          client_name: match.client ? 0.9 : ai.client_name ? 0.6 : 0,
          project_scope: 0.85,
          sections: ai.sections?.length ? 0.9 : 0,
          line_items: ai.line_items?.length ? 0.9 : 0,
        },
        warnings: [],
      };
      if (!draft.title) draft.warnings.push("The reader found no project title.");
      if (!draft.client_name) draft.warnings.push("The reader found no client name.");
      if (!draft.line_items.length) draft.warnings.push("The reader found no fee lines.");
      dirty = false;
      reviewStep();
      toastOk("Read with AI — check the fields below.");
    } catch (err) {
      btn.disabled = false;
      btn.textContent = label;
      toastErr(err.message);
    }
  });

  /* ---- save the read document as a reusable template ---- */
  on(root, "click", "[data-template]", async () => {
    const clientName = draft.client_id
      ? clients.find((c) => c.id === draft.client_id)?.name || draft.client_name
      : draft.client_name;

    const made = await openModal({
      title: "Save as proposal template",
      confirmText: "Save template",
      body: `<form class="form-grid">
        ${field("name", "Template name", draft.title || file.name.replace(/\.pdf$/i, ""),
          { required: true, ph: "Website redesign — standard" })}
        <label style="display:flex;gap:8px;align-items:flex-start;font-size:.9rem">
          <input type="checkbox" name="tokenize" checked style="width:auto;margin-top:3px" />
          <span>Swap this proposal's specifics for tokens
            ${clientName ? `— “${escapeHtml(clientName)}” becomes <code>{{client.name}}</code>` : ""}
            so the next proposal fills itself in.</span>
        </label>
        <div class="hint">Sections and fee lines below are saved as the template's starting
          point. Edit it any time under Proposals → Templates.</div>
      </form>`,
      onConfirm: async (dlg) => {
        const f = new FormData(dlg.querySelector("form"));
        const tokenize = f.get("tokenize") === "on";
        const sections = draft.sections
          .filter((s) => (s.heading || "").trim() || (s.body || "").trim())
          .map((s) => ({
            heading: tokenize ? tokenise(s.heading, clientName, settings) : s.heading,
            body: tokenize ? tokenise(s.body, clientName, settings) : s.body,
          }));
        return await createTemplate({
          name: (f.get("name") || "").trim() || "Imported template",
          sections,
          default_line_items: draft.line_items
            .filter((li) => (li.description || "").trim())
            .map((li) => ({ ...li })),
        });
      },
    });

    if (made) toastOk(`Template “${made.name}” saved.`);
  });

  /* ---- create ---- */
  on(root, "click", "[data-create]", async (e, btn) => {
    const title = (draft.title || "").trim();
    if (!title) return toastErr("Give the proposal a project title.");

    let clientId = draft.client_id;
    const newName = (draft.client_name || "").trim();
    if (!clientId && !newName) return toastErr("Pick a client, or give the new client a name.");

    btn.disabled = true;
    const label = btn.textContent;
    btn.innerHTML = `<span class="spinner"></span>`;
    try {
      if (!clientId) {
        const c = await createClient({ name: newName, status: "active" });
        clients.push(c);
        clientId = c.id;
      }

      let sourcePath = null;
      if (stage.querySelector("#keep-pdf")?.checked) {
        try { sourcePath = await uploadProposalSource(file); }
        catch (err) { toastErr(`Proposal saved, but the PDF wasn't attached: ${err.message}`); }
      }

      const created = await createProposal({
        client_id: clientId,
        title,
        project_scope: draft.project_scope || "other",
        sections: draft.sections.filter((s) => (s.heading || "").trim() || (s.body || "").trim()),
        line_items: draft.line_items.filter((li) => (li.description || "").trim()),
        subtotal: Math.round(subtotal() * 100) / 100,
        status: "draft",
        ...(sourcePath ? { source_pdf_path: sourcePath } : {}),
      });
      toastOk(`Draft ${created.number || ""} created.`);
      ctx.navigate(`/proposals/${created.id}`);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = label;
      toastErr(err.message);
    }
  });

  pickStep();
}

// Turn one proposal's specifics back into the {{tokens}} the template engine resolves.
// Longest name first, so "Connect Landscape Architecture Inc." wins over "Connect".
function tokenise(text, clientName, settings) {
  let out = String(text || "");
  const swaps = [
    [clientName, "{{client.name}}"],
    [settings.business_name, "{{business.name}}"],
  ].filter(([from]) => from && String(from).trim().length >= 4)
    .sort((a, b) => String(b[0]).length - String(a[0]).length);

  for (const [from, token] of swaps) {
    const base = String(from).trim().replace(/[.,]+$/, "");
    // also catch the name with a corporate suffix attached ("… Inc.", "… Ltd.")
    const re = new RegExp(
      `${escapeRe(base)}(?:[ \\u00a0]+(?:Inc|Ltd|Limited|Corp|Co|LLC|LLP)\\.?)?(['’]s)?`,
      "gi");
    out = out.replace(re, (_m, possessive) => token + (possessive || ""));
  }
  return out;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
