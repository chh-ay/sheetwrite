import iconLayout from "@sheetwrite/core/icons.json";
import iconSheet from "@sheetwrite/core/icons.svg?url";
import type { CSSProperties, ReactNode } from "react";

import { clamp, count, ease, lerp, span } from "./scene-math.js";
import { useTimeline } from "./useTimeline.js";

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
const STILL_SECONDS = 13.4;
/** Everything returns to the opening state while the Pivot sheet is on top. */
const RESET = 23;

const ACTS = [
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

const SALES: readonly SalesRow[] = [
  { region: "North", units: 128, rate: 42 },
  { region: "West", units: 96, rate: 48 },
  { region: "South", units: 112, rate: 44 },
  { region: "East", units: 104, rate: 46 },
];
/** The edit: West (B3) goes from 96 to this many units. */
const EDITED_UNITS = 140;
const WEST = 1;
/** What B3 shows while 140 is typed, one key at a time. */
const TYPED: readonly string[] = ["1", "14", "140"];

const revenue = (row: SalesRow, units = row.units) => units * row.rate;
const BEFORE_REVENUE = SALES.map((row) => revenue(row));
const AFTER_REVENUE = SALES.map((row, index) =>
  index === WEST ? revenue(row, EDITED_UNITS) : revenue(row),
);
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
const UNITS_BEFORE = sum(SALES.map((row) => row.units));
const UNITS_AFTER = UNITS_BEFORE - (SALES[WEST]?.units ?? 0) + EDITED_UNITS;
/** The chart's value axis ends here, above the edited West bar. */
const CHART_MAX = 8000;

/** The pivot lists regions in sort order, as a pivot does. */
const PIVOT_ROWS = SALES.map((row, index) => ({
  region: row.region,
  units: index === WEST ? EDITED_UNITS : row.units,
  revenue: AFTER_REVENUE[index] ?? 0,
})).sort((a, b) => a.region.localeCompare(b.region));

const money = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;

/** Columns A–L and 16 rows, so the sheet fills any frame width and height. */
const COLUMNS = "ABCDEFGHIJKL".split("");
const ROWS = 16;
/** Columns the sales table and the pivot fill: Region, Units, Rate, Revenue; Region and two values. */
const SALES_COLUMNS = 4;
const PIVOT_COLUMNS = 3;

/* ---- Frame ------------------------------------------------------------------- */

/** Elements the pointer travels to, by `data-target`. */
type Target =
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

/** Fade in, hold, fade out over [from, to]. */
function window_(t: number, from: number, to: number, fade = 0.3): number {
  if (t < from || t > to) return 0;
  return clamp(Math.min((t - from) / fade, (to - t) / fade));
}

interface Range {
  c: number;
  r: number;
  w: number;
  h: number;
}

interface Frame {
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

function frameAt(t: number): Frame {
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
  const visible = Math.max(...POINTER_WINDOWS.map(([from, to]) => window_(t, from, to)));
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
      opacity: badge ? window_(t, badge.from, badge.to) : 0,
      text: badge?.text ?? BADGES[1].text,
    },
    enter: window_(t, 10.8, 11.5, 0.15),
    pivotTab: span(t, 17.25, 17.55) * (1 - span(t, 23.6, 24.0)),
    pivotView,
    fields: span(t, 17.6, 18.2) * (1 - span(t, 23.2, 23.8)),
    unitsChecked,
    unitsColumn: unitsChecked ? span(t, 19.3, 19.8) : 0,
    pointer: { ...route, opacity: visible },
    ripple: age >= 0 && age < CLICK_SECONDS ? age / CLICK_SECONDS : 1,
  };
}

/* ---- Rendering --------------------------------------------------------------- */

interface Parts {
  root: HTMLElement;
  window: HTMLElement;
  text: Record<"name" | "formula" | "b3" | "d3" | "b6" | "d6" | "badge", HTMLElement>;
  selection: HTMLElement;
  pulses: readonly [HTMLElement, HTMLElement, HTMLElement];
  chart: HTMLElement;
  bars: readonly SVGRectElement[];
  enter: HTMLElement;
  pivotTab: HTMLElement;
  salesView: HTMLElement;
  pivotView: HTMLElement;
  fields: HTMLElement;
  unitsChip: HTMLElement;
  pointer: HTMLElement;
  ripple: HTMLElement;
  acts: readonly HTMLElement[];
  targets: Map<Target, HTMLElement>;
}

