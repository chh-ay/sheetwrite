/**
 * Performance bars: the figure the Performance pages and release notes use to
 * show and compare measurements, so every bar shares one axis style, one
 * number format, one verdict wording and one table view. The speed story
 * (`speedup-story.ts`), on the Render page, the landing page and the
 * performance showcase, uses the same formats and icons.
 *
 * The renderer returns HTML. Build scripts write it into Markdown, so the
 * figure needs no JavaScript of its own. The caller supplies the icon markup,
 * because build scripts inline sprite icons while pages reference the sprite
 * file.
 */
import {
  ALL_MACHINES,
  MACHINE_ICONS,
  type MachineRow,
  machineSwitch,
  renderMachineComparison,
} from "./machine-compare.js";

/** The quantity a figure plots. Times are milliseconds; sizes are bytes. */
export type PerfUnit = "ms" | "bytes" | "ratio";

/** A measured value and, when the capture has one, the spread of its runs. */
export interface PerfStat {
  readonly value: number;
  /** Low and high end of the spread band, in the figure's unit. */
  readonly spread?: readonly [low: number, high: number];
}

/**
 * One bar. In a comparison row, the `base` bar is what the `measured` bar is
 * compared with: the previous release, the baseline build, or another library.
 */
export interface PerfBar {
  readonly label: string;
  readonly role: "base" | "measured";
  /** Absent when the run did not complete; `missing` then says why. */
  readonly stat?: PerfStat;
  readonly missing?: string;
}

export interface PerfRow {
  readonly label: string;
  /** One muted line under the label: what one measured run does. */
  readonly detail?: string;
  /** The raw benchmark ID, kept as a tooltip. */
  readonly id?: string;
  readonly bars: readonly PerfBar[];
}

/** Machines are separate groups with their own axis, never one bar against another. */
export type PerfMachine = "linux" | "mac";

export interface PerfGroup {
  /** For example "Linux · x86-64 · Intel Core i9-12900H". */
  readonly label: string;
  readonly machine?: PerfMachine;
  /** One muted line under the group heading, such as the capture date and commit. */
  readonly note?: string;
  readonly rows: readonly PerfRow[];
}

export interface PerfFigure {
  /** Stable ID for the figure's labels, unique on its page. */
  readonly id: string;
  /** What the bars measure, for example "Median interaction time". */
  readonly title: string;
  readonly unit: PerfUnit;
  readonly scale: "log" | "linear";
  /** Header of the first table column, for example "Interaction". */
  readonly rowHeader: string;
  /** Words for a lower and a higher measured value than the base. */
  readonly verdictWords?: readonly [lower: string, higher: string];
  /** What the spread band shows, for example "Fastest to p95 run". */
  readonly spreadLabel?: string;
  /** Names of the base and measured series, for the legend. */
  readonly series?: { readonly base?: string; readonly measured: string };
  /** The word after a ratio value, so "7.8×" reads "7.8× faster". */
  readonly ratioWord?: string;
  readonly groups: readonly PerfGroup[];
  readonly caption?: string;
}

/** Icon markup for one sprite icon; inline SVG at build time, a sprite reference on pages. */
export type PerfIconMarkup = (name: PerfIconName) => string;

export type PerfIconName = "arrow-down" | "arrow-up" | "minus" | "laptop" | "layers" | "server";

export type PerfVerdictKind = "better" | "worse" | "noise" | "missing";

export interface PerfVerdict {
  readonly kind: PerfVerdictKind;
  /** "16.6× faster", "2.1× slower", "Within noise", "Did not complete". */
  readonly text: string;
  /** Signed change of the measured value against the base: "−94%", "+110%". */
  readonly change?: string;
}

const DEFAULT_VERDICT_WORDS: Readonly<Record<PerfUnit, readonly [string, string]>> = {
  ms: ["faster", "slower"],
  bytes: ["smaller", "larger"],
  ratio: ["lower", "higher"],
};

