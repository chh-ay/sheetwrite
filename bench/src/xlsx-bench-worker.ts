import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { WorkbookSnapshot, XlsxWorkbookBackend } from "@sheetwrite/core";

import { requiredOption } from "./cli-options.js";
import { createXlsxCorpus, type XlsxCorpusMode, type XlsxCorpusScenario } from "./xlsx-corpus.js";

interface WorkerResult {
  readonly engine: "current" | "baseline";
  readonly operation: "import" | "export" | "reject";
  readonly scenario: string;
  readonly durationMs: number;
  readonly maxRssBytes: number;
  readonly rssBeforeBytes: number;
  readonly rssAfterBytes: number;
  readonly heapBeforeBytes: number;
  readonly heapAfterBytes: number;
  readonly arrayBuffersBeforeBytes: number;
  readonly arrayBuffersAfterBytes: number;
  readonly heapRetainedBytes: number;
  readonly arrayBuffersRetainedBytes: number;
  readonly inputBytes: number;
  readonly outputBytes: number;
  readonly checksum: string;
  readonly rejection?: string;
}

function maximum_rss_bytes(): number {
  try {
    const status = readFileSync("/proc/self/status", "utf8");
    const match = /^VmHWM:\s+(\d+)\s+kB$/m.exec(status);
    if (match) return Number(match[1]) * 1024;
  } catch {
    // Non-Linux toolchains fall back to the runtime's documented KiB value.
  }
  return process.resourceUsage().maxRSS * 1024;
}

function sha256(bytes: Uint8Array | string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(bytes);
  return hasher.digest("hex");
}

function snapshot_sentinel(snapshot: WorkbookSnapshot): string {
  let populated_cells = 0;
  let styled_cells = 0;
  let formula_cells = 0;
  let first_value: unknown;
  let last_value: unknown;
  for (const sheet of snapshot.sheets) {
    for (const block of sheet.cells) {
      for (const cell of block.cells) {
        populated_cells++;
        if (cell.style) styled_cells++;
        if (cell.value.kind === "formula") formula_cells++;
        const value =
          cell.value.kind === "literal"
            ? cell.value.value
            : cell.value.kind === "formula"
              ? cell.value.src
              : cell.value.target;
        if (first_value === undefined) first_value = value;
        last_value = value;
      }
    }
  }
  return JSON.stringify({
    sheets: snapshot.sheets.map((sheet) => ({
      name: sheet.name,
      rowCount: sheet.rowCount,
      columns: sheet.columns.length,
      blocks: sheet.cells.length,
      merges: sheet.merges?.length ?? 0,
      notes: sheet.notes?.length ?? 0,
    })),
    populatedCells: populated_cells,
    styledCells: styled_cells,
    formulaCells: formula_cells,
    firstValue: first_value,
    lastValue: last_value,
  });
}

async function backend(engine: "current" | "baseline", root: string): Promise<XlsxWorkbookBackend> {
  const module_path = resolve(root, "packages/xlsx/src/workbook.ts");
  // The root is selected at runtime so the same worker can load an independent detached baseline.
  const loaded = (await import(pathToFileURL(module_path).href)) as {
    readonly sheetwriteWorkbookBackend?: XlsxWorkbookBackend;
    readonly excelJsWorkbookBackend?: XlsxWorkbookBackend;
  };
  const implementation =
    engine === "current" ? loaded.sheetwriteWorkbookBackend : loaded.excelJsWorkbookBackend;
  if (!implementation) throw new Error(`${engine} XLSX backend was not exported by ${module_path}`);
  return implementation;
}

async function measure_operation(
  implementation: XlsxWorkbookBackend,
  operation: WorkerResult["operation"],
  scenario: string,
  input: Uint8Array | WorkbookSnapshot,
): Promise<
  Pick<WorkerResult, "durationMs" | "outputBytes" | "checksum" | "rejection"> & {
    readonly after: NodeJS.MemoryUsage;
  }
