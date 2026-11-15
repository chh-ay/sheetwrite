/**
 * What an engine change does to every workload, per machine: counts of
 * faster, unchanged and slower workloads, the median size of the change, one
 * lane per changed workload on an axis that starts at "as fast as before", and
 * every number on demand. A workload whose two run ranges overlap reads as
 * within noise and is listed, not drawn. A Linux | Mac | All switch shows one
 * machine or every machine side by side; a machine without a capture reads
 * "pending" and draws no mark. Like `renderPerfBars`, it returns static HTML.
 */
import { laneHtml } from "../components/figures/static.js";
import {
  ALL_MACHINES,
  MACHINE_ICONS,
  machineSwitch,
  renderMachineComparison,
} from "./machine-compare.js";
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

/** One machine's capture of the change, or why it has none yet. */
export interface ChangeMachine {
  readonly machine: PerfMachine;
  /** "Linux". */
  readonly name: string;
  /** "x86-64 · Intel Core i9-12900H". */
  readonly detail: string;
  /** "Captured 2026-11-06 · develop b029afe against 0.6.0 · Bun 1.4.4". */
  readonly note?: string;
  readonly workloads?: readonly ChangeWorkload[];
  /** Why the machine has no capture yet; set when `workloads` is absent. */
  readonly pending?: string;
}

export interface ReleaseChange {
  readonly id: string;
  /** "0.6.0". */
  readonly baseName: string;
  /** "0.7.0 engine". */
  readonly measuredName: string;
  readonly machines: readonly ChangeMachine[];
}

/** An axis shows at most this many tick labels; a longer one labels every other power of two. */
const MAX_TICKS = 7;

/** Phones list this many changed workloads, largest first; the rest open on request. */
const PHONE_ROWS = 10;

interface Judged {
  readonly workload: ChangeWorkload;
  readonly kind: PerfVerdictKind;
  readonly text: string;
  readonly change?: string;
  /** Base time over measured time: above 1 is faster. */
  readonly speedup: number;
}

function judge(change: ReleaseChange, workloads: readonly ChangeWorkload[]): Judged[] {
  return workloads
    .map((workload) => {
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
    })
    .sort((left, right) => right.speedup - left.speedup);
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
  const step = axis.high - axis.low + 1 > MAX_TICKS ? 2 : 1;
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
  const lane = laneHtml({
    label: judged.workload.label,
    scale: { kind: "log", domain: [2 ** axis.low, 2 ** axis.high] },
    origin: 1,
    gridlines: Array.from(
      { length: axis.high - axis.low + 1 },
      (_, index) => 2 ** (axis.low + index),
    ),
    series: [
      {
        key: "change",
        label: judged.workload.label,
        value: judged.speedup,
        valueText: judged.text,
        shape: judged.kind === "better" ? "circle" : "square",
        tone: judged.kind === "better" ? "accent" : "danger",
      },
    ],
  });
  return `<li class="change__row" data-verdict="${judged.kind}"><span class="change__label">${escapeHtml(judged.workload.label)}</span><span class="change__lane">${lane}</span><span class="change__verdict">${icon(judged.kind === "better" ? "arrow-down" : "arrow-up")}<b>${escapeHtml(judged.text)}</b></span></li>`;
}

