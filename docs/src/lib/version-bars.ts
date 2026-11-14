/**
 * The release comparison: how a release compares with the two before it, on
 * the measures bench/src/version-comparison.ts records. Each measure is a row
 * with one group of bars per engine, one bar per version, the newest in the
 * accent colour, the value at the bar's end, and its change against the
 * previous release. Every measure is lower-is-better. Bars start at zero on
 * one linear scale per row, shared by both engines, so their lengths compare
 * honestly. Machines sit behind the shared machine switch: their numbers are
 * never compared with each other.
 *
 * A page writes `<version-compare></version-compare>`; the docs build renders
 * it from the committed reports, so a rerun of the comparison on the release
 * commit updates the figure. The figure is HTML and CSS only. The visual rows
 * are hidden from screen readers; the table under them carries the same
 * numbers.
 */
import { readFileSync } from "node:fs";

import { machineSwitch } from "./machine-compare.js";
import {
  escapeHtml,
  formatSize,
  formatTime,
  type PerfIconMarkup,
  type PerfMachine,
} from "./perf-bars.js";

/** The report protocol this renderer reads. */
const PROTOCOL = "sheetwrite-version-comparison-v1";

type Engine = "default" | "full";
const ENGINES: readonly Engine[] = ["default", "full"];
const ENGINE_NAMES: Readonly<Record<Engine, string>> = {
  default: "Default engine",
  full: "Full engine",
};

/** One engine's medians for one version, as the report's `summary` holds them. */
interface EngineSummary {
  readonly recalcGeomeanMs: number;
  readonly retainedMiB: number;
  readonly peakMiB: number;
  readonly importMs: number;
  readonly exportMs: number;
}

/** The report's noise keys: the largest run-to-run variation of each sampled measure. */
type NoiseKey = "recalcGeomean" | "retained" | "peak" | "import" | "export";

/** The parts of a version-comparison report the figure reads. */
export interface VersionReport {
  readonly protocol: string;
  readonly machine: string;
  readonly host: { readonly cpuModel: string };
  readonly rounds: number;
  readonly commits: Readonly<Record<string, string>>;
  readonly method: { readonly rows: readonly unknown[] };
  readonly versions: Readonly<
    Record<
      string,
      { readonly sizes: Readonly<Record<Engine, { readonly totalBrotliBytes: number }>> }
    >
  >;
  readonly summary: Readonly<Record<string, Readonly<Record<Engine, EngineSummary>>>>;
  readonly aaSpreadPercent: Readonly<Record<NoiseKey, number>>;
}

/** What a measure is: a time, a memory amount or a download size. */
type Quantity = "time" | "memory" | "size";

interface Measure {
  readonly label: string;
  readonly detail: (report: VersionReport) => string;
  readonly quantity: Quantity;
  /** The run-to-run variation that bounds noise; sizes are exact, so they have none. */
  readonly noise?: NoiseKey;
  /** The value in milliseconds or bytes. */
  readonly value: (report: VersionReport, version: string, engine: Engine) => number;
}

const MIB = 1024 ** 2;

function summaryOf(report: VersionReport, version: string, engine: Engine): EngineSummary {
  const summary = report.summary[version]?.[engine];
  if (summary === undefined) {
    throw new Error(`${report.machine}: no ${engine} summary for ${version}`);
  }
  return summary;
}

const MEASURES: readonly Measure[] = [
  {
    label: "Formula recalculation",
    detail: (report) => `Geometric mean of ${report.method.rows.length} edit workloads`,
    quantity: "time",
    noise: "recalcGeomean",
    value: (report, version, engine) => summaryOf(report, version, engine).recalcGeomeanMs,
  },
  {
    label: "Retained memory",
    detail: () => "After loading 100,000 formulas",
    quantity: "memory",
    noise: "retained",
    value: (report, version, engine) => summaryOf(report, version, engine).retainedMiB * MIB,
  },
  {
    label: "Peak memory",
    detail: () => "While loading 100,000 formulas",
    quantity: "memory",
    noise: "peak",
    value: (report, version, engine) => summaryOf(report, version, engine).peakMiB * MIB,
  },
  {
    label: "Engine download",
    detail: () => "WebAssembly and JavaScript, Brotli",
    quantity: "size",
    value: (report, version, engine) => {
      const size = report.versions[version]?.sizes[engine]?.totalBrotliBytes;
      if (size === undefined) {
        throw new Error(`${report.machine}: no ${engine} size for ${version}`);
      }
      return size;
    },
  },
  {
    label: "XLSX import",
    detail: () => "50,000 rows × 6 columns, 100,000 formulas",
    quantity: "time",
    noise: "import",
    value: (report, version, engine) => summaryOf(report, version, engine).importMs,
  },
  {
    label: "XLSX export",
    detail: () => "50,000 rows × 6 columns, 100,000 formulas",
    quantity: "time",
    noise: "export",
    value: (report, version, engine) => summaryOf(report, version, engine).exportMs,
  },
];

