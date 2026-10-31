import { describe, expect, it } from "bun:test";

import {
  createSimpleGridInput,
  SheetwriteError as AdapterSheetwriteError,
} from "../src/adapter.js";
import { DelimitedTextOptionsError, DelimitedTextResourceError } from "../src/delimited-text.js";
import {
  assertWorkbookAllocationLimits,
  SnapshotResourceError,
  SnapshotValidationError,
  validateTransactionResources,
} from "../src/document-protocol.js";
import {
  isSheetwriteError,
  JsonByteLengthError,
  normalizeSheetwriteError,
  SHEETWRITE_ERROR_CODES,
  SHEETWRITE_ERROR_OPERATIONS,
  SheetwriteError,
  type SheetwriteErrorCode,
  type SheetwriteErrorOperation,
} from "../src/errors.js";
import { XlsxResourceError } from "../src/export.js";
import { SheetwriteError as FullSheetwriteError } from "../src/index.js";
import { IndexedDbPendingCommitStorageError } from "../src/indexeddb.js";
import { PersistenceError } from "../src/persistence.js";
import { decodeStoreMemoryStats } from "../src/resource-accounting.js";
import { encodeRestoreBlock } from "../src/restore-block.js";
import { createRowBridge } from "../src/row-bridge.js";
import { IncompleteDataError } from "../src/store/data-engine.js";
import { SyncPendingCapacityError, SyncProtocolError } from "../src/sync.js";
import type { Workbook } from "../src/types/document.js";

const MAX_ERROR_TEXT_BYTES = 8 * 1024;
const utf8Bytes = (text: string): number => new TextEncoder().encode(text).length;

function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("expected a throw");
}

describe("SheetwriteError", () => {
  it("has one runtime identity across public core entries", () => {
    expect(FullSheetwriteError).toBe(SheetwriteError);
    expect(AdapterSheetwriteError).toBe(SheetwriteError);
  });

  it("serializes a stable envelope without leaking its cause", () => {
    const cause = new Error("socket closed");
    const error = new SheetwriteError(
      "datasource-request-failed",
      "datasource-request",
      cause.message,
      {
        cause,
        context: { sheet: "sales", request: { start: 20, count: 40 } },
        retryable: true,
      },
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.cause).toBe(cause);
    expect(error.toJSON()).toEqual({
      name: "SheetwriteError",
      message: "socket closed",
      code: "datasource-request-failed",
      operation: "datasource-request",
      context: { sheet: "sales", request: { start: 20, count: 40 } },
      retryable: true,
    });
    expect(JSON.stringify(error)).not.toContain("cause");
  });

  it("retains canonical instances, reconstructs serialized envelopes, and wraps causes once", () => {
    const canonical = new SheetwriteError("aborted", "persistence", "cancelled");
    expect(normalizeSheetwriteError(canonical, "not-found", "persistence")).toBe(canonical);

    const serialized = canonical.toJSON();
    const reconstructed = normalizeSheetwriteError(serialized, "not-found", "persistence");
    expect(reconstructed).toBeInstanceOf(SheetwriteError);
    expect(reconstructed).not.toBe(serialized);
    expect(reconstructed.toJSON()).toEqual(serialized);
    expect(reconstructed.cause).toBe(serialized);

    const cause = new TypeError("bad transport");
    const wrapped = normalizeSheetwriteError(
      cause,
      "datasource-request-failed",
      "datasource-request",
      {
        sheet: "s1",
      },
    );
    expect(wrapped).toMatchObject({
      code: "datasource-request-failed",
      operation: "datasource-request",
      message: "bad transport",
      context: { sheet: "s1" },
    });
    expect(wrapped.cause).toBe(cause);
  });

  it("keeps legacy domain subclasses inside the canonical envelope", () => {
    const failures = [
      new DelimitedTextResourceError("maxCells", 10, 11, "parse"),
      new XlsxResourceError("maxCells", 10, 11, "import"),
      new SnapshotResourceError("maxDenseCells", 10, 11),
      new PersistenceError("not-found", "missing document"),
      new IndexedDbPendingCommitStorageError("quota", "quota exceeded"),
      new SyncProtocolError("invalid-version", "invalid version"),
    ];
    const codes = new Set<string>(SHEETWRITE_ERROR_CODES);
    const operations = new Set<string>(SHEETWRITE_ERROR_OPERATIONS);

    for (const failure of failures) {
      expect(failure).toBeInstanceOf(SheetwriteError);
      expect(codes.has(failure.code)).toBe(true);
      expect(operations.has(failure.operation)).toBe(true);
      expect(isSheetwriteError(failure)).toBe(true);
    }
  });
});

