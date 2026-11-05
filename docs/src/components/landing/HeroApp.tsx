import iconLayout from "@sheetwrite/core/icons.json";
import iconSheet from "@sheetwrite/core/icons.svg?url";
import type { CSSProperties, ReactNode } from "react";

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
} from "./heroFrame.js";
import { count, lerp } from "./scene-math.js";
import { useTimeline } from "./useTimeline.js";

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
  // The pivot's Units cells read this; see `[data-units]` in styles/landing/hero.css.
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
