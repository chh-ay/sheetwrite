import { beforeAll, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  fromXlsxTable,
  fromXlsxWorkbook,
  initSheetwrite,
  SheetwriteError,
  SheetwriteStore,
  toXlsxTable,
  toXlsxWorkbook,
  type WorkbookSnapshot,
  type XlsxWorkbookWarning,
} from "@sheetwrite/core";

import { registerXlsxBackends } from "../src/index.js";
import { rawXlsx, TRANSITIONAL_REL, worksheet } from "./raw-opc.js";

beforeAll(async () => {
  await initSheetwrite();
  registerXlsxBackends();
});

const ROWS_PER_SHEET = 2_000;
const SHEET_COUNT = 2;
const COLUMN_COUNT = 2;
const CELL_COUNT = ROWS_PER_SHEET * SHEET_COUNT * COLUMN_COUNT;
/**
 * Fewest cells per abort check on average. The codec checks per ZIP entry,
 * worksheet and chunk of XML elements or cells; one check per cell would be 1.
 */
const MIN_CELLS_PER_ABORT_CHECK = 64;
/** An error keeps at most 8 KiB of file or host text, plus its own short prefix. */
const MAX_ERROR_MESSAGE_BYTES = 8 * 1024 + 256;
const MAX_WARNINGS = 64;
/** Text cells in `snapshot()`; a held import keeps (almost) all of them alive. */
const TEXT_CELL_COUNT = ROWS_PER_SHEET * SHEET_COUNT;
/** Cell strings counted on top of one snapshot's worth before a probe counts as a leak. */
const RETAINED_CELL_TOLERANCE = 16;
const RETENTION_PROBE = new URL("./abort-retention-probe.ts", import.meta.url).pathname;

function snapshot(): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    workbook: { activeSheet: "s1" },
    sheets: Array.from({ length: SHEET_COUNT }, (_unused, sheet) => ({
      id: `s${sheet + 1}`,
      name: `Data ${sheet + 1}`,
      order: sheet,
      rowCount: ROWS_PER_SHEET,
      columns: [
        { key: "a", header: "A", width: 80, type: "text" as const },
        { key: "b", header: "B", width: 80, type: "number" as const },
      ],
      cells: [
        {
          startRow: 0,
          startCol: 0,
          rowCount: ROWS_PER_SHEET,
          colCount: COLUMN_COUNT,
          cells: Array.from({ length: ROWS_PER_SHEET * COLUMN_COUNT }, (_unused, index) => ({
            rowOffset: Math.floor(index / COLUMN_COUNT),
            colOffset: index % COLUMN_COUNT,
            value: {
              kind: "literal" as const,
              value: index % COLUMN_COUNT === 0 ? `kept-cell-${sheet}-${index}` : index,
            },
          })),
        },
      ],
    })),
  };
}

interface CountingSignal {
  readonly signal: AbortSignal;
  /** Times the codec read `signal.aborted` so far. */
  readonly checks: () => number;
}

/** A real signal that aborts with `reason` when the codec reads `aborted` for the `abort_at`-th time. */
function signal_aborting_at(abort_at: number, reason: Error): CountingSignal {
  const controller = new AbortController();
  let checks = 0;
  let aborted = false;
  Object.defineProperty(controller.signal, "aborted", {
    get() {
      checks += 1;
      if (checks === abort_at) {
        controller.abort(reason);
        aborted = true;
      }
      return aborted;
    },
  });
  return { signal: controller.signal, checks: () => checks };
}

/**
 * Run `operation` once with a signal that never fires to count its checks, then
 * once more aborting at each check. Every aborted run must reject with the reason.
 */
async function expect_abort_at_every_check(
  operation: (signal: AbortSignal) => Promise<unknown>,
): Promise<number> {
  const counting = signal_aborting_at(Number.POSITIVE_INFINITY, new Error("never"));
  await operation(counting.signal);
  const total = counting.checks();

  for (let abort_at = 1; abort_at <= total; abort_at++) {
    const reason = new Error(`abort at check ${abort_at}`);
    await expect(operation(signal_aborting_at(abort_at, reason).signal)).rejects.toBe(reason);
  }
  return total;
}

/**
 * Run one `abort-retention-probe.ts` scenario in a fresh process and return how
 * many imported cell strings it found alive. A separate process keeps this test
 * runner's objects, and the fixture's own strings, out of the count.
 */
async function retained_cell_strings(
  scenario: "aborted" | "dropped" | "held",
  path: string,
  abort_at: number,
): Promise<number> {
  const probe = Bun.spawn([process.execPath, RETENTION_PROBE, scenario, path, String(abort_at)], {
    stdout: "pipe",
    stderr: "inherit",
  });
  const output = await new Response(probe.stdout).text();
  if ((await probe.exited) !== 0) throw new Error(`retention probe ${scenario} failed`);

  const result: unknown = JSON.parse(output);
  if (
    typeof result !== "object" ||
    result === null ||
    !("cellStrings" in result) ||
    typeof result.cellStrings !== "number"
  ) {
    throw new Error(`retention probe ${scenario} printed ${output}`);
  }
  return result.cellStrings;
}