function query<T extends Element>(root: Element, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (element === null) throw new Error(`Hero part missing: ${selector}`);
  return element;
}

function part(root: Element, name: string): HTMLElement {
  return query<HTMLElement>(root, `[data-part="${name}"]`);
}

function collect(root: HTMLElement): Parts {
  const targets = new Map<Target, HTMLElement>();
  for (const element of root.querySelectorAll<HTMLElement>("[data-target]")) {
    targets.set(element.dataset.target as Target, element);
  }
  return {
    root,
    window: query(root, ".ha-window"),
    text: {
      name: part(root, "name"),
      formula: part(root, "formula"),
      b3: part(root, "b3"),
      d3: part(root, "d3"),
      b6: part(root, "b6"),
      d6: part(root, "d6"),
      badge: part(root, "badge-text"),
    },
    selection: part(root, "selection"),
    pulses: [part(root, "pulse-d3"), part(root, "pulse-b6"), part(root, "pulse-d6")],
    chart: part(root, "chart"),
    bars: [...root.querySelectorAll<SVGRectElement>("[data-bar]")],
    enter: part(root, "enter"),
    pivotTab: part(root, "pivot-tab"),
    salesView: part(root, "sales-view"),
    pivotView: part(root, "pivot-view"),
    fields: part(root, "fields"),
    unitsChip: part(root, "units-chip"),
    pointer: part(root, "pointer"),
    ripple: part(root, "ripple"),
    acts: [...root.querySelectorAll<HTMLElement>(".ha-acts li")],
    targets,
  };
}

/** The middle of a target, in the window's coordinates. */
function centerOf(parts: Parts, target: Target): { x: number; y: number } {
  const element = parts.targets.get(target);
  if (element === undefined) return { x: 0, y: 0 };
  const frame = parts.window.getBoundingClientRect();
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2 - frame.left, y: box.top + box.height / 2 - frame.top };
}

function setText(element: HTMLElement, value: string): void {
  if (element.textContent !== value) element.textContent = value;
}

function setRange(element: HTMLElement, range: Range): void {
  element.style.setProperty("--c", String(range.c));
  element.style.setProperty("--r", String(range.r));
  element.style.setProperty("--w", String(range.w));
  element.style.setProperty("--h", String(range.h));
}

function apply(parts: Parts, frame: Frame): void {
  // Read layout first, then write, so a frame forces at most one layout.
  const from = centerOf(parts, frame.pointer.from);
  const to = centerOf(parts, frame.pointer.to);

  const { root } = parts;
  root.dataset.tab = frame.tab;
  root.dataset.sheet = frame.sheet;
  root.dataset.menu = String(frame.menuOpen);
  root.dataset.editing = String(frame.editing);
  root.dataset.chartSelected = String(frame.chartSelected);
  root.dataset.unitsChecked = String(frame.unitsChecked);
  // The Pivot tab takes no room until the pivot sheet exists.
  root.dataset.pivotTab = String(frame.pivotTab > 0);

  setText(parts.text.name, frame.name);
  setText(parts.text.formula, frame.formula);
  setText(parts.text.b3, frame.b3);
  setText(parts.text.d3, frame.d3);
  setText(parts.text.b6, frame.b6);
  setText(parts.text.d6, frame.d6);
  setText(parts.text.badge, frame.badge.text);
  setRange(parts.selection, frame.selection);
  parts.pulses.forEach((pulse, index) => {
    pulse.style.opacity = String(frame.pulses[index] ?? 0);
  });

  parts.chart.style.opacity = String(frame.chart);
  parts.chart.style.transform = `scale(${lerp(0.96, 1, frame.chart)})`;
  parts.bars.forEach((bar, index) => {
    bar.style.transform = `scaleY(${frame.bars[index] ?? 0})`;
  });

  const badge = parts.text.badge.parentElement;
  if (badge !== null) {
    badge.style.opacity = String(frame.badge.opacity);
    badge.style.transform = `translateY(${(1 - frame.badge.opacity) * 6}px)`;
  }
  parts.enter.style.opacity = String(frame.enter);

  parts.pivotTab.style.opacity = String(frame.pivotTab);
  parts.pivotTab.style.transform = `translateY(${(1 - frame.pivotTab) * 8}px)`;
  parts.pivotView.style.opacity = String(frame.pivotView);
  parts.salesView.style.opacity = String(1 - frame.pivotView);
  parts.fields.style.opacity = String(frame.fields);
  parts.fields.style.transform = `translateX(${(1 - frame.fields) * 24}px)`;
  // The pivot's Units cells read this; see `[data-units]` in landing.css.
  parts.pivotView.style.setProperty("--units", String(frame.unitsColumn));
  parts.unitsChip.style.opacity = String(frame.unitsColumn);

  const x = lerp(from.x, to.x, frame.pointer.k);
  const y = lerp(from.y, to.y, frame.pointer.k);
  parts.pointer.style.opacity = String(frame.pointer.opacity);
  parts.pointer.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  parts.ripple.style.opacity = String(1 - frame.ripple);
  parts.ripple.style.transform = `scale(${lerp(0.4, 1.6, frame.ripple)})`;

  parts.acts.forEach((act, index) => {
    const current = index === frame.act;
    act.dataset.current = String(current);
    // Screen readers hear which chapter the picture shows.
    const button = act.querySelector("button");
    if (current) button?.setAttribute("aria-current", "step");
    else button?.removeAttribute("aria-current");
  });
}