/** From this ratio a time change reads "2.1× faster"; below it, as a percentage. */
const RATIO_WORDING = 1.5;
/** Below this share of its row's scale a bar would vanish; it stays visible at this width. */
const MIN_FILL_PERCENT = 1;

function formatValue(value: number, quantity: Quantity): string {
  return quantity === "time" ? formatTime(value) : formatSize(value);
}

function wholePercent(fraction: number): string {
  return `${fraction < 0 ? "−" : "+"}${Math.round(Math.abs(fraction) * 100)}%`;
}

/** How a value compares with the previous release's, in words. */
export interface VersionChange {
  readonly kind: "better" | "worse" | "noise";
  readonly text: string;
}

/**
 * The change of `value` against `previous`: "2.1× faster", "−30% memory",
 * "+20% larger", or "Within noise" when the change is inside the measure's
 * run-to-run variation.
 */
export function versionChange(
  value: number,
  previous: number,
  quantity: Quantity,
  noisePercent: number | undefined,
): VersionChange {
  const fraction = value / previous - 1;
  if (fraction === 0) return { kind: "noise", text: "No change" };
  if (noisePercent !== undefined && Math.abs(fraction) * 100 <= noisePercent) {
    return { kind: "noise", text: "Within noise" };
  }
  const isLower = fraction < 0;
  const kind = isLower ? "better" : "worse";
  if (quantity === "time") {
    const ratio = isLower ? previous / value : value / previous;
    return ratio >= RATIO_WORDING
      ? { kind, text: `${ratio.toFixed(1)}× ${isLower ? "faster" : "slower"}` }
      : { kind, text: `${wholePercent(fraction)} time` };
  }
  if (quantity === "memory") return { kind, text: `${wholePercent(fraction)} memory` };
  return { kind, text: `${wholePercent(fraction)} ${isLower ? "smaller" : "larger"}` };
}

const CHANGE_ICONS = { better: "arrow-down", worse: "arrow-up", noise: "minus" } as const;

/** One machine's report, by the machine the switch names. */
export interface MachineReport {
  readonly machine: PerfMachine;
  readonly report: VersionReport;
}

/** A measure's values: per engine, per version, oldest first. */
function seriesOf(measure: Measure, report: VersionReport, versions: readonly string[]) {
  return ENGINES.map((engine) => versions.map((version) => measure.value(report, version, engine)));
}

function changeOf(measure: Measure, report: VersionReport, series: readonly number[]) {
  return versionChange(
    series.at(-1) ?? 0,
    series.at(-2) ?? 1,
    measure.quantity,
    measure.noise === undefined ? undefined : report.aaSpreadPercent[measure.noise],
  );
}

function rowMarkup(
  measure: Measure,
  report: VersionReport,
  versions: readonly string[],
  icon: PerfIconMarkup,
): string {
  const values = seriesOf(measure, report, versions);
  // One scale per row, from zero to its largest value, shared by both engines.
  const top = Math.max(...values.flat());
  const engines = ENGINES.map((engine, index) => {
    const series = values[index] ?? [];
    const change = changeOf(measure, report, series);
    const bars = versions
      .map((version, at) => {
        const value = series[at] ?? 0;
        const fill = Math.max(MIN_FILL_PERCENT, (value / top) * 100);
        const newest = at === versions.length - 1 ? " data-newest" : "";
        return (
          `<div class="version-bars__bar"${newest}>` +
          `<span class="version-bars__version">${escapeHtml(version)}</span>` +
          `<span class="version-bars__track"><i style="width:${fill.toFixed(2)}%"></i></span>` +
          `<span class="version-bars__value">${formatValue(value, measure.quantity)}</span>` +
          "</div>"
        );
      })
      .join("");
    return (
      `<div class="version-bars__engine">` +
      `<p class="version-bars__engine-name">${ENGINE_NAMES[engine]}</p>` +
      bars +
      `<p class="version-bars__change" data-change="${change.kind}">${icon(CHANGE_ICONS[change.kind])}<strong>${escapeHtml(change.text)}</strong> vs ${escapeHtml(versions.at(-2) ?? "")}</p>` +
      "</div>"
    );
  }).join("");
  return (
    `<li class="version-bars__row">` +
    `<p class="version-bars__measure"><strong>${escapeHtml(measure.label)}</strong><span>${escapeHtml(measure.detail(report))}</span></p>` +
    engines +
    "</li>"
  );
}

