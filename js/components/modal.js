// Promise-based modal dialog built on native <dialog>.
//
//   const result = await openModal({
//     title: "Edit client",
//     body: `<form>...</form>`,          // markup string or DOM node
//     confirmText: "Save",
//     onConfirm: async (dialogEl) => { ...; return valueToResolveWith; },
//   });
//
// Resolves with whatever onConfirm returns, or null if dismissed. Throwing inside
// onConfirm keeps the modal open and shows the error.

import { escapeHtml } from "../core/format.js";

export function openModal({ title, body, confirmText = "Save", cancelText = "Cancel",
                            onConfirm, onOpen, size, danger = false }) {
  return new Promise((resolve) => {
    const dlg = document.createElement("dialog");
    dlg.className = "modal";
    if (size === "lg") dlg.style.width = "min(760px, calc(100vw - 32px))";

    dlg.innerHTML = `
      <div class="m-head">
        <h2>${escapeHtml(title || "")}</h2>
        <button class="icon-btn" data-x aria-label="Close">&times;</button>
      </div>
      <div class="m-body"></div>
      <div class="m-foot">
        <div class="m-err alert error" style="display:none;flex:1;text-align:left"></div>
        <button class="btn ghost" data-cancel>${escapeHtml(cancelText)}</button>
        <button class="btn ${danger ? "danger" : ""}" data-ok>${escapeHtml(confirmText)}</button>
      </div>`;

    const bodyHost = dlg.querySelector(".m-body");
    if (body && body.nodeType) bodyHost.appendChild(body);
    else bodyHost.innerHTML = body || "";

    const errBox = dlg.querySelector(".m-err");
    const okBtn = dlg.querySelector("[data-ok]");

    const done = (val) => { dlg.close(); dlg.remove(); resolve(val); };

    dlg.querySelector("[data-x]").onclick = () => done(null);
    dlg.querySelector("[data-cancel]").onclick = () => done(null);
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); done(null); });

    okBtn.onclick = async () => {
      errBox.style.display = "none";
      if (!onConfirm) return done(true);
      const form = dlg.querySelector("form");
      if (form && !form.reportValidity()) return;
      okBtn.disabled = true;
      okBtn.innerHTML = `<span class="spinner"></span>`;
      try {
        const val = await onConfirm(dlg);
        done(val === undefined ? true : val);
      } catch (err) {
        errBox.textContent = (err && err.message) || String(err);
        errBox.style.display = "block";
        okBtn.disabled = false;
        okBtn.textContent = confirmText;
      }
    };

    // Enter-to-submit from within a single-line input
    dlg.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); okBtn.click(); }
    });

    document.body.appendChild(dlg);
    dlg.showModal();
    if (onOpen) try { onOpen(dlg); } catch (err) { console.error(err); }
    const first = dlg.querySelector("input, select, textarea");
    if (first) first.focus();
  });
}

export function confirmModal(message, { title = "Please confirm", confirmText = "Confirm",
                                        danger = true } = {}) {
  return openModal({
    title,
    body: `<p>${escapeHtml(message)}</p>`,
    confirmText,
    danger,
    onConfirm: () => true,
  });
}
