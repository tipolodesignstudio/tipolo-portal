// Renders the authenticated app shell (sidebar + content outlet).
import { escapeHtml } from "../core/format.js";
import { signOut } from "../core/auth.js";
import { mountTimer } from "./timer.js";

const NAV = [
  { path: "/",           label: "Dashboard",  ic: "◱" },
  { path: "/clients",    label: "Clients",    ic: "☺" },
  { path: "/proposals",  label: "Proposals",  ic: "✎" },
  { path: "/projects",   label: "Projects",   ic: "▦" },
  { path: "/timesheets", label: "Timesheets", ic: "◷" },
  { path: "/invoices",   label: "Invoices",   ic: "$" },
  { path: "/settings",   label: "Settings",   ic: "⚙" },
];

export function renderShell(appRoot, { email }) {
  appRoot.removeAttribute("aria-busy");
  appRoot.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <a class="brand" href="#/" title="Dashboard">Tipolo<span> Portal</span></a>
        <nav>
          ${NAV.map((n) => `
            <a href="#${n.path}" data-nav><span class="ic">${n.ic}</span>${escapeHtml(n.label)}</a>
          `).join("")}
        </nav>
        <div class="spacer"></div>
        <div class="timerbox" id="timerbox"></div>
        <div class="userbox">
          <span class="email">${escapeHtml(email || "")}</span>
          <button class="btn ghost sm block" data-signout>Sign out</button>
        </div>
      </aside>
      <div class="main">
        <main class="view" id="view" aria-live="polite"></main>
      </div>
    </div>`;

  appRoot.querySelector("[data-signout]").addEventListener("click", async (e) => {
    e.target.disabled = true;
    await signOut();
    // onAuthChange in app.js will swap back to the login view
  });

  mountTimer(appRoot.querySelector("#timerbox"));

  return {
    outlet: appRoot.querySelector("#view"),
    // no on-screen breadcrumb any more — keep the API and use it for the tab title
    setCrumbs: (text) => { document.title = text ? `${text} · Tipolo Portal` : "Tipolo Portal"; },
    actions: appRoot.querySelector("#timerbox"),
  };
}