function tableMarkup(machines: readonly MachineReport[], versions: readonly string[]): string {
  const columns = ["Measure", "Engine", ...versions, `Change vs ${versions.at(-2) ?? ""}`];
  const head = `<thead><tr>${columns.map((column) => `<th scope="col">${escapeHtml(column)}</th>`).join("")}</tr></thead>`;
  const bodies = machines.map(({ machine, report }) => {
    const rows = MEASURES.flatMap((measure) =>
      seriesOf(measure, report, versions).map((series, index) => {
        const engine = ENGINES[index] ?? "default";
        return (
          "<tr>" +
          (index === 0
            ? `<th scope="row" rowspan="${ENGINES.length}">${escapeHtml(measure.label)}</th>`
            : "") +
          `<td>${ENGINE_NAMES[engine]}</td>` +
          series.map((value) => `<td>${formatValue(value, measure.quantity)}</td>`).join("") +
          `<td>${escapeHtml(changeOf(measure, report, series).text)}</td>` +
          "</tr>"
        );
      }),
    );
    return `<tbody data-machine="${machine}"><tr><th scope="colgroup" colspan="${columns.length}">${escapeHtml(report.machine)} · ${escapeHtml(report.host.cpuModel)}</th></tr>${rows.join("")}</tbody>`;
  });
  return (
    '<details class="perf-bars__table">' +
    "<summary>Show the numbers as a table</summary>" +
    `<div class="perf-bars__table-frame" tabindex="0" role="region" aria-label="Release comparison, table"><table class="perf-bars__data"><caption>Release comparison; lower is better on every row</caption>${head}${bodies.join("")}</table></div>` +
    "</details>"
  );
}

function shortCommit(commit: string): string {
  return /^[0-9a-f]{40}$/u.test(commit) ? commit.slice(0, 9) : commit;
}

/** The figure for the machines' reports, which must compare the same versions. */
export function renderVersionBars(
  id: string,
  machines: readonly MachineReport[],
  icon: PerfIconMarkup,
): string {
  const [first] = machines;
  if (first === undefined) throw new Error("The release comparison needs at least one report");
  const versions = Object.keys(first.report.summary);
  for (const { report } of machines) {
    if (report.protocol !== PROTOCOL) {
      throw new Error(
        `${report.machine}: report protocol ${report.protocol}, expected ${PROTOCOL}`,
      );
    }
    if (Object.keys(report.summary).join() !== versions.join()) {
      throw new Error(`${report.machine} compares ${Object.keys(report.summary)}, not ${versions}`);
    }
  }
  const newest = versions.at(-1) ?? "";
  const older = versions.slice(0, -1).map(escapeHtml).join(" and ");
  const legend = versions
    .map(
      (version) =>
        `<span class="version-bars__key"${version === newest ? " data-newest" : ""}><i></i>${escapeHtml(version)}</span>`,
    )
    .join("");
  const commits = machines
    .map(({ report }) => `${report.machine} at ${shortCommit(report.commits[newest] ?? "")}`)
    .join(", ");
  const sections = machines
    .map(
      ({ machine, report }) =>
        `<section class="version-bars__machine" data-machine="${machine}"><ul class="version-bars__rows">${MEASURES.map((measure) => rowMarkup(measure, report, versions, icon)).join("")}</ul></section>`,
    )
    .join("");
  return [
    `<figure class="version-bars" aria-labelledby="${id}-title" data-pagefind-ignore>`,
    `<div class="version-bars__head"><p class="version-bars__title" id="${id}-title">How ${escapeHtml(newest)} compares with ${older}</p><p class="version-bars__legend">${legend}<span class="version-bars__lower">Shorter is better on every row</span></p></div>`,
    machines.length > 1
      ? machineSwitch(
          {
            id,
            label: "Machine for the release comparison",
            machines: machines.map(({ machine, report }) => ({ machine, name: report.machine })),
            all: false,
          },
          icon,
        )
      : "",
    // The rows repeat the table below; screen readers read the table.
    `<div class="version-bars__charts" aria-hidden="true">${sections}</div>`,
    tableMarkup(machines, versions),
    `<figcaption class="version-bars__caption">Medians of ${first.report.rounds} runs on each machine: the published ${older} packages against ${escapeHtml(newest)} (${escapeHtml(commits)}). Bars start at zero; each row has its own scale. A change smaller than the measure's run-to-run variation reads "Within noise". Compare within a machine, not across machines.</figcaption>`,
    "</figure>",
  ].join("\n");
}

/** The committed reports the figure draws, by machine. */
const REPORTS: readonly { readonly machine: PerfMachine; readonly file: string }[] = [
  { machine: "linux", file: "linux.json" },
  { machine: "mac", file: "mac.json" },
];
const REPORT_DIRECTORY = new URL("../../../bench/results/version-comparison/", import.meta.url);

/** True when `html` is a `<version-compare>` block. */
export function isVersionCompare(html: string): boolean {
  return html.trimStart().startsWith("<version-compare");
}

/** The release comparison from the committed reports. */
export function renderVersionCompare(id: string, icon: PerfIconMarkup): string {
  const machines = REPORTS.map(({ machine, file }) => ({
    machine,
    report: JSON.parse(readFileSync(new URL(file, REPORT_DIRECTORY), "utf8")) as VersionReport,
  }));
  return renderVersionBars(id, machines, icon);
}