/** Below this share of the track a bar end and its label would overlap the axis start. */
const MIN_FILL_PERCENT = 0.8;
/** A log axis never spans more decades than this, so tiny outliers cannot flatten it. */
const MAX_LOG_DECADES = 6;
/** Linear axes tick at quarters. */
const LINEAR_TICKS = 4;

/** Escapes text for HTML. */
export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function grouped(value: number, digits: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** "Median recalculation time" reads "median recalculation time" inside a sentence. */
function lower_first(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** A number and its unit never break across lines. */
const UNIT_SPACE = "\u00a0";

/** Below a tenth of a millisecond the reader thinks in µs. */
const MICROSECOND_LIMIT_MS = 0.1;

/** Three significant figures in the unit a reader expects: µs, ms, then s. */
export function formatTime(ms: number): string {
  if (ms > 0 && ms < MICROSECOND_LIMIT_MS) {
    const us = ms * 1000;
    return `${grouped(us, us < 10 ? 1 : 0)}${UNIT_SPACE}µs`;
  }
  if (ms < 1 && ms > 0) return `${grouped(ms, 2)}${UNIT_SPACE}ms`;
  if (ms >= 1000) return `${grouped(ms / 1000, ms >= 10_000 ? 1 : 2)}${UNIT_SPACE}s`;
  return `${grouped(ms, ms < 10 ? 2 : ms < 100 ? 1 : 0)}${UNIT_SPACE}ms`;
}

/** Binary units, as the size reports use. */
export function formatSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${grouped(bytes / 1024 ** 3, 2)}${UNIT_SPACE}GiB`;
  if (bytes >= 1024 ** 2) return `${grouped(bytes / 1024 ** 2, 1)}${UNIT_SPACE}MiB`;
  if (bytes >= 1024) return `${grouped(bytes / 1024, 1)}${UNIT_SPACE}KiB`;
  return `${grouped(bytes, 0)}${UNIT_SPACE}B`;
}

/** Ratios span 1× to 10,000×; decimals only help below 100×. */
export function formatTimes(ratio: number): string {
  return `${grouped(ratio, ratio < 100 ? 1 : 0)}×`;
}

export function formatPerfValue(value: number, unit: PerfUnit): string {
  if (unit === "ms") return formatTime(value);
  if (unit === "bytes") return formatSize(value);
  return formatTimes(value);
}

/** A bar's value label: "7.8× faster" on a ratio figure with a ratio word, else the plain value. */
function bar_value(value: number, figure: PerfFigure): string {
  const text = formatPerfValue(value, figure.unit);
  return figure.unit === "ratio" && figure.ratioWord
    ? `${text} ${escapeHtml(figure.ratioWord)}`
    : text;
}

/** Above this saving a whole percent would round to "−100%", which reads as "free". */
const NEAR_FULL_SAVING = 99.5;

/** A signed change with one decimal below 10%, whole percents above: "−75%", "+4.2%". */
function format_percent(fraction: number): string {
  const percent = fraction * 100;
  // Decide the decimals on the rounded value, so 9.96% reads "10%", not "10.0%".
  const magnitude = Math.round(Math.abs(percent) * 10) / 10;
  const is_near_full_saving = percent < 0 && magnitude >= NEAR_FULL_SAVING;
  const digits = magnitude < 10 || is_near_full_saving ? 1 : 0;
  const shown = is_near_full_saving ? Math.min(magnitude, 99.9) : magnitude;
  const text = grouped(shown, digits);
  if (text === grouped(0, digits)) return "0%";
  return `${percent < 0 ? "−" : "+"}${text}%`;
}

function measured_pair(row: PerfRow): { base: PerfBar; measured: PerfBar } | undefined {
  if (row.bars.length !== 2) return undefined;
  const base = row.bars.find((bar) => bar.role === "base");
  const measured = row.bars.find((bar) => bar.role === "measured");
  return base && measured ? { base, measured } : undefined;
}

/**
 * The verdict of a comparison row: how the measured bar relates to its base.
 * Overlapping spread bands read as within noise, because the difference is
 * no larger than the variation between runs of one side.
 */
export function perfVerdict(row: PerfRow, figure: PerfFigure): PerfVerdict | undefined {
  const pair = measured_pair(row);
  if (pair === undefined) return undefined;
  const { base, measured } = pair;
  if (measured.stat === undefined) {
    return {
      kind: "missing",
      text: `${measured.label}: ${measured.missing ?? "did not complete"}`,
    };
  }
  if (base.stat === undefined) {
    return { kind: "missing", text: `${base.label}: ${base.missing ?? "did not complete"}` };
  }
  const [lower_word, higher_word] = figure.verdictWords ?? DEFAULT_VERDICT_WORDS[figure.unit];
  const base_value = base.stat.value;
  const measured_value = measured.stat.value;
  const change = base_value === 0 ? undefined : format_percent(measured_value / base_value - 1);
  const base_spread = base.stat.spread;
  const measured_spread = measured.stat.spread;
  const overlaps =
    base_spread !== undefined &&
    measured_spread !== undefined &&
    measured_spread[0] <= base_spread[1] &&
    base_spread[0] <= measured_spread[1];
  if (overlaps || measured_value === base_value) {
    return { kind: "noise", text: "Within noise", ...(change ? { change } : {}) };
  }
  const is_lower = measured_value < base_value;
  const ratio = is_lower ? base_value / measured_value : measured_value / base_value;
  return {
    kind: is_lower ? "better" : "worse",
    text: Number.isFinite(ratio)
      ? `${formatTimes(ratio)} ${is_lower ? lower_word : higher_word}`
      : is_lower
        ? lower_word
        : higher_word,
    ...(change ? { change } : {}),
  };
}

interface Axis {
  /** Position of a value along the track, 0 to 100. */
  readonly at: (value: number) => number;
  readonly ticks: ReadonlyArray<{ readonly at: number; readonly label: string }>;
  readonly note: string;
}

function log_tick_label(value: number, unit: PerfUnit): string {
  if (unit === "ratio") return `${grouped(value, value < 1 ? 1 : 0)}×`;
  if (unit === "ms") {
    if (value >= 1000) return `${grouped(value / 1000, 0)} s`;
    if (value >= 1) return `${grouped(value, 0)} ms`;
    if (value >= 0.001) return `${grouped(value * 1000, 0)} µs`;
    return `${grouped(value * 1_000_000, 0)} ns`;
  }
  return formatSize(value);
}

function figure_values(groups: readonly PerfGroup[]): number[] {
  return groups.flatMap((group) =>
    group.rows.flatMap((row) =>
      row.bars.flatMap((bar) =>
        bar.stat === undefined ? [] : [bar.stat.value, ...(bar.stat.spread ?? [])],
      ),
    ),
  );
}

function log_axis(values: readonly number[], unit: PerfUnit): Axis {
  const positive = values.filter((value) => value > 0);
  const largest = positive.length > 0 ? Math.max(...positive) : 10;
  const smallest = positive.length > 0 ? Math.min(...positive) : 1;
  const high = Math.ceil(Math.log10(largest));
  // A ratio axis starts at 1×: parity is the natural origin of "N× faster".
  const low =
    unit === "ratio"
      ? Math.min(0, high - 1)
      : Math.min(
          Math.floor(Math.log10(Math.max(smallest, largest / 10 ** MAX_LOG_DECADES))),
          high - 1,
        );
  const decades = high - low;
  const at = (value: number): number =>
    value > 0 ? ((Math.log10(value) - low) / decades) * 100 : 0;
  const ticks = Array.from({ length: decades + 1 }, (_, index) => {
    const exponent = low + index;
    return { at: (index / decades) * 100, label: log_tick_label(10 ** exponent, unit) };
  });
  return { at, ticks, note: "Log scale: each step is 10×" };
}

/** A round step for a linear axis: 1, 2 or 5 times a power of ten. */
function nice_step(largest: number): number {
  const raw = largest / LINEAR_TICKS;
  const power = 10 ** Math.floor(Math.log10(raw));
  const multiple = [1, 2, 5, 10].find((candidate) => candidate * power >= raw) ?? 10;
  return multiple * power;
}

/** The binary unit a byte axis up to `largest` counts in, so its ticks are round in that unit. */
function byte_axis_unit(largest: number): { readonly size: number; readonly name: string } {
  if (largest >= 1024 ** 3) return { size: 1024 ** 3, name: "GiB" };
  if (largest >= 1024 ** 2) return { size: 1024 ** 2, name: "MiB" };
  if (largest >= 1024) return { size: 1024, name: "KiB" };
  return { size: 1, name: "B" };
}

function linear_axis(values: readonly number[], unit: PerfUnit): Axis {
  const largest = Math.max(...values.filter((value) => value > 0), 1);
  // A byte axis steps in round numbers of its own unit (200 KiB, not 0.2 MiB
  // shown as 204.8 KiB), and its labels show only the digits the step needs.
  const bytes = unit === "bytes" ? byte_axis_unit(largest) : undefined;
  const step =
    bytes === undefined ? nice_step(largest) : nice_step(largest / bytes.size) * bytes.size;
  const top = Math.ceil(largest / step) * step;
  const count = Math.round(top / step);
  const at = (value: number): number => (Math.max(0, value) / top) * 100;
  const label = (value: number): string => {
    if (bytes === undefined) return formatPerfValue(value, unit);
    const digits = Math.max(0, -Math.floor(Math.log10(step / bytes.size)));
    return `${grouped(value / bytes.size, digits)}${UNIT_SPACE}${bytes.name}`;
  };
  const ticks = Array.from({ length: count + 1 }, (_, index) => ({
    at: (index / count) * 100,
    label: index === 0 ? "0" : label(step * index),
  }));
  return { at, ticks, note: "Linear scale from 0" };
}

function clamp_percent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function percent(value: number): string {
  return `${clamp_percent(value).toFixed(2)}%`;
}

/** "19.6–23.5 ms": a range names its unit once when both ends share it. */
function format_range(low: number, high: number, unit: PerfUnit): string {
  const low_text = formatPerfValue(low, unit);
  const high_text = formatPerfValue(high, unit);
  const suffix = /(\s\S+|×)$/u.exec(high_text)?.[1];
  return suffix !== undefined && low_text.endsWith(suffix)
    ? `${low_text.slice(0, -suffix.length)}–${high_text}`
    : `${low_text}–${high_text}`;
}

const UNIT_NAMES: Readonly<Record<PerfUnit, string>> = {
  ms: "time",
  bytes: "size",
  ratio: "ratio",
};

const VALUE_HEADERS: Readonly<Record<PerfUnit, string>> = {
  ms: "Time",
  bytes: "Size",
  ratio: "Times faster",
};

function verdict_markup(verdict: PerfVerdict, icon: PerfIconMarkup): string {
  const icon_name: PerfIconName =
    verdict.kind === "better" ? "arrow-down" : verdict.kind === "worse" ? "arrow-up" : "minus";
  // The chip names the result once; the signed % change is in the table view.
  return (
    `<span class="perf-bars__verdict" data-verdict="${verdict.kind}">` +
    icon(icon_name) +
    `<strong>${escapeHtml(verdict.text)}</strong>` +
    "</span>"
  );
}

function bar_markup(bar: PerfBar, axis: Axis, figure: PerfFigure): string {
  const label = `<span class="perf-bars__series">${escapeHtml(bar.label)}</span>`;
  if (bar.stat === undefined) {
    return (
      `<div class="perf-bars__bar" data-role="${bar.role}" data-missing="">` +
      label +
      `<span class="perf-bars__missing">${escapeHtml(bar.missing ?? "Did not complete")}</span>` +
      "</div>"
    );
  }
  const fill = Math.max(MIN_FILL_PERCENT, axis.at(bar.stat.value));
  const spread = bar.stat.spread;
  const spread_markup =
    spread === undefined
      ? ""
      : `<i class="perf-bars__spread" style="left:${percent(axis.at(spread[0]))};width:${percent(
          axis.at(spread[1]) - axis.at(spread[0]),
        )}"></i>`;
  const spread_text =
    spread === undefined ? "" : `<small>${format_range(spread[0], spread[1], figure.unit)}</small>`;
  return (
    `<div class="perf-bars__bar" data-role="${bar.role}">` +
    label +
    // The band sits behind the fill; one tick marks the median at the fill's end.
    `<span class="perf-bars__track" aria-hidden="true">${spread_markup}<i class="perf-bars__fill" style="width:${percent(fill)}"></i><i class="perf-bars__median" style="left:${percent(fill)}"></i></span>` +
    `<span class="perf-bars__value"><b>${bar_value(bar.stat.value, figure)}</b>${spread_text}</span>` +
    "</div>"
  );
}

