/**
 * Bar figures for the generated performance page: shared log and linear
 * scales, their rulers, and the single-series figure. Every benchmark section
 * draws with these, so all charts share one axis style and one number format.
 */

import { formatBytes, formatMs, html, readableId } from "./evidence-format.js";

interface BenchScale {
  pct: (value: number) => string;
  ruler: string;
  segments: number;
}

function trimTick(value: number): string {
  if (value >= 1000) return `${value / 1000} s`;
  if (value >= 1) return `${Number(value.toFixed(value >= 100 ? 0 : 1))} ms`;
  return `${Number((value * 1000).toPrecision(1))} µs`;
}

function benchRuler(ticks: string[]): string {
  return (
    '<div class="bench-bar bench-bar--ruler" aria-hidden="true">' +
    '<span class="bench-bar__engine"></span>' +
    `<span class="bench-bar__track">${ticks.join("")}</span>` +
    '<span class="bench-bar__value"></span>' +
    "</div>"
  );
}

/**
 * Shared per-panel log scale: every bar maps through the same decade domain,
 * so lengths compare across rows, and the ruler labels each 10x tick. The
 * domain rounds outward to decades, ignoring values below maxValue / 100_000
 * when choosing its lower bound so tiny noise cannot flatten the axis.
 */
function benchLogScale(values: number[]): BenchScale {
  const positive = values.filter((value) => value > 0);
  const maxValue = positive.length ? Math.max(...positive) : 1;
  const minValue = positive.length ? Math.min(...positive) : 0.1;
  const hi = Math.ceil(Math.log10(maxValue));
  const lo = Math.min(Math.floor(Math.log10(Math.max(minValue, maxValue / 100_000))), hi - 1);
  const segments = hi - lo;
  const pct = (value: number): string => {
    if (!(value > 0)) return "0.60%";
    const t = ((Math.log10(value) - lo) / segments) * 100;
    return `${Math.min(100, Math.max(0.6, t)).toFixed(2)}%`;
  };
  const ticks: string[] = [];
  for (let exp = lo; exp <= hi; exp++) {
    const at = ((exp - lo) / segments) * 100;
    const value = 10 ** exp;
    // Each tick names its unit; this axis can span microseconds to seconds.
    const label = trimTick(value);
    ticks.push(`<span class="bench-ruler__tick" style="left:${at.toFixed(2)}%">${label}</span>`);
  }
  return { pct, ruler: benchRuler(ticks), segments };
}

function benchLinearScale(values: number[], fmt: (value: number) => string): BenchScale {
  const maxValue = Math.max(...values.filter((value) => value > 0), 1);
  const pct = (value: number): string =>
    `${Math.min(100, Math.max(0.6, (value / maxValue) * 100)).toFixed(2)}%`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    // Every nonzero tick goes through the panel formatter - these are raw
    // values (bytes for memory), not display numbers.
    const label = t === 0 ? "0" : fmt(maxValue * t);
    return `<span class="bench-ruler__tick" style="left:${(t * 100).toFixed(2)}%">${label}</span>`;
  });
  return { pct, ruler: benchRuler(ticks), segments: 4 };
}

interface BenchFigureGroup {
  label: string;
  /** One muted line under the label: what one timed iteration does. */
  detail?: string;
  /** A result chip beside the label, for example "1.09× faster". */
  chip?: { text: string; outcome: "faster" | "slower" | "even" };
  entries: Array<{
    sizeLabel: string;
    median: number;
    p95: number;
    /** Bar colour: the default series, or the compared engine. */
    series?: "sheetwrite" | "compare";
  }>;
}

/** Time uses a shared log scale; memory uses a shared linear byte scale. */
function benchScaleFigure(
  lead: string,
  groups: readonly BenchFigureGroup[],
  metric: "time" | "memory" = "time",
): string[] {
  const values = groups.flatMap((group) =>
    group.entries.flatMap((entry) => [entry.median, entry.p95]),
  );
  const formatValue = metric === "memory" ? formatBytes : formatMs;
  const scale = metric === "memory" ? benchLinearScale(values, formatValue) : benchLogScale(values);
  const axisNote =
    metric === "memory"
      ? "linear scale — shorter uses less memory"
      : "log scale — every tick is 10× — shorter is faster";
  const unlabelled = groups.every((group) =>
    group.entries.every((entry) => entry.sizeLabel === ""),
  );
  const lines = [
    `<figure class="bench-viz bench-ruled${unlabelled ? " bench-viz--unlabelled" : ""}" data-pagefind-ignore style="--bench-segs:${scale.segments}">`,
    `<div class="bench-viz__scale"><span class="bench-viz__lead">${lead}</span><span class="bench-viz__axis-note">${axisNote}</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>`,
    scale.ruler,
  ];
  for (const group of groups) {
    if (group.entries.length === 0) continue;
    const chip = group.chip
      ? `<span class="bench-viz__ratio" data-kind="${group.chip.outcome}">${html(group.chip.text)}</span>`
      : "";
    const detail = group.detail
      ? `<span class="bench-viz__detail">${html(group.detail)}</span>`
      : "";
    lines.push(
      `<div class="bench-viz__row" data-outcome="${group.chip?.outcome ?? "faster"}">`,
      `<div class="bench-viz__head"><span class="bench-viz__label" title="${html(group.label)}">${html(readableId(group.label))}${detail}</span>${chip}</div>`,
    );
    for (const entry of group.entries) {
      const pct = scale.pct;
      lines.push(
        `<div class="bench-bar" data-engine="${entry.series === "compare" ? "handsontable" : "sheetwrite"}">` +
          `<span class="bench-bar__engine">${html(entry.sizeLabel)}</span>` +
          `<span class="bench-bar__track" aria-hidden="true">` +
          `<i class="bench-bar__spread" style="width:${pct(entry.p95)}"></i>` +
          `<i class="bench-bar__fill" style="width:${pct(entry.median)}"></i></span>` +
          `<span class="bench-bar__value"><b class="bench-num" data-stat="median">${formatValue(entry.median)}</b><b class="bench-num" data-stat="p95">${formatValue(entry.p95)}</b></span>` +
          `</div>`,
      );
    }
    lines.push("</div>");
  }
  lines.push("</figure>");
  return lines;
}

export {
  benchLinearScale,
  benchLogScale,
  benchScaleFigure,
  type BenchFigureGroup,
  type BenchScale,
};