function table(judged: readonly Judged[], change: ReleaseChange, machine: ChangeMachine): string {
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
  return `<table class="change__data"><caption>${escapeHtml(change.measuredName)} against ${escapeHtml(change.baseName)} on ${escapeHtml(machine.name)}, median time per workload</caption><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

/** Median of sorted values. */
function middle(sorted: readonly number[]): number {
  const half = Math.floor(sorted.length / 2);
  const upper = sorted[half] ?? Number.NaN;
  return sorted.length % 2 === 1 ? upper : ((sorted[half - 1] ?? upper) + upper) / 2;
}

/** "Median 2.5× faster (1.5× to 16.7×)": how much the changed workloads changed. */
function sizeOfChange(entries: readonly Judged[], word: "faster" | "slower"): string {
  if (entries.length === 0) return "";
  const factors = entries
    .map((entry) => (word === "faster" ? entry.speedup : 1 / entry.speedup))
    .sort((left, right) => left - right);
  const low = factors[0] ?? Number.NaN;
  const high = factors.at(-1) ?? Number.NaN;
  const range = entries.length > 1 ? ` (${formatTimes(low)} to ${formatTimes(high)})` : "";
  return `Median <b>${formatTimes(middle(factors))} ${word}</b>${range} across the ${entries.length} ${word} ${entries.length === 1 ? "workload" : "workloads"}`;
}

interface MachineVerdicts {
  readonly judged: readonly Judged[];
  readonly faster: readonly Judged[];
  readonly slower: readonly Judged[];
  readonly noise: readonly Judged[];
}

function verdictsOf(change: ReleaseChange, machine: ChangeMachine): MachineVerdicts | undefined {
  if (machine.workloads === undefined) return undefined;
  const judged = judge(change, machine.workloads);
  return {
    judged,
    faster: judged.filter((entry) => entry.kind === "better"),
    slower: judged.filter((entry) => entry.kind === "worse"),
    noise: judged.filter((entry) => entry.kind !== "better" && entry.kind !== "worse"),
  };
}

function counts(verdicts: MachineVerdicts): string {
  return `<ul class="change__counts">${(
    [
      ["better", verdicts.faster.length, "faster"],
      ["noise", verdicts.noise.length, "within noise"],
      ["worse", verdicts.slower.length, "slower"],
    ] as const
  )
    .map(
      ([kind, count, words]) =>
        `<li data-verdict="${kind}"${count === 0 ? " data-zero" : ""}><b>${count}</b><span>${words}</span></li>`,
    )
    .join("")}</ul>`;
}

function sizes(verdicts: MachineVerdicts): string {
  return (
    [
      ["better", sizeOfChange(verdicts.faster, "faster")],
      ["worse", sizeOfChange(verdicts.slower, "slower")],
    ] as const
  )
    .filter(([, text]) => text !== "")
    .map(([kind, text]) => `<p class="change__size" data-verdict="${kind}">${text}</p>`)
    .join("");
}

function machinePanel(change: ReleaseChange, machine: ChangeMachine, icon: PerfIconMarkup): string {
  const heading = `<p class="change__machine">${icon(MACHINE_ICONS[machine.machine])}<b>${escapeHtml(machine.name)}</b><span class="change__detail">${escapeHtml(machine.detail)}</span>${machine.note === undefined ? "" : `<span class="change__note">${escapeHtml(machine.note)}</span>`}</p>`;
  const verdicts = verdictsOf(change, machine);
  if (verdicts === undefined) {
    return `<section class="change__panel" data-machine="${machine.machine}" aria-label="${escapeHtml(machine.name)}">${heading}<p class="change__pending">${escapeHtml(machine.pending ?? "Not measured yet.")}</p></section>`;
  }
  const { judged, faster, slower, noise } = verdicts;
  const changed = [...faster, ...slower];
  const axis = changeAxis(changed);
  const direction =
    slower.length > 0 ? "left of 1× is slower, right is faster" : "right of 1× is faster";
  const overflow = changed.length - PHONE_ROWS;
  const id = `${change.id}-${machine.machine}`;
  return [
    `<section class="change__panel" data-machine="${machine.machine}" aria-label="${escapeHtml(machine.name)}" style="--change-steps:${axis.high - axis.low}">`,
    heading,
    counts(verdicts),
    sizes(verdicts),
    changed.length === 0
      ? ""
      : `<div class="change__overview"><p class="change__axis-title">Speedup against ${escapeHtml(change.baseName)} for each workload that changed, log scale: ${direction}. Workloads whose run ranges overlap are within noise, listed below.</p><div class="change__axis" aria-hidden="true"><span class="change__ticks">${axisTicks(axis)}</span></div>${
          // Phones show the largest changes first; the rest open on request.
          overflow > 0 ? `<input type="checkbox" class="change__toggle" id="${id}-all">` : ""
        }<ul class="change__rows">${changed.map((entry) => dotRow(entry, axis, icon)).join("")}</ul>${
          overflow > 0
            ? `<label class="change__toggle-label" for="${id}-all"><span data-closed>Show ${overflow} more ${overflow === 1 ? "workload" : "workloads"}</span><span data-open>Show the first ${PHONE_ROWS} only</span></label>`
            : ""
        }</div>`,
    noise.length === 0
      ? ""
      : `<details class="change__more"><summary>${noise.length} ${noise.length === 1 ? "workload" : "workloads"} within noise</summary><p class="change__noise">${noise.map((entry) => escapeHtml(entry.workload.label)).join(" · ")}</p></details>`,
    `<details class="change__more"><summary>Show all numbers</summary><div class="change__table" tabindex="0" role="region" aria-label="${escapeHtml(change.measuredName)} against ${escapeHtml(change.baseName)} on ${escapeHtml(machine.name)}, table">${table(judged, change, machine)}</div></details>`,
    "</section>",
  ].join("");
}

/** Every machine side by side: counts and median lines per machine, then a mark per machine per workload. */
function allPanel(change: ReleaseChange, icon: PerfIconMarkup): string {
  const perMachine = change.machines.map((machine) => ({
    machine,
    verdicts: verdictsOf(change, machine),
  }));
  const columns = perMachine
    .map(
      ({ machine, verdicts }) =>
        `<div class="change__column" data-machine="${machine.machine}"><p class="change__machine">${icon(MACHINE_ICONS[machine.machine])}<b>${escapeHtml(machine.name)}</b></p>${
          verdicts === undefined
            ? `<p class="change__pending">${escapeHtml(machine.pending ?? "Not measured yet.")}</p>`
            : `${counts(verdicts)}${sizes(verdicts)}`
        }</div>`,
    )
    .join("");
  const order = perMachine.find(({ verdicts }) => verdicts !== undefined)?.verdicts?.judged ?? [];
  const labels = new Map(order.map((entry) => [entry.workload.id, entry.workload.label] as const));
  for (const { machine } of perMachine) {
    for (const workload of machine.workloads ?? []) labels.set(workload.id, workload.label);
  }
  const allRows = [...labels].map(([id, label]) => ({
    label,
    results: Object.fromEntries(
      perMachine.map(({ machine, verdicts }) => {
        const entry = verdicts?.judged.find((judged) => judged.workload.id === id);
        return [
          machine.machine,
          entry === undefined
            ? { pending: verdicts === undefined ? "pending" : "no result" }
            : { ratio: entry.speedup, text: entry.text, noise: entry.kind === "noise" },
        ];
      }),
    ),
  }));
  // A row is drawn when some machine measured a change; rows within noise everywhere are listed.
  const changed = (entry: (typeof allRows)[number]) =>
    Object.values(entry.results).some((result) => "ratio" in result && !result.noise);
  const rows = allRows.filter(changed);
  const quiet = allRows.filter((entry) => !changed(entry));
  return `<section class="change__panel" data-machine="${ALL_MACHINES}" aria-label="Every machine"><div class="change__columns">${columns}</div>${renderMachineComparison(
    {
      id: `${change.id}-all`,
      measure: `Times faster than ${change.baseName}`,
      parity: `as fast as ${change.baseName}`,
      rowHeader: "Workload",
      machines: change.machines.map((machine) => ({
        machine: machine.machine,
        name: machine.name,
        // A pending machine's reason is already in its column above.
        detail:
          machine.workloads === undefined
            ? `${machine.detail} · pending`
            : `${machine.detail} · ${machine.note ?? ""}`,
      })),
      rows,
      quiet: {
        summary: `${quiet.length} ${quiet.length === 1 ? "workload" : "workloads"} within noise on every measured machine`,
        rows: quiet,
      },
    },
    icon,
  )}</section>`;
}

/** The change as HTML: a machine switch over each machine's panel and one for all of them. */
export function renderReleaseChange(change: ReleaseChange, icon: PerfIconMarkup): string {
  const switched = change.machines.length > 1;
  return [
    `<figure class="change" aria-labelledby="${change.id}-title" data-pagefind-ignore>`,
    `<p class="change__title" id="${change.id}-title">${escapeHtml(change.measuredName)} against ${escapeHtml(change.baseName)}: median time per workload</p>`,
    switched
      ? machineSwitch(
          {
            id: change.id,
            label: `Machine for the ${change.measuredName} against ${change.baseName}`,
            machines: change.machines,
          },
          icon,
        )
      : "",
    ...change.machines.map((machine) => machinePanel(change, machine, icon)),
    switched ? allPanel(change, icon) : "",
    "</figure>",
  ].join("");
}
