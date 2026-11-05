import compatibilitySummary from "../generated/compatibility-summary.json";
import formulaSummary from "../generated/formula-summary.json";
import landingBench from "../generated/landing-bench.json";

/**
 * Every number the landing page shows, read from generated sources: the saved
 * benchmark capture, the size report, the compatibility corpus and the formula
 * inventory. `bun run docs:generate` refreshes them; nothing here is typed by
 * hand.
 */

/** One benchmark size from the saved capture. */
export interface LandingBenchSize {
  readonly size: number;
  readonly comparedScenarios: number;
  readonly medianRatio: number;
  readonly bestRatio: number;
  readonly bestScenario: string;
  readonly handsontableIncomplete: number;
}

/** The saved browser capture the benchmark numbers come from. */
export interface LandingBenchCapture {
  readonly commit: string;
  readonly timestamp: string;
  readonly browser: string;
  readonly rounds: number;
  readonly engineVersions: { readonly sheetwrite: string; readonly handsontable: string };
}

/** Benchmark results, when a capture is available. */
export interface LandingBenchmarks {
  readonly capture: LandingBenchCapture;
  readonly heroStats: {
    readonly millionRowScenarios: number;
    readonly millionRowMedianMs: number;
    readonly millionRowHeapMb: number;
  };
  readonly sizes: readonly LandingBenchSize[];
}

/** Brotli-compressed downloads, as browsers fetch them. */
export interface LandingDownloads {
  readonly coreFirstLoadBrotliBytes: number;
  readonly defaultEngineBrotliBytes: number;
  readonly fullEngineBrotliBytes: number;
}

/** Counts from the published compatibility corpus. */
export interface LandingCompatibility {
  readonly libraryVersion: string;
  readonly totalTests: number;
  readonly localPassed: number;
  readonly unsupported: number;
  readonly regressions: number;
}

/** Everything the landing can prove, each part absent when its source is. */
export interface LandingEvidence {
  readonly benchmarks: LandingBenchmarks | undefined;
  readonly downloads: LandingDownloads | undefined;
  readonly compatibility: LandingCompatibility;
  readonly functionCount: number;
}

interface LandingBenchData extends Partial<LandingBenchmarks> {
  readonly available: boolean;
  readonly downloads?: LandingDownloads;
}

const bench: LandingBenchData = landingBench;

/** The landing's evidence, read once from the generated files. */
export const LANDING_EVIDENCE: LandingEvidence = {
  benchmarks:
    bench.available && bench.capture && bench.heroStats && bench.sizes
      ? { capture: bench.capture, heroStats: bench.heroStats, sizes: bench.sizes }
      : undefined,
  downloads: bench.downloads,
  compatibility: compatibilitySummary,
  functionCount: formulaSummary.functionCount,
};

/** The benchmark at one million rows, the size the landing leads with. */
export const MILLION_ROWS = 1_000_000;

const BYTES_PER_KIB = 1024;

/** Whole kibibytes, the unit the size reports in the docs use. */
export function kib(bytes: number): string {
  return `${Math.round(bytes / BYTES_PER_KIB)} KiB`;
}

const INTEGER = new Intl.NumberFormat("en-US");

/** A count with thousands separators. */
export function count(value: number): string {
  return INTEGER.format(value);
}
