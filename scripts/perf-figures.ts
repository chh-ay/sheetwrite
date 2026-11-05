/**
 * Performance bars for the generated pages: the shared renderer with the
 * sprite icons inlined, and the machine sections every capture belongs to.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { inlineIcon } from "../docs/src/icons/inline-icon.js";
import {
  type PerfFigure,
  type PerfGroup,
  type PerfMachine,
  type PerfRow,
  type PerfStat,
  renderPerfBars,
} from "../docs/src/lib/perf-bars.js";
import { repositoryRoot } from "./docs-shared.js";
import { formatCaptureTime } from "./evidence-format.js";

/** Bars as static HTML for a Markdown page; icons are inlined, so the figure needs no JavaScript. */
export function perfFigure(figure: PerfFigure): string {
  return renderPerfBars(figure, (name) => inlineIcon(name));
}

/** Where each machine's release capture lives, and what the pages call it. */
export interface CaptureMachine {
  readonly machine: PerfMachine;
  /** Results directory, relative to the repository root. */
  readonly directory: string;
  /** "Linux · x86-64 · 12th Gen Intel Core i9-12900H". */
  readonly label: string;
}

/** The Linux release machine's captures are the committed `bench/results` evidence. */
const LINUX_DIRECTORY = "bench/results";
/** Other machines capture the same release with `bench:release:machine`. */
const MAC_DIRECTORY = "bench/results/machines/mac";

interface MachineCaptureManifest {
  readonly protocol: string;
  readonly machine: { readonly cpu: string; readonly os: string; readonly arch: string };
}

interface CaptureScopeReceipt {
  readonly metadata?: { readonly cpu?: string; readonly kernel?: string };
}

/** "12th Gen Intel(R) Core(TM) i9-12900H" reads "12th Gen Intel Core i9-12900H". */
function cpuName(cpu: string): string {
  return cpu.replaceAll(/\((R|TM)\)/gu, "").replaceAll(/\s+/gu, " ").trim();
}

function readJson<T>(relativePath: string): T | undefined {
  const path = join(repositoryRoot, relativePath);
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : undefined;
}

/**
 * The machines with release captures, Linux first. Linux names its CPU in the
 * capture receipts; another machine names it in the `capture.json` that
 * `bench:release:machine` writes.
 */
export function captureMachines(): readonly CaptureMachine[] {
  const machines: CaptureMachine[] = [];
  const linuxCpu = readJson<CaptureScopeReceipt>(`${LINUX_DIRECTORY}/capture-runs/render-scale.json`)
    ?.metadata?.cpu;
  machines.push({
    machine: "linux",
    directory: LINUX_DIRECTORY,
    label: `Linux · x86-64${linuxCpu ? ` · ${cpuName(linuxCpu)}` : ""}`,
  });
  const mac = readJson<MachineCaptureManifest>(`${MAC_DIRECTORY}/capture.json`);
  if (mac !== undefined) {
    if (mac.protocol !== "sheetwrite-machine-capture-v1") {
      throw new Error(`${MAC_DIRECTORY}/capture.json is not a machine capture manifest`);
    }
    machines.push({
      machine: "mac",
      directory: MAC_DIRECTORY,
      label: `Mac · Apple Silicon · ${cpuName(mac.machine.cpu)}`,
    });
  }
  return machines;
}

/** A capture validated on one machine. */
export interface MachineEvidence<T> {
  readonly machine: CaptureMachine;
  readonly evidence: T;
  readonly source: string;
}

/** One group per machine that has evidence, each with its own rows. */
export function machineGroups<T>(
  captures: ReadonlyArray<MachineEvidence<T>>,
  rows: (evidence: T) => readonly PerfRow[],
  note?: (evidence: T) => string,
): PerfGroup[] {
  return captures.map(({ machine, evidence }) => ({
    label: machine.label,
    machine: machine.machine,
    ...(note ? { note: note(evidence) } : {}),
    rows: rows(evidence),
  }));
}

/** A run summary with its fastest run, when the capture recorded one. */
export interface RunStat {
  readonly median: number;
  readonly p95: number;
  readonly min?: number;
}

export const FASTEST_TO_P95 = "Fastest to p95 run";

/** The median, banded from the fastest run (or the median) to the p95 run. */
export function fastestToP95(stat: RunStat): PerfStat {
  const low = stat.min !== undefined && Number.isFinite(stat.min) ? stat.min : stat.median;
  return {
    value: stat.median,
    spread: [Math.min(low, stat.median), Math.max(stat.p95, stat.median)],
  };
}

/** "Captured 2026-10-28 17:15 UTC · commit ac4ab63", under each machine's heading. */
export function captureNote(meta: { readonly timestamp: string; readonly commit: string }): string {
  return `Captured ${formatCaptureTime(meta.timestamp)} UTC · commit ${meta.commit.slice(0, 7)}`;
}
