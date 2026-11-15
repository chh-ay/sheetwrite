/**
 * Before-and-after comparisons written in release notes. A note lists each
 * operation with its time or size in the previous and the new release:
 *
 *   <perf-compare title="Slower operations" base="0.4.0" measured="0.5.0" machine="linux">
 *   Column sum · 100,000 rows | 0.21 ms | 0.44 ms
 *   Create a 100,000-cell spill | 10.6 ms | 11.2–13.5 ms
 *   </perf-compare>
 *
 * The docs build turns the block into the shared performance bars, so release
 * notes show the same figure as the Performance pages. A value written as a
 * range ("11.2–13.5 ms") is drawn from its low end, with the range as its band.
 */
import type { PerfFigure, PerfMachine, PerfStat, PerfUnit } from "./perf-bars.js";

const BLOCK = /^<perf-compare\b([^>]*)>\n([\s\S]*?)\n<\/perf-compare>\s*$/u;
const ATTRIBUTE = /([a-z-]+)="([^"]*)"/gu;
const VALUE =
  /^(\d[\d,]*(?:\.\d+)?)(?:\s*[–-]\s*(\d[\d,]*(?:\.\d+)?))?\s*(ns|µs|ms|s|B|KB|MB|KiB|MiB|GiB)$/u;

/** Each written unit in the figure's base unit: milliseconds or bytes. */
const UNITS: Readonly<Record<string, { readonly unit: PerfUnit; readonly scale: number }>> = {
  ns: { unit: "ms", scale: 1e-6 },
  µs: { unit: "ms", scale: 1e-3 },
  ms: { unit: "ms", scale: 1 },
  s: { unit: "ms", scale: 1000 },
  B: { unit: "bytes", scale: 1 },
  KB: { unit: "bytes", scale: 1000 },
  MB: { unit: "bytes", scale: 1000 ** 2 },
  KiB: { unit: "bytes", scale: 1024 },
  MiB: { unit: "bytes", scale: 1024 ** 2 },
  GiB: { unit: "bytes", scale: 1024 ** 3 },
};

const MACHINE_LABELS: Readonly<Record<PerfMachine, string>> = {
  linux: "Linux · x86-64 · release machine",
  mac: "Mac · Apple Silicon",
};

function parseValue(text: string, where: string): { unit: PerfUnit; stat: PerfStat } {
  const match = VALUE.exec(text.trim());
  const unit = match?.[3] === undefined ? undefined : UNITS[match[3]];
  if (match === null || unit === undefined) {
    throw new Error(
      `<perf-compare> ${where}: "${text}" is not a value such as "4.2 ms" or "310 MiB"`,
    );
  }
  const low = Number(match[1]?.replaceAll(",", "")) * unit.scale;
  const high =
    match[2] === undefined ? undefined : Number(match[2].replaceAll(",", "")) * unit.scale;
  return {
    unit: unit.unit,
    stat: high === undefined ? { value: low } : { value: low, spread: [low, high] },
  };
}

/** True when `html` is a `<perf-compare>` block. */
export function isPerfCompare(html: string): boolean {
  return html.trimStart().startsWith("<perf-compare");
}

/** The figure a `<perf-compare>` block describes; a malformed block fails the build. */
export function parsePerfCompare(html: string, id: string): PerfFigure {
  const block = BLOCK.exec(html.trim());
  if (block === null) throw new Error(`<perf-compare> must hold one operation per line:\n${html}`);
  const attributes = new Map(
    [...(block[1] ?? "").matchAll(ATTRIBUTE)].map((match) => [match[1], match[2] ?? ""]),
  );
  const title = attributes.get("title");
  const base = attributes.get("base");
  const measured = attributes.get("measured");
  const machine = attributes.get("machine");
  if (!title || !base || !measured || (machine !== "linux" && machine !== "mac")) {
    throw new Error(
      '<perf-compare> needs title, base, measured and machine="linux" or machine="mac"',
    );
  }
  const units = new Set<PerfUnit>();
  const rows = (block[2] ?? "")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const cells = line.split("|").map((cell) => cell.trim());
      const [label, before, after] = cells;
      if (cells.length !== 3 || !label || !before || !after) {
        throw new Error(`<perf-compare> line "${line}" needs: operation | ${base} | ${measured}`);
      }
      const baseValue = parseValue(before, label);
      const measuredValue = parseValue(after, label);
      units.add(baseValue.unit).add(measuredValue.unit);
      return {
        label,
        bars: [
          { label: base, role: "base" as const, stat: baseValue.stat },
          { label: measured, role: "measured" as const, stat: measuredValue.stat },
        ],
      };
    });
  const [unit, ...others] = units;
  if (unit === undefined || others.length > 0) {
    throw new Error(`<perf-compare> "${title}" mixes times and sizes; use one figure for each`);
  }
  const caption = attributes.get("caption");
  return {
    id,
    title,
    unit,
    scale: "log",
    rowHeader: "Operation",
    ...(unit === "bytes" ? { verdictWords: ["smaller", "larger"] as const } : {}),
    series: { base, measured },
    ...(rows.some((row) => row.bars.some((bar) => bar.stat.spread))
      ? { spreadLabel: "Reported range" }
      : {}),
    groups: [{ label: MACHINE_LABELS[machine], machine, rows }],
    ...(caption ? { caption } : {}),
  };
}
