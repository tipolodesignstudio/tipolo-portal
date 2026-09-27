// Bring the studio's Google Drive filing into the portal.
//
// 05_Proposals and 06_Projects are already named by job number, so the portal can line
// its own records up against the folders and show what is missing. Importing a proposal
// reads its PDF exactly as the PDF import does — the PDF becomes the proposal, and only
// the client and the fees are taken out of it — the difference being that the file comes
// from Drive instead of a file picker.
//
// Projects and invoices are listed, not created: a project is made by converting its
// proposal, which is how every other project in the portal came about.

import { escapeHtml, money } from "../core/format.js";
import { on } from "../core/render.js";
import {
  listClients, createClient, createProposal, uploadProposalSource, getSettings,
  listProposals, listProjects, listInvoices, booksState, reserveJobNumber,
} from "../core/api.js";
import * as drive from "../core/gdrive.js";
import { scanProposals, scanProjects, markKnown, fileFromDrive } from "../core/drive-scan.js";
import { extractPdf } from "../core/pdf-text.js";
import { parseProposal } from "../core/proposal-parse.js";
import { lineAmount } from "../core/invoice-calc.js";
import { openModal } from "../components/modal.js";
import { field, select, row } from "../components/form.js";
import { toastOk, toastErr } from "../components/toast.js";

const FROM_KEY = "tipolo.driveImport.from";
const SCOPES = [
  { value: "landscape", label: "Landscape" },
  { value: "multimedia", label: "Multimedia" },
  { value: "other", label: "Other" },
];

