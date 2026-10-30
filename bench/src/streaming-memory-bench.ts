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
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : (process.argv[index + 1] ?? fallback);
}

function maximumRssBytes(): number {
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

function csvFixture(rows: number): { workbook: Workbook; data: ColumnarData } {
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
  await core.initSheetwrite();
  core.setXlsxWorkbookBackend(xlsx.sheetwriteWorkbookBackend);
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
  const fixturePath = option("--fixture", "");
  if (operation === "fixture") {
    writeFileSync(fixturePath, await core.toXlsxWorkbook(snapshot(rows), options));
    process.exit(0);
  }
  const fixture = operation === "xlsx-export" ? snapshot(rows) : undefined;
  const csv = operation === "csv" ? csvFixture(rows) : undefined;
  const store = csv ? new core.SheetwriteStore(csv.workbook, csv.data) : undefined;
  Bun.gc(true);
  // Reset VmHWM so fixture construction is excluded from the measured peak.
  writeFileSync("/proc/self/clear_refs", "5");
  const rssBefore = process.memoryUsage().rss;
  const started = performance.now();
  let measured = { bytes: 0, peak: 0 };
  if (operation === "csv") {
    if (!store) throw new Error("CSV fixture store unavailable");
    const sheet = store.getWorkbook().sheets[0];
    if (!sheet) throw new Error("CSV fixture sheet unavailable");
    const csvOptions = {
      resourceLimits: {
        maxRows: rows + 1,
        maxCells: (rows + 1) * COLUMNS,
        maxOutputBytes: 2 ** 31,
      },
    };
    if (mode === "stream") measured = await consume(core.toCsvStream(sheet, store, csvOptions));
    else {
      const text = core.toCsv(sheet, store, csvOptions);
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
    if (!fixturePath) throw new Error("--fixture is required for xlsx-import");
    const imported =
      mode === "stream"
        ? await core.fromXlsxWorkbookFile(Bun.file(fixturePath), options)
        : await core.fromXlsxWorkbook(readFileSync(fixturePath), options);
    measured = { bytes: imported.sheets[0]?.rowCount ?? 0, peak: 0 };
  }
  return {
    root,
    mode,
    operation,
    rows,
    outputBytes: measured.bytes,
    peakChunkBytes: measured.peak,
    maxRssBytes: maximumRssBytes(),
    rssDeltaBytes: process.memoryUsage().rss - rssBefore,
    durationMs: performance.now() - started,
  };
}

async function runOne(args: readonly string[]): Promise<StreamingMemoryResult | undefined> {
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
 * Arms: baseline buffered, candidate buffered (regression guard), candidate stream.
 * `--baseline-root` is a built checkout of the pre-change commit.
 */
async function main(): Promise<void> {
  const baselineRoot = option("--baseline-root", "");
  if (!baselineRoot) throw new Error("--baseline-root is required");
  const candidateRoot = option("--candidate-root", resolve(import.meta.dir, "../.."));
  const pairs = Math.max(3, Number(option("--pairs", "3")));
  const rows = option("--rows", "200000");
  const operations = option("--operations", "csv,xlsx-export,xlsx-import").split(",");
  const results: StreamingMemoryResult[] = [];
  const fixtureDirectory = mkdtempSync(join(tmpdir(), "sheetwrite-stream-memory-"));
  const fixture = join(fixtureDirectory, "import.xlsx");
  try {
    await runOne([
      "--root",
      candidateRoot,
      "--operation",
      "fixture",
      "--rows",
      rows,
      "--fixture",
      fixture,
    ]);
    const arms = [
      { root: baselineRoot, mode: "buffered" },
      { root: candidateRoot, mode: "buffered" },
      { root: candidateRoot, mode: "stream" },
    ];
    for (const operation of operations) {
      for (let pair = 0; pair < pairs; pair++) {
        const order = pair % 2 === 0 ? arms : [...arms].reverse();
        for (const arm of order) {
          const result = await runOne([
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
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
  process.stdout.write(`${JSON.stringify({ pairs, rows: Number(rows), results }, null, 2)}\n`);
}

if (import.meta.main) {
  if (process.argv.includes("--worker"))
    process.stdout.write(`${JSON.stringify(await worker())}\n`);
  else await main();
}
