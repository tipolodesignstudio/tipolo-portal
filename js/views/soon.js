// Placeholder for sections delivered in later phases.
import { titleCase } from "../core/format.js";

const PHASE = {
  clients: "Phase 1", projects: "Phase 1",
  timesheets: "Phase 2", invoices: "Phase 3", proposals: "Phase 4",
};

export async function render(root, ctx) {
  const section = (ctx.path || "/").split("/")[1] || "section";
  ctx.setCrumbs?.(titleCase(section));
  root.innerHTML = `
    <div class="empty">
      <h3>${titleCase(section)}</h3>
      <p class="faint">Coming in ${PHASE[section] || "a later phase"}.</p>
    </div>`;
}
