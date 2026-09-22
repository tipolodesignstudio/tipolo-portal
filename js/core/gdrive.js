// Google Drive, straight from the browser.
//
// Sign-in is Google's own token popup (Google Identity Services). Each person connects
// once; the token lasts an hour and is kept for the tab's session, so a reload doesn't
// ask again. There is no refresh token in this flow — after an hour the next Drive
// action opens the popup again, and it closes itself if access was already granted.
//
// A popup can only open from a click. connect() therefore has to be the first thing a
// click handler calls, before any await; everything else here assumes a token exists
// and throws NotConnected if it doesn't.

import { GOOGLE_CLIENT_ID } from "../../config.js";

const SCOPE = "https://www.googleapis.com/auth/drive";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const KEY = "tipolo.gdrive.token";
const FOLDER = "application/vnd.google-apps.folder";

export class NotConnected extends Error {
  constructor() { super("Connect Google Drive first."); this.name = "NotConnected"; }
}

export const configured = () =>
  !!GOOGLE_CLIENT_ID && !/^YOUR-/.test(GOOGLE_CLIENT_ID);

/* ---------------- token ---------------- */

let token = null;
try { const t = JSON.parse(sessionStorage.getItem(KEY) || "null"); if (t && t.exp > Date.now()) token = t; }
catch { /* storage blocked */ }

const listeners = new Set();
export const onConnectionChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const notify = () => listeners.forEach((fn) => { try { fn(connected()); } catch { /* */ } });

export const connected = () => !!token && token.exp > Date.now() + 60_000;

let gisReady = null;
export function loadGoogle() {
  if (!configured()) return Promise.resolve(false);
  if (window.google?.accounts?.oauth2) return Promise.resolve(true);
  gisReady ||= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => { gisReady = null; reject(new Error("Couldn't reach Google sign-in.")); };
    document.head.appendChild(s);
  });
  return gisReady;
}

let client = null;
let pending = null;
let hint = "";
export const setLoginHint = (email) => { hint = email || ""; };
let handlers = { ok() {}, fail() {} };

// Call synchronously from a click. Resolves once Google hands back a token.
export function connect({ email } = {}) {
  if (connected()) return Promise.resolve(token.access);
  if (!configured()) return Promise.reject(new Error("Google Drive isn't set up yet (config.js has no Google client ID)."));
  if (!window.google?.accounts?.oauth2) {
    loadGoogle();
    return Promise.reject(new Error("Google sign-in is still loading — try again in a moment."));
  }
  if (pending) return pending;
  client ||= google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID, scope: SCOPE,
    callback: (res) => handlers.ok(res),
    error_callback: (err) => handlers.fail(err),
  });
  pending = new Promise((resolve, reject) => {
    handlers = {
      ok(res) {
        pending = null;
        if (res.error) { reject(new Error(res.error_description || res.error)); return; }
        token = { access: res.access_token, exp: Date.now() + (Number(res.expires_in) || 3600) * 1000 };
        try { sessionStorage.setItem(KEY, JSON.stringify(token)); } catch { /* */ }
        notify();
        resolve(token.access);
      },
      fail(err) {
        pending = null;
        reject(new Error(err?.type === "popup_closed" ? "Google sign-in was closed."
          : err?.type === "popup_failed_to_open" ? "The browser blocked Google's sign-in popup."
          : (err?.message || "Google sign-in failed.")));
      },
    };
  });
  client.requestAccessToken({ prompt: "", login_hint: email || hint || undefined });
  return pending;
}

export function disconnect() {
  if (token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token.access, () => {});
  token = null;
  try { sessionStorage.removeItem(KEY); } catch { /* */ }
  notify();
}

/* ---------------- requests ---------------- */

