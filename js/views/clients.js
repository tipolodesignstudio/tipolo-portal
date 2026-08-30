// Clients list: search, active/archived filter, create/edit.
import { escapeHtml, debounce, money } from "../core/format.js";
import { on } from "../core/render.js";
import { listClients, createClient, updateClient } from "../core/api.js";
import { openModal } from "../components/modal.js";
import { field, textarea, row, readForm, nullIfEmpty } from "../components/form.js";
import { toastOk, toastErr } from "../components/toast.js";

let state = { search: "", status: "active" };

export async function render(root, ctx) {
  ctx.setCrumbs?.("Clients");
  root.innerHTML = `
    <div class="page-head">
      <div><h1>Clients</h1><div class="muted">People and companies you work with.</div></div>
      <button class="btn" data-new-client>+ New client</button>
    </div>
    <div class="filters">
      <input class="search" type="search" placeholder="Search name, company, email…"
             value="${escapeHtml(state.search)}" data-search />
      <div class="seg" data-status>
        ${["active", "archived", "all"].map((s) =>
          `<button data-s="${s}" class="${state.status === s ? "on" : ""}">${s[0].toUpperCase() + s.slice(1)}</button>`).join("")}
      </div>
    </div>
    <div id="clients-list"><div class="loading-row"><span class="spinner"></span> Loading…</div></div>`;

  const listEl = root.querySelector("#clients-list");

  async function refresh() {
    listEl.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading…</div>`;
    try {
      const rows = await listClients(state);
      listEl.innerHTML = rows.length ? table(rows) : empty();
    } catch (err) {
      listEl.innerHTML = `<div class="empty"><h3>Couldn't load clients</h3>
        <p class="faint">${escapeHtml(err.message)}</p></div>`;
    }
  }

  on(root, "input", "[data-search]", debounce((e) => {
    state.search = e.target.value; refresh();
  }, 250));
  on(root, "click", "[data-status] button", (e, btn) => {
    state.status = btn.dataset.s;
    root.querySelectorAll("[data-status] button").forEach((b) => b.classList.toggle("on", b === btn));
    refresh();
  });
  on(root, "click", "[data-new-client]", () => editClient(null, refresh));
  on(root, "click", "tr[data-id]", (e, tr) => {
    if (e.target.closest("[data-edit]")) return;
    ctx.navigate(`/clients/${tr.dataset.id}`);
  });
  on(root, "click", "[data-edit]", async (e, btn) => {
    e.stopPropagation();
    const tr = btn.closest("tr");
    editClient({ id: tr.dataset.id }, refresh, true);
  });

  await refresh();
}

function table(rows) {
  return `
    <div class="table-wrap">
      <table class="data">
        <thead><tr>
          <th>Name</th><th>Company</th><th>Email</th>
          <th class="num">Projects</th><th class="num">Rate</th><th></th>
        </tr></thead>
        <tbody>
          ${rows.map((c) => `
            <tr class="clickable" data-id="${c.id}">
              <td>${escapeHtml(c.name)}${c.status === "archived" ? ` <span class="badge grey">archived</span>` : ""}</td>
              <td class="muted">${escapeHtml(c.company || "—")}</td>
              <td class="muted">${escapeHtml(c.email || "—")}</td>
              <td class="num">${c.project_count}</td>
              <td class="num">${c.default_rate != null ? money(c.default_rate) : "—"}</td>
              <td class="right"><button class="btn link" data-edit>Edit</button></td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function empty() {
  return `<div class="empty"><h3>No clients yet</h3>
    <p class="faint">Add your first client to start tracking projects.</p></div>`;
}

/* ---- create / edit modal (exported so other views can reuse) ---- */
export async function editClient(existing, onSaved, fetchFirst = false) {
  let c = existing || {};
  if (fetchFirst && existing?.id) {
    const { getClient } = await import("../core/api.js");
    try { c = await getClient(existing.id); } catch (err) { toastErr(err.message); return; }
  }
  const isNew = !c.id;

  const result = await openModal({
    title: isNew ? "New client" : "Edit client",
    confirmText: isNew ? "Create client" : "Save",
    body: `<form class="form-grid">
      ${field("name", "Name", c.name, { required: true })}
      ${row(
        field("company", "Company", c.company),
        field("email", "Email", c.email, { type: "email" }),
      )}
      ${row(
        field("phone", "Phone", c.phone),
        field("default_rate", "Default hourly rate", c.default_rate, { type: "number", step: "0.01", min: 0 }),
      )}
      ${textarea("address", "Address", c.address, { rows: 2 })}
      ${textarea("notes", "Notes", c.notes, { rows: 3 })}
      ${field("tags", "Tags", (c.tags || []).join(", "), { hint: "Comma-separated" })}
      ${!isNew ? `<label style="display:flex;gap:8px;align-items:center;font-size:.9rem">
        <input type="checkbox" name="archived" ${c.status === "archived" ? "checked" : ""} style="width:auto" />
        Archived</label>` : ""}
    </form>`,
    onConfirm: async (dlg) => {
      const f = readForm(dlg.querySelector("form"));
      const patch = {
        name: f.name,
        company: nullIfEmpty(f.company),
        email: nullIfEmpty(f.email),
        phone: nullIfEmpty(f.phone),
        address: nullIfEmpty(f.address),
        notes: nullIfEmpty(f.notes),
        default_rate: f.default_rate,
        tags: (f.tags || "").split(",").map((t) => t.trim()).filter(Boolean),
      };
      if (!isNew) patch.status = f.archived ? "archived" : "active";
      return isNew ? await createClient(patch) : await updateClient(c.id, patch);
    },
  });

  if (result) {
    toastOk(isNew ? "Client created" : "Client saved");
    onSaved?.(result);
  }
}