/* ---- Markup ------------------------------------------------------------------ */

type GlyphName = keyof typeof iconLayout.icons;

/** One glyph from the shell's own icon sheet, drawn as a mask in the text colour. */
function Glyph({ name, large = false }: Readonly<{ name: GlyphName; large?: boolean }>) {
  const { column, row } = iconLayout.icons[name];
  const step = iconLayout.pitch / iconLayout.cell;
  return (
    <i
      className="ha-glyph"
      data-large={large || undefined}
      style={{ "--gx": -column * step, "--gy": -row * step } as CSSProperties}
    />
  );
}

function Command({
  icon,
  label,
  target,
  menu = false,
}: Readonly<{ icon: GlyphName; label: string; target?: Target; menu?: boolean }>) {
  return (
    <span className="ha-command" data-target={target}>
      <Glyph large name={icon} />
      <span>{label}</span>
      {menu ? <i className="ha-caret" /> : null}
    </span>
  );
}

function Group({
  label,
  fold,
  children,
}: Readonly<{ label: string; fold?: "narrow" | "medium"; children: ReactNode }>) {
  return (
    <span className="ha-group" data-fold={fold}>
      <span className="ha-group__body">{children}</span>
      <span className="ha-group__label">{label}</span>
    </span>
  );
}

function Small({ icon, label }: Readonly<{ icon: GlyphName; label?: string }>) {
  return (
    <span className="ha-small">
      <Glyph name={icon} />
      {label === undefined ? null : <span>{label}</span>}
    </span>
  );
}

const CHART_KINDS: ReadonlyArray<readonly [GlyphName, string]> = [
  ["chartColumn", "Column"],
  ["chartBar", "Bar"],
  ["chartLine", "Line"],
  ["chartArea", "Area"],
  ["chartPie", "Pie"],
  ["chartDoughnut", "Doughnut"],
  ["chartScatter", "Scatter"],
];