export async function render(root, ctx) {
  ctx.setCrumbs?.("Proposals / From Drive");

  let from = localStorage.getItem(FROM_KEY) || "26000";
  let clients = [];
  let settings = {};
  let books = {};
  let known = { proposals: [], projects: [], invoices: [] };

  root.innerHTML = `
    <div class="page-head">
      <div>
        <div class="faint" style="font-size:.85rem"><a href="#/proposals">← Proposals</a></div>
        <h1>Import from Google Drive</h1>
        <div class="muted">Reads 05_Proposals and 06_Projects and lines them up against the portal by job number. Nothing in Drive is changed.</div>
      </div>
      <div class="cluster">
        <label class="faint" style="font-size:.85rem">From job number
          <input id="from" value="${escapeHtml(from)}" style="max-width:90px;margin-left:6px" /></label>
        <button class="btn" data-scan>Scan Drive</button>
      </div>
    </div>
    <div id="stage"></div>`;

  const stage = root.querySelector("#stage");
  const fromInput = root.querySelector("#from");

  function setup(message) {
    stage.innerHTML = `<div class="card"><div class="alert info" style="margin:0">${message}</div></div>`;
  }

  async function load() {
    stage.innerHTML = `<div class="card"><div class="loading-row"><span class="spinner"></span> Loading…</div></div>`;
    try {
      [clients, settings, books, known.proposals, known.projects, known.invoices] = await Promise.all([
        listClients({ status: "all" }), getSettings().catch(() => ({})), booksState().catch(() => ({})),
        listProposals({ status: "all" }), listProjects({ status: "all" }), listInvoices({ status: "all" }),
      ]);
    } catch (err) { return setup(escapeHtml(err.message)); }

    if (!drive.configured()) {
      return setup(`Google Drive isn't switched on yet — it needs a Google client ID in
        <code>config.js</code>. SETUP.md → “Google Drive” has the steps.`);
    }
    if (!books.drive_proposals_folder_id && !books.drive_projects_folder_id) {
      return setup(`Point the portal at your folders first:
        <a href="#/settings" data-goto-drive>Settings → Google Drive</a>, where 05_Proposals
        and 06_Projects each take a link.`);
    }
    idle();
  }

  const idle = () => {
    stage.innerHTML = `<div class="empty card"><h3>Ready to scan</h3>
      <p class="faint">Reads the folders numbered ${escapeHtml(from)} and up.
      ${drive.connected() ? "" : "You'll be asked to connect Google first."}</p></div>`;
  };

  /* ---------------- scan ---------------- */

  async function scan() {
    stage.innerHTML = `<div class="card"><div class="loading-row"><span class="spinner"></span> Reading Drive…</div></div>`;
    try {
      const [proposals, projects] = await Promise.all([
        books.drive_proposals_folder_id ? scanProposals(books.drive_proposals_folder_id, { from }) : [],
        books.drive_projects_folder_id ? scanProjects(books.drive_projects_folder_id, { from }) : [],
      ]);
      paint(markKnown(proposals, known.proposals), markKnown(projects, known.projects));
    } catch (err) {
      stage.innerHTML = `<div class="card"><div class="alert error" style="margin:0">${escapeHtml(err.message)}</div></div>`;
    }
  }

  let rows = { proposals: [], projects: [] };

  function paint(proposals, projects) {
    rows = { proposals, projects };
    const newCount = proposals.filter((p) => !p.existing).length;
    stage.innerHTML = `
      <div class="card" style="margin-bottom:16px">
        <div class="between" style="margin-bottom:10px">
          <h2 class="mt-0">Proposals <span class="faint" style="font-weight:400">· 05_Proposals</span></h2>
          <span class="faint">${newCount} not in the portal</span>
        </div>
        ${proposals.length ? `
        <div class="table-wrap"><table class="data">
          <thead><tr><th>No.</th><th>Folder</th><th>PDF to attach</th><th>In the portal</th><th></th></tr></thead>
          <tbody>
            ${proposals.map((p, i) => `
              <tr>
                <td class="nowrap">${escapeHtml(p.number)}</td>
                <td>${escapeHtml(p.title)}</td>
                <td class="muted">${p.pdf ? escapeHtml(p.pdf.name)
                  : `<span class="badge red">no proposal PDF</span>`}</td>
                <td>${p.existing
                  ? `<a href="#/proposals/${p.existing.id}">${escapeHtml(p.existing.title || "open")}</a>`
                  : `<span class="badge amber">not yet</span>`}</td>
                <td class="right">${p.existing || !p.pdf ? ""
                  : `<button class="btn sm" data-import="${i}">Import</button>`}</td>
              </tr>`).join("")}
          </tbody>
        </table></div>` : `<p class="faint" style="margin:0">Nothing numbered ${escapeHtml(from)} or higher.</p>`}
      </div>

      <div class="card">
        <div class="between" style="margin-bottom:10px">
          <h2 class="mt-0">Projects <span class="faint" style="font-weight:400">· 06_Projects</span></h2>
        </div>
        <div class="muted" style="margin-bottom:10px">
          A project is created by accepting its proposal and converting it, so these are
          shown to check against, not imported.</div>
        ${projects.length ? `
        <div class="table-wrap"><table class="data">
          <thead><tr><th>No.</th><th>Folder</th><th>Invoices in Drive</th><th>In the portal</th></tr></thead>
          <tbody>
            ${projects.map((p) => `
              <tr>
                <td class="nowrap">${escapeHtml(p.number)}</td>
                <td>${escapeHtml(p.title)}${p.scope ? ` <span class="badge grey">${p.scope}</span>` : ""}</td>
                <td class="muted">${p.invoices.length
                  ? p.invoices.map((inv) => {
                      const hit = known.invoices.find((k) => k.number === inv.number);
                      return `${escapeHtml(inv.number || inv.file.name)} ${hit
                        ? `<a href="#/invoices/${hit.id}" class="badge green">in portal</a>`
                        : `<span class="badge amber">not in portal</span>`}`;
                    }).join("<br>")
                  : "—"}</td>
                <td>${p.existing
                  ? `<a href="#/projects/${p.existing.id}">${escapeHtml(p.existing.title || "open")}</a>`
                  : `<span class="badge amber">not yet</span>`}</td>
              </tr>`).join("")}
          </tbody>
        </table></div>` : `<p class="faint" style="margin:0">Nothing numbered ${escapeHtml(from)} or higher.</p>`}
      </div>`;
  }

  /* ---------------- import one proposal ---------------- */

  async function importOne(entry, btn) {
    const label = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>`;
    let file, draft;
    try {
      file = await fileFromDrive(entry.pdf);
      const doc = await extractPdf(file);
      draft = parseProposal(doc, { clients, businessName: settings.business_name || "" });
      if (doc.text.trim().length < 200) {
        draft.warnings = ["This PDF has almost no text layer — it's probably a scan, so the fees couldn't be read. Type them in below.", ...(draft.warnings || [])];
      }
    } catch (err) {
      btn.disabled = false; btn.textContent = label;
      return toastErr(`Couldn't read ${entry.pdf.name}: ${err.message}`);
    }
    btn.disabled = false; btn.textContent = label;

    draft.title = draft.title || entry.title;
    draft.project_scope = draft.project_scope || entry.scope || "other";
    const created = await reviewAndCreate(entry, draft, file);
    if (created) {
      // keep the studio's counter ahead of what has just been imported
      try { await reserveJobNumber(created.number); } catch { /* numbering is not worth failing over */ }
      entry.existing = created;
      paint(rows.proposals, rows.projects);
      toastOk(`${entry.number} imported as ${created.number || "a draft"}.`);
    }
  }

  // The same review the PDF import shows, in a modal: what was read, editable, with the
  // fee lines that become the project's budget.
  function reviewAndCreate(entry, draft, file) {
    const subtotal = () => draft.line_items.reduce((s, li) => s + lineAmount(li), 0);
    const lineRows = () => draft.line_items.map((li, i) => `
      <tr data-i="${i}">
        <td><input data-k="description" value="${escapeHtml(li.description || "")}" style="width:100%" /></td>
        <td><input data-k="qty" type="number" step="0.01" value="${li.qty ?? 1}" style="max-width:70px;text-align:right" /></td>
        <td><input data-k="unit_price" type="number" step="0.01" value="${li.unit_price ?? 0}" style="max-width:110px;text-align:right" /></td>
        <td class="num">${money(lineAmount(li))}</td>
        <td class="right"><button type="button" class="btn link" data-del="${i}">remove</button></td>
      </tr>`).join("");

    return openModal({
      title: `Import ${entry.number}`,
      confirmText: "Create proposal",
      size: "lg",
      body: `<form class="form-grid">
        <div class="faint" style="font-size:.85rem">Attaching <strong>${escapeHtml(file.name)}</strong> from Drive.</div>
        ${(draft.warnings || []).map((w) => `<div class="alert info">${escapeHtml(w)}</div>`).join("")}
        ${row(
          field("title", "Project title", draft.title, { required: true }),
          select("project_scope", "Scope", draft.project_scope || "other", SCOPES),
        )}
        ${select("client_id", "Client", draft.client_id || "",
          [{ value: "", label: draft.client_name ? `＋ new client: ${draft.client_name}` : "＋ new client" },
           ...clients.map((c) => ({ value: c.id, label: c.name }))])}
        <div class="field" data-newclient ${draft.client_id ? "hidden" : ""}>
          ${field("client_name", "New client name", draft.client_name || "", { ph: "Stone Bear Hardscapes" })}
        </div>
        <div class="field">
          <label class="lbl">Fee schedule</label>
          <div class="table-wrap"><table class="data" id="lines">
            <thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th class="num">Amount</th><th></th></tr></thead>
            <tbody>${lineRows()}</tbody>
            <tfoot><tr><td colspan="3"><button type="button" class="btn link" data-add>+ add line</button></td>
              <td class="num"><strong id="tot">${money(subtotal())}</strong></td><td></td></tr></tfoot>
          </table></div>
        </div>
      </form>`,
      onOpen: (dlg) => {
        const repaint = () => {
          dlg.querySelector("#lines tbody").innerHTML = lineRows();
          dlg.querySelector("#tot").textContent = money(subtotal());
        };
        dlg.addEventListener("input", (e) => {
          const el = e.target;
          if (el.dataset.k) {
            const i = +el.closest("tr").dataset.i;
            draft.line_items[i][el.dataset.k] = el.dataset.k === "description" ? el.value : Number(el.value);
            dlg.querySelector("#tot").textContent = money(subtotal());
            el.closest("tr").querySelector("td:nth-child(4)").textContent = money(lineAmount(draft.line_items[i]));
          }
        });
        dlg.addEventListener("change", (e) => {
          if (e.target.name === "client_id") dlg.querySelector("[data-newclient]").hidden = !!e.target.value;
        });
        dlg.addEventListener("click", (e) => {
          if (e.target.dataset.add != null) { draft.line_items.push({ description: "", qty: 1, unit_price: 0 }); repaint(); }
          const del = e.target.dataset.del;
          if (del != null) { draft.line_items.splice(+del, 1); repaint(); }
        });
      },
      onConfirm: async (dlg) => {
        const f = new FormData(dlg.querySelector("form"));
        const title = String(f.get("title") || "").trim();
        if (!title) throw new Error("Give the proposal a project title.");
        let clientId = f.get("client_id");
        const newName = String(f.get("client_name") || "").trim();
        if (!clientId) {
          if (!newName) throw new Error("Pick a client, or name the new one.");
          const c = await createClient({ name: newName, status: "active" });
          clients.push(c);
          clientId = c.id;
        }
        const sourcePath = await uploadProposalSource(file);   // the PDF is the proposal
        return await createProposal({
          number: entry.number,          // the folder's number, not a freshly drawn one
          client_id: clientId,
          title,
          project_scope: f.get("project_scope") || "other",
          doc_mode: "pdf",
          sections: [],
          line_items: draft.line_items.filter((li) => (li.description || "").trim()),
          subtotal: Math.round(subtotal() * 100) / 100,
          status: "draft",
          source_pdf_path: sourcePath,
        });
      },
    });
  }

  /* ---------------- wiring ---------------- */

  fromInput.addEventListener("change", () => {
    from = fromInput.value.trim() || "26000";
    try { localStorage.setItem(FROM_KEY, from); } catch { /* */ }
  });
  on(root, "click", "[data-goto-drive]", () => {
    try { localStorage.setItem("tipolo.settings.tab", "drive"); } catch { /* */ }
  });
  on(root, "click", "[data-scan]", () => {
    // Google's popup has to open inside the click, before anything is awaited.
    const go = drive.connected() ? Promise.resolve() : drive.connect();
    go.then(scan).catch((err) => toastErr(err.message));
  });
  on(root, "click", "[data-import]", (e, btn) => importOne(rows.proposals[+btn.dataset.import], btn));

  await load();
}
