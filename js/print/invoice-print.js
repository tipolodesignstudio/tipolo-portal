// Branded invoice document -> browser print dialog ("Save as PDF").
// The markup comes from invoice-doc.js, the same builder the preview pane uses.
import { invoiceDocHtml, invoiceFileName } from "./invoice-doc.js";

export function printInvoice(inv, settings = {}, ctx = {}) {
  const host = document.createElement("div");
  host.id = "print-root";
  host.innerHTML = invoiceDocHtml(inv, settings, ctx);

  // Chrome, Edge and Safari all seed the "Save as PDF" filename from the page title,
  // so the file lands as Invoice_YYNNN-XXX.pdf rather than the app's own title.
  const title = document.title;
  document.title = invoiceFileName(inv);

  document.body.appendChild(host);
  const cleanup = () => {
    host.remove();
    document.title = title;
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
  // Safari sometimes doesn't fire afterprint.
  setTimeout(cleanup, 60000);
}
