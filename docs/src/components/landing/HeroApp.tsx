import {
  ACTS,
  AFTER_REVENUE,
  BEFORE_REVENUE,
  CHART_MAX,
  COLUMNS,
  type Frame,
  frameAt,
  HERO_LOOP_SECONDS,
  money,
  PIVOT_COLUMNS,
  PIVOT_ROWS,
  type Range,
  ROWS,
  SALES,
  SALES_COLUMNS,
  STILL_SECONDS,
  sum,
  type Target,
  UNITS_AFTER,
  WEST,
} from "@docs/components/landing/heroFrame.js";
import { count, lerp } from "@docs/components/landing/scene-math.js";
import iconLayout from "@sheetwrite/core/icons.json";
import iconSheet from "@sheetwrite/core/icons.svg?url";
import { createSignal, For, type JSX, Show } from "solid-js";

import { createTimeline } from "./timeline.js";

/* ---- Rendering --------------------------------------------------------------- */

/** How far the badge rises as it fades in. */
const BADGE_RISE_PX = 6;
/** How far the Pivot sheet tab rises as it appears. */
const PIVOT_TAB_RISE_PX = 8;
/** How far the PivotTable Fields pane slides in from the right. */
const FIELDS_SLIDE_PX = 24;
/** The chart grows from this scale to full size as it fades in. */
const CHART_START_SCALE = 0.96;
/** A click ripple grows between these scales as it fades out. */
const RIPPLE_START_SCALE = 0.4;
const RIPPLE_END_SCALE = 1.6;

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

/**
 * Draws one frame straight into the DOM. The chapter list is the exception:
 * it renders from the current act signal (see `HeroApp`), so its
 * `aria-current` stays owned by Solid.
 */
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
  parts.chart.style.transform = `scale(${lerp(CHART_START_SCALE, 1, frame.chart)})`;
  parts.bars.forEach((bar, index) => {
    bar.style.transform = `scaleY(${frame.bars[index] ?? 0})`;
  });

  const badge = parts.text.badge.parentElement;
  if (badge !== null) {
    badge.style.opacity = String(frame.badge.opacity);
    badge.style.transform = `translateY(${(1 - frame.badge.opacity) * BADGE_RISE_PX}px)`;
  }
  parts.enter.style.opacity = String(frame.enter);

  parts.pivotTab.style.opacity = String(frame.pivotTab);
  parts.pivotTab.style.transform = `translateY(${(1 - frame.pivotTab) * PIVOT_TAB_RISE_PX}px)`;
  parts.pivotView.style.opacity = String(frame.pivotView);
  parts.salesView.style.opacity = String(1 - frame.pivotView);
  parts.fields.style.opacity = String(frame.fields);
  parts.fields.style.transform = `translateX(${(1 - frame.fields) * FIELDS_SLIDE_PX}px)`;
  // The pivot's Units cells read this; see `[data-units]` in styles/landing/hero.css.
  parts.pivotView.style.setProperty("--units", String(frame.unitsColumn));
  parts.unitsChip.style.opacity = String(frame.unitsColumn);

  const x = lerp(from.x, to.x, frame.pointer.k);
  const y = lerp(from.y, to.y, frame.pointer.k);
  parts.pointer.style.opacity = String(frame.pointer.opacity);
  parts.pointer.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  parts.ripple.style.opacity = String(1 - frame.ripple);
  parts.ripple.style.transform = `scale(${lerp(RIPPLE_START_SCALE, RIPPLE_END_SCALE, frame.ripple)})`;
}

/* ---- Markup ------------------------------------------------------------------ */

type GlyphName = keyof typeof iconLayout.icons;

/** One glyph from the shell's own icon sheet, drawn as a mask in the text colour. */
function Glyph(props: Readonly<{ name: GlyphName; large?: boolean }>) {
  const { column, row } = iconLayout.icons[props.name];
  const step = iconLayout.pitch / iconLayout.cell;
  return (
    <i
      class="ha-glyph"
      data-large={props.large === true ? "true" : undefined}
      style={{ "--gx": String(-column * step), "--gy": String(-row * step) }}
    />
  );
}

function Command(
  props: Readonly<{ icon: GlyphName; label: string; target?: Target; menu?: boolean }>,
) {
  return (
    <span class="ha-command" data-target={props.target}>
      <Glyph large name={props.icon} />
      <span>{props.label}</span>
      <Show when={props.menu === true}>
        <i class="ha-caret" />
      </Show>
    </span>
  );
}

