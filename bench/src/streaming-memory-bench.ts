import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type * as SheetwriteCore from "@sheetwrite/core";
import type {
  ColumnarData,
  Workbook,
  WorkbookSnapshot,
  XlsxWorkbookBackend,
} from "@sheetwrite/core";

import { optionValue } from "./cli-options.js";

type Operation = "csv" | "xlsx-export" | "xlsx-import" | "fixture";

interface StreamingMemoryResult {
  readonly root: string;
  readonly mode: "buffered" | "stream";
  readonly operation: Operation;
  readonly rows: number;
  readonly outputBytes: number;
  readonly peakChunkBytes: number;
  readonly maxRssBytes: number;
  readonly rssDeltaBytes: number;
  readonly durationMs: number;
}

const COLUMNS = 8;

function option(name: string, fallback: string): string {
  return optionValue(process.argv, name) ?? fallback;
}

function maximum_rss_bytes(): number {
  const match = /^VmHWM:\s+(\d+)\s+kB$/m.exec(readFileSync("/proc/self/status", "utf8"));
  return match ? Number(match[1]) * 1024 : process.resourceUsage().maxRSS * 1024;
}

function snapshot(rows: number): WorkbookSnapshot {
  const cells = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < COLUMNS; col++) {
      cells.push({
        rowOffset: row,
        colOffset: col,
        value: { kind: "literal" as const, value: col === 0 ? `row-${row}` : row * col },
      });
    }
  }
  return {
    schemaVersion: 1,
    workbook: { activeSheet: "s" },
    sheets: [
      {
        id: "s",
        name: "Data",
        order: 0,
        rowCount: rows,
        columns: Array.from({ length: COLUMNS }, (_unused, col) => ({
          key: `c${col}`,
          header: `C${col}`,
          width: 80,
          type: "text" as const,
        })),
        cells: [{ startRow: 0, startCol: 0, rowCount: rows, colCount: COLUMNS, cells }],
      },
    ],
  };
}

function csv_fixture(rows: number): { workbook: Workbook; data: ColumnarData } {
  const columns: ColumnarData["columns"] = Object.create(null);
  for (let col = 0; col < COLUMNS; col++) {
    columns[`c${col}`] = Array.from({ length: rows }, (_unused, row) =>
      col === 0 ? `row-${row}` : row * col,
    );
  }
  return {
    workbook: {
      activeSheet: "s",
      sheets: [
        {
          id: "s",
          name: "Data",
          rowCount: rows,
          columns: Array.from({ length: COLUMNS }, (_unused, col) => ({
            key: `c${col}`,
            header: `C${col}`,
            width: 80,
            type: "text" as const,
          })),
        },
      ],
    },
    data: { rowCount: rows, columns },
  };
}

async function consume(
  source: ReadableStream<Uint8Array>,
): Promise<{ bytes: number; peak: number }> {
  let bytes = 0;
  let peak = 0;
  for await (const chunk of source) {
    bytes += chunk.byteLength;
    peak = Math.max(peak, chunk.byteLength);
  }
  return { bytes, peak };
}

