// Header running-timer widget. State lives in localStorage so it survives navigation
// and reloads. Stopping opens the time-entry dialog prefilled with the elapsed time.
import { listActiveProjectsLite } from "../core/api.js";
import { openModal } from "./modal.js";
import { toastErr } from "./toast.js";
import { editTimeEntry } from "../views/time-entry-modal.js";

const KEY = "tipolo-timer";
let tickHandle = null;
let hostEl = null;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
}
function save(state) {
  if (state) localStorage.setItem(KEY, JSON.stringify(state));
  else localStorage.removeItem(KEY);
}

function elapsedMs(state) {
  return Date.now() - new Date(state.startedAt).getTime();
}
function fmt(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function mountTimer(container) {
  hostEl = document.createElement("div");
  hostEl.className = "timer-widget";
  container.prepend(hostEl);
  window.addEventListener("storage", (e) => { if (e.key === KEY) renderTimer(); });
  renderTimer();
}

function renderTimer() {
  if (!hostEl) return;
  const state = load();
  clearInterval(tickHandle);

  if (!state) {
    hostEl.innerHTML = `<button class="btn ghost sm" data-timer-start>▶ Start timer</button>`;
    hostEl.querySelector("[data-timer-start]").onclick = startFlow;
    return;
  }

  hostEl.innerHTML = `
    <div class="timer-running">
      <span class="dot"></span>
      <span class="t-proj" title="${state.projectTitle}">${state.projectTitle}</span>
      <span class="t-clock" data-clock>${fmt(elapsedMs(state))}</span>
      <button class="btn sm" data-timer-stop>Stop</button>
      <button class="icon-btn" data-timer-cancel title="Discard">&times;</button>
    </div>`;
  hostEl.querySelector("[data-timer-stop]").onclick = stopFlow;
  hostEl.querySelector("[data-timer-cancel]").onclick = cancelFlow;

  const clock = hostEl.querySelector("[data-clock]");
  tickHandle = setInterval(() => {
    const s = load();
    if (!s) { renderTimer(); return; }
    clock.textContent = fmt(elapsedMs(s));
  }, 1000);
}

async function startFlow() {
  let projects;
  try { projects = await listActiveProjectsLite(); }
  catch (err) { toastErr(err.message); return; }
  if (!projects.length) {
    await openModal({ title: "No open projects",
      body: `<p>Create a project first, then you can time your work on it.</p>`,
      confirmText: "OK", onConfirm: () => true });
    return;
  }
  const picked = await openModal({
    title: "Start timer",
    confirmText: "Start",
    body: `<form class="form-grid">
      <div class="field">
        <label class="lbl" for="tp">Project</label>
        <select id="tp" name="project_id" required>
          ${projects.map((p) => `<option value="${p.id}">${p.client?.name ? `${p.title} — ${p.client.name}` : p.title}</option>`).join("")}
        </select>
      </div>
    </form>`,
    onConfirm: (dlg) => {
      const id = dlg.querySelector("[name=project_id]").value;
      const p = projects.find((x) => x.id === id);
      return { projectId: id, projectTitle: p?.title || "Project" };
    },
  });
  if (!picked) return;
  save({ ...picked, startedAt: new Date().toISOString() });
  renderTimer();
}

async function stopFlow() {
  const state = load();
  if (!state) return;
  const minutes = Math.max(1, Math.round(elapsedMs(state) / 60000));
  // clear first so the running clock stops even if the dialog is dismissed
  save(null);
  renderTimer();
  await editTimeEntry({
    prefill: { project_id: state.projectId, minutes },
    onSaved: () => {
      window.dispatchEvent(new CustomEvent("tipolo:time-changed"));
    },
  });
}

async function cancelFlow() {
  const ok = await openModal({
    title: "Discard timer",
    body: `<p>Discard the running timer without logging any time?</p>`,
    confirmText: "Discard", danger: true, onConfirm: () => true,
  });
  if (ok) { save(null); renderTimer(); }
}