describe("isSheetwriteError", () => {
  it("accepts every subclass and envelopes whose code this release does not know", () => {
    const failures = [
      new DelimitedTextOptionsError("maxCells", -1),
      new SnapshotValidationError([{ path: "$", code: "invalid-value", message: "bad" }]),
      new SyncPendingCapacityError({
        kind: "resource-limit",
        severity: "error",
        resource: "pending-commits",
        actual: 2,
        max: 1,
        message: "full",
      }),
      new IncompleteDataError("s1", { status: "incomplete", loadedCells: 1, totalCells: 2 }),
      new JsonByteLengthError("payload-limit", "too large", 9, 8),
    ];
    for (const failure of failures) expect(isSheetwriteError(failure)).toBe(true);

    expect(
      isSheetwriteError({
        name: "SheetwriteError",
        message: "from a newer release",
        code: "code-from-a-newer-release",
        operation: "operation-from-a-newer-release",
      }),
    ).toBe(true);
  });

  it("rejects values without the failure shape", () => {
    const throwingProxy = new Proxy(
      {},
      {
        get() {
          throw new Error("trap");
        },
      },
    );
    const lookAlikes: unknown[] = [
      null,
      "SheetwriteError",
      new Error("plain"),
      Object.assign(new Error("no such file"), { code: "ENOENT" }),
      new DOMException("stopped", "AbortError"),
      { name: "SheetwriteError", message: "m", code: 7, operation: "store" },
      { name: "SheetwriteError", message: "m", code: "", operation: "store" },
      { name: "SheetwriteError", message: "m", code: "not-found" },
      {
        name: "SheetwriteError",
        message: "m",
        code: "not-found",
        operation: "store",
        retryable: 1,
      },
      {
        name: "SheetwriteError",
        message: "m",
        code: "not-found",
        operation: "store",
        context: { owner: new Map() },
      },
      throwingProxy,
    ];

    for (const value of lookAlikes) expect(isSheetwriteError(value)).toBe(false);
  });

  it("lists every code and operation of the type unions", () => {
    // A code or operation missing from the arrays fails to compile here.
    const codes: Record<SheetwriteErrorCode, true> = Object.fromEntries(
      SHEETWRITE_ERROR_CODES.map((code) => [code, true]),
    ) as Record<(typeof SHEETWRITE_ERROR_CODES)[number], true>;
    const operations: Record<SheetwriteErrorOperation, true> = Object.fromEntries(
      SHEETWRITE_ERROR_OPERATIONS.map((operation) => [operation, true]),
    ) as Record<(typeof SHEETWRITE_ERROR_OPERATIONS)[number], true>;

    expect(Object.keys(codes)).toHaveLength(SHEETWRITE_ERROR_CODES.length);
    expect(Object.keys(operations)).toHaveLength(SHEETWRITE_ERROR_OPERATIONS.length);
  });
});

describe("SheetwriteError size", () => {
  it("still builds the error when its context passes a cap", () => {
    const failure = new SheetwriteError("datasource-request-failed", "datasource-request", "m", {
      context: { columns: Array.from({ length: 2_000 }, (_, index) => index) },
    });

    expect(failure.code).toBe("datasource-request-failed");
    expect(failure.context).toEqual({ truncated: true });
  });

  it("cuts host text in the message and context to 8 KiB", () => {
    const hostText = `start${"é".repeat(50_000)}end`;
    const failure = new SheetwriteError("not-found", "store", hostText, {
      context: { first: hostText, second: hostText, count: 3 },
    });
    const context = failure.context as { first: string; second: string; count: number };

    expect(utf8Bytes(failure.message)).toBeLessThanOrEqual(MAX_ERROR_TEXT_BYTES);
    expect(failure.message.startsWith("start")).toBe(true);
    expect(failure.message.endsWith("end")).toBe(true);
    expect(utf8Bytes(context.first) + utf8Bytes(context.second)).toBeLessThanOrEqual(
      MAX_ERROR_TEXT_BYTES,
    );
    expect(context.count).toBe(3);
  });

  it("keeps the first 64 snapshot issues and counts all of them", () => {
    const issues = Array.from({ length: 1_000 }, (_, index) => ({
      path: `$.sheets[${index}]`,
      code: "invalid-value" as const,
      message: "bad sheet",
    }));
    const failure = new SnapshotValidationError(issues);

    expect(failure.errors).toHaveLength(64);
    expect(failure.context).toMatchObject({ issueCount: 1_000, firstPath: "$.sheets[0]" });
  });
});

describe("typed failures on public paths", () => {
  it("reports bad host input with a code and an operation", () => {
    const workbook: Workbook = {
      activeSheet: "s1",
      sheets: [
        {
          id: "s1",
          name: "Sheet1",
          rowCount: 1,
          columns: [{ key: "a", header: "A", width: 100, type: "text" }],
        },
      ],
    };
    const cases: Array<[() => unknown, SheetwriteErrorCode, SheetwriteErrorOperation]> = [
      [() => validateTransactionResources("patches" as never), "invalid-operations", "transaction"],
      [
        () => assertWorkbookAllocationLimits(workbook, { resourceLimits: { maxSheets: -1 } }),
        "invalid-limits",
        "snapshot-allocate",
      ],
      [
        () =>
          encodeRestoreBlock(
            { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
            { rowCount: 1, colCount: 1, values: [null] },
          ),
        "invalid-operations",
        "transaction",
      ],
      [() => decodeStoreMemoryStats([], null), "invalid-argument", "resource-diagnostics"],
      [
        () =>
          createSimpleGridInput({
            columns: [
              { key: "a", title: "A" },
              { key: "a", title: "B" },
            ],
            defaultRows: [],
          }),
        "invalid-argument",
        "create-grid",
      ],
      [
        () =>
          createRowBridge({
            columns: [{ key: "id" }],
            defaultRows: [{ id: "r1" }, { id: "r1" }],
            getRowId: (row) => row.id,
          }),
        "invalid-argument",
        "row-bridge",
      ],
    ];

    for (const [run, code, operation] of cases) {
      const failure = thrownBy(run);
      expect(failure).toBeInstanceOf(SheetwriteError);
      expect(failure).toMatchObject({ code, operation });
    }
  });
});