async function worker(): Promise<StreamingMemoryResult> {
  const root = resolve(option("--root", "."));
  const mode = option("--mode", "stream") === "buffered" ? "buffered" : "stream";
  const operation = option("--operation", "xlsx-export") as Operation;
  const rows = Number(option("--rows", "200000"));
  // Roots are selected at runtime so one worker measures independent baseline and candidate checkouts.
  const core = (await import(
    pathToFileURL(resolve(root, "packages/core/src/index.ts")).href
  )) as typeof SheetwriteCore;
  const xlsx = (await import(
    pathToFileURL(resolve(root, "packages/xlsx/src/workbook.ts")).href
  )) as { sheetwriteWorkbookBackend: XlsxWorkbookBackend };
  // A baseline checkout from before the add-on API takes no options object and has the setter instead.
  const legacy_setter = Reflect.get(core, "setXlsxWorkbookBackend");
  if (typeof legacy_setter === "function") {
    await core.initSheetwrite();
    legacy_setter(xlsx.sheetwriteWorkbookBackend);
  } else {
    await core.initSheetwrite({
      addons: [
        {
          name: "streaming-memory-bench",
          setup: (context) => context.xlsx({ workbook: xlsx.sheetwriteWorkbookBackend }),
        },
      ],
    });
  }

  const options = {
    maxCells: rows * COLUMNS,
    resourceLimits: {
      maxOutputBytes: 2 ** 31,
      maxEntryUncompressedBytes: 2 ** 31,
      maxTotalUncompressedBytes: 2 ** 31,
      maxInputBytes: 2 ** 31,
      maxXmlElements: rows * COLUMNS * 3 + 1_000,
    },
  };
  const fixture_path = option("--fixture", "");
  if (operation === "fixture") {
    writeFileSync(fixture_path, await core.toXlsxWorkbook(snapshot(rows), options));
    process.exit(0);
  }
  const fixture = operation === "xlsx-export" ? snapshot(rows) : undefined;
  const csv = operation === "csv" ? csv_fixture(rows) : undefined;
  const store = csv ? new core.SheetwriteStore(csv.workbook, csv.data) : undefined;
  Bun.gc(true);
  // Reset VmHWM so fixture construction is excluded from the measured peak.
  writeFileSync("/proc/self/clear_refs", "5");
  const rss_before = process.memoryUsage().rss;
  const started = performance.now();
  let measured = { bytes: 0, peak: 0 };
  if (operation === "csv") {
    if (!store) throw new Error("CSV fixture store unavailable");
    const sheet = store.getWorkbook().sheets[0];
    if (!sheet) throw new Error("CSV fixture sheet unavailable");
    const csv_options = {
      resourceLimits: {
        maxRows: rows + 1,
        maxCells: (rows + 1) * COLUMNS,
        maxOutputBytes: 2 ** 31,
      },
    };
    if (mode === "stream") measured = await consume(core.toCsvStream(sheet, store, csv_options));
    else {
      const text = core.toCsv(sheet, store, csv_options);
      measured = { bytes: Buffer.byteLength(text), peak: Buffer.byteLength(text) };
    }
  } else if (operation === "xlsx-export") {
    if (!fixture) throw new Error("XLSX export fixture unavailable");
    if (mode === "stream") measured = await consume(core.toXlsxWorkbookStream(fixture, options));
    else {
      const bytes = await core.toXlsxWorkbook(fixture, options);
      measured = { bytes: bytes.byteLength, peak: bytes.byteLength };
    }
  } else {
    if (!fixture_path) throw new Error("--fixture is required for xlsx-import");
    const imported =
      mode === "stream"
        ? await core.fromXlsxWorkbookFile(Bun.file(fixture_path), options)
        : await core.fromXlsxWorkbook(readFileSync(fixture_path), options);
    measured = { bytes: imported.sheets[0]?.rowCount ?? 0, peak: 0 };
  }
  return {
    root,
    mode,
    operation,
    rows,
    outputBytes: measured.bytes,
    peakChunkBytes: measured.peak,
    maxRssBytes: maximum_rss_bytes(),
    rssDeltaBytes: process.memoryUsage().rss - rss_before,
    durationMs: performance.now() - started,
  };
}

async function run_one(args: readonly string[]): Promise<StreamingMemoryResult | undefined> {
  const child = Bun.spawn([process.execPath, import.meta.path, "--worker", ...args], {
    stdout: "pipe",
    stderr: "inherit",
  });
  const output = await new Response(child.stdout).text();
  if ((await child.exited) !== 0)
    throw new Error(`streaming memory worker failed: ${args.join(" ")}`);
  return output.trim() ? (JSON.parse(output) as StreamingMemoryResult) : undefined;
}

/**
 * Interleave baseline and candidate in fresh processes so machine drift lands on both sides.
 * Arms: buffered and stream on each checkout.
 * `--baseline-root` is a built checkout of the pre-change commit.
 */
async function main(): Promise<void> {
  const baseline_root = option("--baseline-root", "");
  if (!baseline_root) throw new Error("--baseline-root is required");
  const candidate_root = option("--candidate-root", resolve(import.meta.dir, "../.."));
  const pairs = Math.max(3, Number(option("--pairs", "3")));
  const rows = option("--rows", "200000");
  const operations = option("--operations", "csv,xlsx-export,xlsx-import").split(",");
  const results: StreamingMemoryResult[] = [];
  const fixture_directory = mkdtempSync(join(tmpdir(), "sheetwrite-stream-memory-"));
  const fixture = join(fixture_directory, "import.xlsx");
  try {
    await run_one([
      "--root",
      candidate_root,
      "--operation",
      "fixture",
      "--rows",
      rows,
      "--fixture",
      fixture,
    ]);
    const arms = [
      { root: baseline_root, mode: "buffered" },
      { root: candidate_root, mode: "buffered" },
      { root: candidate_root, mode: "stream" },
      { root: baseline_root, mode: "stream" },
    ];
    for (const operation of operations) {
      for (let pair = 0; pair < pairs; pair++) {
        const order = pair % 2 === 0 ? arms : [...arms].reverse();
        for (const arm of order) {
          const result = await run_one([
            "--root",
            arm.root,
            "--mode",
            arm.mode,
            "--operation",
            operation,
            "--rows",
            rows,
            "--fixture",
            fixture,
          ]);
          if (result) results.push(result);
        }
      }
    }
  } finally {
    rmSync(fixture_directory, { recursive: true, force: true });
  }
  process.stdout.write(`${JSON.stringify({ pairs, rows: Number(rows), results }, null, 2)}\n`);
}

if (import.meta.main) {
  if (process.argv.includes("--worker"))
    process.stdout.write(`${JSON.stringify(await worker())}\n`);
  else await main();
}
