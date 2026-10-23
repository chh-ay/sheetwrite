/**
 * Shared formatting and layout blocks for the generated performance evidence
 * page. Every benchmark section uses the same number formats and the same
 * layout: validated result, headline numbers, main table, then all
 * measurements collapsed.
 */

/** Escapes text for HTML that the Markdown pipeline passes through as-is. */
function html(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Three significant figures in the unit a reader expects: µs, ms, then s. */
function formatMs(value: number): string {
  // "0.00 ms" reads like a broken benchmark; sub-hundredth values are real
  // measurements in the microsecond range.
  if (value > 0 && value < 0.0095) return `${Math.max(1, Math.round(value * 1000))} µs`;
  if (value >= 1000) return `${fixed(value / 1000, value >= 10_000 ? 1 : 2)} s`;
  return `${fixed(value, value < 10 ? 2 : value < 100 ? 1 : 0)} ms`;
}

function formatMb(value: number): string {
  return `${(value / 1_000_000).toFixed(1)} MB`;
}

/** Binary units, as the WASM and package size reports use. */
function formatBytes(value: number): string {
  if (value >= 1024 * 1024) return `${fixed(value / (1024 * 1024), 1)} MiB`;
  if (value >= 1024) return `${fixed(value / 1024, 1)} KiB`;
  return `${value} B`;
}

/** Paired ratios sit near 1, so they keep two decimals. */
function formatRatio(value: number): string {
  return `${value.toFixed(2)}×`;
}

/** Speedups span 1× to 10,000×; decimals only help below 100×. */
function formatSpeedup(value: number): string {
  return `${fixed(value, value < 100 ? 1 : 0)}×`;
}

function fixed(value: number, digits: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * A benchmark ID as words: "scroll-down.top-left" reads "Scroll down · top
 * left", "windowRead" reads "Window read". The raw ID stays in the title.
 */
function readableId(id: string): string {
  const words = id
    .split(".")
    .map((part) =>
      part
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replaceAll(/[-_]/g, " ")
        .toLowerCase(),
    )
    .join(" · ");
  return capitalized(words);
}

/**
 * Generated prose as a sentence: grouped digits, and a capital first letter
 * unless the first word is an identifier such as "fromCsv" or "initSheetwrite()".
 */
function readableText(text: string): string {
  const grouped = text.replaceAll(/\b\d{5,}\b/g, (digits) => formatCount(Number(digits)));
  const firstWord = grouped.split(" ", 1)[0] ?? "";
  return /^[a-z]+$/.test(firstWord) ? capitalized(grouped) : grouped;
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

/** Minute precision: the capture time identifies a run, not a measurement. */
function formatCaptureTime(timestamp: string): string {
  return timestamp.slice(0, 16).replace("T", " ");
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A value or a range, with one shared unit suffix. */
function span(values: readonly number[], digits: number, suffix: string): string {
  const low = Math.min(...values).toFixed(digits);
  const high = Math.max(...values).toFixed(digits);
  return low === high ? `${low}${suffix}` : `${low}–${high}${suffix}`;
}

/**
 * Time ratios (current ÷ baseline) as a speedup readers can compare: "5.5×
 * faster", or a range when one operation has several scenarios.
 */
function speedupText(ratios: readonly number[]): string {
  if (ratios.every((ratio) => ratio <= 1)) {
    return `${span(
      ratios.map((ratio) => 1 / ratio),
      1,
      "×",
    )} faster`;
  }
  if (ratios.every((ratio) => ratio >= 1)) return `${span(ratios, 1, "×")} slower`;
  return `${span(ratios, 2, "×")} of baseline time`;
}

/** Size ratios (current ÷ baseline) as the share saved: "91% less". */
function reductionText(ratios: readonly number[]): string {
  const saved = ratios.map((ratio) => (1 - ratio) * 100);
  if (saved.every((percent) => percent >= 0)) return `${span(saved, 0, "%")} less`;
  if (saved.every((percent) => percent <= 0)) {
    return `${span(
      saved.map((percent) => -percent),
      0,
      "%",
    )} more`;
  }
  return `${span(ratios, 2, "×")} of baseline`;
}

/** A short hash with the full value on hover, so provenance never widens a line. */
function shortHash(hash: string): string {
  return `<code title="${html(hash)}">${html(hash.slice(0, 12))}</code>`;
}

interface HeadlineStat {
  /** Preformatted value, for example "5.5× faster". */
  readonly value: string;
  /** What was measured, in plain text. */
  readonly label: string;
}

/** Two to four headline numbers under the section's validated result. */
function evidenceHeadline(stats: readonly HeadlineStat[]): string[] {
  return [
    '<dl class="bench-stats" data-pagefind-ignore>',
    ...stats.map((stat) => `<div><dt>${html(stat.label)}</dt><dd>${html(stat.value)}</dd></div>`),
    "</dl>",
    "",
  ];
}

/** Capture provenance as label/value rows; values are trusted HTML. */
function provenanceList(rows: ReadonlyArray<readonly [label: string, value: string]>): string[] {
  return [
    '<dl class="bench-meta" data-pagefind-ignore>',
    ...rows.map(([label, value]) => `<div><dt>${html(label)}</dt><dd>${value}</dd></div>`),
    "</dl>",
    "",
  ];
}

/**
 * Detail that supports the headline but is not the result: full tables,
 * counters, checkpoints. It stays in the page (and in search) but closed.
 */
function allMeasurements(lines: readonly string[]): string[] {
  // Blank lines around the body let Markdown inside the HTML block render.
  return [
    '<details class="bench-all"><summary>All measurements</summary>',
    "",
    ...lines,
    "",
    "</details>",
    "",
  ];
}

export {
  allMeasurements,
  capitalized,
  evidenceHeadline,
  formatCaptureTime,
  formatBytes,
  formatCount,
  formatMb,
  formatMs,
  formatRatio,
  formatSpeedup,
  html,
  provenanceList,
  reductionText,
  readableId,
  readableText,
  shortHash,
  speedupText,
  type HeadlineStat,
};
