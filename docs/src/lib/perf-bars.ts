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

export type PerfIconName = "arrow-down" | "arrow-up" | "minus" | "laptop" | "server";

export type PerfVerdictKind = "better" | "worse" | "noise" | "missing";

export interface PerfVerdict {
  readonly kind: PerfVerdictKind;
  /** "16.6× faster", "2.1× slower", "Within noise", "Did not complete". */
  readonly text: string;
  /** Signed change of the measured value against the base: "−94%", "+110%". */
  readonly change?: string;
}

const MACHINE_ICONS: Readonly<Record<PerfMachine, PerfIconName>> = {
  linux: "server",
  mac: "laptop",
};

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

/** Below a tenth of a millisecond the reader thinks in µs. */
const MICROSECOND_LIMIT_MS = 0.1;

/** Three significant figures in the unit a reader expects: µs, ms, then s. */
export function formatTime(ms: number): string {
  if (ms > 0 && ms < MICROSECOND_LIMIT_MS) {
    const us = ms * 1000;
    return `${grouped(us, us < 10 ? 1 : 0)} µs`;
  }
  if (ms < 1 && ms > 0) return `${grouped(ms, 2)} ms`;
  if (ms >= 1000) return `${grouped(ms / 1000, ms >= 10_000 ? 1 : 2)} s`;
  return `${grouped(ms, ms < 10 ? 2 : ms < 100 ? 1 : 0)} ms`;
}

