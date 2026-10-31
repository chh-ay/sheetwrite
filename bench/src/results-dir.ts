import { resolve } from "node:path";

import { optionValue } from "./cli-options.js";

const BENCH_ROOT = resolve(import.meta.dir, "..");

/**
 * Where a capture writes its artifacts. Tracked evidence lives in
 * `bench/results`; `--results-dir` redirects every write of a run (used by the
 * smoke pipeline) so a rehearsal can never overwrite published evidence.
 */
export function resultsDirectory(args: readonly string[]): string {
  return resolve(BENCH_ROOT, optionValue(args, "--results-dir") ?? "results");
}
