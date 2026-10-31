import { beforeAll, describe, expect, it } from "bun:test";

import {
 DelimitedTextOptionsError,
 type DelimitedTextResourceLimits,
} from "../src/delimited-text.js";
import { SheetwriteError } from "../src/errors.js";
import {
 fromCsv,
 fromXlsxTable,
 fromXlsxWorkbook,
 parseCsv,
 setXlsxTableExportBackend,
 setXlsxTableImportBackend,
 setXlsxWorkbookBackend,
 toCsv,
 toCsvStream,
 toTsv,
 toTsvStream,
 toXlsxTable,
 toXlsxWorkbook,
} from "../src/export.js";
import { initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import type { Column, Workbook, WorkbookSnapshot } from "../src/types.js";

beforeAll(async () => {
 await initSheetwrite();
});

/** Records the parser and encoder handle between two abort checks. */
const RECORDS_PER_CHECK = 1024;
const RECORD_COUNT = 3_000;
const EXPORT_ROWS = 10;
const WINDOW_ROWS = 3;
/** An error keeps at most 8 KiB of host text. */
const MAX_ERROR_TEXT_BYTES = 8 * 1024;

const columns: Column[] = [
 { key: "a", header: "A", width: 80, type: "text" },
 { key: "b", header: "B", width: 80, type: "number" },
];

function workbook(): Workbook {
 return {
  activeSheet: "s",
  sheets: [{ id: "s", name: "S", rowCount: EXPORT_ROWS, columns }],
 };
}

function store(): SheetwriteStore {
 return new SheetwriteStore(workbook(), {
  rowCount: EXPORT_ROWS,
  columns: {
   a: Array.from({ length: EXPORT_ROWS }, (_unused, row) => `row ${row}`),
   b: Array.from({ length: EXPORT_ROWS }, (_unused, row) => row),
  },
 });
}

interface CountingSignal {
 readonly signal: AbortSignal;
 /** Times the operation called `signal.throwIfAborted()` so far. */
 readonly checks: () => number;
}

/** A real signal that aborts with `reason` at the `abortAt`-th `throwIfAborted()` call. */
function signalAbortingAt(abortAt: number, reason: Error): CountingSignal {
 const controller = new AbortController();
 const { signal } = controller;
 let checks = 0;
 signal.throwIfAborted = () => {
  checks += 1;
  if (checks === abortAt) controller.abort(reason);
  AbortSignal.prototype.throwIfAborted.call(signal);
 };
 return { signal, checks: () => checks };
}

/**
 * Run `operation` once with a signal that never fires to count its checks, then
 * once more aborting at each check. Every aborted run must fail with the reason.
 */
async function expectAbortAtEveryCheck(
 operation: (signal: AbortSignal) => unknown,
): Promise<number> {
 const counting = signalAbortingAt(Number.POSITIVE_INFINITY, new Error("never"));
 await operation(counting.signal);
 const total = counting.checks();

 for (let abortAt = 1; abortAt <= total; abortAt++) {
  const reason = new Error(`abort at check ${abortAt}`);
  const failure = await Promise.resolve()
   .then(() => operation(signalAbortingAt(abortAt, reason).signal))
   .then(
    () => undefined,
    (error: unknown) => error,
   );
  expect(failure).toBe(reason);
 }
 return total;
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<void> {
 for await (const _chunk of stream);
}

function resetXlsxBackends(): void {
 setXlsxTableExportBackend(null as never);
 setXlsxTableImportBackend(null as never);
 setXlsxWorkbookBackend(null as never);
}

describe("delimited-text abort", () => {
 it("parsing rejects with the reason before the scan and once per chunk of records", async () => {
  const csv = Array.from({ length: RECORD_COUNT }, (_unused, row) => `${row},x`).join("\r\n");
  const maxChecks = 1 + Math.ceil(RECORD_COUNT / RECORDS_PER_CHECK);

  expect(
   await expectAbortAtEveryCheck((signal) => parseCsv(csv, { signal })),
  ).toBeLessThanOrEqual(maxChecks);
  expect(
   await expectAbortAtEveryCheck((signal) => fromCsv(csv, columns, { signal })),
  ).toBeLessThanOrEqual(maxChecks);
 });

 it("CSV and TSV exports reject with the reason at every store window and leave the store unchanged", async () => {
  const source = store();
  const sheet = source.getWorkbook().sheets[0];
  if (!sheet) throw new Error("expected the export sheet");
  const range = {
   sheet: "s",
   start: { row: 0, col: 0 },
   end: { row: EXPORT_ROWS - 1, col: 1 },
  };
  const resourceLimits: Partial<DelimitedTextResourceLimits> = {
   maxWriterWindowRows: WINDOW_ROWS,
  };
  const before = JSON.stringify(source.exportSnapshot());

  const windows = Math.ceil(EXPORT_ROWS / WINDOW_ROWS);
  for (const exportOnce of [
   (signal: AbortSignal) => toCsv(sheet, source, { signal, resourceLimits }),
   (signal: AbortSignal) => toTsv(range, source, { signal, resourceLimits }),
   (signal: AbortSignal) => drain(toCsvStream(sheet, source, { signal, resourceLimits })),
   (signal: AbortSignal) => drain(toTsvStream(range, source, { signal, resourceLimits })),
  ]) {
   expect(await expectAbortAtEveryCheck(exportOnce)).toBeGreaterThanOrEqual(windows);
  }

  expect(JSON.stringify(source.exportSnapshot())).toBe(before);
  source.dispose();
 });

 it("an invalid option keeps only its type, never a copy of the value", () => {
  const resourceLimits: Partial<DelimitedTextResourceLimits> = {};
  Reflect.set(resourceLimits, "maxRows", "x".repeat(1 << 20));

  let failure: unknown;
  try {
   parseCsv("a", { resourceLimits });
  } catch (error) {
   failure = error;
  }

  expect(failure).toBeInstanceOf(DelimitedTextOptionsError);
  expect(failure).toMatchObject({
   context: { format: "delimited-text", resource: "maxRows", valueType: "string" },
  });
  expect(JSON.stringify(failure).length).toBeLessThan(MAX_ERROR_TEXT_BYTES);
 });
});

describe("XLSX call abort", () => {
 const snapshot: WorkbookSnapshot = {
  schemaVersion: 1,
  workbook: { activeSheet: "s" },
  sheets: [{ id: "s", name: "S", order: 0, rowCount: 1, columns, cells: [] }],
 };

 it("rejects with the reason, not a wrapped failure, before and during the backend call", async () => {
  const lateFailure = new TypeError("backend stream closed");
  let calls = 0;
  let abortDuringCall: (() => void) | undefined;
  const failAfterAbort = async (): Promise<never> => {
   calls += 1;
   abortDuringCall?.();
   throw lateFailure;
  };
  setXlsxWorkbookBackend({
   name: "abort-test",
   toXlsxWorkbook: failAfterAbort,
   fromXlsxWorkbook: failAfterAbort,
  });
  setXlsxTableExportBackend({ name: "abort-test", toXlsxTable: failAfterAbort });
  setXlsxTableImportBackend({ name: "abort-test", fromXlsxTable: failAfterAbort });
  const source = store();
  const xlsxCalls = [
   (signal: AbortSignal) => toXlsxWorkbook(snapshot, { signal }),
   (signal: AbortSignal) => fromXlsxWorkbook(new Uint8Array(0), { signal }),
   (signal: AbortSignal) => toXlsxTable(source.getWorkbook(), source, { signal }),
   (signal: AbortSignal) => fromXlsxTable(new Uint8Array(0), { signal }),
  ];

  try {
   for (const call of xlsxCalls) {
    const early = new AbortController();
    early.abort(new Error("aborted before the call"));
    await expect(call(early.signal)).rejects.toBe(early.signal.reason);

    const during = new AbortController();
    const reason = new Error("aborted during the call");
    abortDuringCall = () => during.abort(reason);
    await expect(call(during.signal)).rejects.toBe(reason);
    abortDuringCall = undefined;
   }
   expect(calls).toBe(xlsxCalls.length);
  } finally {
   resetXlsxBackends();
   source.dispose();
  }
 });

 it("cuts a long backend name in the failure context to 8 KiB", async () => {
  setXlsxWorkbookBackend({
   name: "b".repeat(1 << 20),
   toXlsxWorkbook: async () => {
    throw new Error("backend failed");
   },
   fromXlsxWorkbook: async () => {
    throw new Error("backend failed");
   },
  });

  try {
   const failure = await toXlsxWorkbook(snapshot).then(
    () => undefined,
    (error: unknown) => error,
   );
   if (!(failure instanceof SheetwriteError)) throw new Error("expected a SheetwriteError");
   expect(failure.code).toBe("export-failed");
   const backend = failure.context?.backend;
   if (typeof backend !== "string") throw new Error("expected a backend name in the context");
   expect(new TextEncoder().encode(backend).byteLength).toBeLessThanOrEqual(
    MAX_ERROR_TEXT_BYTES,
   );
  } finally {
   resetXlsxBackends();
  }
 });
});
