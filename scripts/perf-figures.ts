/**
 * Performance bars for the generated pages: the shared renderer with the
 * sprite icons inlined, and the machine sections every capture belongs to.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { MACHINE_CAPTURE_SUITES } from "../bench/src/machine-capture.js";
import { inlineIcon } from "../docs/src/icons/inline-icon.js";
import {
  type PerfFigure,
  type PerfGroup,
  type PerfMachine,
  type PerfRow,
  type PerfStat,
  renderPerfBars,
} from "../docs/src/lib/perf-bars.js";
import { type ReleaseChange, renderReleaseChange } from "../docs/src/lib/release-change.js";
import { renderSpeedupStory, type SpeedupStory } from "../docs/src/lib/speedup-story.js";
import { repositoryRoot } from "./docs-shared.js";
import { formatCaptureTime, html, provenanceList, shortHash } from "./evidence-format.js";

/** The markers around a Performance page's figure; see `extractFigureAssets`. */
const FIGURE_START = "<!--perf-figure:";
const FIGURE_END = "<!--/perf-figure-->";

/**
 * A figure for a Performance page, marked so `extractFigureAssets` moves it
 * out of the page into its own static HTML asset: the page's script then
 * carries a placeholder, not the figure.
 */
function pageFigure(id: string, markup: string): string {
  return `${FIGURE_START}${id}-->\n${markup}\n${FIGURE_END}`;
}

/** Bars as static HTML for a Performance page; icons are inlined, so the figure needs no JavaScript. */
export function perfFigure(figure: PerfFigure): string {
  return pageFigure(
    figure.id,
    renderPerfBars(figure, (name) => inlineIcon(name)),
  );
}

/** The speed story as static HTML for a Performance page. */
export function speedStory(story: SpeedupStory): string {
  return pageFigure(
    story.id,
    renderSpeedupStory(story, (name) => inlineIcon(name)),
  );
}

/** An engine change across every workload, as static HTML for a Performance page. */
export function releaseChange(change: ReleaseChange): string {
  return pageFigure(
    change.id,
    renderReleaseChange(change, (name) => inlineIcon(name)),
  );
}

/** A figure moved out of its page: where the page refers to it, and its markup. */
export interface FigureAsset {
  /** "render--render-scale-time": the page's slug and the figure's id. */
  readonly name: string;
  readonly html: string;
}

/**
 * Moves every marked figure out of a Performance page. Each becomes a
 * `<PerfFigure>` placeholder, which the docs build turns into a component that
 * shows the figure's static HTML asset (docs/src/lib/perf-figure-markup.ts).
 */
export function extractFigureAssets(
  slug: string,
  content: string,
): { content: string; assets: FigureAsset[] } {
  const assets: FigureAsset[] = [];
  const pattern = new RegExp(`${FIGURE_START}([\\w-]+)-->\\n([\\s\\S]*?)\\n${FIGURE_END}`, "gu");
  const rest = content.replace(pattern, (_match, id: string, markup: string) => {
    const name = `${slug}--${id}`;
    if (assets.some((asset) => asset.name === name)) {
      throw new Error(`two figures on performance/${slug} share the id ${id}`);
    }
    assets.push({ name, html: markup });
    // The open tag alone on its line starts an HTML block, so the figure is not wrapped in a paragraph.
    return `<PerfFigure name="${name}">\n</PerfFigure>`;
  });
  if (rest.includes(FIGURE_START)) throw new Error(`performance/${slug} has an unclosed figure`);
  return { content: rest, assets };
}

/** "Linux · x86-64 · Intel Core i9-12900H" splits into "Linux" and the rest. */
export function machineName(machine: CaptureMachine): { name: string; detail: string } {
  const [name = machine.label, ...rest] = machine.label.split(" · ");
  return { name, detail: rest.join(" · ") };
}