function Ribbon() {
  return (
    <div className="ha-ribbon">
      <div className="ha-ribbon__tabs">
        <span data-tab="home">Home</span>
        <span data-tab="insert" data-target="tab-insert">
          Insert
        </span>
        <span>Data</span>
        <span>View</span>
      </div>
      <div className="ha-ribbon__panel" data-panel="home">
        <Group fold="medium" label="Undo">
          <span className="ha-stack">
            <Small icon="undo" label="Undo" />
            <Small icon="redo" label="Redo" />
          </span>
        </Group>
        <Group label="Clipboard">
          <Command icon="paste" label="Paste" />
          <span className="ha-stack">
            <Small icon="cut" label="Cut" />
            <Small icon="copy" label="Copy" />
          </span>
        </Group>
        <Group label="Font">
          <span className="ha-stack">
            <span className="ha-select">Inter</span>
            <span className="ha-row">
              <Small icon="bold" />
              <Small icon="italic" />
              <Small icon="underline" />
              <Small icon="fillColor" />
              <Small icon="textColor" />
            </span>
          </span>
        </Group>
        <Group fold="narrow" label="Alignment">
          <span className="ha-row">
            <Small icon="alignLeft" />
            <Small icon="alignCenter" />
            <Small icon="alignRight" />
            <Small icon="wrap" />
          </span>
        </Group>
        <Group fold="narrow" label="Number">
          <span className="ha-stack">
            <span className="ha-select">Currency</span>
            <span className="ha-row">
              <Small icon="currency" />
              <Small icon="percent" />
              <Small icon="comma" />
            </span>
          </span>
        </Group>
        <Group fold="medium" label="Editing">
          <span className="ha-stack">
            <Small icon="autoSum" label="AutoSum" />
            <Small icon="sortFilter" label="Sort & Filter" />
          </span>
        </Group>
      </div>
      <div className="ha-ribbon__panel" data-panel="insert">
        <Group fold="medium" label="Rows & Columns">
          <Command icon="insert" label="Insert" menu />
          <Command icon="delete" label="Delete" menu />
        </Group>
        <Group label="Tables">
          <Command icon="pivotTable" label="PivotTable" target="pivot-button" />
        </Group>
        <Group label="Charts">
          <span className="ha-menu-anchor">
            <Command icon="chart" label="Chart" menu target="chart-button" />
            <span className="ha-menu">
              {CHART_KINDS.map(([icon, label], index) => (
                <span
                  className="ha-menu__item"
                  data-target={index === 0 ? "kind-column" : undefined}
                  key={label}
                >
                  <Glyph name={icon} />
                  {label}
                </span>
              ))}
            </span>
          </span>
        </Group>
        <Group fold="narrow" label="Links">
          <Command icon="hyperlink" label="Link" />
        </Group>
        <Group fold="narrow" label="Notes">
          <Command icon="note" label="Note" />
        </Group>
      </div>
    </div>
  );
}

/** A cell overlay placed on the sheet in column and row units. */
function cellBox(range: Range): CSSProperties {
  return {
    "--c": range.c,
    "--r": range.r,
    "--w": range.w,
    "--h": range.h,
  } as CSSProperties;
}

function SalesCells({ still }: Readonly<{ still: Frame }>) {
  const value = (row: number, column: number): ReactNode => {
    if (row === 0) return ["Region", "Units", "Rate", "Revenue"][column] ?? "";
    const sales = SALES[row - 1];
    if (sales !== undefined) {
      if (column === 0) return sales.region;
      if (column === 1)
        return row - 1 === WEST ? <span data-part="b3">{still.b3}</span> : count(sales.units);
      if (column === 2) return `$${sales.rate}`;
      if (column === 3)
        return row - 1 === WEST ? (
          <span data-part="d3">{still.d3}</span>
        ) : (
          money(BEFORE_REVENUE[row - 1] ?? 0)
        );
    }
    if (row === SALES.length + 1) {
      if (column === 0) return "Total";
      if (column === 1) return <span data-part="b6">{still.b6}</span>;
      if (column === 3) return <span data-part="d6">{still.d6}</span>;
    }
    return "";
  };
  return <Cells value={value} />;
}

function PivotCells() {
  const value = (row: number, column: number): ReactNode => {
    if (row === 0) return ["Region", "Sum of Revenue", "Sum of Units"][column] ?? "";
    const pivot = PIVOT_ROWS[row - 1];
    if (pivot !== undefined) {
      if (column === 0) return pivot.region;
      if (column === 1) return money(pivot.revenue);
      if (column === 2) return count(pivot.units);
    }
    if (row === PIVOT_ROWS.length + 1) {
      if (column === 0) return "Grand Total";
      if (column === 1) return money(sum(AFTER_REVENUE));
      if (column === 2) return count(UNITS_AFTER);
    }
    return "";
  };
  return <Cells pivot value={value} />;
}

