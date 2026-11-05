import { count, ease, fadeWindow, lerp, span } from "./scene-math.js";

/**
 * Hero illustration: the spreadsheet app in a scripted 25-second loop.
 *
 * 1. Chart (0–8.5 s): the pointer drags A1:D5, opens Insert › Chart and picks
 *    Column. The chart appears over the cells and its bars grow.
 * 2. Edit (8.5–16 s): the pointer selects B3 and types 140. Revenue, both
 *    totals and the West bar follow.
 * 3. Pivot (16–25 s): Insert › PivotTable adds a Pivot sheet with the field
 *    list; ticking Units adds a second value column.
 *
 * The ribbon, formula bar and sheet tabs mirror the real shell and use its
 * glyph sheet. `frameAt` is a pure function of time; `apply` writes text,
 * transforms, opacity and data attributes, so the loop never re-renders
 * React. The server renders the still frame (the finished edit), which is
 * also what reduced motion and a page without scripting show.
 */

export const HERO_LOOP_SECONDS = 25;
/** The still frame: the chart is in and the edit has recalculated. */
export const STILL_SECONDS = 13.4;
/** Everything returns to the opening state while the Pivot sheet is on top. */
const RESET = 23;

export const ACTS = [
  { start: 0, text: "Insert a chart from the selection." },
  { start: 8.5, text: "Edit a cell. Formulas and the chart follow." },
  { start: 16, text: "Summarize it with a pivot table." },
] as const;

/* ---- Workbook -------------------------------------------------------------- */

interface SalesRow {
  region: string;
  units: number;
  rate: number;
}

export const SALES: readonly SalesRow[] = [
  { region: "North", units: 128, rate: 42 },
  { region: "West", units: 96, rate: 48 },
  { region: "South", units: 112, rate: 44 },
  { region: "East", units: 104, rate: 46 },
];
/** The edit: West (B3) goes from 96 to this many units. */
const EDITED_UNITS = 140;
export const WEST = 1;
/** What B3 shows while 140 is typed, one key at a time. */
const TYPED: readonly string[] = ["1", "14", "140"];

export const revenue = (row: SalesRow, units = row.units) => units * row.rate;
export const BEFORE_REVENUE = SALES.map((row) => revenue(row));
export const AFTER_REVENUE = SALES.map((row, index) =>
  index === WEST ? revenue(row, EDITED_UNITS) : revenue(row),
);
export const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
const UNITS_BEFORE = sum(SALES.map((row) => row.units));
export const UNITS_AFTER = UNITS_BEFORE - (SALES[WEST]?.units ?? 0) + EDITED_UNITS;
/** The chart's value axis ends here, above the edited West bar. */
export const CHART_MAX = 8000;

/** The pivot lists regions in sort order, as a pivot does. */
export const PIVOT_ROWS = SALES.map((row, index) => ({
  region: row.region,
  units: index === WEST ? EDITED_UNITS : row.units,
  revenue: AFTER_REVENUE[index] ?? 0,
})).sort((a, b) => a.region.localeCompare(b.region));

export const money = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;

/** Columns A–L and 16 rows, so the sheet fills any frame width and height. */
export const COLUMNS = "ABCDEFGHIJKL".split("");
export const ROWS = 16;
/** Columns the sales table and the pivot fill: Region, Units, Rate, Revenue; Region and two values. */
export const SALES_COLUMNS = 4;
export const PIVOT_COLUMNS = 3;

/* ---- Frame ------------------------------------------------------------------- */

/** Elements the pointer travels to, by `data-target`. */
export type Target =
  | "rest"
  | "a1"
  | "d5"
  | "tab-insert"
  | "chart-button"
  | "kind-column"
  | "chart"
  | "b3"
  | "pivot-button"
  | "field-units";

/** Pointer route: it rests at a target until the next entry's time, then moves. */
type Waypoint = readonly [number, Target];
const ROUTE: readonly [Waypoint, ...Waypoint[]] = [
  [0, "rest"],
  [0.5, "rest"],
  [1.3, "a1"],
  [1.5, "a1"],
  [2.3, "d5"],
  [2.6, "d5"],
  [3.3, "tab-insert"],
  [3.6, "tab-insert"],
  [4.2, "chart-button"],
  [4.45, "chart-button"],
  [4.9, "kind-column"],
  [8.5, "kind-column"],
  [8.6, "chart"],
  [8.8, "chart"],
  [9.5, "b3"],
  [16.1, "b3"],
  [16.9, "pivot-button"],
  [17.5, "pivot-button"],
  [18.4, "field-units"],
];

/** When the pointer is on screen: one window per act. */
const POINTER_WINDOWS = [
  [0.2, 6.6],
  [8.6, 12.5],
  [16.1, 20.4],
] as const;

const CLICKS = [1.4, 3.4, 4.3, 5.0, 9.6, 17.1, 19.2] as const;
const CLICK_SECONDS = 0.5;

const BADGES = [
  { from: 5.6, to: 8.2, text: "Column chart from A1:D5" },
  { from: 12.2, to: 15.6, text: "3 cells and the chart recalculated" },
  { from: 18.0, to: 22.6, text: "Pivot table on a new sheet, one undo step" },
] as const;

export interface Range {
  c: number;
  r: number;
  w: number;
  h: number;
}

