// Shared create/edit dialog for a time entry. Used by the Timesheets view, the
// project detail Time tab, and the header timer widget.
import { escapeHtml, isoDate, parseDuration, minutesToHM } from "../core/format.js";
import { openModal } from "../components/modal.js";
import { field, textarea, select, row, readForm } from "../components/form.js";
import { toastOk, toastErr } from "../components/toast.js";
import {
  createTimeEntry, updateTimeEntry, deleteTimeEntry,
  listActiveProjectsLite, getSettings, effectiveRate,
} from "../core/api.js";

function rateFor(projectLite, settings) {
  return effectiveRate(
    { hourly_rate: projectLite?.hourly_rate, client: projectLite?.client },
    settings
  );
}

export async function editTimeEntry({ existing = null, prefill = {}, onSaved } = {}) {
  const isNew = !existing;
  let projects, settings;
  try {
    [projects, settings] = await Promise.all([
      listActiveProjectsLite(),
      getSettings().catch(() => ({})),
    ]);
  } catch (err) { toastErr(err.message); return; }

  if (!projects.length && isNew) {
    await openModal({
      title: "No open projects",
      body: `<p>Create a project (status not archived/complete) before logging time.</p>`,
      confirmText: "OK", onConfirm: () => true,
    });
    return;
  }

  const e = existing || {};
  const selectedProjectId = e.project_id || prefill.project_id || projects[0]?.id;
  const startDuration = prefill.minutes != null
    ? minutesToHM(prefill.minutes)
    : e.minutes != null ? minutesToHM(e.minutes) : "";
  const startRate = e.rate != null ? e.rate
    : rateFor(projects.find((p) => p.id === selectedProjectId), settings);

  const result = await openModal({
    title: isNew ? "Log time" : "Edit time entry",
    confirmText: isNew ? "Add entry" : "Save",
    body: `<form class="form-grid">
      ${select("project_id", "Project", selectedProjectId, projects.map((p) => ({
        value: p.id, label: p.client?.name ? `${p.title} — ${p.client.name}` : p.title,
      })), { required: true })}
      ${row(
        field("entry_date", "Date", e.entry_date || prefill.entry_date || isoDate(), { type: "date", required: true }),
        field("duration", "Duration", startDuration, { ph: "1:30 or 1.5h", required: true, hint: "h:mm, 1.5h, or 90m" }),
      )}
      ${textarea("description", "What did you work on?", e.description || prefill.description || "", { rows: 2 })}
      ${row(
        field("rate", "Rate ($/hr)", startRate ?? "", { type: "number", step: "0.01", min: 0 }),
        `<div class="field"><label class="lbl">&nbsp;</label>
          <label style="display:flex;gap:8px;align-items:center;font-size:.9rem;padding:9px 0">
            <input type="checkbox" name="billable" ${e.billable === false ? "" : "checked"} style="width:auto" />
            Billable</label></div>`,
      )}
      ${!isNew && e.invoice_id ? `<div class="alert info">This entry is on an invoice — editing won't change the invoice.</div>` : ""}
    </form>`,
    onConfirm: async (dlg) => {
      const f = readForm(dlg.querySelector("form"));
      const minutes = parseDuration(f.duration);
      if (minutes == null || minutes <= 0) throw new Error("Enter a duration like 1:30, 1.5h, or 90m.");
      const patch = {
        project_id: f.project_id,
        entry_date: f.entry_date,
        description: f.description || null,
        minutes,
        billable: !!f.billable,
        rate: f.rate === "" || f.rate == null ? null : Number(f.rate),
      };
      return isNew ? await createTimeEntry(patch) : await updateTimeEntry(e.id, patch);
    },
  });

  if (result) {
    toastOk(isNew ? "Time logged" : "Entry saved");
    onSaved?.(result);
  }
}

export async function confirmDeleteEntry(id, onDone) {
  const ok = await openModal({
    title: "Delete time entry",
    body: `<p>Delete this time entry? This can't be undone.</p>`,
    confirmText: "Delete", danger: true, onConfirm: () => true,
  });
  if (!ok) return;
  try { await deleteTimeEntry(id); toastOk("Entry deleted"); onDone?.(); }
  catch (err) { toastErr(err.message); }
}
