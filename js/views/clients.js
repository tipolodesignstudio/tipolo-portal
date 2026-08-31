// Clients list + create/edit. A client has a business name (or is an individual),
// one or more contacts (one primary), and any number of managed categories.
import { escapeHtml, debounce, money } from "../core/format.js";
import { on } from "../core/render.js";
import {
  listClients, getClient, createClient, updateClient,
  listClientContacts, saveClientContacts, listCategories,
} from "../core/api.js";
import { openModal } from "../components/modal.js";
import { field, textarea, row, readForm, nullIfEmpty, attachPhoneFormat } from "../components/form.js";
import { toastOk, toastErr } from "../components/toast.js";

let state = { search: "", status: "active", categoryId: "" };
let categories = [];

export async function render(root, ctx) {
  ctx.setCrumbs?.("Clients");
  try { categories = await listCategories(); } catch { categories = []; }
  const catById = Object.fromEntries(categories.map((c) => [c.id, c.name]));

  root.innerHTML = `
    <div class="page-head">
      <div><h1>Clients</h1><div class="muted">Businesses and individuals you work with.</div></div>
      <button class="btn" data-new-client>+ New client</button>
    </div>
    <div class="filters">
      <input class="search" type="search" placeholder="Search client or email…"
             value="${escapeHtml(state.search)}" data-search />
      <select data-cat>
        <option value="">All categories</option>
        ${categories.map((c) => `<option value="${c.id}" ${state.categoryId === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
      </select>
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
      listEl.innerHTML = rows.length ? table(rows, catById) : empty();
    } catch (err) {
      listEl.innerHTML = `<div class="empty"><h3>Couldn't load clients</h3>
        <p class="faint">${escapeHtml(err.message)}</p></div>`;
    }
  }

  on(root, "input", "[data-search]", debounce((e) => { state.search = e.target.value; refresh(); }, 250));
  on(root, "change", "[data-cat]", (e) => { state.categoryId = e.target.value; refresh(); });
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
  on(root, "click", "[data-edit]", (e, btn) => {
    e.stopPropagation();
    editClient({ id: btn.closest("tr").dataset.id }, refresh, true);
  });

  await refresh();
}