function row_markup(row: PerfRow, axis: Axis, figure: PerfFigure, icon: PerfIconMarkup): string {
  const verdict = perfVerdict(row, figure);
  const title = row.id === undefined ? "" : ` title="${escapeHtml(row.id)}"`;
  const detail =
    row.detail === undefined
      ? ""
      : `<span class="perf-bars__detail">${escapeHtml(row.detail)}</span>`;
  return [
    `<li class="perf-bars__row"${verdict ? ` data-verdict="${verdict.kind}"` : ""}>`,
    `<div class="perf-bars__row-head"><span class="perf-bars__label"${title}>${escapeHtml(row.label)}${detail}</span>${verdict ? verdict_markup(verdict, icon) : ""}</div>`,
    ...row.bars.map((bar) => bar_markup(bar, axis, figure)),
    "</li>",
  ].join("");
}

/** Phone axes keep at most this many labels, evenly spaced from the origin. */
const NARROW_TICK_LABELS = 4;

function axis_markup(axis: Axis): string {
  // Every label is centred on its gridline; phones show an evenly spaced subset.
  const step = Math.ceil((axis.ticks.length - 1) / (NARROW_TICK_LABELS - 1));
  const ticks = axis.ticks
    .map(
      (tick, index) =>
        `<span class="perf-bars__tick" style="left:${percent(tick.at)}"${
          index % step === 0 ? "" : ' data-narrow="hidden"'
        }>${escapeHtml(tick.label)}</span>`,
    )
    .join("");
  return (
    `<div class="perf-bars__axis" aria-hidden="true" data-ticks="${axis.ticks.length}">` +
    `<span class="perf-bars__axis-title">${axis.note}</span>` +
    `<span class="perf-bars__scale">${ticks}</span>` +
    "</div>"
  );
}

