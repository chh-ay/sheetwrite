/**
 * What an engine change does to every workload, on one machine: counts of
 * faster, unchanged and slower workloads, one dot per changed workload on an
 * axis centred on "as fast as before", and every number on demand. A workload
 * whose two run ranges overlap reads as within noise and is listed, not drawn.
 * Like `renderPerfBars`, it returns static HTML and needs no script.
 */
import {
  escapeHtml,
  formatTime,
  type PerfIconMarkup,
  type PerfMachine,
  type PerfStat,
  perfVerdict,
  type PerfVerdictKind,
} from "./perf-bars.js";

export interface ChangeWorkload {
  readonly id: string;
  /** "Wide fan-out edit · 100,000 cells". */
  readonly label: string;
  readonly base: PerfStat;
  readonly measured: PerfStat;
}

export interface ReleaseChange {
  readonly id: string;
  /** "0.6.0". */
  readonly baseName: string;
  /** "develop". */
  readonly measuredName: string;
  readonly machine: PerfMachine;
  /** "Linux · x86-64 · Intel Core i9-12900H". */
  readonly machineLabel: string;
  /** "Captured 2026-11-06 · develop 00694381 against 0.6.0 · Bun 1.4.4". */
  readonly note: string;
  /** Machines whose capture of this change does not exist yet, with why. */
  readonly pending?: readonly string[];
  readonly workloads: readonly ChangeWorkload[];
}

const MACHINE_ICONS: Readonly<Record<PerfMachine, "server" | "laptop">> = {
  linux: "server",
  mac: "laptop",
};

/** An axis shows at most this many tick labels; a longer one labels every other power of two. */
const MAX_TICKS = 7;

interface Judged {
  readonly workload: ChangeWorkload;
  readonly kind: PerfVerdictKind;
  readonly text: string;
  readonly change?: string;
  /** Base time over measured time: above 1 is faster. */
  readonly speedup: number;
}

function judge(change: ReleaseChange): Judged[] {
  return change.workloads.map((workload) => {
    const verdict = perfVerdict(
      {
        label: workload.label,
        bars: [
          { label: change.baseName, role: "base", stat: workload.base },
          { label: change.measuredName, role: "measured", stat: workload.measured },
        ],
      },
      { id: change.id, title: "", unit: "ms", scale: "log", rowHeader: "", groups: [] },
    );
    return {
      workload,
      kind: verdict?.kind ?? "noise",
      text: verdict?.text ?? "Within noise",
      ...(verdict?.change ? { change: verdict.change } : {}),
      speedup: workload.base.value / workload.measured.value,
    };
  });
}

/** The axis in powers of two: from 1× (or the slowest workload) to the fastest. */
interface ChangeAxis {
  readonly low: number;
  readonly high: number;
}

function changeAxis(changed: readonly Judged[]): ChangeAxis {
  const exponents = changed.map((entry) => Math.log2(entry.speedup));
  return {
    low: Math.min(0, Math.floor(Math.min(0, ...exponents))),
    high: Math.max(1, Math.ceil(Math.max(0, ...exponents))),
  };
}

function position(speedup: number, axis: ChangeAxis): number {
  const exponent = Math.max(axis.low, Math.min(axis.high, Math.log2(speedup)));
  return ((exponent - axis.low) / (axis.high - axis.low)) * 100;
}

/** "1/2×", "1×", "4×": a power of two as a ratio label. */
function ratioLabel(exponent: number): string {
  return exponent >= 0 ? `${(2 ** exponent).toLocaleString("en-US")}×` : `1/${2 ** -exponent}×`;
}

function axisTicks(axis: ChangeAxis): string {
  const count = axis.high - axis.low + 1;
  const step = count > MAX_TICKS ? 2 : 1;
  const ticks: string[] = [];
  for (let exponent = axis.low; exponent <= axis.high; exponent += 1) {
    // Every other power of two is labelled on a long axis; 1× always is.
    if (exponent !== 0 && exponent % step !== 0) continue;
    ticks.push(
      `<span style="left:${position(2 ** exponent, axis).toFixed(2)}%"${exponent === 0 ? ' data-centre=""' : ""}>${ratioLabel(exponent)}</span>`,
    );
  }
  return ticks.join("");
}

