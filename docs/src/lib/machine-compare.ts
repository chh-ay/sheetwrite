/**
 * Every machine at once, honestly: one row per workload with one mark per
 * machine on a shared ratio axis. Absolute times differ between machines, so
 * the "All" view never draws them on one axis; it draws how much faster (or
 * slower) each machine is against its own baseline. A machine without a
 * capture shows "pending" and no mark, so a missing mark never reads as a
 * slowdown. The bars, the speed story and the engine change all use it for
 * their "All" view.
 */
import { type FigureShape, type FigureTone, scalePosition } from "../components/figures/scale.js";
import { laneHtml, legendMark } from "../components/figures/static.js";
import { escapeHtml, formatTimes, type PerfIconMarkup, type PerfMachine } from "./perf-bars.js";

/** One machine's result for one row: a ratio above 1 is faster, or pending. */
export type MachineResult =
  | { readonly ratio: number; readonly text: string; readonly noise?: boolean }
  | { readonly pending: string };

export interface MachineRow {
  readonly label: string;
  readonly id?: string;
  readonly results: Readonly<Partial<Record<PerfMachine, MachineResult>>>;
}

export interface MachineKey {
  readonly machine: PerfMachine;
  /** "Linux". */
  readonly name: string;
  /** "Intel Core i9-12900H · captured 2026-10-28", or why it is pending. */
  readonly detail: string;
}

export interface MachineComparison {
  readonly id: string;
  /** "Times faster than Handsontable". */
  readonly measure: string;
  /** "as fast as Handsontable", the label of 1×. */
  readonly parity: string;
  readonly machines: readonly MachineKey[];
  readonly rows: readonly MachineRow[];
  /** Header of the table's first column. */
  readonly rowHeader: string;
}

export const MACHINE_ICONS: Readonly<Record<PerfMachine, "server" | "laptop">> = {
  linux: "server",
  mac: "laptop",
};

/** Each machine's mark: a shape and a tone, so no machine is told by colour alone. */
export const MACHINE_MARKS: Readonly<
  Record<PerfMachine, { readonly shape: FigureShape; readonly tone: FigureTone }>
> = {
  linux: { shape: "circle", tone: "accent" },
  mac: { shape: "diamond", tone: "violet" },
};

/** Up to this many doublings, the axis steps in powers of two; a wider one steps in powers of ten. */
const MAX_DOUBLINGS = 6;

/** A ratio axis: its ends and the values its gridlines and labels sit on. */
interface RatioAxis {
  readonly domain: readonly [low: number, high: number];
  readonly ticks: readonly number[];
}

function measured(result: MachineResult | undefined): result is {
  ratio: number;
  text: string;
  noise?: boolean;
} {
  return result !== undefined && "ratio" in result && Number.isFinite(result.ratio);
}

/** A result as words: its own text, why it is pending, or that the row has none. */
function resultText(
  result: MachineResult | undefined,
  describe: (value: { ratio: number; text: string }) => string,
): string {
  if (result === undefined) return "no result";
  return "pending" in result ? result.pending : describe(result);
}

/** From the slowest mark (or 1×) to the fastest, in powers of two or, when that spans many doublings, of ten. */
function axisOf(rows: readonly MachineRow[]): RatioAxis {
  const ratios = rows.flatMap((row) =>
    Object.values(row.results).flatMap((result) => (measured(result) ? [result.ratio] : [])),
  );
  const wide = Math.log2(Math.max(1, ...ratios)) > MAX_DOUBLINGS;
  const base = wide ? 10 : 2;
  const log = (value: number) => Math.log(value) / Math.log(base);
  const low = Math.min(0, Math.floor(Math.min(0, ...ratios.map(log))));
  const high = Math.max(1, Math.ceil(Math.max(0, ...ratios.map(log))));
  return {
    domain: [base ** low, base ** high],
    ticks: Array.from({ length: high - low + 1 }, (_, index) => base ** (low + index)),
  };
}

/** "1/2×", "1×", "1,000×". */
function ratioLabel(ratio: number): string {
  return ratio >= 1 ? `${ratio.toLocaleString("en-US")}×` : `1/${Math.round(1 / ratio)}×`;
}

function ticks(axis: RatioAxis): string {
  const scale = { kind: "log", domain: axis.domain } as const;
  return axis.ticks
    .map(
      (ratio) =>
        `<span style="left:${scalePosition(scale, ratio).toFixed(2)}%"${ratio === 1 ? " data-parity" : ""}>${ratioLabel(ratio)}</span>`,
    )
    .join("");
}

