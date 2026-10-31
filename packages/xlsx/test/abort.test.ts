import { heapStats } from "bun:jsc";
import { beforeAll, describe, expect, it } from "bun:test";

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

const ROWS_PER_SHEET = 6_000;
const SHEET_COUNT = 2;
const COLUMN_COUNT = 2;
const CELL_COUNT = ROWS_PER_SHEET * SHEET_COUNT * COLUMN_COUNT;
/** The codec checks its signal per ZIP entry, worksheet and chunk of XML elements or cells. */
const MAX_CELLS_PER_ABORT_CHECK = 512;
/** An error keeps at most 8 KiB of file or host text, plus its own short prefix. */
const MAX_ERROR_MESSAGE_BYTES = 8 * 1024 + 256;
/** Objects that GC timing or a stray stack pointer can leave alive after an import. */
const RETAINED_OBJECT_SLACK = 5_000;
const MAX_WARNINGS = 64;

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
              value: index % COLUMN_COUNT === 0 ? `text ${sheet} ${index}` : index,
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

/** A real signal that aborts with `reason` when the codec reads `aborted` for the `abortAt`-th time. */
function signalAbortingAt(abortAt: number, reason: Error): CountingSignal {
  const controller = new AbortController();
  let checks = 0;
  let aborted = false;
  Object.defineProperty(controller.signal, "aborted", {
    get() {
      checks += 1;
      if (checks === abortAt) {
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
async function expectAbortAtEveryCheck(
  operation: (signal: AbortSignal) => Promise<unknown>,
): Promise<number> {
  const counting = signalAbortingAt(Number.POSITIVE_INFINITY, new Error("never"));
  await operation(counting.signal);
  const total = counting.checks();

  for (let abortAt = 1; abortAt <= total; abortAt++) {
    const reason = new Error(`abort at check ${abortAt}`);
    await expect(operation(signalAbortingAt(abortAt, reason).signal)).rejects.toBe(reason);
  }
  return total;
}

function liveObjects(): number {
  Bun.gc(true);
  return heapStats().objectCount;
}

describe("XLSX abort", () => {
  it("rejects workbook and table imports with the reason at every check, never per cell", async () => {
    const bytes = await toXlsxWorkbook(snapshot());

    const workbookChecks = await expectAbortAtEveryCheck((signal) =>
      fromXlsxWorkbook(bytes, { signal }),
    );
    const tableChecks = await expectAbortAtEveryCheck((signal) => fromXlsxTable(bytes, { signal }));

    expect(workbookChecks).toBeGreaterThanOrEqual(SHEET_COUNT);
    expect(workbookChecks).toBeLessThan(CELL_COUNT / MAX_CELLS_PER_ABORT_CHECK);
    expect(tableChecks).toBeLessThan(CELL_COUNT / MAX_CELLS_PER_ABORT_CHECK);
  });

  it("rejects workbook and table exports with the reason at every check and leaves the store unchanged", async () => {
    const store = SheetwriteStore.fromSnapshot(snapshot());
    const before = JSON.stringify(store.exportSnapshot());

    const workbookChecks = await expectAbortAtEveryCheck((signal) =>
      toXlsxWorkbook(store, { signal }),
    );
    const tableChecks = await expectAbortAtEveryCheck((signal) =>
      toXlsxTable(store.getWorkbook(), store, { signal }),
    );

    expect(workbookChecks).toBeLessThan(CELL_COUNT / MAX_CELLS_PER_ABORT_CHECK);
    expect(tableChecks).toBeLessThan(CELL_COUNT / MAX_CELLS_PER_ABORT_CHECK);
    expect(JSON.stringify(store.exportSnapshot())).toBe(before);
    store.dispose();
  });

  it("keeps no partial snapshot after an import aborts at its last check", async () => {
    const bytes = await toXlsxWorkbook(snapshot());
    const counting = signalAbortingAt(Number.POSITIVE_INFINITY, new Error("never"));
    await fromXlsxWorkbook(bytes, { signal: counting.signal });
    const lastCheck = counting.checks();

    const before = liveObjects();
    const reason = new Error("abort after the cells are built");
    await expect(
      fromXlsxWorkbook(bytes, { signal: signalAbortingAt(lastCheck, reason).signal }),
    ).rejects.toBe(reason);

    // A kept snapshot holds at least one cell and one value object per cell.
    expect(liveObjects() - before).toBeLessThan(RETAINED_OBJECT_SLACK);
  });
});

describe("XLSX failure size", () => {
  it("cuts file text in an import failure to 8 KiB and keeps the decoding cause", async () => {
    const target = `%E0%A4%A${"a".repeat(200_000)}`;
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
    const codecFailure = failure.cause;
    if (!(codecFailure instanceof TypeError)) throw new Error("expected the codec TypeError");
    expect(codecFailure.message).toBe(failure.message);
    expect(codecFailure.cause).toBeInstanceOf(URIError);
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