function group_heading(group: PerfGroup, icon: PerfIconMarkup): string {
  const machine_icon = group.machine === undefined ? "" : icon(MACHINE_ICONS[group.machine]);
  const note =
    group.note === undefined
      ? ""
      : `<span class="perf-bars__group-note">${escapeHtml(group.note)}</span>`;
  return `<p class="perf-bars__group-title">${machine_icon}<strong>${escapeHtml(group.label)}</strong>${note}</p>`;
}

function legend_markup(figure: PerfFigure, has_comparison: boolean): string {
  const items: string[] = [];
  if (has_comparison && figure.series?.base) {
    items.push(
      `<span class="perf-bars__key" data-key="base"><i></i>${escapeHtml(figure.series.base)}</span>`,
    );
  }
  if (figure.series) {
    items.push(
      `<span class="perf-bars__key" data-key="measured"><i></i>${escapeHtml(figure.series.measured)}</span>`,
    );
  }
  if (figure.spreadLabel) {
    items.push(
      `<span class="perf-bars__key" data-key="spread"><i></i>${escapeHtml(figure.spreadLabel)}</span>`,
    );
  }
  return items.length === 0 ? "" : `<div class="perf-bars__legend">${items.join("")}</div>`;
}

function has_series_labels(groups: readonly PerfGroup[]): boolean {
  return groups.some((group) => group.rows.some((row) => row.bars.some((bar) => bar.label !== "")));
}