function dotRow(judged: Judged, axis: ChangeAxis, icon: PerfIconMarkup): string {
  const at = position(judged.speedup, axis);
  const origin = position(1, axis);
  const from = Math.min(origin, at);
  const width = Math.abs(at - origin);
  return `<li class="change__row" data-verdict="${judged.kind}"><span class="change__label">${escapeHtml(judged.workload.label)}</span><span class="change__lane" aria-hidden="true" style="--change-origin:${origin.toFixed(2)}%"><i class="change__stem" style="left:${from.toFixed(2)}%;width:${width.toFixed(2)}%"></i><i class="change__dot" style="left:${at.toFixed(2)}%"></i></span><span class="change__verdict">${icon(judged.kind === "better" ? "arrow-down" : "arrow-up")}<b>${escapeHtml(judged.text)}</b></span></li>`;
}

function table(judged: readonly Judged[], change: ReleaseChange): string {
  const head = [
    "Workload",
    `${change.baseName} median`,
    `${change.measuredName} median`,
    "Change",
    "Verdict",
  ]
    .map((column) => `<th scope="col">${escapeHtml(column)}</th>`)
    .join("");
  const rows = judged
    .map(
      ({ workload, text, change: percent }) =>
        `<tr><th scope="row">${escapeHtml(workload.label)}</th><td>${formatTime(workload.base.value)}</td><td><b>${formatTime(workload.measured.value)}</b></td><td>${percent ?? ""}</td><td>${escapeHtml(text)}</td></tr>`,
    )
    .join("");
  return `<table class="change__data"><caption>${escapeHtml(change.measuredName)} against ${escapeHtml(change.baseName)}, median time per workload</caption><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

/** The change as HTML: counts, the changed workloads on a centred axis, and every number. */
export function renderReleaseChange(change: ReleaseChange, icon: PerfIconMarkup): string {
  const judged = judge(change).sort((left, right) => right.speedup - left.speedup);
  const faster = judged.filter((entry) => entry.kind === "better");
  const slower = judged.filter((entry) => entry.kind === "worse");
  const noise = judged.filter((entry) => entry.kind !== "better" && entry.kind !== "worse");
  const changed = [...faster, ...slower];
  const axis = changeAxis(changed);
  const ticks = axisTicks(axis);
  const direction =
    slower.length > 0 ? "left of 1× is slower, right is faster" : "right of 1× is faster";
  const counts = [
    ["better", faster.length, "faster"],
    ["noise", noise.length, "within noise"],
    ["worse", slower.length, "slower"],
  ] as const;
  const pending = (change.pending ?? [])
    .map((line) => `<p class="change__pending">${escapeHtml(line)}</p>`)
    .join("");
  return [
    `<figure class="change" aria-labelledby="${change.id}-title" data-pagefind-ignore style="--change-steps:${axis.high - axis.low}">`,
    `<p class="change__title" id="${change.id}-title">${escapeHtml(change.measuredName)} against ${escapeHtml(change.baseName)}: median time per workload</p>`,
    `<p class="change__machine">${icon(MACHINE_ICONS[change.machine])}<b>${escapeHtml(change.machineLabel)}</b><span>${escapeHtml(change.note)}</span></p>`,
    pending,
    `<ul class="change__counts">${counts
      .map(
        ([kind, count, words]) =>
          `<li data-verdict="${kind}"><b>${count}</b><span>${words}</span></li>`,
      )
      .join("")}</ul>`,
    changed.length === 0
      ? ""
      : `<div class="change__overview"><p class="change__axis-title">Speedup against ${escapeHtml(change.baseName)} for each workload that changed, log scale: ${direction}. Workloads whose run ranges overlap are within noise, listed below.</p><div class="change__axis" aria-hidden="true"><span class="change__ticks">${ticks}</span></div><ul class="change__rows">${changed.map((entry) => dotRow(entry, axis, icon)).join("")}</ul></div>`,
    noise.length === 0
      ? ""
      : `<details class="change__more"><summary>${noise.length} ${noise.length === 1 ? "workload" : "workloads"} within noise</summary><p class="change__noise">${noise.map((entry) => escapeHtml(entry.workload.label)).join(" · ")}</p></details>`,
    `<details class="change__more"><summary>Show all numbers</summary><div class="change__table" tabindex="0" role="region" aria-label="${escapeHtml(change.measuredName)} against ${escapeHtml(change.baseName)}, table">${table(judged, change)}</div></details>`,
    "</figure>",
  ].join("");
}
