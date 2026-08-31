// Proposal template editor (/proposals/templates/:id, id may be "new").
import { escapeHtml, money } from "../core/format.js";
import { on } from "../core/render.js";
import { getTemplate, createTemplate, updateTemplate } from "../core/api.js";
import { TOKEN_HELP } from "../core/tokens.js";
import { toastOk, toastErr } from "../components/toast.js";

const STARTER = [
  { heading: "Overview", body: "Thank you for the opportunity to work with {{client.name}} on {{project.title}}." },
  { heading: "Scope of work", body: "" },
  { heading: "Timeline", body: "" },
  { heading: "Fees", body: "The estimated fee is {{fee.subtotal}}, plus applicable taxes. A 50% deposit reserves project time." },
  { heading: "Terms", body: "This proposal is valid until {{proposal.validUntil}}." },
];

export async function render(root, ctx) {
  const isNew = ctx.params.id === "new";
  ctx.setCrumbs?.(`Proposals / Templates / ${isNew ? "New" : "Edit"}`);

  let tpl = { name: "", sections: STARTER.map((s) => ({ ...s })), default_line_items: [] };
  if (!isNew) {
    try { tpl = await getTemplate(ctx.params.id); }
    catch (err) {
      root.innerHTML = `<div class="empty"><h3>Template not found</h3><p class="faint">${escapeHtml(err.message)}</p></div>`;
      return;
    }
  }
  let sections = (tpl.sections || []).map((s) => ({ ...s }));
  let lines = (tpl.default_line_items || []).map((li) => ({ ...li }));

  root.innerHTML = `
    <div class="page-head">
      <div>
        <div class="faint" style="font-size:.85rem"><a href="#/proposals/templates">← Templates</a></div>
        <h1>${isNew ? "New template" : "Edit template"}</h1>
      </div>
      <button class="btn" data-save>Save template</button>
    </div>

    <div class="card">
      ${input("name", "Template name", tpl.name, "e.g. Standard landscape proposal")}
      <div class="hint">Tokens: ${TOKEN_HELP.map((t) => `<code>${escapeHtml(t)}</code>`).join(" ")}</div>
    </div>

    <div class="card">
      <div class="between"><h2 class="mt-0">Sections</h2><button class="btn subtle sm" data-add-sec>+ Add section</button></div>
      <div id="secs"></div>
    </div>

    <div class="card">
      <div class="between"><h2 class="mt-0">Default fee lines</h2><button class="btn subtle sm" data-add-line>+ Add line</button></div>
      <div id="lines"></div>
    </div>`;

  const secs = root.querySelector("#secs");
  const linesEl = root.querySelector("#lines");

  const renderSecs = () => {
    secs.innerHTML = sections.length ? sections.map((s, i) => `
      <div class="sec-block" data-i="${i}">
        <div class="cluster" style="gap:6px;margin-bottom:6px">
          <input data-k="heading" value="${escapeHtml(s.heading || "")}" placeholder="Heading" style="flex:1" />
          <button class="btn link" data-move="-1" ${i === 0 ? "disabled" : ""}>↑</button>
          <button class="btn link" data-move="1" ${i === sections.length - 1 ? "disabled" : ""}>↓</button>
          <button class="btn link" data-del-sec>remove</button>
        </div>
        <textarea data-k="body" rows="3" placeholder="Body text with {{tokens}}">${escapeHtml(s.body || "")}</textarea>
      </div>`).join("") : `<p class="faint" style="font-size:.9rem">No sections.</p>`;
  };
  const renderLines = () => {
    linesEl.innerHTML = lines.length ? lines.map((li, i) => `
      <div class="cluster" data-i="${i}" style="gap:8px;margin-bottom:8px">
        <input data-k="description" value="${escapeHtml(li.description || "")}" placeholder="Description" style="flex:1" />
        <input data-k="qty" type="number" step="0.01" min="0" value="${li.qty ?? 1}" style="width:80px;text-align:right" />
        <input data-k="unit_price" type="number" step="0.01" min="0" value="${li.unit_price ?? 0}" style="width:110px;text-align:right" />
        <button class="btn link" data-del-line>remove</button>
      </div>`).join("") : `<p class="faint" style="font-size:.9rem">No default fee lines.</p>`;
  };

  on(root, "input", "#secs [data-k]", (e, el) => { sections[+el.closest(".sec-block").dataset.i][el.dataset.k] = el.value; });
  on(root, "click", "[data-add-sec]", () => { sections.push({ heading: "", body: "" }); renderSecs(); });
  on(root, "click", "[data-del-sec]", (e, el) => { sections.splice(+el.closest(".sec-block").dataset.i, 1); renderSecs(); });
  on(root, "click", "#secs [data-move]", (e, el) => {
    const i = +el.closest(".sec-block").dataset.i, j = i + (+el.dataset.move);
    if (j < 0 || j >= sections.length) return;
    [sections[i], sections[j]] = [sections[j], sections[i]]; renderSecs();
  });
  on(root, "input", "#lines [data-k]", (e, el) => {
    const i = +el.closest("[data-i]").dataset.i;
    lines[i][el.dataset.k] = el.dataset.k === "description" ? el.value : Number(el.value);
  });
  on(root, "click", "[data-add-line]", () => { lines.push({ description: "", qty: 1, unit_price: 0 }); renderLines(); });
  on(root, "click", "#lines [data-del-line]", (e, el) => { lines.splice(+el.closest("[data-i]").dataset.i, 1); renderLines(); });

  on(root, "click", "[data-save]", async (e, btn) => {
    const name = root.querySelector("[name=name]").value.trim();
    if (!name) return toastErr("Give the template a name.");
    btn.disabled = true;
    const patch = { name, sections, default_line_items: lines };
    try {
      const saved = isNew ? await createTemplate(patch) : await updateTemplate(tpl.id, patch);
      toastOk("Template saved");
      ctx.navigate(`/proposals/templates`);
    } catch (err) { toastErr(err.message); btn.disabled = false; }
  });

  renderSecs();
  renderLines();
}

function input(name, label, val, ph) {
  return `<div class="field"><label class="lbl" for="f_${name}">${label}</label>
    <input id="f_${name}" name="${name}" value="${escapeHtml(val || "")}" placeholder="${escapeHtml(ph || "")}" /></div>`;
}
