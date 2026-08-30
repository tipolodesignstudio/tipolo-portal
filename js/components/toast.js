// Ephemeral toast notifications.
const stack = () => document.getElementById("toast-stack");

export function toast(message, kind = "ok", ms = 3200) {
  const host = stack();
  if (!host) return;
  const node = document.createElement("div");
  node.className = "toast " + (kind === "error" ? "err" : kind === "ok" ? "ok" : "");
  node.textContent = message;
  host.appendChild(node);
  setTimeout(() => {
    node.style.transition = "opacity .2s";
    node.style.opacity = "0";
    setTimeout(() => node.remove(), 220);
  }, ms);
}

export const toastOk = (m) => toast(m, "ok");
export const toastErr = (m) => toast(m, "error", 5000);
