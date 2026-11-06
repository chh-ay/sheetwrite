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
  formatTimes,
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

/** The axis spans at least ½× to 2×, so a 1.05× change does not fill the lane. */
const MIN_AXIS_RATIO = 2;

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

/** Ticks at 1× and at powers of two either side, labelled by direction. */
function axisTicks(span: number, baseName: string): Array<{ at: number; label: string }> {
  const slower: Array<{ at: number; label: string }> = [];
  const faster: Array<{ at: number; label: string }> = [];
  for (let ratio = 2; ratio <= span; ratio *= 2) {
    slower.unshift({ at: -Math.log2(ratio), label: `${formatTimes(ratio)} slower` });
    faster.push({ at: Math.log2(ratio), label: `${formatTimes(ratio)} faster` });
  }
  return [...slower, { at: 0, label: `as fast as ${baseName}` }, ...faster];
}

function position(speedup: number, halfSpan: number): number {
  const clamped = Math.max(-halfSpan, Math.min(halfSpan, Math.log2(speedup)));
  return 50 + (clamped / halfSpan) * 50;
}

function dotRow(judged: Judged, halfSpan: number, icon: PerfIconMarkup): string {
  const at = position(judged.speedup, halfSpan);
  const from = Math.min(50, at);
  const width = Math.abs(at - 50);
  return `<li class="change__row" data-verdict="${judged.kind}"><span class="change__label">${escapeHtml(judged.workload.label)}</span><span class="change__lane" aria-hidden="true"><i class="change__stem" style="left:${from.toFixed(2)}%;width:${width.toFixed(2)}%"></i><i class="change__dot" style="left:${at.toFixed(2)}%"></i></span><span class="change__verdict">${icon(judged.kind === "better" ? "arrow-down" : "arrow-up")}<b>${escapeHtml(judged.text)}</b></span></li>`;
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
  const largest = Math.max(
    MIN_AXIS_RATIO,
    ...changed.map((entry) => Math.max(entry.speedup, 1 / entry.speedup)),
  );
  const span = 2 ** Math.ceil(Math.log2(largest));
  const halfSpan = Math.log2(span);
  const ticks = axisTicks(span, change.baseName)
    .map(
      (tick) =>
        `<span style="left:${(50 + (tick.at / halfSpan) * 50).toFixed(2)}%"${tick.at === 0 ? ' data-centre=""' : ""}>${escapeHtml(tick.label)}</span>`,
    )
    .join("");
  const counts = [
    ["better", faster.length, "faster"],
    ["noise", noise.length, "within noise"],
    ["worse", slower.length, "slower"],
  ] as const;
  const pending = (change.pending ?? [])
    .map((line) => `<p class="change__pending">${escapeHtml(line)}</p>`)
    .join("");
  return [
    `<figure class="change" aria-labelledby="${change.id}-title" data-pagefind-ignore style="--change-steps:${2 * halfSpan}">`,
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
      : `<div class="change__overview"><p class="change__axis-title">Each dot is one workload's speedup, on a log scale centred on ${escapeHtml(change.baseName)}. Workloads whose run ranges overlap are within noise and listed below.</p><div class="change__axis" aria-hidden="true"><span class="change__ticks">${ticks}</span></div><ul class="change__rows">${changed.map((entry) => dotRow(entry, halfSpan, icon)).join("")}</ul></div>`,
    noise.length === 0
      ? ""
      : `<details class="change__more"><summary>${noise.length} workloads within noise</summary><p class="change__noise">${noise.map((entry) => escapeHtml(entry.workload.label)).join(" · ")}</p></details>`,
    `<details class="change__more"><summary>Show all numbers</summary><div class="change__table" tabindex="0" role="region" aria-label="${escapeHtml(change.measuredName)} against ${escapeHtml(change.baseName)}, table">${table(judged, change)}</div></details>`,
    "</figure>",
  ].join("");
}