function Cells({
  value,
  pivot = false,
}: Readonly<{ value: (row: number, column: number) => ReactNode; pivot?: boolean }>) {
  const cells: ReactNode[] = [];
  for (let row = 0; row < ROWS; row++) {
    cells.push(
      <span className="ha-rowhead" key={`h${row}`}>
        {row + 1}
      </span>,
    );
    COLUMNS.forEach((_, column) => {
      const content = value(row, column);
      cells.push(
        <span
          className="ha-cell"
          data-head={row === 0 || undefined}
          data-total={
            // The total rule spans the table's own columns, not the empty ones.
            (column < (pivot ? PIVOT_COLUMNS : SALES_COLUMNS) &&
              row === (pivot ? PIVOT_ROWS.length : SALES.length) + 1) ||
            undefined
          }
          data-text={column === 0 || undefined}
          data-units={(pivot && column === 2) || undefined}
          key={`${row}-${column}`}
        >
          {content}
        </span>,
      );
    });
  }
  return <div className="ha-cells">{cells}</div>;
}

function Chart({ still }: Readonly<{ still: Frame }>) {
  const plot = { x: 34, y: 30, w: 268, h: 128 } as const;
  const slot = plot.w / SALES.length;
  const barW = slot * 0.52;
  return (
    <div className="ha-chart" data-part="chart" style={{ opacity: still.chart }}>
      <svg aria-hidden="true" viewBox="0 0 320 196">
        <text className="ha-chart__title" x={160} y={18}>
          Revenue by region
        </text>
        {[0, 2000, 4000, 6000, 8000].map((tick) => {
          const y = plot.y + plot.h - (tick / CHART_MAX) * plot.h;
          return (
            <g key={tick}>
              <line className="ha-chart__grid" x1={plot.x} x2={plot.x + plot.w} y1={y} y2={y} />
              <text className="ha-chart__axis" x={plot.x - 6} y={y + 3}>
                {tick === 0 ? "0" : `${tick / 1000}k`}
              </text>
            </g>
          );
        })}
        {SALES.map((row, index) => {
          const x = plot.x + slot * index + (slot - barW) / 2;
          return (
            <g key={row.region}>
              <rect
                className="ha-chart__bar"
                data-bar={index}
                data-edited={index === WEST || undefined}
                height={plot.h}
                rx={2}
                style={{ transform: `scaleY(${still.bars[index] ?? 0})` }}
                width={barW}
                x={x}
                y={plot.y}
              />
              <text className="ha-chart__label" x={x + barW / 2} y={plot.y + plot.h + 16}>
                {row.region}
              </text>
            </g>
          );
        })}
      </svg>
      <i className="ha-chart__handle" data-corner="nw" />
      <i className="ha-chart__handle" data-corner="ne" />
      <i className="ha-chart__handle" data-corner="sw" />
      <i className="ha-chart__handle" data-corner="se" />
      <span className="ha-chart__target" data-target="chart" />
    </div>
  );
}

function Fields() {
  return (
    <aside className="ha-fields" data-part="fields">
      <strong>PivotTable Fields</strong>
      <ul>
        <li data-on>Region</li>
        <li data-target="field-units" data-units>
          Units
        </li>
        <li>Rate</li>
        <li data-on>Revenue</li>
      </ul>
      <span className="ha-fields__area">Rows</span>
      <span className="ha-fields__chip">Region</span>
      <span className="ha-fields__area">Values</span>
      <span className="ha-fields__chip">Sum of Revenue</span>
      <span className="ha-fields__chip" data-part="units-chip" style={{ opacity: 0 }}>
        Sum of Units
      </span>
    </aside>
  );
}

const STILL = frameAt(STILL_SECONDS);

