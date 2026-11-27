import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import {
  DelimitedTextOptionsError,
  type DelimitedTextResourceLimits,
  encodeDelimitedTextChunks,
} from "../src/delimited-text.js";
import { fromCsv, parseCsv, toCsv, toCsvStream, toTsv, toTsvStream } from "../src/export.js";
import { initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import type { Column, Workbook, WorkbookSnapshot } from "../src/types.js";
import {
  setXlsxTableExportBackend,
  setXlsxTableImportBackend,
  setXlsxWorkbookBackend,
} from "../src/xlsx-slots.js";
import { keepXlsxSlots } from "./fixtures.js";

let restore_xlsx_slots = keepXlsxSlots();
beforeEach(() => {
  restore_xlsx_slots = keepXlsxSlots();
});
afterEach(() => {
  restore_xlsx_slots();
});
import {
  fromXlsxTable,
  fromXlsxWorkbook,
  toXlsxTable,
  toXlsxWorkbook,
} from "../src/xlsx-bridge.js";

beforeAll(async () => {
  await initSheetwrite();
});

/** Records the parser and encoder handle between two abort checks. */
const RECORDS_PER_CHECK = 1024;
const RECORD_COUNT = 3_000;
const EXPORT_ROWS = 10;
const WINDOW_ROWS = 3;
/** Characters the encoder writes per slice of a long field. */
const FIELD_SLICE_CHARACTERS = 16 * 1024;
const SHORT_FIELDS = Array.from({ length: 20 }, (_unused, column) => `short ${column}`);
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

/** A real signal that aborts with `reason` at the `abort_at`-th `throwIfAborted()` call. */
function signal_aborting_at(abort_at: number, reason: Error): CountingSignal {
  const controller = new AbortController();
  const { signal } = controller;
  let checks = 0;
  signal.throwIfAborted = () => {
    checks += 1;
    if (checks === abort_at) controller.abort(reason);
    AbortSignal.prototype.throwIfAborted.call(signal);
  };
  return { signal, checks: () => checks };
}

/**
 * Run `operation` once with a signal that never fires to count its checks, then
 * once more aborting at each check. Every aborted run must fail with the reason.
 */
async function expect_abort_at_every_check(
  operation: (signal: AbortSignal) => unknown,
): Promise<number> {
  const counting = signal_aborting_at(Number.POSITIVE_INFINITY, new Error("never"));
  await operation(counting.signal);
  const total = counting.checks();

  for (let abort_at = 1; abort_at <= total; abort_at++) {
    const reason = new Error(`abort at check ${abort_at}`);
    const failure = await Promise.resolve()
      .then(() => operation(signal_aborting_at(abort_at, reason).signal))
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

describe("delimited-text abort", () => {
  it("parsing rejects with the reason before the scan and once per chunk of records", async () => {
    const csv = Array.from({ length: RECORD_COUNT }, (_unused, row) => `${row},x`).join("\r\n");
    // One check before the scan, then one per full chunk of records.
    const expected_checks = 1 + Math.floor(RECORD_COUNT / RECORDS_PER_CHECK);

    expect(await expect_abort_at_every_check((signal) => parseCsv(csv, { signal }))).toBe(
      expected_checks,
    );
    expect(await expect_abort_at_every_check((signal) => fromCsv(csv, columns, { signal }))).toBe(
      expected_checks,
    );
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
    const resource_limits: Partial<DelimitedTextResourceLimits> = {
      maxWriterWindowRows: WINDOW_ROWS,
    };
    const before = JSON.stringify(source.exportSnapshot());

    const windows = Math.ceil(EXPORT_ROWS / WINDOW_ROWS);
    for (const export_once of [
      (signal: AbortSignal) => toCsv(sheet, source, { signal, resourceLimits: resource_limits }),
      (signal: AbortSignal) => toTsv(range, source, { signal, resourceLimits: resource_limits }),
      (signal: AbortSignal) =>
        drain(toCsvStream(sheet, source, { signal, resourceLimits: resource_limits })),
      (signal: AbortSignal) =>
        drain(toTsvStream(range, source, { signal, resourceLimits: resource_limits })),
    ]) {
      const checks = await expect_abort_at_every_check(export_once);
      expect(checks).toBeGreaterThanOrEqual(windows);
      // One check per cell would be at least one per row and column.
      expect(checks).toBeLessThan(EXPORT_ROWS * columns.length);
    }

    expect(JSON.stringify(source.exportSnapshot())).toBe(before);
    source.dispose();
  });

  it("a long field adds a check between its slices, and short fields in its row add none", async () => {
    const slices = 3;
    const row = ["x".repeat(slices * FIELD_SLICE_CHARACTERS), ...SHORT_FIELDS];
    // One check for the first chunk of records, then one before each later slice.
    const expected_checks = 1 + (slices - 1);

    expect(
      await expect_abort_at_every_check((signal) => [
        ...encodeDelimitedTextChunks([row], ",", { signal }),
      ]),
    ).toBe(expected_checks);
  });

  it("an invalid option keeps only its type, never a copy of the value", () => {
    const resource_limits: Partial<DelimitedTextResourceLimits> = {};
    Reflect.set(resource_limits, "maxRows", "x".repeat(1 << 20));

    let failure: unknown;
    try {
      parseCsv("a", { resourceLimits: resource_limits });
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
    const late_failure = new TypeError("backend stream closed");
    let calls = 0;
    let abort_during_call: (() => void) | undefined;
    const fail_after_abort = async (): Promise<never> => {
      calls += 1;
      abort_during_call?.();
      throw late_failure;
    };
    setXlsxWorkbookBackend({
      name: "abort-test",
      toXlsxWorkbook: fail_after_abort,
      fromXlsxWorkbook: fail_after_abort,
    });
    setXlsxTableExportBackend({ name: "abort-test", toXlsxTable: fail_after_abort });
    setXlsxTableImportBackend({ name: "abort-test", fromXlsxTable: fail_after_abort });
    const source = store();
    const xlsx_calls = [
      (signal: AbortSignal) => toXlsxWorkbook(snapshot, { signal }),
      (signal: AbortSignal) => fromXlsxWorkbook(new Uint8Array(0), { signal }),
      (signal: AbortSignal) => toXlsxTable(source.getWorkbook(), source, { signal }),
      (signal: AbortSignal) => fromXlsxTable(new Uint8Array(0), { signal }),
    ];

    try {
      for (const call of xlsx_calls) {
        const early = new AbortController();
        early.abort(new Error("aborted before the call"));
        await expect(call(early.signal)).rejects.toBe(early.signal.reason);

        const during = new AbortController();
        const reason = new Error("aborted during the call");
        abort_during_call = () => during.abort(reason);
        await expect(call(during.signal)).rejects.toBe(reason);
        abort_during_call = undefined;
      }
      expect(calls).toBe(xlsx_calls.length);
    } finally {
      source.dispose();
    }
  });
});