/** Binary units, as the size reports use. */
export function formatSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${grouped(bytes / 1024 ** 3, 2)} GiB`;
  if (bytes >= 1024 ** 2) return `${grouped(bytes / 1024 ** 2, 1)} MiB`;
  if (bytes >= 1024) return `${grouped(bytes / 1024, 1)} KiB`;
  return `${grouped(bytes, 0)} B`;
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
function barValue(value: number, figure: PerfFigure): string {
  const text = formatPerfValue(value, figure.unit);
  return figure.unit === "ratio" && figure.ratioWord
    ? `${text} ${escapeHtml(figure.ratioWord)}`
    : text;
}

/** Above this saving a whole percent would round to "−100%", which reads as "free". */
const NEAR_FULL_SAVING = 99.5;

/** A signed change with one decimal below 10%, whole percents above: "−75%", "+4.2%". */
function formatPercent(fraction: number): string {
  const percent = fraction * 100;
  // Decide the decimals on the rounded value, so 9.96% reads "10%", not "10.0%".
  const magnitude = Math.round(Math.abs(percent) * 10) / 10;
  const isNearFullSaving = percent < 0 && magnitude >= NEAR_FULL_SAVING;
  const digits = magnitude < 10 || isNearFullSaving ? 1 : 0;
  const shown = isNearFullSaving ? Math.min(magnitude, 99.9) : magnitude;
  const text = grouped(shown, digits);
  if (text === grouped(0, digits)) return "0%";
  return `${percent < 0 ? "−" : "+"}${text}%`;
}

function measuredPair(row: PerfRow): { base: PerfBar; measured: PerfBar } | undefined {
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
  const pair = measuredPair(row);
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
  const [lowerWord, higherWord] = figure.verdictWords ?? DEFAULT_VERDICT_WORDS[figure.unit];
  const baseValue = base.stat.value;
  const measuredValue = measured.stat.value;
  const change = baseValue === 0 ? undefined : formatPercent(measuredValue / baseValue - 1);
  const baseSpread = base.stat.spread;
  const measuredSpread = measured.stat.spread;
  const overlaps =
    baseSpread !== undefined &&
    measuredSpread !== undefined &&
    measuredSpread[0] <= baseSpread[1] &&
    baseSpread[0] <= measuredSpread[1];
  if (overlaps || measuredValue === baseValue) {
    return { kind: "noise", text: "Within noise", ...(change ? { change } : {}) };
  }
  const isLower = measuredValue < baseValue;
  const ratio = isLower ? baseValue / measuredValue : measuredValue / baseValue;
  return {
    kind: isLower ? "better" : "worse",
    text: Number.isFinite(ratio)
      ? `${formatTimes(ratio)} ${isLower ? lowerWord : higherWord}`
      : isLower
        ? lowerWord
        : higherWord,
    ...(change ? { change } : {}),
  };
}

interface Axis {
  /** Position of a value along the track, 0 to 100. */
  readonly at: (value: number) => number;
  readonly ticks: ReadonlyArray<{ readonly at: number; readonly label: string }>;
  readonly note: string;
}

function logTickLabel(value: number, unit: PerfUnit): string {
  if (unit === "ratio") return `${grouped(value, value < 1 ? 1 : 0)}×`;
  if (unit === "ms") {
    if (value >= 1000) return `${grouped(value / 1000, 0)} s`;
    if (value >= 1) return `${grouped(value, 0)} ms`;
    if (value >= 0.001) return `${grouped(value * 1000, 0)} µs`;
    return `${grouped(value * 1_000_000, 0)} ns`;
  }
  return formatSize(value);
}

function figureValues(groups: readonly PerfGroup[]): number[] {
  return groups.flatMap((group) =>
    group.rows.flatMap((row) =>
      row.bars.flatMap((bar) =>
        bar.stat === undefined ? [] : [bar.stat.value, ...(bar.stat.spread ?? [])],
      ),
    ),
  );
}

function logAxis(values: readonly number[], unit: PerfUnit): Axis {
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
    return { at: (index / decades) * 100, label: logTickLabel(10 ** exponent, unit) };
  });
  return { at, ticks, note: "Log scale: each step is 10×" };
}

/** A round step for a linear axis: 1, 2 or 5 times a power of ten. */
function niceStep(largest: number): number {
  const raw = largest / LINEAR_TICKS;
  const power = 10 ** Math.floor(Math.log10(raw));
  const multiple = [1, 2, 5, 10].find((candidate) => candidate * power >= raw) ?? 10;
  return multiple * power;
}

function linearAxis(values: readonly number[], unit: PerfUnit): Axis {
  const largest = Math.max(...values.filter((value) => value > 0), 1);
  const step = unit === "bytes" ? niceStep(largest / 1024 ** 2) * 1024 ** 2 : niceStep(largest);
  const top = Math.ceil(largest / step) * step;
  const count = Math.round(top / step);
  const at = (value: number): number => (Math.max(0, value) / top) * 100;
  const ticks = Array.from({ length: count + 1 }, (_, index) => ({
    at: (index / count) * 100,
    label: index === 0 ? "0" : formatPerfValue(step * index, unit),
  }));
  return { at, ticks, note: "Linear scale from 0" };
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function percent(value: number): string {
  return `${clampPercent(value).toFixed(2)}%`;
}

/** "19.6–23.5 ms": a range names its unit once when both ends share it. */
function formatRange(low: number, high: number, unit: PerfUnit): string {
  const lowText = formatPerfValue(low, unit);
  const highText = formatPerfValue(high, unit);
  const suffix = /(\s\S+|×)$/u.exec(highText)?.[1];
  return suffix !== undefined && lowText.endsWith(suffix)
    ? `${lowText.slice(0, -suffix.length)}–${highText}`
    : `${lowText}–${highText}`;
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

function verdictMarkup(verdict: PerfVerdict, icon: PerfIconMarkup): string {
  const iconName: PerfIconName =
    verdict.kind === "better" ? "arrow-down" : verdict.kind === "worse" ? "arrow-up" : "minus";
  // The chip names the result once; the signed % change is in the table view.
  return (
    `<span class="perf-bars__verdict" data-verdict="${verdict.kind}">` +
    icon(iconName) +
    `<strong>${escapeHtml(verdict.text)}</strong>` +
    "</span>"
  );
}

function barMarkup(bar: PerfBar, axis: Axis, figure: PerfFigure): string {
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
  const spreadMarkup =
    spread === undefined
      ? ""
      : `<i class="perf-bars__spread" style="left:${percent(axis.at(spread[0]))};width:${percent(
          axis.at(spread[1]) - axis.at(spread[0]),
        )}"></i>`;
  const spreadText =
    spread === undefined ? "" : `<small>${formatRange(spread[0], spread[1], figure.unit)}</small>`;
  return (
    `<div class="perf-bars__bar" data-role="${bar.role}">` +
    label +
    // The band sits behind the fill; one tick marks the median at the fill's end.
    `<span class="perf-bars__track" aria-hidden="true">${spreadMarkup}<i class="perf-bars__fill" style="width:${percent(fill)}"></i><i class="perf-bars__median" style="left:${percent(fill)}"></i></span>` +
    `<span class="perf-bars__value"><b>${barValue(bar.stat.value, figure)}</b>${spreadText}</span>` +
    "</div>"
  );
}

function rowMarkup(row: PerfRow, axis: Axis, figure: PerfFigure, icon: PerfIconMarkup): string {
  const verdict = perfVerdict(row, figure);
  const title = row.id === undefined ? "" : ` title="${escapeHtml(row.id)}"`;
  const detail =
    row.detail === undefined
      ? ""
      : `<span class="perf-bars__detail">${escapeHtml(row.detail)}</span>`;
  return [
    `<li class="perf-bars__row"${verdict ? ` data-verdict="${verdict.kind}"` : ""}>`,
    `<div class="perf-bars__row-head"><span class="perf-bars__label"${title}>${escapeHtml(row.label)}${detail}</span>${verdict ? verdictMarkup(verdict, icon) : ""}</div>`,
    ...row.bars.map((bar) => barMarkup(bar, axis, figure)),
    "</li>",
  ].join("");
}

/** Phone axes keep at most this many labels, evenly spaced from the origin. */
const NARROW_TICK_LABELS = 4;