> {
  const started = performance.now();
  let ended = started;
  let output_bytes = 0;
  let checksum = "";
  let rejection: string | undefined;
  if (operation === "export") {
    const output = await implementation.toXlsxWorkbook(input as WorkbookSnapshot, {
      maxCells: 1_000_000,
    });
    ended = performance.now();
    output_bytes = output.byteLength;
    checksum = sha256(output);
  } else if (operation === "import") {
    const snapshot = await implementation.fromXlsxWorkbook(input as Uint8Array, {
      maxCells: 1_000_000,
    });
    ended = performance.now();
    const sentinel = snapshot_sentinel(snapshot);
    output_bytes = Buffer.byteLength(sentinel);
    checksum = sha256(sentinel);
  } else {
    try {
      await implementation.fromXlsxWorkbook(input as Uint8Array, {
        maxCells: 1_000_000,
        resourceLimits: {
          maxCompressionRatio: scenario === "compression-ratio" ? 2 : 1_000,
          maxXmlDepth: scenario === "deep-xml" ? 8 : 256,
        },
      });
      throw new Error(`hostile fixture ${scenario} was accepted`);
    } catch (error) {
      ended = performance.now();
      const message = error instanceof Error ? `${error.name}:${error.message}` : String(error);
      rejection = message;
      if (message.includes("was accepted")) throw error;
      output_bytes = Buffer.byteLength(message);
      checksum = sha256(message);
    }
  }
  return {
    durationMs: ended - started,
    outputBytes: output_bytes,
    checksum,
    ...(rejection ? { rejection } : {}),
    after: process.memoryUsage(),
  };
}

/**
 * Collect garbage and read memory from a timer callback. The collector scans the native stack
 * conservatively, so old values in the frame of `main` can keep dead objects alive: the export
 * corpus before the operation, codec objects after it. A timer callback starts on a new stack
 * after this frame is suspended.
 */
function collected_usage(): Promise<NodeJS.MemoryUsage> {
  const { promise, resolve } = Promise.withResolvers<NodeJS.MemoryUsage>();
  setTimeout(() => {
    Bun.gc(true);
    resolve(process.memoryUsage());
  }, 0);
  return promise;
}

/** The export scenario's snapshot. The rest of the corpus is garbage when this returns. */
function export_snapshot(mode: XlsxCorpusMode, scenario: string): WorkbookSnapshot {
  const snapshot = createXlsxCorpus(mode).scenarios[scenario as XlsxCorpusScenario];
  if (!snapshot) throw new Error(`unknown export scenario ${scenario}`);
  return snapshot;
}

async function main(): Promise<WorkerResult> {
  const args = process.argv.slice(2);
  const engine = requiredOption(args, "--engine") as "current" | "baseline";
  const operation = requiredOption(args, "--operation") as "import" | "export" | "reject";
  const scenario = requiredOption(args, "--scenario");
  const mode = requiredOption(args, "--mode") as XlsxCorpusMode;
  const root = requiredOption(args, "--root");
  const fixture = requiredOption(args, "--fixture");
  if (engine !== "current" && engine !== "baseline") throw new Error(`invalid engine ${engine}`);
  if (!(["import", "export", "reject"] as const).includes(operation)) {
    throw new Error(`invalid operation ${operation}`);
  }
  if (mode !== "smoke" && mode !== "full") throw new Error(`invalid mode ${mode}`);

  const implementation = await backend(engine, root);
  let input_bytes = 0;
  let input: Uint8Array | WorkbookSnapshot;
  if (operation === "export") {
    input = export_snapshot(mode, scenario);
    input_bytes = Buffer.byteLength(JSON.stringify(input));
  } else {
    input = new Uint8Array(await Bun.file(fixture).arrayBuffer());
    input_bytes = input.byteLength;
  }

  const before = await collected_usage();
  const {
    durationMs: duration_ms,
    outputBytes: output_bytes,
    checksum,
    rejection,
    after,
  } = await measure_operation(implementation, operation, scenario, input);
  const retained = await collected_usage();
  return {
    engine,
    operation,
    scenario,
    durationMs: duration_ms,
    // Linux updates VmHWM lazily, so the observed final RSS can already exceed it.
    maxRssBytes: Math.max(maximum_rss_bytes(), after.rss),
    rssBeforeBytes: before.rss,
    rssAfterBytes: after.rss,
    heapBeforeBytes: before.heapUsed,
    heapAfterBytes: after.heapUsed,
    arrayBuffersBeforeBytes: before.arrayBuffers,
    arrayBuffersAfterBytes: after.arrayBuffers,
    heapRetainedBytes: retained.heapUsed,
    arrayBuffersRetainedBytes: retained.arrayBuffers,
    inputBytes: input_bytes,
    outputBytes: output_bytes,
    checksum,
    ...(rejection ? { rejection } : {}),
  };
}

if (import.meta.main) {
  process.stdout.write(`${JSON.stringify(await main())}\n`);
}