function table_markup(figure: PerfFigure): string {
  const has_spread = figure.groups.some((group) =>
    group.rows.some((row) => row.bars.some((bar) => bar.stat?.spread !== undefined)),
  );
  const has_comparison = figure.groups.some((group) =>
    group.rows.some((row) => measured_pair(row) !== undefined),
  );
  const has_series = has_series_labels(figure.groups);
  // The figure title already names the statistic; the column names the quantity.
  const columns = [
    figure.rowHeader,
    ...(has_series ? ["Series"] : []),
    VALUE_HEADERS[figure.unit],
    ...(has_spread ? [figure.spreadLabel ?? "Spread"] : []),
    ...(has_comparison ? ["Change", "Verdict"] : []),
  ];
  const head = `<thead><tr>${columns.map((column) => `<th scope="col">${escapeHtml(column)}</th>`).join("")}</tr></thead>`;
  const bodies = figure.groups.map((group) => {
    const rows = group.rows.flatMap((row) => {
      const verdict = perfVerdict(row, figure);
      return row.bars.map((bar, index) => {
        const cells = [
          index === 0
            ? `<th scope="row" rowspan="${row.bars.length}">${escapeHtml(row.label)}</th>`
            : "",
          has_series ? `<td>${escapeHtml(bar.label)}</td>` : "",
          `<td>${bar.stat ? bar_value(bar.stat.value, figure) : escapeHtml(bar.missing ?? "Did not complete")}</td>`,
          has_spread
            ? `<td>${bar.stat?.spread ? format_range(bar.stat.spread[0], bar.stat.spread[1], figure.unit) : ""}</td>`
            : "",
          has_comparison
            ? index === 0
              ? `<td rowspan="${row.bars.length}">${verdict?.change ?? ""}</td><td rowspan="${row.bars.length}">${verdict ? escapeHtml(verdict.text) : ""}</td>`
              : ""
            : "",
        ];
        return `<tr>${cells.join("")}</tr>`;
      });
    });
    const group_row =
      figure.groups.length > 1 || group.machine !== undefined
        ? `<tr><th scope="colgroup" colspan="${columns.length}">${escapeHtml(group.label)}</th></tr>`
        : "";
    return `<tbody>${group_row}${rows.join("")}</tbody>`;
  });
  return (
    '<details class="perf-bars__table">' +
    "<summary>Show the numbers as a table</summary>" +
    // The class keeps the docs build from wrapping this table in a prose table frame.
    `<div class="perf-bars__table-frame" tabindex="0" role="region" aria-label="${escapeHtml(figure.title)}, table"><table class="perf-bars__data"><caption>${escapeHtml(figure.title)}</caption>${head}${bodies.join("")}</table></div>` +
    "</details>"
  );
}

