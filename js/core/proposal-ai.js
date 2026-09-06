// Client side of the `parse-proposal` Edge Function — the AI fallback used when the
// local parser in proposal-parse.js can't read a document confidently.
//
// The function is optional: if it isn't deployed, the import screen just hides the
// button. Nothing here ever runs without the user clicking "Read with AI".

import { supabase } from "./supabase.js";

export const FUNCTION_NAME = "parse-proposal";

// Text-layer PDFs go up as text (cheap). A PDF with no usable text layer — a scan —
// goes up as the file itself so the model can read the page images.
const MIN_TEXT = 400;
const MAX_PDF_BYTES = 4_000_000;

export async function aiParseProposal({ text = "", file = null, clients = [] } = {}) {
  const body = {
    text: text.slice(0, 180_000),
    filename: file?.name || "",
    clients: clients.map((c) => ({ id: c.id, name: c.name })).slice(0, 400),
  };

  if (text.trim().length < MIN_TEXT && file) {
    if (file.size > MAX_PDF_BYTES) {
      throw new Error(
        "This PDF has almost no text layer and is too big to send as a scan (max 4 MB). " +
        "Re-export it with selectable text, or fill the fields in by hand.");
    }
    body.pdf_base64 = await toBase64(file);
  }

  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body });
  if (error) throw new Error(await describe(error));
  if (data?.error) throw new Error(data.error);
  if (!data) throw new Error("The reader returned nothing.");
  return data;
}

// Is the function deployed? Cached for the session; used to show/hide the button.
let available = null;
export async function aiAvailable() {
  if (available !== null) return available;
  try {
    const { error } = await supabase.functions.invoke(FUNCTION_NAME, { body: { ping: true } });
    // A 400 ("nothing to read") means the function is there and answering.
    const status = error?.context?.status;
    available = !error || status === 400;
  } catch {
    available = false;
  }
  return available;
}

async function describe(error) {
  const status = error?.context?.status;
  // A missing function answers without CORS headers, so the browser reports a fetch
  // failure rather than a 404.
  if (status === 404 || error?.name === "FunctionsFetchError") {
    return "The `parse-proposal` function isn't deployed yet — see SETUP.md §8.";
  }
  if (status === 401 || status === 403) {
    return "The reader rejected your session. Sign out and back in, then retry.";
  }
  try {
    const body = await error.context.json();
    if (body?.error) return body.error;
  } catch { /* not JSON */ }
  return error.message || "The reader failed.";
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(new Error("Couldn't read the file."));
    r.readAsDataURL(file);
  });
}
