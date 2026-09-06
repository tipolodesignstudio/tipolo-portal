// Turns a proposal's schedule rows into a grid layout for the gantt chart.
//
// Two scales, both built on Monday-start weeks:
//   "week"  one column per week          — the default, fits a long job on one page
//   "day"   five columns per week, Mon–Fri — working days only, no weekend columns
//
// Dates are ISO (YYYY-MM-DD). A row with a start but no due is a milestone (a diamond
// rather than a bar) — that is how "Project Start" reads in the source proposal.
// Returns null when nothing has a date yet, so the caller can fall back to a plain table.

const DAY = 86400000;
const MAX_WEEK_COLS = 30;
const MAX_DAY_COLS = 60;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["M", "T", "W", "T", "F"];

export function parseISO(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ""))) return null;
  const d = new Date(`${s}T00:00:00`);
  return isNaN(d) ? null : d;
}

const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// Monday of the week containing d.
function mondayOf(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

const weeksBetween = (a, b) => Math.round((mondayOf(b) - mondayOf(a)) / (7 * DAY));

// Weekend dates clamp onto the Friday of their week, so a bar never needs a column
// that the working-day scale doesn't have.
const weekdayIdx = (d) => Math.min((d.getDay() + 6) % 7, 4);

const shortDate = (d) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;

export function buildGantt(rows = [], scale = "week") {
  const items = rows.map((r) => ({
    task: r.task || "",
    start: parseISO(r.start),
    due: parseISO(r.due),
  }));

  const dates = items.flatMap((i) => [i.start, i.due]).filter(Boolean);
  if (!dates.length) return null;

  const first = new Date(Math.min(...dates));
  const last = new Date(Math.max(...dates));
  const mon0 = mondayOf(first);
  const weekCount = weeksBetween(mon0, last) + 1;

  const perWeek = scale === "day" ? 5 : 1;
  const cap = scale === "day" ? MAX_DAY_COLS : MAX_WEEK_COLS;
  const shownWeeks = Math.min(weekCount, Math.floor(cap / perWeek));
  const truncated = shownWeeks < weekCount;
  const colCount = shownWeeks * perWeek;

  // column index of a date, in the active scale
  const colOf = (d) => {
    const w = weeksBetween(mon0, d);
    return scale === "day" ? w * 5 + weekdayIdx(d) : w;
  };

  const weeks = Array.from({ length: shownWeeks }, (_, w) => {
    const mon = addDays(mon0, w * 7);
    const fri = addDays(mon, 4);
    return {
      index: w,
      label: `Week ${w + 1}`,
      sub: `${shortDate(mon)}–${fri.getMonth() === mon.getMonth() ? fri.getDate() : shortDate(fri)}`,
      startCol: w * perWeek,
      span: perWeek,
    };
  });

  const cols = scale === "day"
    ? Array.from({ length: colCount }, (_, i) => {
      const d = addDays(mon0, Math.floor(i / 5) * 7 + (i % 5));
      return { i, label: WD[i % 5], sub: String(d.getDate()), weekIndex: Math.floor(i / 5) };
    })
    : [];

  const bars = items.map((it) => {
    if (!it.start && !it.due) return { task: it.task, empty: true };
    const s = it.start || it.due;
    const e = it.due || it.start;
    const startCol = Math.max(0, Math.min(colOf(s), colCount - 1));
    const endCol = Math.max(startCol, Math.min(colOf(e), colCount - 1));
    return {
      task: it.task,
      milestone: !it.due,
      startCol,
      endCol,
      startLabel: it.start ? shortDate(it.start) : "",
      dueLabel: it.due ? shortDate(it.due) : "",
      clipped: colOf(e) > colCount - 1,
    };
  });

  return { scale, colCount, weeks, cols, bars, truncated };
}
