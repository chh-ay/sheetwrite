import { beforeAll, describe, expect, it } from "bun:test";

import {
  fromXlsxTable,
  fromXlsxWorkbook,
  initSheetwrite,
  SheetwriteError,
  SheetwriteStore,
  toXlsxTable,
  toXlsxWorkbook,
} from "@sheetwrite/core";

import { xlsxAddon } from "../src/index.js";
import { rawXlsx, TRANSITIONAL_REL, worksheet } from "./raw-opc.js";
import { book, collectWarnings, sheet } from "./workbook-fixtures.js";

beforeAll(async () => {
  await initSheetwrite({ addons: [xlsxAddon()] });
});

const ROWS_PER_SHEET = 2_000;
const SHEET_COUNT = 2;
const CELL_COUNT = ROWS_PER_SHEET * SHEET_COUNT * 2;
/**
 * Fewest cells per abort check on average. The codec checks per ZIP entry,
 * worksheet and chunk of XML elements or cells; one check per cell would be 1.
 */
const MIN_CELLS_PER_ABORT_CHECK = 64;
/** An error keeps at most 8 KiB of file or host text, plus its own short prefix. */
const MAX_ERROR_MESSAGE_BYTES = 8 * 1024 + 256;
const MAX_WARNINGS = 64;

const snapshot = () =>
  book(
    Array.from({ length: SHEET_COUNT }, (_, index) =>
      sheet(
        `s${index + 1}`,
        `Data ${index + 1}`,
        Array.from({ length: ROWS_PER_SHEET }, (_, row) => [`text-${index}-${row}`, row]),
      ),
    ),
  );

/** A real signal that aborts with `reason` when the codec reads `aborted` for the `abortAt`-th time. */
function signalAbortingAt(abortAt: number, reason: Error) {
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
async function expectAbortAtEveryCheck(operation: (signal: AbortSignal) => Promise<unknown>) {
  const counting = signalAbortingAt(Number.POSITIVE_INFINITY, new Error("never"));
  await operation(counting.signal);
  const total = counting.checks();
  for (let abortAt = 1; abortAt <= total; abortAt++) {
    const reason = new Error(`abort at check ${abortAt}`);
    await expect(operation(signalAbortingAt(abortAt, reason).signal)).rejects.toBe(reason);
  }
  return total;
}

describe("XLSX abort", () => {
  it("rejects workbook and table imports with the reason at every check, never per cell", async () => {
    const bytes = await toXlsxWorkbook(snapshot());
    const workbookChecks = await expectAbortAtEveryCheck((signal) =>
      fromXlsxWorkbook(bytes, { signal }),
    );
    const tableChecks = await expectAbortAtEveryCheck((signal) => fromXlsxTable(bytes, { signal }));

    expect(workbookChecks).toBeGreaterThanOrEqual(SHEET_COUNT);
    expect(workbookChecks).toBeLessThan(CELL_COUNT / MIN_CELLS_PER_ABORT_CHECK);
    expect(tableChecks).toBeLessThan(CELL_COUNT / MIN_CELLS_PER_ABORT_CHECK);
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

    expect(workbookChecks).toBeLessThan(CELL_COUNT / MIN_CELLS_PER_ABORT_CHECK);
    expect(tableChecks).toBeLessThan(CELL_COUNT / MIN_CELLS_PER_ABORT_CHECK);
    expect(JSON.stringify(store.exportSnapshot())).toBe(before);
    store.dispose();
  });
});

describe("XLSX failure size", () => {
  it("cuts file text in an import failure to 8 KiB and keeps the decoding cause", async () => {
    const bytes = rawXlsx({
      sheets: [{ xml: worksheet("<sheetData/>") }],
      workbookRelationships: `<Relationship Id="rIdBad" Type="${TRANSITIONAL_REL}/customXml" Target="%ZZ${"a".repeat(200_000)}"/>`,
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
      (_, index) =>
        `<Relationship Id="rExt${index}" Type="${TRANSITIONAL_REL}/oleObject" Target="https://example.invalid/${index}" TargetMode="External"/>`,
    ).join("");
    const { warnings, onWarning } = collectWarnings();
    await fromXlsxWorkbook(
      rawXlsx({ sheets: [{ xml: worksheet("<sheetData/>") }], rootRelationships: relationships }),
      { onWarning },
    );
    expect(warnings).toHaveLength(MAX_WARNINGS);
  });
});