/**
 * Every machine's comparison on one ratio axis: for each row, how much lower
 * or higher each machine's measured value is than its own base. Rows match
 * across machines by benchmark ID, or by label when a row has none.
 */
function all_machines(
  figure: PerfFigure,
  groups: readonly PerfGroup[],
  icon: PerfIconMarkup,
): string {
  const machine_groups = groups.flatMap((group) =>
    group.machine === undefined ? [] : [{ group, machine: group.machine }],
  );
  const keys = new Map<string, string>();
  for (const { group } of machine_groups) {
    for (const row of group.rows) keys.set(row.id ?? row.label, row.label);
  }
  const [lower] = figure.verdictWords ?? DEFAULT_VERDICT_WORDS[figure.unit];
  const base_name = figure.series?.base ?? "the base";
  const rows: MachineRow[] = [...keys].map(([key, label]) => ({
    label,
    id: key,
    results: Object.fromEntries(
      machine_groups.map(({ group, machine }) => {
        const row = group.rows.find((entry) => (entry.id ?? entry.label) === key);
        const pair = row === undefined ? undefined : measured_pair(row);
        const verdict = row === undefined ? undefined : perfVerdict(row, figure);
        if (
          pair?.base.stat === undefined ||
          pair.measured.stat === undefined ||
          verdict === undefined
        ) {
          return [
            machine,
            { pending: row === undefined ? "no result" : (verdict?.text ?? "no result") },
          ];
        }
        return [
          machine,
          {
            ratio: pair.base.stat.value / pair.measured.stat.value,
            text: verdict.text,
            noise: verdict.kind === "noise",
          },
        ];
      }),
    ),
  }));
  return renderMachineComparison(
    {
      id: `${figure.id}-all`,
      measure: `Times ${lower} than ${base_name}`,
      parity: `the same as ${base_name}`,
      rowHeader: figure.rowHeader,
      machines: machine_groups.map(({ group, machine }) => {
        const [name = group.label, ...rest] = group.label.split(" · ");
        return {
          machine,
          name,
          detail: [...rest, ...(group.note === undefined ? [] : [group.note])].join(" · "),
        };
      }),
      rows,
    },
    icon,
  );
}

