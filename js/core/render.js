// Tiny DOM helpers. Views build markup with the html`` template from format.js and
// hand it to setHTML(); interactivity is wired with on() event delegation.

export function setHTML(root, markup) {
  root.innerHTML = markup;
  return root;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k === "html") node.innerHTML = v;
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

// Delegated event binding: on(root, "click", "[data-act='save']", handler)
export function on(root, type, selector, handler) {
  root.addEventListener(type, (e) => {
    const match = e.target.closest(selector);
    if (match && root.contains(match)) handler(e, match);
  });
}

// Serialise a <form> to a plain object. Checkboxes -> boolean, empty strings -> "".
export function formData(form) {
  const out = {};
  for (const field of form.elements) {
    if (!field.name) continue;
    if (field.type === "checkbox") out[field.name] = field.checked;
    else if (field.type === "radio") { if (field.checked) out[field.name] = field.value; }
    else if (field.type === "number") out[field.name] = field.value === "" ? null : Number(field.value);
    else out[field.name] = field.value;
  }
  return out;
}