describe("XLSX abort", () => {
  it("rejects workbook and table imports with the reason at every check, never per cell", async () => {
    const bytes = await toXlsxWorkbook(snapshot());

    const workbook_checks = await expect_abort_at_every_check((signal) =>
      fromXlsxWorkbook(bytes, { signal }),
    );
    const table_checks = await expect_abort_at_every_check((signal) =>
      fromXlsxTable(bytes, { signal }),
    );

    expect(workbook_checks).toBeGreaterThanOrEqual(SHEET_COUNT);
    expect(workbook_checks).toBeLessThan(CELL_COUNT / MIN_CELLS_PER_ABORT_CHECK);
    expect(table_checks).toBeLessThan(CELL_COUNT / MIN_CELLS_PER_ABORT_CHECK);
  });

  it("rejects workbook and table exports with the reason at every check and leaves the store unchanged", async () => {
    const store = SheetwriteStore.fromSnapshot(snapshot());
    const before = JSON.stringify(store.exportSnapshot());

    const workbook_checks = await expect_abort_at_every_check((signal) =>
      toXlsxWorkbook(store, { signal }),
    );
    const table_checks = await expect_abort_at_every_check((signal) =>
      toXlsxTable(store.getWorkbook(), store, { signal }),
    );

    expect(workbook_checks).toBeLessThan(CELL_COUNT / MIN_CELLS_PER_ABORT_CHECK);
    expect(table_checks).toBeLessThan(CELL_COUNT / MIN_CELLS_PER_ABORT_CHECK);
    expect(JSON.stringify(store.exportSnapshot())).toBe(before);
    store.dispose();
  });

  it("leaves at most one import's cells alive after repeated aborted imports, as for completed ones", async () => {
    const bytes = await toXlsxWorkbook(snapshot());
    const counting = signal_aborting_at(Number.POSITIVE_INFINITY, new Error("never"));
    await fromXlsxWorkbook(bytes, { signal: counting.signal });
    const path = join(tmpdir(), `sheetwrite-abort-retention-${process.pid}.xlsx`);
    await Bun.write(path, bytes);

    try {
      const [aborted, dropped, held] = await Promise.all([
        retained_cell_strings("aborted", path, counting.checks()),
        retained_cell_strings("dropped", path, 1),
        retained_cell_strings("held", path, 1),
      ]);

      expect(held).toBeGreaterThan(TEXT_CELL_COUNT / 2);
      // The probe repeats the aborted and the dropped import four times. A stray
      // stack pointer can pin the last one, so one copy may stay alive; a leak
      // keeps one copy per import.
      expect(dropped).toBeLessThanOrEqual(held + RETAINED_CELL_TOLERANCE);
      expect(aborted).toBeLessThanOrEqual(held + RETAINED_CELL_TOLERANCE);
    } finally {
      await rm(path, { force: true });
    }
  });
});

describe("XLSX failure size", () => {
  it("cuts file text in an import failure to 8 KiB and keeps the decoding cause", async () => {
    const target = `%ZZ${"a".repeat(200_000)}`;
    const bytes = rawXlsx({
      sheets: [{ xml: worksheet("<sheetData/>") }],
      workbookRelationships: `<Relationship Id="rIdBad" Type="${TRANSITIONAL_REL}/customXml" Target="${target}"/>`,
      // Stored, so the repeated text does not trip the compression-ratio limit first.
      compressionLevel: 0,
    });

    const failure = await fromXlsxWorkbook(bytes).then(
      () => undefined,
      (error: unknown) => error,
    );

    if (!(failure instanceof SheetwriteError)) throw new Error("expected a SheetwriteError");
    expect(failure).toMatchObject({ code: "xlsx-import-failed", operation: "xlsx-import" });
    expect(failure.message).toContain("invalid escaping");
    expect(new TextEncoder().encode(failure.message).byteLength).toBeLessThanOrEqual(
      MAX_ERROR_MESSAGE_BYTES,
    );
    const codec_failure = failure.cause;
    if (!(codec_failure instanceof TypeError)) throw new Error("expected the codec TypeError");
    expect(codec_failure.message).toBe(failure.message);
    expect(codec_failure.cause).toBeInstanceOf(URIError);
  });

  it("reports at most 64 warnings for one import", async () => {
    const relationships = Array.from(
      { length: MAX_WARNINGS * 3 },
      (_unused, index) =>
        `<Relationship Id="rExt${index}" Type="${TRANSITIONAL_REL}/oleObject" Target="https://example.invalid/${index}" TargetMode="External"/>`,
    ).join("");
    const bytes = rawXlsx({
      sheets: [{ xml: worksheet("<sheetData/>") }],
      rootRelationships: relationships,
    });
    const warnings: XlsxWorkbookWarning[] = [];

    await fromXlsxWorkbook(bytes, { onWarning: (warning) => warnings.push(warning) });

    expect(warnings).toHaveLength(MAX_WARNINGS);
  });
});
