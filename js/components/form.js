// Field builders for modal forms. Each returns an HTML string; wrap them in <form>.
import { escapeHtml, formatPhone } from "../core/format.js";

export function field(name, label, value = "", { type = "text", ph = "", required = false,
                                                 step, min, hint } = {}) {
  return `
    <div class="field">
      <label class="lbl" for="f_${name}">${escapeHtml(label)}${required ? " *" : ""}</label>
      <input id="f_${name}" name="${name}" type="${type}" value="${escapeHtml(value ?? "")}"
        placeholder="${escapeHtml(ph)}" ${required ? "required" : ""}
        ${step ? `step="${step}"` : ""} ${min != null ? `min="${min}"` : ""} />
      ${hint ? `<div class="hint">${escapeHtml(hint)}</div>` : ""}
    </div>`;
}

export function textarea(name, label, value = "", { rows = 3, ph = "" } = {}) {
  return `
    <div class="field">
      <label class="lbl" for="f_${name}">${escapeHtml(label)}</label>
      <textarea id="f_${name}" name="${name}" rows="${rows}"
        placeholder="${escapeHtml(ph)}">${escapeHtml(value ?? "")}</textarea>
    </div>`;
}

export function select(name, label, value, options, { required = false } = {}) {
  return `
    <div class="field">
      <label class="lbl" for="f_${name}">${escapeHtml(label)}${required ? " *" : ""}</label>
      <select id="f_${name}" name="${name}" ${required ? "required" : ""}>
        ${options.map((o) => {
          const val = typeof o === "string" ? o : o.value;
          const lab = typeof o === "string" ? o : o.label;
          return `<option value="${escapeHtml(val)}" ${String(val) === String(value ?? "") ? "selected" : ""}>${escapeHtml(lab)}</option>`;
        }).join("")}
      </select>
    </div>`;
}

export function row(...fields) {
  return `<div class="form-grid cols-2">${fields.join("")}</div>`;
}

// Read a <form> into an object; numbers -> Number|null, checkboxes -> bool, "" kept.
export function readForm(form) {
  const out = {};
  for (const f of form.elements) {
    if (!f.name) continue;
    if (f.type === "checkbox") out[f.name] = f.checked;
    else if (f.type === "number") out[f.name] = f.value === "" ? null : Number(f.value);
    else out[f.name] = f.value.trim();
  }
  return out;
}

export const nullIfEmpty = (v) => (v === "" || v == null ? null : v);

// Live phone formatting: rewrites the input to "+1.604.555.0123" as digits are typed.
export function attachPhoneFormat(input) {
  if (!input) return;
  const apply = () => { input.value = formatPhone(input.value); };
  apply();
  input.addEventListener("input", apply);
  input.addEventListener("blur", apply);
}
