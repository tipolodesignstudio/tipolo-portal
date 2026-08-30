// Bootstrap: config check -> session gate -> shell + router, reacting to auth changes.
import { supabase, CONFIG_OK } from "./core/supabase.js";
import { defineRoutes, startRouter } from "./core/router.js";
import { renderShell } from "./components/layout.js";
import { getSettings } from "./core/api.js";
import { setCurrency } from "./core/format.js";
import * as loginView from "./views/login.js";

const app = document.getElementById("app");

const ROUTES = [
  { pattern: "/",            load: () => import("./views/dashboard.js") },
  { pattern: "/settings",    load: () => import("./views/settings.js") },
  { pattern: "/clients",     load: () => import("./views/soon.js") },
  { pattern: "/clients/:id", load: () => import("./views/soon.js") },
  { pattern: "/projects",    load: () => import("./views/soon.js") },
  { pattern: "/projects/:id",load: () => import("./views/soon.js") },
  { pattern: "/timesheets",  load: () => import("./views/soon.js") },
  { pattern: "/invoices",    load: () => import("./views/soon.js") },
  { pattern: "/proposals",   load: () => import("./views/soon.js") },
  { pattern: "*",            load: () => import("./views/soon.js") },
];

let mode = null; // 'login' | 'app' | 'reset'
let shell = null;

function showConfigNeeded() {
  app.removeAttribute("aria-busy");
  app.innerHTML = `
    <div class="auth-wrap"><div class="auth-card">
      <div class="brand">Tipolo<span> Portal</span></div>
      <h1>Almost there</h1>
      <p class="sub">Add your Supabase project URL and anon key to <code>config.js</code>,
      then reload. See <code>SETUP.md</code>.</p>
    </div></div>`;
}

function showLogin(loginMode = "signin") {
  mode = loginMode === "reset" ? "reset" : "login";
  shell = null;
  loginView.render(app, { mode: loginMode });
}

async function showApp(session) {
  if (mode === "app" && shell) return; // already mounted
  mode = "app";
  shell = renderShell(app, { email: session.user?.email });

  // route context helpers piggyback on the shell
  const origDefine = ROUTES.map((r) => ({
    ...r,
    load: async () => {
      const m = await r.load();
      return {
        render: (outlet, ctx) =>
          m.render(outlet, { ...ctx, setCrumbs: shell.setCrumbs, actions: shell.actions }),
      };
    },
  }));
  defineRoutes(origDefine);
  startRouter(shell.outlet);

  try {
    const s = await getSettings();
    if (s?.currency) setCurrency(s.currency);
  } catch { /* ignore */ }
}

async function boot() {
  if (!CONFIG_OK) { showConfigNeeded(); return; }

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") { showLogin("reset"); return; }
    if (session) { showApp(session); }
    else { showLogin("signin"); }
  });

  // initial state (onAuthStateChange also fires with INITIAL_SESSION, but be explicit)
  const { data } = await supabase.auth.getSession();
  if (data.session) showApp(data.session);
  else showLogin("signin");
}

boot();