function legend(comparison: MachineComparison, icon: PerfIconMarkup): string {
  return `<ul class="machines__legend">${comparison.machines
    .map(
      (key) =>
        `<li data-machine="${key.machine}">${legendMark(MACHINE_MARKS[key.machine].shape, MACHINE_MARKS[key.machine].tone)}${icon(MACHINE_ICONS[key.machine])}<b>${escapeHtml(key.name)}</b><span>${escapeHtml(key.detail)}</span></li>`,
    )
    .join("")}</ul>`;
}

function row(entry: MachineRow, comparison: MachineComparison, axis: RatioAxis): string {
  const lane = laneHtml({
    label: entry.label,
    scale: { kind: "log", domain: axis.domain },
    origin: 1,
    gridlines: axis.ticks,
    series: comparison.machines.map((key) => {
      const result = entry.results[key.machine];
      return {
        key: key.machine,
        label: key.name,
        value: measured(result) ? result.ratio : null,
        valueText: resultText(result, (value) => value.text),
        ...MACHINE_MARKS[key.machine],
      };
    }),
  });
  const values = comparison.machines
    .map((key) => {
      const result = entry.results[key.machine];
      return `<span data-machine="${key.machine}"${measured(result) ? "" : " data-pending"}>${legendMark(MACHINE_MARKS[key.machine].shape, MACHINE_MARKS[key.machine].tone)}${escapeHtml(key.name)} <b>${escapeHtml(resultText(result, (value) => value.text))}</b></span>`;
    })
    .join("");
  const title = entry.id === undefined ? "" : ` title="${escapeHtml(entry.id)}"`;
  return `<li class="machines__row"><span class="machines__label"${title}>${escapeHtml(entry.label)}</span><span class="machines__lane">${lane}</span><span class="machines__values">${values}</span></li>`;
}

function table(comparison: MachineComparison): string {
  const head = [
    comparison.rowHeader,
    ...comparison.machines.map((key) => `${key.name}: ${comparison.measure.toLowerCase()}`),
  ]
    .map((column) => `<th scope="col">${escapeHtml(column)}</th>`)
    .join("");
  const body = comparison.rows
    .map(
      (entry) =>
        `<tr><th scope="row">${escapeHtml(entry.label)}</th>${comparison.machines
          .map((key) => {
            const result = entry.results[key.machine];
            const text = resultText(
              result,
              (value) => `${formatTimes(value.ratio)} · ${value.text}`,
            );
            return `<td>${escapeHtml(text)}</td>`;
          })
          .join("")}</tr>`,
    )
    .join("");
  return `<details class="machines__more"><summary>Show every machine as a table</summary><div class="machines__table" tabindex="0" role="region" aria-label="${escapeHtml(comparison.measure)}, every machine, table"><table class="machines__data"><caption>${escapeHtml(comparison.measure)}, every machine</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div></details>`;
}

/** The value of the switch option that shows every machine at once. */
export const ALL_MACHINES = "all";

/**
 * A Linux | Mac | All radio group. The first machine starts checked; the
 * markup's `checked` stays the reader's to change. `label` names the figure,
 * so a page with several switches reads "Machine for median recalculation time".
 */
export function machineSwitch(
  options: {
    readonly id: string;
    readonly label: string;
    readonly machines: ReadonlyArray<{ readonly machine: PerfMachine; readonly name: string }>;
  },
  icon: PerfIconMarkup,
): string {
  const name = `${options.id}-machine`;
  const radio = (value: string, text: string, glyph: string, checked: boolean): string =>
    `<input type="radio" name="${name}" id="${name}-${value}" value="${value}"${checked ? " checked" : ""}><label for="${name}-${value}">${glyph}${escapeHtml(text)}</label>`;
  return `<div class="machine-switch" role="radiogroup" aria-label="${escapeHtml(options.label)}">${[
    ...options.machines.map((entry, index) =>
      radio(entry.machine, entry.name, icon(MACHINE_ICONS[entry.machine]), index === 0),
    ),
    radio(ALL_MACHINES, "All", icon("layers"), false),
  ].join("")}</div>`;
}

/** Every machine's result per row on one ratio axis, with a legend and a table per machine column. */
export function renderMachineComparison(
  comparison: MachineComparison,
  icon: PerfIconMarkup,
): string {
  const axis = axisOf(comparison.rows);
  return [
    `<div class="machines">`,
    legend(comparison, icon),
    `<p class="machines__axis-title">${escapeHtml(comparison.measure)} on each machine, against its own baseline; log scale, 1× is ${escapeHtml(comparison.parity)}. Machines are never compared with each other.</p>`,
    `<div class="machines__axis" aria-hidden="true"><span class="machines__ticks">${ticks(axis)}</span></div>`,
    `<ul class="machines__rows">${comparison.rows.map((entry) => row(entry, comparison, axis)).join("")}</ul>`,
    table(comparison),
    "</div>",
  ].join("");
}