/** The figure as HTML, every group on its own axis; machines behind a switch. */
export function renderPerfBars(figure: PerfFigure, icon: PerfIconMarkup): string {
  const groups = figure.groups.filter((group) => group.rows.length > 0);
  const has_comparison = groups.some((group) =>
    group.rows.some((row) => measured_pair(row) !== undefined),
  );
  const switched = groups.filter((group) => group.machine !== undefined).length > 1;
  const series = has_series_labels(groups) ? "" : ' data-series="none"';
  const parts = [
    `<figure class="perf-bars" data-unit="${UNIT_NAMES[figure.unit]}" data-scale="${figure.scale}"${series}${switched ? " data-switched" : ""} aria-labelledby="${figure.id}-title" data-pagefind-ignore>`,
    `<div class="perf-bars__head"><p class="perf-bars__title" id="${figure.id}-title">${escapeHtml(figure.title)}</p>${legend_markup(figure, has_comparison)}</div>`,
    switched
      ? machineSwitch(
          {
            id: figure.id,
            // Each switch names its figure, so a page with several reads "Machine for median recalculation time".
            label: `Machine for ${lower_first(figure.title)}`,
            machines: groups.flatMap((group) =>
              group.machine === undefined
                ? []
                : [{ machine: group.machine, name: group.label.split(" · ")[0] ?? group.label }],
            ),
          },
          icon,
        )
      : "",
  ];
  for (const group of groups) {
    const values = figure_values([group]);
    const axis =
      figure.scale === "log" ? log_axis(values, figure.unit) : linear_axis(values, figure.unit);
    parts.push(
      // Ticks are evenly spaced on both scales, so the tracks draw them as one repeating gridline.
      `<section class="perf-bars__group"${group.machine ? ` data-machine="${group.machine}"` : ""} style="--perf-steps:${axis.ticks.length - 1}">`,
      // The switch already shows each machine's icon; the heading names the machine in text.
      group_heading(group, switched ? () => "" : icon),
      axis_markup(axis),
      `<ul class="perf-bars__rows">${group.rows.map((row) => row_markup(row, axis, figure, icon)).join("")}</ul>`,
      "</section>",
    );
  }
  // "All" shows every machine's ratios on one axis; without a base to compare with, it shows every machine's own axis in turn.
  if (switched && has_comparison) {
    parts.push(
      `<section class="perf-bars__all" data-machine="${ALL_MACHINES}">${all_machines(figure, groups, icon)}</section>`,
    );
  }
  parts.push(table_markup({ ...figure, groups }));
  if (figure.caption) {
    parts.push(`<figcaption class="perf-bars__caption">${escapeHtml(figure.caption)}</figcaption>`);
  }
  parts.push("</figure>");
  return parts.join("\n");
}
