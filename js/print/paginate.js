// Lays a flow of document blocks onto Letter pages.
//
// The proposal is paginated here rather than left to the browser so that the preview
// and the print are the same pages: the preview shows real 8.5x11 sheets, and print
// puts a hard break between them. Letting the printer flow the text would give a
// preview that could not show where the breaks land.
//
// Units are measured in a hidden sheet of the same width and styled by the same CSS,
// so the heights are the real ones.

const PX_IN = 96;
export const PAGE_H = 11 * PX_IN;
export const PAGE_W = 8.5 * PX_IN;
export const BAND_H = 1.75 * PX_IN;   // letterhead band
export const BAR_H = 0.47 * PX_IN;    // contact bar
const PAD_TOP = 26;
const PAD_BOTTOM = 18;

// Room for body copy on one page.
export const CONTENT_H = PAGE_H - BAND_H - BAR_H - PAD_TOP - PAD_BOTTOM;

// Landscape Letter, used for a gantt chart too wide for the portrait column.
export const LAND_W = 11 * PX_IN;
export const LAND_H = 8.5 * PX_IN;

// A heading must not be the last thing on a page. `keep` marks a unit that has to stay
// with the one after it — headings, and the "A. Base Scope" style labels above tables.
const KEEP = new Set(["H1", "H2", "H3"]);

function measure(flowHtml) {
  const host = document.createElement("div");
  host.className = "doc letterhead pagination-probe";
  host.style.cssText =
    `position:absolute;left:-10000px;top:0;width:${PAGE_W}px;visibility:hidden;pointer-events:none`;
  host.innerHTML = `<div class="sheet-page"><div class="lh-body">${flowHtml}</div></div>`;
  document.body.appendChild(host);

  const body = host.querySelector(".lh-body");
  const units = [...body.children].map((el) => {
    const cs = getComputedStyle(el);
    return {
      html: el.outerHTML,
      // margins collapse between siblings, so the bottom margin is the one that counts
      h: el.offsetHeight + parseFloat(cs.marginBottom || 0),
      top: parseFloat(cs.marginTop || 0),
      keep: KEEP.has(el.tagName) || el.dataset.keep === "1",
      brk: el.classList.contains("pagebreak"),
      landscape: el.dataset.landscape === "1",
    };
  });
  host.remove();
  return units;
}

// Returns [{ landscape, units }] — one entry per printed page.
export function paginate(flowHtml) {
  const units = measure(flowHtml);
  const pages = [];
  let page = [];
  let used = 0;

  const push = (landscape = false) => {
    pages.push({ landscape, units: page });
    page = [];
    used = 0;
  };

  for (let i = 0; i < units.length; i++) {
    const u = units[i];

    if (u.brk) { if (page.length) push(); continue; }

    // A chart too wide for the portrait column takes a landscape page to itself, and
    // brings its heading along so the page is not left titleless.
    if (u.landscape) {
      const prev = page[page.length - 1];
      const heading = units[i - 1]?.keep && prev === units[i - 1].html;
      if (heading) page.pop();
      if (page.length) push();
      page = heading ? [units[i - 1].html, u.html] : [u.html];
      push(true);
      continue;
    }

    // A heading that would sit alone at the foot of a page goes over with its text.
    if (u.keep && page.length) {
      const next = units[i + 1];
      const together = u.h + u.top + (next && !next.brk ? next.h + next.top : 0);
      if (used + together > CONTENT_H) { push(); }
    }

    const need = u.h + (page.length ? u.top : 0);
    if (page.length && used + need > CONTENT_H) push();

    page.push(u.html);
    used += need;
  }
  if (page.length) push();
  return pages.length ? pages : [{ landscape: false, units: [] }];
}
