import { expect, it } from "bun:test";
import { resolve } from "node:path";

const BENCH_ROOT = resolve(import.meta.dir, "..");
const REPOSITORY_ROOT = resolve(BENCH_ROOT, "..");
/**
 * The sparse export input is 2,000 cells; the full corpus the worker builds
 * it from holds about 20 MB. A fresh Bun process starts near 2.5 MB of heap.
 */
const MAX_SPARSE_HEAP_BEFORE_BYTES = 8 * 1024 * 1024;

it("measures an export without the rest of the corpus it was built from", async () => {
  const worker = Bun.spawn(
    [
      process.execPath,
      resolve(BENCH_ROOT, "src/xlsx-bench-worker.ts"),
      "--engine",
      "current",
      "--operation",
      "export",
      "--scenario",
      "sparse",
      "--mode",
      "full",
      "--root",
      REPOSITORY_ROOT,
      "--fixture",
      resolve(BENCH_ROOT, "fixtures/xlsx-codec-corpus.xlsx"),
    ],
    { cwd: REPOSITORY_ROOT, stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr, exit_code] = await Promise.all([
    new Response(worker.stdout).text(),
    new Response(worker.stderr).text(),
    worker.exited,
  ]);

  expect(exit_code, `XLSX worker failed:\n${stderr}`).toBe(0);
  const sample = JSON.parse(stdout.trim()) as { heapBeforeBytes: number };
  expect(sample.heapBeforeBytes).toBeLessThan(MAX_SPARSE_HEAP_BEFORE_BYTES);
}, 60_000);