/** Where each machine's release capture lives, and what the pages call it. */
export interface CaptureMachine {
  readonly machine: PerfMachine;
  /** Results directory, relative to the repository root. */
  readonly directory: string;
  /** "Linux · x86-64 · 12th Gen Intel Core i9-12900H". */
  readonly label: string;
  /** What `bench:release:machine` recorded; the Linux release machine has none. */
  readonly manifest?: MachineCaptureManifest;
}

/** The Linux release machine's captures are the committed `bench/results` evidence. */
const LINUX_DIRECTORY = "bench/results";
/** Other machines capture the same release with `bench:release:machine`. */
const MAC_DIRECTORY = "bench/results/machines/mac";

/** `capture.json`, as `bench/src/machine-capture.ts` writes it. */
interface MachineCaptureManifest {
  readonly protocol: string;
  readonly machine: {
    readonly cpu: string;
    readonly os: string;
    readonly arch: string;
    readonly logicalCores: number;
    readonly memoryBytes: number;
    readonly bun: string;
  };
  readonly release: string;
  readonly commit: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly command: string;
  /** Suites that did not complete on this machine, with the error each printed. */
  readonly failed?: ReadonlyArray<{ readonly suite: string; readonly error: string }>;
}

/** Why `artifact` is missing from a machine capture, when its suite did not complete. */
export function machineFailure(machine: CaptureMachine, artifact: string): string | undefined {
  const suite = MACHINE_CAPTURE_SUITES.find((entry) =>
    (entry.artifacts as readonly string[]).includes(artifact),
  );
  const failure = machine.manifest?.failed?.find((entry) => entry.suite === suite?.name);
  return failure === undefined
    ? undefined
    : `the ${failure.suite} suite did not complete on this machine: ${failure.error}`;
}

interface CaptureScopeReceipt {
  readonly metadata?: { readonly cpu?: string; readonly kernel?: string };
}

/** "12th Gen Intel(R) Core(TM) i9-12900H" reads "Intel Core i9-12900H". */
function cpuName(cpu: string): string {
  return cpu
    .replaceAll(/\((R|TM)\)/gu, "")
    .replace(/^\d+(st|nd|rd|th) Gen /u, "")
    .replaceAll(/\s+/gu, " ")
    .trim();
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
  const linuxCpu = readJson<CaptureScopeReceipt>(
    `${LINUX_DIRECTORY}/capture-runs/render-scale.json`,
  )?.metadata?.cpu;
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
      // "Apple M5 Pro" under "Apple Silicon" names the maker once: "M5 Pro".
      label: `Mac · Apple Silicon · ${cpuName(mac.machine.cpu).replace(/^Apple /u, "")}`,
      manifest: mac,
    });
  }
  return machines;
}

const GIB = 1024 ** 3;

/** How each machine other than the release machine was captured, for the Capture section. */
export function machineCaptureLines(machines: readonly CaptureMachine[]): string[] {
  return machines.flatMap(({ label, directory, manifest }) =>
    manifest === undefined
      ? []
      : [
          `### ${label}`,
          "",
          `These captures measure release ${html(manifest.release)} on a second machine. They sit beside the release machine's results in their own groups and are never compared with them.`,
          "",
          ...provenanceList([
            ["Release", `${html(manifest.release)} · ${shortHash(manifest.commit)} clean checkout`],
            [
              "Captured",
              `${formatCaptureTime(manifest.startedAt)} → ${formatCaptureTime(manifest.finishedAt)} UTC`,
            ],
            [
              "Machine",
              `${html(manifest.machine.cpu)} · ${manifest.machine.logicalCores} cores · ${Math.round(manifest.machine.memoryBytes / GIB)} GiB · ${html(manifest.machine.os)} · Bun ${html(manifest.machine.bun)}`,
            ],
            ["Artifacts", `<code>${html(directory)}/</code>`],
          ]),
          "",
          "Reproduce with:",
          "",
          '```sh partial="needs clean, built checkouts of the release and the XLSX baseline" title="Release capture on another machine"',
          manifest.command,
          "```",
          "",
        ],
  );
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