export interface Frame {
  act: number;
  tab: "home" | "insert";
  sheet: "sales" | "pivot";
  menuOpen: boolean;
  name: string;
  formula: string;
  editing: boolean;
  selection: Range;
  b3: string;
  d3: string;
  b6: string;
  d6: string;
  /** Recalculation pulse on D3, B6, D6. */
  pulses: readonly [number, number, number];
  chart: number;
  chartSelected: boolean;
  /** Bar heights as a share of the value axis. */
  bars: readonly number[];
  badge: { opacity: number; text: string };
  enter: number;
  pivotTab: number;
  pivotView: number;
  fields: number;
  unitsChecked: boolean;
  unitsColumn: number;
  pointer: { from: Target; to: Target; k: number; opacity: number };
  ripple: number;
}

function routeAt(t: number): { from: Target; to: Target; k: number } {
  let index = 0;
  while (index + 1 < ROUTE.length && (ROUTE[index + 1]?.[0] ?? Infinity) <= t) index++;
  const [start, from] = ROUTE[index] ?? ROUTE[0];
  const next = ROUTE[index + 1];
  if (next === undefined) return { from, to: from, k: 1 };
  // Hold at `from` until the move into `next` starts; moves take the gap.
  return { from, to: next[1], k: ease(span(t, start, next[0])) };
}

export function frameAt(t: number): Frame {
  const act = t < ACTS[1].start ? 0 : t < ACTS[2].start ? 1 : 2;
  const reset = t >= RESET;

  // Act 1: drag A1:D5, then Insert › Chart › Column.
  const drag = span(t, 1.5, 2.3);
  const range: Range =
    t < 1.5
      ? { c: 0, r: 0, w: 1, h: 1 }
      : { c: 0, r: 0, w: 1 + Math.round(3 * drag), h: 1 + Math.round(4 * drag) };
  const chart = reset ? 0 : span(t, 5.05, 5.45);
  const grow = span(t, 5.3, 6.3);

  // Act 2: B3 takes 140 and its dependents recalculate.
  const onB3 = t >= 9.6 && !reset;
  const editing = t >= 9.8 && t < 11.0;
  const typedIndex = t < 10.0 ? -1 : t < 10.25 ? 0 : t < 10.5 ? 1 : 2;
  const committed = t >= 11.0 && !reset;
  const b3 = editing
    ? (TYPED[typedIndex] ?? "")
    : committed
      ? String(EDITED_UNITS)
      : String(SALES[WEST]?.units ?? 0);
  const d3k = reset ? 0 : span(t, 11.1, 11.7);
  const totalsK = reset ? 0 : span(t, 11.7, 12.4);
  const westK = reset ? 0 : span(t, 11.2, 12.0);
  const pulse = (start: number) => {
    const age = t - start;
    return age > 0 && age < 1.2 ? 1 - age / 1.2 : 0;
  };

  // Act 3: a Pivot sheet with its field list; Units joins the values.
  const pivotOn = t >= 17.4 && t < 23.6;
  const pivotView = span(t, 17.4, 17.8) * (1 - span(t, 23.6, 24.2));
  const unitsChecked = t >= 19.2 && t < 23.6;

  const westBefore = BEFORE_REVENUE[WEST] ?? 0;
  const westAfter = AFTER_REVENUE[WEST] ?? 0;
  const bars = BEFORE_REVENUE.map(
    (value, index) =>
      ((index === WEST ? lerp(westBefore, westAfter, westK) : value) / CHART_MAX) * grow,
  );

  const badge = BADGES.find((item) => t >= item.from && t <= item.to);
  const route = routeAt(t);
  const visible = Math.max(...POINTER_WINDOWS.map(([from, to]) => fadeWindow(t, from, to, 0.3)));
  const lastClick = Math.max(...CLICKS.filter((click) => click <= t), -Infinity);
  const age = t - lastClick;

  return {
    act,
    tab: t >= 3.4 && t < 23.6 ? "insert" : "home",
    sheet: pivotOn ? "pivot" : "sales",
    menuOpen: t >= 4.35 && t < 5.0,
    name: pivotOn ? "A1" : onB3 ? "B3" : "A1",
    formula: pivotOn ? "Region" : onB3 ? b3 : "Region",
    editing,
    selection: onB3 ? { c: 1, r: 2, w: 1, h: 1 } : reset ? { c: 0, r: 0, w: 1, h: 1 } : range,
    b3,
    d3: money(lerp(westBefore, westAfter, d3k)),
    b6: count(lerp(UNITS_BEFORE, UNITS_AFTER, totalsK)),
    d6: money(lerp(sum(BEFORE_REVENUE), sum(AFTER_REVENUE), totalsK)),
    pulses: reset ? [0, 0, 0] : [pulse(11.1), pulse(11.7), pulse(11.7)],
    chart,
    chartSelected: t >= 5.05 && t < 9.6,
    bars,
    badge: {
      opacity: badge ? fadeWindow(t, badge.from, badge.to, 0.3) : 0,
      text: badge?.text ?? BADGES[1].text,
    },
    enter: fadeWindow(t, 10.8, 11.5, 0.15),
    pivotTab: span(t, 17.25, 17.55) * (1 - span(t, 23.6, 24.0)),
    pivotView,
    fields: span(t, 17.6, 18.2) * (1 - span(t, 23.2, 23.8)),
    unitsChecked,
    unitsColumn: unitsChecked ? span(t, 19.3, 19.8) : 0,
    pointer: { ...route, opacity: visible },
    ripple: age >= 0 && age < CLICK_SECONDS ? age / CLICK_SECONDS : 1,
  };
}