function axisMarkup(axis: Axis): string {
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

function groupHeading(group: PerfGroup, icon: PerfIconMarkup): string {
  const machineIcon = group.machine === undefined ? "" : icon(MACHINE_ICONS[group.machine]);
  const note =
    group.note === undefined
      ? ""
      : `<span class="perf-bars__group-note">${escapeHtml(group.note)}</span>`;
  return `<p class="perf-bars__group-title">${machineIcon}<strong>${escapeHtml(group.label)}</strong>${note}</p>`;
}

function legendMarkup(figure: PerfFigure, hasComparison: boolean): string {
  const items: string[] = [];
  if (hasComparison && figure.series?.base) {
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

function hasSeriesLabels(groups: readonly PerfGroup[]): boolean {
  return groups.some((group) => group.rows.some((row) => row.bars.some((bar) => bar.label !== "")));
}

function tableMarkup(figure: PerfFigure): string {
  const hasSpread = figure.groups.some((group) =>
    group.rows.some((row) => row.bars.some((bar) => bar.stat?.spread !== undefined)),
  );
  const hasComparison = figure.groups.some((group) =>
    group.rows.some((row) => measuredPair(row) !== undefined),
  );
  const hasSeries = hasSeriesLabels(figure.groups);
  // The figure title already names the statistic; the column names the quantity.
  const columns = [
    figure.rowHeader,
    ...(hasSeries ? ["Series"] : []),
    VALUE_HEADERS[figure.unit],
    ...(hasSpread ? [figure.spreadLabel ?? "Spread"] : []),
    ...(hasComparison ? ["Change", "Verdict"] : []),
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
          hasSeries ? `<td>${escapeHtml(bar.label)}</td>` : "",
          `<td>${bar.stat ? barValue(bar.stat.value, figure) : escapeHtml(bar.missing ?? "Did not complete")}</td>`,
          hasSpread
            ? `<td>${bar.stat?.spread ? formatRange(bar.stat.spread[0], bar.stat.spread[1], figure.unit) : ""}</td>`
            : "",
          hasComparison
            ? index === 0
              ? `<td rowspan="${row.bars.length}">${verdict?.change ?? ""}</td><td rowspan="${row.bars.length}">${verdict ? escapeHtml(verdict.text) : ""}</td>`
              : ""
            : "",
        ];
        return `<tr>${cells.join("")}</tr>`;
      });
    });
    const groupRow =
      figure.groups.length > 1 || group.machine !== undefined
        ? `<tr><th scope="colgroup" colspan="${columns.length}">${escapeHtml(group.label)}</th></tr>`
        : "";
    return `<tbody>${groupRow}${rows.join("")}</tbody>`;
  });
  return (
    '<details class="perf-bars__table">' +
    "<summary>Show the numbers as a table</summary>" +
    // The class keeps the docs build from wrapping this table in a prose table frame.
    `<div class="perf-bars__table-frame" tabindex="0" role="region" aria-label="${escapeHtml(figure.title)}, table"><table class="perf-bars__data"><caption>${escapeHtml(figure.title)}</caption>${head}${bodies.join("")}</table></div>` +
    "</details>"
  );
}

/** The figure as HTML, every group on its own axis. */
export function renderPerfBars(figure: PerfFigure, icon: PerfIconMarkup): string {
  const groups = figure.groups.filter((group) => group.rows.length > 0);
  const hasComparison = groups.some((group) =>
    group.rows.some((row) => measuredPair(row) !== undefined),
  );
  const series = hasSeriesLabels(groups) ? "" : ' data-series="none"';
  const parts = [
    `<figure class="perf-bars" data-unit="${UNIT_NAMES[figure.unit]}" data-scale="${figure.scale}"${series} aria-labelledby="${figure.id}-title" data-pagefind-ignore>`,
    `<div class="perf-bars__head"><p class="perf-bars__title" id="${figure.id}-title">${escapeHtml(figure.title)}</p>${legendMarkup(figure, hasComparison)}</div>`,
  ];
  for (const group of groups) {
    const values = figureValues([group]);
    const axis =
      figure.scale === "log" ? logAxis(values, figure.unit) : linearAxis(values, figure.unit);
    parts.push(
      // Ticks are evenly spaced on both scales, so the tracks draw them as one repeating gridline.
      `<section class="perf-bars__group"${group.machine ? ` data-machine="${group.machine}"` : ""} style="--perf-steps:${axis.ticks.length - 1}">`,
      groupHeading(group, icon),
      axisMarkup(axis),
      `<ul class="perf-bars__rows">${group.rows.map((row) => rowMarkup(row, axis, figure, icon)).join("")}</ul>`,
      "</section>",
    );
  }
  parts.push(tableMarkup({ ...figure, groups }));
  if (figure.caption) {
    parts.push(`<figcaption class="perf-bars__caption">${escapeHtml(figure.caption)}</figcaption>`);
  }
  parts.push("</figure>");
  return parts.join("\n");
}