async function call(url, opts = {}) {
  if (!connected()) throw new NotConnected();
  const res = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${token.access}`, ...(opts.headers || {}) } });
  if (res.status === 401) { token = null; try { sessionStorage.removeItem(KEY); } catch { /* */ } notify(); throw new NotConnected(); }
  if (!res.ok) {
    let msg = `Google Drive said ${res.status}`;
    try { const j = await res.json(); msg = j.error?.message || msg; } catch { /* */ }
    if (res.status === 404) msg = "Google Drive couldn't find that file or folder — it may not be shared with you.";
    throw new Error(msg);
  }
  return res;
}

const q = (params) => new URLSearchParams({ supportsAllDrives: "true", ...params }).toString();
const FIELDS = "id,name,mimeType,parents,webViewLink,modifiedTime";
const quote = (s) => `'${String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

export async function getFile(id) {
  return (await call(`${API}/files/${encodeURIComponent(id)}?${q({ fields: FIELDS })}`)).json();
}

export async function listChildren(parentId, { name, folders } = {}) {
  let query = `${quote(parentId)} in parents and trashed = false`;
  if (name) query += ` and name = ${quote(name)}`;
  if (folders) query += ` and mimeType = '${FOLDER}'`;
  const out = [];
  let pageToken = "";
  do {
    const res = await (await call(`${API}/files?${q({
      q: query, fields: `nextPageToken,files(${FIELDS})`, pageSize: "200",
      includeItemsFromAllDrives: "true", ...(pageToken ? { pageToken } : {}),
    })}`)).json();
    out.push(...(res.files || []));
    pageToken = res.nextPageToken || "";
  } while (pageToken);
  return out;
}

export async function findOrCreateFolder(parentId, name) {
  const [hit] = await listChildren(parentId, { name, folders: true });
  if (hit) return hit;
  return (await call(`${API}/files?${q({ fields: FIELDS })}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId] }),
  })).json();
}

export async function download(id) {
  return (await call(`${API}/files/${encodeURIComponent(id)}?${q({ alt: "media" })}`)).arrayBuffer();
}

function multipart(meta, blob) {
  const boundary = "tipolo" + Math.random().toString(36).slice(2);
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
    `--${boundary}\r\nContent-Type: ${blob.type || "application/octet-stream"}\r\n\r\n`,
    blob, `\r\n--${boundary}--`,
  ]);
  return { body, headers: { "Content-Type": `multipart/related; boundary=${boundary}` } };
}

export async function upload(parentId, name, blob) {
  const { body, headers } = multipart({ name, parents: [parentId] }, blob);
  return (await call(`${UPLOAD}/files?${q({ uploadType: "multipart", fields: FIELDS })}`,
    { method: "POST", headers, body })).json();
}

// new contents for an existing file — same id, same link, Drive keeps the old version
export async function replace(id, blob) {
  return (await call(`${UPLOAD}/files/${encodeURIComponent(id)}?${q({ uploadType: "media", fields: FIELDS })}`,
    { method: "PATCH", headers: { "Content-Type": blob.type || "application/octet-stream" }, body: blob })).json();
}

export async function copy(id, parentId, name) {
  return (await call(`${API}/files/${encodeURIComponent(id)}/copy?${q({ fields: FIELDS })}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, parents: [parentId] }),
  })).json();
}

// rename and/or move
export async function moveRename(id, { name, from, to }) {
  const params = { fields: FIELDS };
  if (to && from && to !== from) { params.addParents = to; params.removeParents = from; }
  return (await call(`${API}/files/${encodeURIComponent(id)}?${q(params)}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(name ? { name } : {}),
  })).json();
}

// A folder or file id from whatever was pasted: a Drive link or the bare id.
export function idFromLink(s) {
  const v = String(s || "").trim();
  const m = /\/folders\/([\w-]{10,})/.exec(v) || /\/d\/([\w-]{10,})/.exec(v) || /[?&]id=([\w-]{10,})/.exec(v);
  if (m) return m[1];
  return /^[\w-]{10,}$/.test(v) ? v : "";
}
