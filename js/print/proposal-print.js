// Branded proposal document -> browser print dialog ("Save as PDF").
// The markup comes from proposal-doc.js, the same builder the preview pane uses.
import { proposalDocHtml } from "./proposal-doc.js";

export function printProposal(p, settings = {}) {
  const host = document.createElement("div");
  host.id = "print-root";
  host.innerHTML = proposalDocHtml(p, settings);

  document.body.appendChild(host);
  const cleanup = () => { host.remove(); window.removeEventListener("afterprint", cleanup); };
  window.addEventListener("afterprint", cleanup);
  window.print();
  setTimeout(cleanup, 60000);
}