export function HeroApp() {
  const { ref, replay, seek } = useTimeline<HTMLElement>({
    loopSeconds: HERO_LOOP_SECONDS,
    stillSeconds: STILL_SECONDS,
    create: (root) => {
      const parts = collect(root);
      return (t) => apply(parts, frameAt(t));
    },
  });

  return (
    <figure
      className="sw-hero-app"
      data-chart-selected={String(STILL.chartSelected)}
      data-editing="false"
      data-landing-running="false"
      data-menu="false"
      data-sheet="sales"
      data-tab={STILL.tab}
      data-testid="landing-product-story"
      data-pivot-tab="false"
      data-units-checked="false"
      ref={ref}
      style={{ "--ha-icons": `url("${iconSheet}")` } as CSSProperties}
    >
      <div aria-hidden="true" className="ha-window">
        <div className="ha-title">
          <strong>Northwind / 2026 sales.xlsx</strong>
        </div>
        <Ribbon />
        <div className="ha-bar">
          <span className="ha-bar__name" data-part="name">
            {STILL.name}
          </span>
          <span className="ha-bar__fx">fx</span>
          <span className="ha-bar__formula">
            <span data-part="formula">{STILL.formula}</span>
            <i className="ha-caret-line" />
          </span>
        </div>
        <div className="ha-sheet">
          <div className="ha-colheads">
            <span />
            {COLUMNS.map((letter) => (
              <span key={letter}>{letter}</span>
            ))}
          </div>
          <div className="ha-view" data-part="sales-view" style={{ opacity: 1 }}>
            <SalesCells still={STILL} />
            <span
              className="ha-box ha-anchor"
              data-target="a1"
              style={cellBox({ c: 0, r: 0, w: 1, h: 1 })}
            />
            <span
              className="ha-box ha-anchor"
              data-target="d5"
              style={cellBox({ c: 3, r: 4, w: 1, h: 1 })}
            />
            <span
              className="ha-box ha-anchor"
              data-target="b3"
              style={cellBox({ c: 1, r: 2, w: 1, h: 1 })}
            />
            <span
              className="ha-box ha-pulse"
              data-part="pulse-d3"
              style={{ ...cellBox({ c: 3, r: 2, w: 1, h: 1 }), opacity: 0 }}
            />
            <span
              className="ha-box ha-pulse"
              data-part="pulse-b6"
              style={{ ...cellBox({ c: 1, r: 5, w: 1, h: 1 }), opacity: 0 }}
            />
            <span
              className="ha-box ha-pulse"
              data-part="pulse-d6"
              style={{ ...cellBox({ c: 3, r: 5, w: 1, h: 1 }), opacity: 0 }}
            />
            <span
              className="ha-box ha-selection"
              data-part="selection"
              style={cellBox(STILL.selection)}
            />
            <Chart still={STILL} />
          </div>
          <div
            className="ha-view"
            data-part="pivot-view"
            style={{ opacity: 0, "--units": 0 } as CSSProperties}
          >
            <PivotCells />
            <Fields />
          </div>
        </div>
        <div className="ha-sheets">
          <span data-sheet-tab="sales">Sales</span>
          <span data-part="pivot-tab" data-sheet-tab="pivot" style={{ opacity: 0 }}>
            Pivot
          </span>
          <span className="ha-sheets__add">+</span>
        </div>
        <span className="ha-badge" style={{ opacity: STILL.badge.opacity }}>
          <span data-part="badge-text">{STILL.badge.text}</span>
        </span>
        <kbd className="ha-key" data-part="enter" style={{ opacity: 0 }}>
          Enter
        </kbd>
        <span className="ha-anchor ha-rest" data-target="rest" />
        <span className="ha-pointer" data-part="pointer" style={{ opacity: 0 }}>
          <i className="ha-ripple" data-part="ripple" />
          <svg viewBox="0 0 16 22">
            <path d="M 1 1 L 1 19 L 6 14.5 L 9.5 22 L 12.5 20.6 L 9 13.4 L 15 13.4 Z" />
          </svg>
        </span>
      </div>
      <ol aria-label="What the illustration shows" className="ha-acts">
        {ACTS.map((act, index) => (
          <li data-current={index === STILL.act} key={act.text}>
            <button
              aria-current={index === STILL.act ? "step" : undefined}
              onClick={() => seek(act.start)}
              type="button"
            >
              {act.text}
            </button>
          </li>
        ))}
      </ol>
      <figcaption>
        <span>Illustration of the spreadsheet app. The showcases run the real engine.</span>
        <button className="sw-hero-app__replay" onClick={replay} type="button">
          Replay animation
        </button>
      </figcaption>
    </figure>
  );
}
