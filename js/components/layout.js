// Renders the authenticated app shell (sidebar + topbar) and returns the view outlet.
import { escapeHtml } from "../core/format.js";
import { signOut } from "../core/auth.js";
import { mountTimer } from "./timer.js";

const NAV = [
  { path: "/",           label: "Dashboard",  ic: "◱" },
  { path: "/clients",    label: "Clients",    ic: "☺" },
  { path: "/projects",   label: "Projects",   ic: "▦" },
  { path: "/timesheets", label: "Timesheets", ic: "◷" },
  { path: "/invoices",   label: "Invoices",   ic: "$" },
  { path: "/proposals",  label: "Proposals",  ic: "✎" },
  { path: "/settings",   label: "Settings",   ic: "⚙" },
];

export function renderShell(appRoot, { email }) {
  appRoot.removeAttribute("aria-busy");
  appRoot.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">Tipolo<span> Portal</span></div>
        <nav>
          ${NAV.map((n) => `
            <a href="#${n.path}" data-nav><span class="ic">${n.ic}</span>${escapeHtml(n.label)}</a>
          `).join("")}
        </nav>
        <div class="spacer"></div>
        <div class="userbox">
          <span class="email">${escapeHtml(email || "")}</span>
          <button class="btn ghost sm block" data-signout>Sign out</button>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <div class="crumbs" id="crumbs">Dashboard</div>
          <div class="actions" id="topbar-actions"></div>
        </header>
        <main class="view" id="view" aria-live="polite"></main>
      </div>
    </div>`;

  appRoot.querySelector("[data-signout]").addEventListener("click", async (e) => {
    e.target.disabled = true;
    await signOut();
    // onAuthChange in app.js will swap back to the login view
  });

  const actions = appRoot.querySelector("#topbar-actions");
  mountTimer(actions);

  return {
    outlet: appRoot.querySelector("#view"),
    setCrumbs: (text) => { appRoot.querySelector("#crumbs").textContent = text; },
    actions,
  };
}
