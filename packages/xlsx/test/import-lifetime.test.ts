import { expect, it } from "bun:test";

import type { SheetSnapshot } from "@sheetwrite/core";

import { sheetwriteWorkbookBackend } from "../src/workbook.js";
import { book, columns } from "./workbook-fixtures.js";

const SHEETS = 4;
/** Enough rows that validating the import runs long enough for the JIT to optimize it. */
const ROWS = 20_000;
const WIDTH = 4;
/**
 * Whether a compilation outlives the import depends on timing: with the leak
 * present, about one fresh process in four still frees the workbook in time.
 * Three concurrent processes miss the leak about once in sixty runs.
 */
const PROBES = 3;

function numbered_sheet(index: number): SheetSnapshot {
  const cells: SheetSnapshot["cells"][number]["cells"] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < WIDTH; col++) {
      const value = col === 0 ? `row ${row}` : row * WIDTH + col;
      cells.push({ rowOffset: row, colOffset: col, value: { kind: "literal", value } });
    }
  }
  return {
    id: `s${index}`,
    name: `Sheet ${index}`,
    order: index,
    rowCount: ROWS,
    columns: columns(WIDTH),
    cells: [{ startRow: 0, startCol: 0, rowCount: ROWS, colCount: WIDTH, cells }],
  };
}

interface ProbeReport {
  readonly tracked: number;
  readonly retained: number;
}

async function run_probe(bytes: Uint8Array): Promise<ProbeReport> {
  const probe = Bun.spawn([process.execPath, "./import-lifetime-probe.ts"], {
    cwd: new URL(".", import.meta.url).pathname,
    stdin: bytes,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exit_code] = await Promise.all([
    new Response(probe.stdout).text(),
    new Response(probe.stderr).text(),
    probe.exited,
  ]);
  expect(exit_code, `import lifetime probe failed:\n${stderr}`).toBe(0);
  return JSON.parse(stdout.trim()) as ProbeReport;
}

// Objects held by other suites in the shared `bun test` process can keep a
// referent alive, and an export in the same process would optimize the import's
// code before it runs, so each import runs first in a fresh process
// (import-lifetime-probe.ts).
it("frees an imported workbook once the caller drops it", async () => {
  const workbook = book(Array.from({ length: SHEETS }, (_unused, index) => numbered_sheet(index)));
  const bytes = await sheetwriteWorkbookBackend.toXlsxWorkbook(workbook);
  const reports = await Promise.all(Array.from({ length: PROBES }, () => run_probe(bytes)));

  for (const report of reports) {
    // The sheet list, and each block's cell list and first and last cell.
    expect(report.tracked).toBeGreaterThanOrEqual(1 + SHEETS * 3);
  }
  expect(reports.map((report) => report.retained)).toEqual(reports.map(() => 0));
}, 60_000);
