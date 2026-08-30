// Minimal hash router. Routes are registered as { pattern, load } where `load` is an
// async function returning a module with `render(container, ctx)`.
//
//   ctx = { params, query, path, navigate }

const routes = [];
let outlet = null;
let notFound = null;
let currentToken = 0;

export function defineRoutes(list) {
  routes.length = 0;
  for (const r of list) {
    if (r.pattern === "*") { notFound = r; continue; }
    routes.push({ ...r, regex: toRegex(r.pattern), keys: keysOf(r.pattern) });
  }
}

export function startRouter(outletEl) {
  outlet = outletEl;
  window.addEventListener("hashchange", handle);
  handle();
}

export function navigate(path) {
  if (("#" + path) === window.location.hash) handle();
  else window.location.hash = path;
}

export function currentPath() {
  return (window.location.hash || "#/").slice(1);
}

function toRegex(pattern) {
  const rx = pattern
    .split("/")
    .map((seg) =>
      seg.startsWith(":") ? "([^/]+)" : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("/");
  return new RegExp("^" + rx + "/?$");
}
function keysOf(pattern) {
  return (pattern.match(/:([A-Za-z_]+)/g) || []).map((k) => k.slice(1));
}

async function handle() {
  const raw = currentPath();
  const [pathname, queryStr = ""] = raw.split("?");
  const path = pathname || "/";
  const query = Object.fromEntries(new URLSearchParams(queryStr));

  let matched = null, params = {};
  for (const r of routes) {
    const m = r.regex.exec(path);
    if (m) {
      matched = r;
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      break;
    }
  }
  const route = matched || notFound;
  if (!route) return;

  const token = ++currentToken;
  outlet.setAttribute("aria-busy", "true");
  try {
    const mod = await route.load();
    if (token !== currentToken) return; // superseded by a newer navigation
    document.querySelectorAll("[data-nav]").forEach((a) => {
      const target = a.getAttribute("href").slice(1).split("?")[0];
      a.classList.toggle("active", target === path || (target !== "/" && path.startsWith(target)));
    });
    window.scrollTo(0, 0);
    await mod.render(outlet, { params, query, path, navigate });
  } catch (err) {
    console.error("Route error:", err);
    if (token === currentToken) {
      outlet.innerHTML =
        `<div class="empty"><h3>Something broke loading this page</h3>
         <p class="faint">${(err && err.message) || err}</p></div>`;
    }
  } finally {
    if (token === currentToken) outlet.removeAttribute("aria-busy");
  }
}
