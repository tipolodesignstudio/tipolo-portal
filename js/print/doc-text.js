// Body copy -> document markup. Shared by the proposal and the invoice so a bullet,
// a bold word or an unfilled [placeholder] means the same thing in both.
//
// Everything here runs AFTER escaping, so the only tags in the output are the ones
// produced here — the stored text stays plain and can never inject markup.

import { escapeHtml } from "../core/format.js";
import { resolveTokens } from "../core/tokens.js";

// Inline formatting, written the way a writer would type it:
//   **bold**   *italic*   __underline__
function inline(escaped) {
  // The outer pairs match up to their closing marker rather than to the next single
  // one, so *italic* nested inside **bold** survives instead of splitting it.
  return escaped
    .replace(/\*\*((?:(?!\*\*)[^\n])+)\*\*/g, "<b>$1</b>")
    .replace(/__((?:(?!__)[^\n])+)__/g, "<u>$1</u>")
    .replace(/\*([^*\n]+)\*/g, "<i>$1</i>");
}

// Anything still in [brackets] is unfilled, so it prints red — impossible to send by
// accident without noticing. The character class stops it swallowing the tags above.
function marks(html) {
  return html.replace(/\[[^\[\]<>]*\]/g, (m) => `<span class="ph">${m}</span>`);
}

export const esc = (t) => marks(inline(escapeHtml(t ?? "")));

/* A line beginning "• ", "- ", "1. " or "a) " is a list item ("*" is italic, not a
   bullet); two leading spaces (or a tab) step it in one level, matching the source
   document's 18pt indents. A following line that is indented but carries no marker is
   the same item wrapped onto a second line, not a new one — that is what the builder's
   Bullet/Number buttons produce and what a writer types by hand. Prose and lists can
   sit in the same paragraph. */
export const LIST_RE = /^([ \t]*)([••-]|\d+[.)]|[A-Za-z][.)])[ \t]+(.*)$/;
const CONT_RE = /^[ \t]+\S/;

const indentOf = (ws) => Math.min(Math.floor(ws.replace(/\t/g, "  ").length / 2), 3);

export function prose(text, map, blkTag = "") {
  const src = resolveTokens(text || "", map);
  if (!src.trim()) return "";
  const out = [];

  for (const para of src.split(/\n{2,}/)) {
    let buf = [];      // plain lines waiting to become a <p>
    let items = [];    // the run of list items being built

    const flushText = () => {
      if (!buf.length) return;
      out.push(`<p${blkTag}>${buf.map((l) => esc(l.trim())).join("<br>")}</p>`);
      buf = [];
    };
    const flushList = () => { out.push(...items); items = []; };

    for (const line of para.split("\n")) {
      const m = line.match(LIST_RE);
      if (m) {
        flushText();
        const marker = m[2] === "-" ? "•" : m[2];
        items.push(`<div class="li lvl${indentOf(m[1])}"${blkTag}>`
          + `<span class="mk">${escapeHtml(marker)}</span>`
          + `<span class="tx">${esc(m[3])}</span></div>`);
      } else if (items.length && CONT_RE.test(line)) {
        // wrapped continuation of the item above
        items[items.length - 1] = items[items.length - 1]
          .replace(/<\/span><\/div>$/, ` ${esc(line.trim())}</span></div>`);
      } else {
        flushList();
        buf.push(line);
      }
    }
    flushText();
    flushList();
  }
  return out.join("");
}
