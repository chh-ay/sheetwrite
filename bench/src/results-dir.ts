import { resolve } from "node:path";

const BENCH_ROOT = resolve(import.meta.dir, "..");

/**
 * Where a capture writes its artifacts. Tracked evidence lives in
 * `bench/results`; `--results-dir` redirects every write of a run (used by the
 * smoke pipeline) so a rehearsal can never overwrite published evidence.
 */
export function resultsDirectory(args: readonly string[]): string {
  const index = args.indexOf("--results-dir");
  if (index < 0) return resolve(BENCH_ROOT, "results");
  const requested = args[index + 1];
  if (requested === undefined || requested.startsWith("--")) {
    throw new TypeError("--results-dir requires a path");
  }
  return resolve(BENCH_ROOT, requested);
}