function table(rows, catById) {
  return `
    <div class="table-wrap">
      <table class="data">
        <thead><tr>
          <th>Client</th><th>Primary contact</th><th>Categories</th>
          <th class="num">Projects</th><th class="num">Rate</th><th></th>
        </tr></thead>
        <tbody>
          ${rows.map((c) => `
            <tr class="clickable" data-id="${c.id}">
              <td>${escapeHtml(c.name)}${c.status === "archived" ? ` <span class="badge grey">archived</span>` : ""}</td>
              <td class="muted">${c.is_individual ? `<span class="faint">individual</span>`
                : escapeHtml(c.primary_contact?.name || "—")}</td>
              <td class="muted">${(c.category_ids || []).map((id) =>
                `<span class="badge">${escapeHtml(catById[id] || "?")}</span>`).join(" ") || "—"}</td>
              <td class="num">${c.project_count}</td>
              <td class="num">${c.default_rate != null ? money(c.default_rate) : "—"}</td>
              <td class="right"><button class="btn link" data-edit>Edit</button></td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function empty() {
  return `<div class="empty"><h3>No clients${state.categoryId || state.search ? " match" : " yet"}</h3>
    <p class="faint">Add a client to start proposals and projects.</p></div>`;
}

/* ---------- create / edit ---------- */
export async function editClient(existing, onSaved, fetchFirst = false) {
  let c = existing || {};
  let contactRows = [];
  if (fetchFirst && existing?.id) {
    try {
      [c, contactRows] = await Promise.all([getClient(existing.id), listClientContacts(existing.id)]);
    } catch (err) { toastErr(err.message); return; }
  }
  const isNew = !c.id;
  if (!contactRows.length) contactRows = [{ name: c.is_individual ? (c.name || "") : "", title: "", email: "", phone: "", is_primary: true }];

  if (!categories.length) { try { categories = await listCategories(); } catch { /* ignore */ } }
  const selectedCats = new Set(c.category_ids || []);

  const result = await openModal({
    title: isNew ? "New client" : "Edit client",
    confirmText: isNew ? "Create client" : "Save",
    size: "lg",
    body: `<form class="form-grid">
      <label style="display:flex;gap:8px;align-items:center;font-size:.9rem">
        <input type="checkbox" name="is_individual" ${c.is_individual ? "checked" : ""} style="width:auto" />
        Individual client (no separate business name)
      </label>
      <div data-biz-field>
        ${field("business_name", "Client / business name", c.is_individual ? "" : c.name, { required: true })}
      </div>

      <div class="field">
        <label class="lbl">Categories</label>
        <div class="cluster" style="gap:6px 14px">
          ${categories.length ? categories.map((cat) => `
            <label style="display:flex;gap:6px;align-items:center;font-size:.9rem">
              <input type="checkbox" data-cat-id="${cat.id}" ${selectedCats.has(cat.id) ? "checked" : ""} style="width:auto" />
              ${escapeHtml(cat.name)}</label>`).join("")
            : `<span class="faint" style="font-size:.85rem">No categories yet — add them in Settings.</span>`}
        </div>
      </div>

      <div class="field" data-contacts-wrap>
        <label class="lbl">Contacts</label>
        <div id="contact-rows" class="stack" style="gap:10px"></div>
        <button type="button" class="btn ghost sm" data-add-contact style="margin-top:8px">+ Add contact</button>
      </div>

      ${field("default_rate", "Default hourly rate", c.default_rate, { type: "number", step: "0.01", min: 0 })}
      ${field("street", "Street", c.street)}
      ${row(field("city", "City", c.city), field("province", "Province", c.province, { ph: "BC" }))}
      ${field("postal_code", "Postal code", c.postal_code, { ph: "V8W 1A1" })}
      ${textarea("notes", "Notes", c.notes, { rows: 3 })}
      ${field("tags", "Tags", (c.tags || []).join(", "), { hint: "Free-form, comma-separated" })}
      ${!isNew ? `<label style="display:flex;gap:8px;align-items:center;font-size:.9rem">
        <input type="checkbox" name="archived" ${c.status === "archived" ? "checked" : ""} style="width:auto" />
        Archived</label>` : ""}
    </form>`,
    onOpen: (dlg) => {
      const form = dlg.querySelector("form");
      const indiv = form.elements.is_individual;
      const bizWrap = form.querySelector("[data-biz-field]");
      const contactsWrap = form.querySelector("[data-contacts-wrap]");
      const rowsHost = form.querySelector("#contact-rows");

      const renderContacts = () => {
        rowsHost.innerHTML = contactRows.map((r, i) => `
          <div class="contact-row" data-i="${i}">
            <div class="form-grid cols-2">
              <input data-k="name" value="${escapeHtml(r.name || "")}" placeholder="Name" />
              <input data-k="title" value="${escapeHtml(r.title || "")}" placeholder="Role / title" />
              <input data-k="email" type="email" value="${escapeHtml(r.email || "")}" placeholder="Email" />
              <input data-k="phone" value="${escapeHtml(r.phone || "")}" placeholder="Phone" />
            </div>
            <div class="cluster" style="gap:12px;margin-top:4px;font-size:.85rem">
              <label style="display:flex;gap:6px;align-items:center">
                <input type="radio" name="primary_contact" ${r.is_primary ? "checked" : ""} data-primary="${i}" style="width:auto" />
                Primary</label>
              ${indiv.checked ? "" : `<button type="button" class="btn link" data-rm-contact="${i}">remove</button>`}
            </div>
          </div>`).join("");
        rowsHost.querySelectorAll("input[data-k=phone]").forEach(attachPhoneFormat);
      };

      const syncIndividual = () => {
        const on = indiv.checked;
        bizWrap.style.display = on ? "none" : "";
        form.elements.business_name.required = !on;
        if (on) {
          contactRows = [contactRows[0] || { name: "", title: "", email: "", phone: "", is_primary: true }];
          contactRows[0].is_primary = true;
          contactsWrap.querySelector(".lbl").textContent = "Contact (this person is the client)";
        } else {
          contactsWrap.querySelector(".lbl").textContent = "Contacts";
        }
        form.querySelector("[data-add-contact]").style.display = on ? "none" : "";
        renderContacts();
      };
      indiv.addEventListener("change", syncIndividual);

      rowsHost.addEventListener("input", (e) => {
        const rowEl = e.target.closest(".contact-row"); if (!rowEl) return;
        const i = +rowEl.dataset.i; const k = e.target.dataset.k;
        if (k) contactRows[i][k] = e.target.value;
      });
      rowsHost.addEventListener("change", (e) => {
        if (e.target.dataset.primary != null) {
          contactRows.forEach((r, idx) => (r.is_primary = idx === +e.target.dataset.primary));
        }
      });
      rowsHost.addEventListener("click", (e) => {
        const rm = e.target.closest("[data-rm-contact]");
        if (rm) {
          contactRows.splice(+rm.dataset.rmContact, 1);
          if (!contactRows.some((r) => r.is_primary) && contactRows[0]) contactRows[0].is_primary = true;
          renderContacts();
        }
      });
      form.querySelector("[data-add-contact]").addEventListener("click", () => {
        contactRows.push({ name: "", title: "", email: "", phone: "", is_primary: contactRows.length === 0 });
        renderContacts();
      });

      syncIndividual();
    },
    onConfirm: async (dlg) => {
      const form = dlg.querySelector("form");
      const f = readForm(form);
      const individual = !!f.is_individual;

      const contacts = contactRows
        .map((r) => ({ ...r, name: (r.name || "").trim() }))
        .filter((r) => r.name);
      if (individual && !contacts.length) throw new Error("Enter the client's name.");
      if (!individual && !f.business_name) throw new Error("Enter the business name.");

      const name = individual ? contacts[0].name : f.business_name;
      const categoryIds = [...form.querySelectorAll("[data-cat-id]:checked")].map((el) => el.dataset.catId);

      const patch = {
        name,
        is_individual: individual,
        category_ids: categoryIds,
        email: nullIfEmpty(contacts.find((c) => c.is_primary)?.email || contacts[0]?.email || f.email),
        phone: nullIfEmpty(contacts.find((c) => c.is_primary)?.phone || contacts[0]?.phone),
        street: nullIfEmpty(f.street),
        city: nullIfEmpty(f.city),
        province: nullIfEmpty(f.province),
        postal_code: nullIfEmpty(f.postal_code),
        notes: nullIfEmpty(f.notes),
        default_rate: f.default_rate,
        tags: (f.tags || "").split(",").map((t) => t.trim()).filter(Boolean),
      };
      if (!isNew) patch.status = f.archived ? "archived" : "active";

      const saved = isNew ? await createClient(patch) : await updateClient(c.id, patch);
      await saveClientContacts(saved.id, contacts);
      return saved;
    },
  });

  if (result) {
    toastOk(isNew ? "Client created" : "Client saved");
    onSaved?.(result);
  }
}