function Group(
  props: Readonly<{ label: string; fold?: "narrow" | "medium"; children: JSX.Element }>,
) {
  return (
    <span class="ha-group" data-fold={props.fold}>
      <span class="ha-group__body">{props.children}</span>
      <span class="ha-group__label">{props.label}</span>
    </span>
  );
}

function Small(props: Readonly<{ icon: GlyphName; label?: string }>) {
  return (
    <span class="ha-small">
      <Glyph name={props.icon} />
      <Show when={props.label}>{(label) => <span>{label()}</span>}</Show>
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
    <div class="ha-ribbon">
      <div class="ha-ribbon__tabs">
        <span data-tab="home">Home</span>
        <span data-tab="insert" data-target="tab-insert">
          Insert
        </span>
        <span>Data</span>
        <span>View</span>
      </div>
      <div class="ha-ribbon__panel" data-panel="home">
        <Group fold="medium" label="Undo">
          <span class="ha-stack">
            <Small icon="undo" label="Undo" />
            <Small icon="redo" label="Redo" />
          </span>
        </Group>
        <Group label="Clipboard">
          <Command icon="paste" label="Paste" />
          <span class="ha-stack">
            <Small icon="cut" label="Cut" />
            <Small icon="copy" label="Copy" />
          </span>
        </Group>
        <Group label="Font">
          <span class="ha-stack">
            <span class="ha-select">Instrument Sans</span>
            <span class="ha-row">
              <Small icon="bold" />
              <Small icon="italic" />
              <Small icon="underline" />
              <Small icon="fillColor" />
              <Small icon="textColor" />
            </span>
          </span>
        </Group>
        <Group fold="narrow" label="Alignment">
          <span class="ha-row">
            <Small icon="alignLeft" />
            <Small icon="alignCenter" />
            <Small icon="alignRight" />
            <Small icon="wrap" />
          </span>
        </Group>
        <Group fold="narrow" label="Number">
          <span class="ha-stack">
            <span class="ha-select">Currency</span>
            <span class="ha-row">
              <Small icon="currency" />
              <Small icon="percent" />
              <Small icon="comma" />
            </span>
          </span>
        </Group>
        <Group fold="medium" label="Editing">
          <span class="ha-stack">
            <Small icon="autoSum" label="AutoSum" />
            <Small icon="sortFilter" label="Sort & Filter" />
          </span>
        </Group>
      </div>
      <div class="ha-ribbon__panel" data-panel="insert">
        <Group fold="medium" label="Rows & Columns">
          <Command icon="insert" label="Insert" menu />
          <Command icon="delete" label="Delete" menu />
        </Group>
        <Group label="Tables">
          <Command icon="pivotTable" label="PivotTable" target="pivot-button" />
        </Group>
        <Group label="Charts">
          <span class="ha-menu-anchor">
            <Command icon="chart" label="Chart" menu target="chart-button" />
            <span class="ha-menu">
              <For each={CHART_KINDS}>
                {([icon, label], index) => (
                  <span
                    class="ha-menu__item"
                    data-target={index() === 0 ? "kind-column" : undefined}
                  >
                    <Glyph name={icon} />
                    {label}
                  </span>
                )}
              </For>
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
function cellBox(range: Range): JSX.CSSProperties {
  return {
    "--c": String(range.c),
    "--r": String(range.r),
    "--w": String(range.w),
    "--h": String(range.h),
  };
}

function SalesCells(props: Readonly<{ still: Frame }>) {
  const cellContent = (row: number, column: number): JSX.Element => {
    if (row === 0) return ["Region", "Units", "Rate", "Revenue"][column] ?? "";

    const sales = SALES[row - 1];
    if (sales !== undefined) {
      if (column === 0) return sales.region;
      if (column === 1)
        return row - 1 === WEST ? <span data-part="b3">{props.still.b3}</span> : count(sales.units);
      if (column === 2) return `$${sales.rate}`;
      if (column === 3)
        return row - 1 === WEST ? (
          <span data-part="d3">{props.still.d3}</span>
        ) : (
          money(BEFORE_REVENUE[row - 1] ?? 0)
        );
    }

    if (row === SALES.length + 1) {
      if (column === 0) return "Total";
      if (column === 1) return <span data-part="b6">{props.still.b6}</span>;
      if (column === 3) return <span data-part="d6">{props.still.d6}</span>;
    }

    return "";
  };

  return <Cells cellContent={cellContent} />;
}

function PivotCells() {
  const cellContent = (row: number, column: number): JSX.Element => {
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
  return <Cells pivot cellContent={cellContent} />;
}

const ROW_INDEXES: readonly number[] = Array.from({ length: ROWS }, (_, row) => row);

function Cells(
  props: Readonly<{ cellContent: (row: number, column: number) => JSX.Element; pivot?: boolean }>,
) {
  const pivot = props.pivot === true;
  // The total rule spans the table's own columns, not the empty ones.
  const isTotal = (row: number, column: number): boolean =>
    column < (pivot ? PIVOT_COLUMNS : SALES_COLUMNS) &&
    row === (pivot ? PIVOT_ROWS.length : SALES.length) + 1;

  return (
    <div class="ha-cells">
      <For each={ROW_INDEXES}>
        {(row) => (
          <>
            <span class="ha-rowhead">{row + 1}</span>
            <For each={COLUMNS}>
              {(_, columnIndex) => {
                const column = columnIndex();
                return (
                  <span
                    class="ha-cell"
                    data-head={row === 0 ? "true" : undefined}
                    data-total={isTotal(row, column) ? "true" : undefined}
                    data-text={column === 0 ? "true" : undefined}
                    data-units={pivot && column === 2 ? "true" : undefined}
                  >
                    {props.cellContent(row, column)}
                  </span>
                );
              }}
            </For>
          </>
        )}
      </For>
    </div>
  );
}

/** The chart's plot area in the SVG's view box units. */
const PLOT = { x: 34, y: 30, w: 268, h: 128 } as const;
/** Each bar's share of its region's slot. */
const BAR_SHARE = 0.52;
const CHART_TICKS = [0, 2000, 4000, 6000, 8000] as const;
const THOUSAND = 1000;

function Chart(props: Readonly<{ still: Frame }>) {
  const slot = PLOT.w / SALES.length;
  const barW = slot * BAR_SHARE;
  return (
    <div class="ha-chart" data-part="chart" style={{ opacity: props.still.chart }}>
      <svg aria-hidden="true" viewBox="0 0 320 196">
        <text class="ha-chart__title" x={160} y={18}>
          Revenue by region
        </text>
        <For each={CHART_TICKS}>
          {(tick) => {
            const y = PLOT.y + PLOT.h - (tick / CHART_MAX) * PLOT.h;
            return (
              <g>
                <line class="ha-chart__grid" x1={PLOT.x} x2={PLOT.x + PLOT.w} y1={y} y2={y} />
                <text class="ha-chart__axis" x={PLOT.x - 6} y={y + 3}>
                  {tick === 0 ? "0" : `${tick / THOUSAND}k`}
                </text>
              </g>
            );
          }}
        </For>
        <For each={SALES}>
          {(row, barIndex) => {
            const index = barIndex();
            const x = PLOT.x + slot * index + (slot - barW) / 2;
            return (
              <g>
                <rect
                  class="ha-chart__bar"
                  data-bar={index}
                  data-edited={index === WEST ? "true" : undefined}
                  height={PLOT.h}
                  rx={2}
                  style={{ transform: `scaleY(${props.still.bars[index] ?? 0})` }}
                  width={barW}
                  x={x}
                  y={PLOT.y}
                />
                <text class="ha-chart__label" x={x + barW / 2} y={PLOT.y + PLOT.h + 16}>
                  {row.region}
                </text>
              </g>
            );
          }}
        </For>
      </svg>
      <i class="ha-chart__handle" data-corner="nw" />
      <i class="ha-chart__handle" data-corner="ne" />
      <i class="ha-chart__handle" data-corner="sw" />
      <i class="ha-chart__handle" data-corner="se" />
      <span class="ha-chart__target" data-target="chart" />
    </div>
  );
}

function Fields() {
  return (
    <aside class="ha-fields" data-part="fields">
      <strong>PivotTable Fields</strong>
      <ul>
        <li data-on="true">Region</li>
        <li data-target="field-units" data-units="true">
          Units
        </li>
        <li>Rate</li>
        <li data-on="true">Revenue</li>
      </ul>
      <span class="ha-fields__area">Rows</span>
      <span class="ha-fields__chip">Region</span>
      <span class="ha-fields__area">Values</span>
      <span class="ha-fields__chip">Sum of Revenue</span>
      <span class="ha-fields__chip" data-part="units-chip" style={{ opacity: 0 }}>
        Sum of Units
      </span>
    </aside>
  );
}

const STILL = frameAt(STILL_SECONDS);

export function HeroApp() {
  // Screen readers hear which chapter the picture shows.
  const [currentAct, setCurrentAct] = createSignal(STILL.act);
  const timeline = createTimeline<HTMLElement>({
    loopSeconds: HERO_LOOP_SECONDS,
    stillSeconds: STILL_SECONDS,
    create: (root) => {
      const parts = collect(root);
      return (seconds) => {
        const frame = frameAt(seconds);
        apply(parts, frame);
        setCurrentAct(frame.act);
      };
    },
  });

  return (
    <figure
      class="sw-hero-app"
      // The landing's render-blocking `expect` link waits for this id (routes/index.tsx).
      id="landing-hero-app"
      data-chart-selected={String(STILL.chartSelected)}
      data-editing="false"
      data-landing-running="false"
      data-menu="false"
      data-sheet="sales"
      data-tab={STILL.tab}
      data-testid="landing-product-story"
      data-pivot-tab="false"
      data-units-checked="false"
      ref={timeline.ref}
      style={{ "--ha-icons": `url("${iconSheet}")` }}
    >
      <div aria-hidden="true" class="ha-window">
        <div class="ha-title">
          <strong>Northwind / 2026 sales.xlsx</strong>
        </div>
        <Ribbon />
        <div class="ha-bar">
          <span class="ha-bar__name" data-part="name">
            {STILL.name}
          </span>
          <span class="ha-bar__fx">fx</span>
          <span class="ha-bar__formula">
            <span data-part="formula">{STILL.formula}</span>
            <i class="ha-caret-line" />
          </span>
        </div>
        <div class="ha-sheet">
          <div class="ha-colheads">
            <span />
            <For each={COLUMNS}>{(letter) => <span>{letter}</span>}</For>
          </div>
          <div class="ha-view" data-part="sales-view" style={{ opacity: 1 }}>
            <SalesCells still={STILL} />
            <span
              class="ha-box ha-anchor"
              data-target="a1"
              style={cellBox({ c: 0, r: 0, w: 1, h: 1 })}
            />
            <span
              class="ha-box ha-anchor"
              data-target="d5"
              style={cellBox({ c: 3, r: 4, w: 1, h: 1 })}
            />
            <span
              class="ha-box ha-anchor"
              data-target="b3"
              style={cellBox({ c: 1, r: 2, w: 1, h: 1 })}
            />
            <span
              class="ha-box ha-pulse"
              data-part="pulse-d3"
              style={{ ...cellBox({ c: 3, r: 2, w: 1, h: 1 }), opacity: 0 }}
            />
            <span
              class="ha-box ha-pulse"
              data-part="pulse-b6"
              style={{ ...cellBox({ c: 1, r: 5, w: 1, h: 1 }), opacity: 0 }}
            />
            <span
              class="ha-box ha-pulse"
              data-part="pulse-d6"
              style={{ ...cellBox({ c: 3, r: 5, w: 1, h: 1 }), opacity: 0 }}
            />
            <span
              class="ha-box ha-selection"
              data-part="selection"
              style={cellBox(STILL.selection)}
            />
            <Chart still={STILL} />
          </div>
          <div class="ha-view" data-part="pivot-view" style={{ opacity: 0, "--units": "0" }}>
            <PivotCells />
            <Fields />
          </div>
        </div>
        <div class="ha-sheets">
          <span data-sheet-tab="sales">Sales</span>
          <span data-part="pivot-tab" data-sheet-tab="pivot" style={{ opacity: 0 }}>
            Pivot
          </span>
          <span class="ha-sheets__add">+</span>
        </div>
        <span class="ha-badge" style={{ opacity: STILL.badge.opacity }}>
          <span data-part="badge-text">{STILL.badge.text}</span>
        </span>
        <kbd class="ha-key" data-part="enter" style={{ opacity: 0 }}>
          Enter
        </kbd>
        <span class="ha-anchor ha-rest" data-target="rest" />
        <span class="ha-pointer" data-part="pointer" style={{ opacity: 0 }}>
          <i class="ha-ripple" data-part="ripple" />
          <svg viewBox="0 0 16 22">
            <path d="M 1 1 L 1 19 L 6 14.5 L 9.5 22 L 12.5 20.6 L 9 13.4 L 15 13.4 Z" />
          </svg>
        </span>
      </div>
      <ol aria-label="What the illustration shows" class="ha-acts">
        <For each={ACTS}>
          {(act, index) => (
            <li data-current={String(index() === currentAct())}>
              <button
                aria-current={index() === currentAct() ? "step" : undefined}
                onClick={() => timeline.seek(act.start)}
                type="button"
              >
                {act.text}
              </button>
            </li>
          )}
        </For>
      </ol>
      <figcaption>
        <span>Illustration of the spreadsheet app. The showcases run the real engine.</span>
        <button class="sw-hero-app__replay" onClick={() => timeline.replay()} type="button">
          Replay animation
        </button>
      </figcaption>
    </figure>
  );
}
