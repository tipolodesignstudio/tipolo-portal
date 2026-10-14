// Formatting for the builder's text boxes. Text stays plain: **bold**, *italic*,
// __underline__, "• " bullets and "1. " numbers, each two leading spaces one more level
// of indent — exactly what the printed document understands (js/print/doc-text.js).
//
// Each function edits the textarea in place with setRangeText, which keeps the
// browser's undo history, then fires an input event so React picks up the new value.

const MARKER = /^([ \t]*)([•\-*]|\d+[.)]|[A-Za-z][.)])[ \t]+/;
export const isListLine = (line: string) => MARKER.test(line);

const fire = (ta: HTMLTextAreaElement) => {
  ta.dispatchEvent(new Event("input", { bubbles: true }));
  ta.focus();
};

export type LineAction = "bullet" | "number" | "indent" | "outdent";

export function formatLines(ta: HTMLTextAreaElement, action: LineAction) {
  const v = ta.value;
  const from = v.lastIndexOf("\n", Math.max(0, ta.selectionStart - 1)) + 1;
  let to = v.indexOf("\n", ta.selectionEnd);
  if (to === -1) to = v.length;
  const lines = v.slice(from, to).split("\n");
  let out: string[];

  if (action === "indent" || action === "outdent") {
    out = lines.map((l) => (action === "indent" ? `  ${l}` : l.replace(/^ {1,2}|^\t/, "")));
  } else if (action === "bullet") {
    // already all bullets → strip them, so the button toggles
    const all = lines.every((l) => /^[ \t]*[•\-*][ \t]+/.test(l) || !l.trim());
    out = lines.map((l) => {
      if (!l.trim()) return l;
      const ws = l.match(/^[ \t]*/)![0];
      const text = l.replace(MARKER, "").trim();
      return all ? ws + text : `${ws}• ${text}`;
    });
  } else {
    const all = lines.every((l) => /^[ \t]*\d+[.)][ \t]+/.test(l) || !l.trim());
    let n = 0;
    out = lines.map((l) => {
      if (!l.trim()) return l;
      const ws = l.match(/^[ \t]*/)![0];
      const text = l.replace(MARKER, "").trim();
      return all ? ws + text : `${ws}${++n}. ${text}`;
    });
  }
  ta.setRangeText(out.join("\n"), from, to, "select");
  fire(ta);
}

// Wraps the selection in the marker, or unwraps it if it is already wrapped, so the
// button toggles like a word processor's. With nothing selected it drops the pair in and
// puts the caret between them.
export function wrapSelection(ta: HTMLTextAreaElement, mark: string) {
  const { selectionStart: a, selectionEnd: b, value: v } = ta;
  const sel = v.slice(a, b);
  const n = mark.length;
  const outside = v.slice(a - n, a) === mark && v.slice(b, b + n) === mark;
  const inside = sel.length >= n * 2 && sel.startsWith(mark) && sel.endsWith(mark);

  if (outside) ta.setRangeText(sel, a - n, b + n, "select");
  else if (inside) ta.setRangeText(sel.slice(n, -n), a, b, "select");
  else {
    ta.setRangeText(mark + sel + mark, a, b, "end");
    ta.setSelectionRange(a + n, a + n + sel.length);
  }
  fire(ta);
}

/* Keyboard: ⌘B/I/U wrap; Tab indents a list line (or the selected lines) instead of
   leaving the box; Escape leaves it. Returns true when it handled the key. */
export function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>): boolean {
  const ta = e.currentTarget;
  if ((e.metaKey || e.ctrlKey) && !e.altKey) {
    const mark = ({ b: "**", i: "*", u: "__" } as Record<string, string>)[e.key.toLowerCase()];
    if (mark) { e.preventDefault(); wrapSelection(ta, mark); return true; }
  }
  if (e.key === "Escape") { ta.blur(); return true; }
  if (e.key !== "Tab") return false;
  e.preventDefault();
  const from = ta.value.lastIndexOf("\n", Math.max(0, ta.selectionStart - 1)) + 1;
  const eol = ta.value.indexOf("\n", from);
  const line = ta.value.slice(from, eol === -1 ? ta.value.length : eol);
  if (isListLine(line) || ta.selectionStart !== ta.selectionEnd || e.shiftKey) {
    formatLines(ta, e.shiftKey ? "outdent" : "indent");
  } else {
    ta.setRangeText("\t", ta.selectionStart, ta.selectionEnd, "end");
    fire(ta);
  }
  return true;
}
