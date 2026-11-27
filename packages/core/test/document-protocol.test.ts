import { beforeAll, describe, expect, it } from "bun:test";

import { deflateSync } from "fflate";

import {
  CheckedSnapshot,
  DEFAULT_SNAPSHOT_RESOURCE_LIMITS,
  DEFAULT_TRANSACTION_RESOURCE_LIMITS,
  type DocumentValidationError,
  type DocumentValidationResult,
  documentOpTarget,
  type MergeScanStats,
  overlappingMergeIndices,
  recheckSnapshotResources,
  resolveTransactionResourceLimits,
  validateDocumentOperationShape,
  validateTransactionResources,
  validateWorkbookSnapshot,
  WORKBOOK_SCHEMA_VERSION,
} from "../src/document-protocol.js";
import { initSheetwrite } from "../src/grid.js";
import {
  decodeRestoreBlock,
  encodeRestoreBlock,
  MAX_RESTORE_BLOCK_DECODED_BYTES,
} from "../src/restore-block.js";
import { SheetwriteStore } from "../src/store.js";
import type { DataValidationCondition, DocumentOp, WorkbookSnapshot } from "../src/types.js";
import { makeWorkbook } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

function rich_snapshot(): WorkbookSnapshot {
  return {
    schemaVersion: WORKBOOK_SCHEMA_VERSION,
    documentId: "doc-1",
    version: 7,
    workbook: {
      activeSheet: "sheet-a",
      namedRanges: [
        {
          name: "Totals",
          range: { sheet: "sheet-a", start: { row: 0, col: 1 }, end: { row: 2, col: 1 } },
        },
      ],
    },
    sheets: [
      {
        id: "sheet-b",
        name: "Lookup",
        order: 1,
        rowCount: 2,
        columns: [{ key: "label", header: "Label", width: 120, type: "text" }],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 2,
            colCount: 1,
            cells: [
              { rowOffset: 1, colOffset: 0, value: { kind: "literal", value: "later" } },
              { rowOffset: 0, colOffset: 0, value: { kind: "literal", value: "first" } },
            ],
          },
        ],
      },
      {
        id: "sheet-a",
        name: "Main",
        order: 0,
        rowCount: 4,
        columns: [
          { key: "name", header: "Name", width: 160, type: "text" },
          { key: "amount", header: "Amount", width: 100, type: "number", visible: false },
        ],
        frozenRows: 1,
        frozenCols: 1,
        rowMeta: [
          [2, { hidden: true }],
          [0, { height: 42 }],
        ],
        merges: [{ r0: 1, c0: 1, r1: 0, c1: 0 }],
        conditionalFormats: [
          {
            range: { sheet: "sheet-a", start: { row: 0, col: 1 }, end: { row: 3, col: 1 } },
            when: { kind: "greaterThan", value: 10 },
            style: { color: "#ff0000" },
          },
        ],
        rowGroups: [{ start: 1, end: 3, collapsed: true }],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 4,
            colCount: 2,
            cells: [
              {
                rowOffset: 2,
                colOffset: 1,
                value: { kind: "ref", target: { sheet: "sheet-b", row: 0, col: 0 } },
              },
              {
                rowOffset: 1,
                colOffset: 1,
                value: { kind: "formula", src: "=SUM(B1:B1)" },
                style: {
                  bold: true,
                  fontSize: 18,
                  fontFamily: "Calibri Light",
                  verticalAlign: "top",
                  numberFormat: "0.00%",
                },
              },
              { rowOffset: 0, colOffset: 0, value: { kind: "literal", value: "title" } },
            ],
          },
        ],
      },
    ],
  };
}

function merge_snapshot(
  merges: NonNullable<WorkbookSnapshot["sheets"][number]["merges"]>,
  row_count: number,
  column_count: number,
): WorkbookSnapshot {
  return {
    schemaVersion: WORKBOOK_SCHEMA_VERSION,
    documentId: "merge-validation",
    workbook: { activeSheet: "s" },
    sheets: [
      {
        id: "s",
        name: "Merges",
        order: 0,
        rowCount: row_count,
        columns: Array.from({ length: column_count }, (_, index) => ({
          key: `c${index}`,
          header: `C${index}`,
          width: 80,
          type: "text" as const,
        })),
        merges,
        cells: [],
      },
    ],
  };
}

function with_workbook(patch: Record<string, unknown>): unknown {
  const snapshot = rich_snapshot();
  return { ...snapshot, workbook: { ...snapshot.workbook, ...patch } };
}

function with_first_sheet(patch: Record<string, unknown>): unknown {
  const snapshot = rich_snapshot();
  return {
    ...snapshot,
    sheets: [{ ...snapshot.sheets[0]!, ...patch }, ...snapshot.sheets.slice(1)],
  };
}

function with_first_block(patch: Record<string, unknown>): unknown {
  const snapshot = rich_snapshot();
  const sheet = snapshot.sheets[0]!;
  return {
    ...snapshot,
    sheets: [
      {
        ...sheet,
        cells: [{ ...sheet.cells[0]!, ...patch }, ...sheet.cells.slice(1)],
      },
      ...snapshot.sheets.slice(1),
    ],
  };
}

function with_first_cell(patch: Record<string, unknown>): unknown {
  const snapshot = rich_snapshot();
  const sheet = snapshot.sheets[0]!;
  const block = sheet.cells[0]!;
  return {
    ...snapshot,
    sheets: [
      {
        ...sheet,
        cells: [
          {
            ...block,
            cells: [{ ...block.cells[0]!, ...patch }, ...block.cells.slice(1)],
          },
          ...sheet.cells.slice(1),
        ],
      },
      ...snapshot.sheets.slice(1),
    ],
  };
}

function expect_invalid(
  value: unknown,
  expected: Pick<DocumentValidationError, "path" | "code">,
): DocumentValidationResult {
  let result: DocumentValidationResult | undefined;
  expect(() => {
    result = validateWorkbookSnapshot(value);
  }).not.toThrow();
  if (!result || result.ok) throw new Error("malformed snapshot unexpectedly accepted");
  expect(result.errors).toContainEqual(expect.objectContaining(expected));
  return result;
}

describe("workbook document protocol", () => {
  it("round-trips every authoritative field through JSON", () => {
    const parsed: unknown = JSON.parse(JSON.stringify(rich_snapshot()));
    const result = validateWorkbookSnapshot(parsed);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("snapshot unexpectedly invalid");
    expect(result.value.sheets.map((sheet) => sheet.id)).toEqual(["sheet-a", "sheet-b"]);
    expect(result.value.sheets[0]?.merges).toEqual([{ r0: 0, c0: 0, r1: 1, c1: 1 }]);
    expect(result.value.sheets[0]?.rowMeta?.map(([row]) => row)).toEqual([0, 2]);
    expect(result.value.sheets[0]?.cells[0]?.cells.map((cell) => cell.rowOffset)).toEqual([
      0, 1, 2,
    ]);
    expect(result.value.sheets[0]?.cells[0]?.cells[1]).toMatchObject({
      value: { kind: "formula", src: "=SUM(B1:B1)" },
      style: {
        bold: true,
        fontSize: 18,
        fontFamily: "Calibri Light",
        verticalAlign: "top",
        numberFormat: "0.00%",
      },
    });
    expect(result.value).not.toHaveProperty("selection");
    expect(result.value).not.toHaveProperty("scrollTop");
    expect(result.value).not.toHaveProperty("zoom");
  });

  it("returns stable structured errors for every top-level trust-boundary value", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const inherited = Object.create({ inherited: true }) as Record<string, unknown>;
    inherited.schemaVersion = WORKBOOK_SCHEMA_VERSION;
    const null_prototype = Object.create(null) as Record<string, unknown>;
    null_prototype.schemaVersion = WORKBOOK_SCHEMA_VERSION;
    const hostile_proxy = new Proxy(
      {},
      {
        ownKeys(): never {
          throw new Error("validator trusted proxy reflection");
        },
      },
    );

    const cases: Array<{
      name: string;
      value: unknown;
      path: string;
      code: DocumentValidationError["code"];
    }> = [
      { name: "null", value: null, path: "$", code: "invalid-value" },
      { name: "undefined", value: undefined, path: "$", code: "non-serializable" },
      { name: "string", value: "snapshot", path: "$", code: "invalid-value" },
      { name: "number", value: 1, path: "$", code: "invalid-value" },
      { name: "boolean", value: true, path: "$", code: "invalid-value" },
      { name: "array", value: [], path: "$", code: "invalid-value" },
      { name: "function", value: () => undefined, path: "$", code: "non-serializable" },
      { name: "date", value: new Date(0), path: "$", code: "non-serializable" },
      { name: "map", value: new Map(), path: "$", code: "non-serializable" },
      { name: "set", value: new Set(), path: "$", code: "non-serializable" },
      { name: "typed array", value: new Uint8Array(), path: "$", code: "non-serializable" },
      { name: "cycle", value: cyclic, path: "self", code: "non-serializable" },
      { name: "inherited prototype", value: inherited, path: "$", code: "non-serializable" },
      { name: "null prototype", value: null_prototype, path: "$", code: "non-serializable" },
      { name: "hostile proxy", value: hostile_proxy, path: "$", code: "invalid-value" },
    ];

    for (const test_case of cases) {
      expect_invalid(test_case.value, { path: test_case.path, code: test_case.code });
    }
  });

  it("rejects malformed blocks, cells, ranges, values, and styles at exact paths", () => {
    const sheet = rich_snapshot().sheets[0]!;
    const block = sheet.cells[0]!;
    const cell = block.cells[0]!;
    const conditional_format = {
      range: { sheet: "sheet-b", start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
      when: { kind: "greaterThan", value: 0 },
      style: { bold: true },
    };
    const cell_path = "sheets[0].cells[0].cells[0]";
    const outside_range = (sheet: string, end_row: number) => ({
      sheet,
      start: { row: 0, col: 0 },
      end: { row: end_row, col: 0 },
    });
    const cases: Array<{ value: unknown; path: string; code?: DocumentValidationError["code"] }> = [
      { value: with_first_block({ startRow: 0.5 }), path: "sheets[0].cells[0].startRow" },
      { value: with_first_block({ rowCount: 0 }), path: "sheets[0].cells[0].rowCount" },
      { value: with_first_cell({ rowOffset: "0" }), path: `${cell_path}.rowOffset` },
      { value: with_first_cell({ value: { kind: "unknown" } }), path: `${cell_path}.value.kind` },
      {
        value: with_first_cell({ value: { kind: "formula", src: 1 } }),
        path: `${cell_path}.value.src`,
      },
      {
        value: with_first_cell({ value: { kind: "ref", target: null } }),
        path: `${cell_path}.value.target`,
      },
      { value: with_first_cell({ style: null }), path: `${cell_path}.style` },
      { value: with_first_cell({ style: { bold: "yes" } }), path: `${cell_path}.style.bold` },
      {
        // Families land inside a canvas font string; quotes and separators would inject.
        value: with_first_cell({ style: { fontFamily: 'Arial"; color: red' } }),
        path: `${cell_path}.style.fontFamily`,
      },
      {
        value: with_first_cell({ style: { fontFamily: "Arial, serif" } }),
        path: `${cell_path}.style.fontFamily`,
      },
      {
        value: with_first_cell({ style: { verticalAlign: "center" } }),
        path: `${cell_path}.style.verticalAlign`,
      },
      {
        value: with_first_cell({ style: { numberFormat: "0".repeat(256) } }),
        path: `${cell_path}.style.numberFormat`,
      },
      {
        value: with_first_sheet({ conditionalFormats: [{ ...conditional_format, range: null }] }),
        path: "sheets[0].conditionalFormats[0].range",
      },
      {
        value: with_first_sheet({
          conditionalFormats: [
            {
              ...conditional_format,
              range: { ...conditional_format.range, start: { row: 0.25, col: 0 } },
            },
          ],
        }),
        path: "sheets[0].conditionalFormats[0].range.start.row",
      },
      {
        value: with_first_cell({
          ...cell,
          value: { kind: "ref", target: { sheet: "missing", row: 0, col: 0 } },
        }),
        path: `${cell_path}.value.target`,
        code: "missing-reference",
      },
      {
        value: with_first_cell({
          ...cell,
          value: { kind: "ref", target: { sheet: "sheet-b", row: 99, col: 0 } },
        }),
        path: `${cell_path}.value.target`,
        code: "out-of-bounds",
      },
      {
        value: with_workbook({
          namedRanges: [{ name: "Missing", range: outside_range("missing", 0) }],
        }),
        path: "workbook.namedRanges[0].range",
        code: "missing-reference",
      },
      {
        value: with_workbook({
          namedRanges: [{ name: "Outside", range: outside_range("sheet-b", 9) }],
        }),
        path: "workbook.namedRanges[0].range",
        code: "out-of-bounds",
      },
    ];

    for (const test_case of cases) {
      expect_invalid(test_case.value, {
        path: test_case.path,
        code: test_case.code ?? "invalid-value",
      });
    }
  });

  it("rejects every value that is not closed under JSON serialization", () => {
    const accessor = Object.create(Object.prototype) as Record<string, unknown>;
    Object.defineProperty(accessor, "value", {
      enumerable: true,
      get(): never {
        throw new Error("validator invoked an untrusted getter");
      },
    });
    const sparse: unknown[] = [];
    sparse.length = 1;
    const nested_prototype = Object.create({ inherited: true }) as Record<string, unknown>;
    nested_prototype.value = "unsafe";

    const value_path = "sheets[0].cells[0].cells[0].value.value";
    const values: Array<{ value: unknown; path: string }> = [
      { value: Number.NaN, path: `${value_path}` },
      { value: Number.POSITIVE_INFINITY, path: `${value_path}` },
      { value: Number.NEGATIVE_INFINITY, path: `${value_path}` },
      { value: undefined, path: `${value_path}` },
      { value: new Date(0), path: `${value_path}` },
      { value: Symbol("unsafe"), path: `${value_path}` },
      { value: 1n, path: `${value_path}` },
      { value: accessor, path: `${value_path}.value` },
      { value: nested_prototype, path: `${value_path}` },
      { value: sparse, path: `${value_path}[0]` },
    ];

    for (const test_case of values) {
      expect_invalid(with_first_cell({ value: { kind: "literal", value: test_case.value } }), {
        path: test_case.path,
        code: "non-serializable",
      });
    }

    const metadata_values: Array<{ value: unknown; path: string }> = [
      {
        value: with_first_sheet({ rowMeta: [[0, { height: Number.NaN }]] }),
        path: "sheets[0].rowMeta[0][1].height",
      },
      {
        value: with_first_sheet({
          columns: [
            {
              ...rich_snapshot().sheets[0]!.columns[0]!,
              headerStyle: { color: new Date(0) },
            },
          ],
        }),
        path: "sheets[0].columns[0].headerStyle.color",
      },
    ];
    for (const test_case of metadata_values) {
      expect_invalid(test_case.value, { path: test_case.path, code: "non-serializable" });
    }
  });

  it("returns structured errors for invalid identities, bounds, merges, and schemas", () => {
    const future = { ...rich_snapshot(), schemaVersion: 2 };
    const future_result = validateWorkbookSnapshot(future);
    expect(future_result.ok).toBe(false);
    if (future_result.ok) throw new Error("future schema unexpectedly accepted");
    expect(future_result.errors.map((error) => error.code)).toContain("unsupported-schema");

    const invalid = rich_snapshot();
    invalid.sheets[1]!.id = "sheet-a";
    invalid.sheets[0]!.columns.push({
      ...invalid.sheets[0]!.columns[0]!,
      key: invalid.sheets[0]!.columns[0]!.key,
    });
    invalid.sheets[0]!.merges = [
      { r0: 0, c0: 0, r1: 1, c1: 0 },
      { r0: 1, c0: 0, r1: 1, c1: 1 },
    ];
    invalid.sheets[0]!.cells[0]!.cells.push({
      rowOffset: 99,
      colOffset: 0,
      value: { kind: "literal", value: null },
    });

    const result = validateWorkbookSnapshot(invalid);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("invalid snapshot unexpectedly accepted");
    expect(new Set(result.errors.map((error) => error.code))).toEqual(
      new Set(["duplicate-id", "overlapping-merge", "out-of-bounds"]),
    );
  });

  it("validates large disjoint merge sets in bounded work and keeps every merge", () => {
    for (const count of [1_000, 4_000, 16_000]) {
      const columns = 128;
      const merges = Array.from({ length: count }, (_, index) => ({
        r0: Math.floor(index / columns),
        c0: index % columns,
        r1: Math.floor(index / columns),
        c1: index % columns,
      })).reverse();
      const result = validateWorkbookSnapshot(
        merge_snapshot(merges, Math.ceil(count / columns), columns),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("disjoint merges unexpectedly rejected");
      expect(result.value.sheets[0]?.merges).toHaveLength(merges.length);
      expect(
        new Set(result.value.sheets[0]?.merges?.map((merge) => JSON.stringify(merge))),
      ).toEqual(new Set(merges.map((merge) => JSON.stringify(merge))));
      // Untrusted snapshots must validate merges in O(n log n), not pairwise.
      const stats: MergeScanStats = { nodeVisits: 0 };
      expect(overlappingMergeIndices(merges, stats).includes(true)).toBe(false);
      expect(stats.nodeVisits).toBeLessThan(count * (Math.ceil(Math.log2(count)) + 1) * 12);
    }
  });

  it("admits large disjoint merge sets on added sheets and rejects a distant overlap", () => {
    const count = 4_000;
    const columns = 128;
    const merges_per_row = columns / 2;
    // Admission requires each merge to cover more than one cell.
    const merges = Array.from({ length: count }, (_, index) => ({
      r0: Math.floor(index / merges_per_row),
      c0: (index % merges_per_row) * 2,
      r1: Math.floor(index / merges_per_row),
      c1: (index % merges_per_row) * 2 + 1,
    }));
    const [source] = merge_snapshot(merges, Math.ceil(count / merges_per_row), columns).sheets;
    if (!source) throw new Error("merge sheet missing");
    const store = new SheetwriteStore(makeWorkbook(1));

    const overlapping = { ...source, id: "overlap", name: "Overlap", order: 1 };
    overlapping.merges = [{ r0: 0, c0: 1, r1: 1, c1: 2 }, ...merges];
    expect(
      store.applyTransaction({ patches: [{ op: "addSheet", sheet: overlapping }] }),
    ).toMatchObject({
      status: "rejected",
    });

    const disjoint = { ...source, id: "added", name: "Added", order: 1 };
    expect(
      store.applyTransaction({ patches: [{ op: "addSheet", sheet: disjoint }] }),
    ).toMatchObject({
      status: "applied",
    });
    store.dispose();
  });

  it("rejects zero row heights like row metadata operations", () => {
    const snapshot = rich_snapshot();
    const input = {
      ...snapshot,
      sheets: snapshot.sheets.map((sheet) =>
        sheet.id === "sheet-a" ? { ...sheet, rowMeta: [[0, { height: 0 }]] } : sheet,
      ),
    };

    const result = validateWorkbookSnapshot(input);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("zero row height unexpectedly accepted");
    expect(result.errors.map((error) => error.path)).toContain("sheets[1].rowMeta[0][1].height");
  });

  it("orders canonical identifiers independently of the runtime locale", () => {
    const snapshot = rich_snapshot();
    const range = { sheet: "sheet-a", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } };
    const input = {
      ...snapshot,
      sheets: snapshot.sheets.map((sheet) =>
        sheet.id === "sheet-a"
          ? {
              ...sheet,
              protectedRanges: [
                { id: "a", range },
                { id: "B", range },
              ],
            }
          : sheet,
      ),
    };

    const result = validateWorkbookSnapshot(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("snapshot unexpectedly rejected");
    const sheet = result.value.sheets.find((candidate) => candidate.id === "sheet-a");
    expect(sheet?.protectedRanges?.map((protected_range) => protected_range.id)).toEqual([
      "B",
      "a",
    ]);
  });

  it("reports table column overflow as a table limit", () => {
    const snapshot = rich_snapshot();
    const columns = Array.from({ length: 16_385 }, (_, index) => ({ name: `C${index}` }));
    const input = {
      ...snapshot,
      sheets: snapshot.sheets.map((sheet) =>
        sheet.id === "sheet-a" ? { ...sheet, tables: [{ id: "wide", columns }] } : sheet,
      ),
    };

    const result = validateWorkbookSnapshot(input);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("wide table unexpectedly accepted");
    expect(result.errors[0]).toMatchObject({
      code: "resource-limit",
      path: expect.stringMatching(/\.tables\[0\]\.columns$/),
    });
  });

  it("validates named range scope, identity, and formula-safe names", () => {
    const scoped = rich_snapshot();
    scoped.workbook.namedRanges!.push({
      name: "Totals",
      scope: "sheet-a",
      range: { sheet: "sheet-a", start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
    });
    expect(validateWorkbookSnapshot(scoped).ok).toBe(true);

    scoped.workbook.namedRanges!.push({
      name: "totals",
      scope: "sheet-a",
      range: { sheet: "sheet-a", start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
    });
    const duplicate = validateWorkbookSnapshot(scoped);
    expect(duplicate.ok).toBe(false);
    if (duplicate.ok) throw new Error("duplicate named range unexpectedly accepted");
    expect(duplicate.errors.map((error) => error.code)).toContain("duplicate-id");

    const invalid = rich_snapshot();
    invalid.workbook.namedRanges = [
      {
        name: "A1",
        scope: "missing",
        range: { sheet: "sheet-a", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      },
    ];
    const invalid_result = validateWorkbookSnapshot(invalid);
    expect(invalid_result.ok).toBe(false);
    if (invalid_result.ok) throw new Error("invalid named range unexpectedly accepted");
    expect(new Set(invalid_result.errors.map((error) => error.code))).toEqual(
      new Set(["invalid-value"]),
    );

    const missing_scope = rich_snapshot();
    missing_scope.workbook.namedRanges![0]!.scope = "missing";
    const missing_scope_result = validateWorkbookSnapshot(missing_scope);
    expect(missing_scope_result.ok).toBe(false);
    if (missing_scope_result.ok) throw new Error("missing scope unexpectedly accepted");
    expect(missing_scope_result.errors.map((error) => error.code)).toContain("missing-reference");
  });

  it("accepts Excel's iteration limits and rejects anything the engine would refuse", () => {
    const boundaries = [
      { iterate: true, maxIterations: 1, maxChange: 0 },
      { iterate: false, maxIterations: 32_767, maxChange: 1e300 },
    ];
    for (const calculation of boundaries) {
      expect(validateWorkbookSnapshot(with_workbook({ calculation })).ok).toBe(true);
      expect(validateDocumentOperationShape({ op: "setCalculation", calculation })).toEqual([]);
    }

    const valid = { iterate: true, maxIterations: 100, maxChange: 0.001 };
    const invalid: Array<[field: string, value: unknown]> = [
      ["iterate", "1"],
      ["iterate", undefined],
      ["maxIterations", 0],
      ["maxIterations", 32_768],
      ["maxIterations", 1.5],
      ["maxIterations", "100"],
      ["maxChange", -0.001],
      ["maxChange", Number.POSITIVE_INFINITY],
      ["maxChange", Number.NaN],
    ];
    for (const [field, value] of invalid) {
      const calculation = { ...valid, [field]: value };
      const snapshot = validateWorkbookSnapshot(with_workbook({ calculation }));
      expect(snapshot.ok).toBe(false);
      if (snapshot.ok) throw new Error(`calculation.${field} = ${String(value)} accepted`);
      expect(snapshot.errors.map((error) => error.path)).toEqual([`workbook.calculation.${field}`]);
      expect(
        validateDocumentOperationShape({ op: "setCalculation", calculation }).map(
          (error) => error.path,
        ),
      ).toEqual([`operation.calculation.${field}`]);
    }
  });

  it("checks a conditional format's stopIfTrue in snapshots and operations alike", () => {
    const format = {
      range: { sheet: "sheet-a", start: { row: 0, col: 1 }, end: { row: 3, col: 1 } },
      when: { kind: "greaterThan", value: 10 },
      style: { color: "#ff0000" },
      stopIfTrue: "yes",
    };
    const snapshot = validateWorkbookSnapshot(with_first_sheet({ conditionalFormats: [format] }));
    expect(snapshot.ok).toBe(false);
    if (snapshot.ok) throw new Error("a text stopIfTrue was accepted");
    expect(snapshot.errors.map((error) => error.path)).toEqual([
      "sheets[0].conditionalFormats[0].stopIfTrue",
    ]);
    const operation = {
      op: "setSheetMeta",
      sheet: "sheet-a",
      patch: { conditionalFormats: [format] },
    };
    expect(validateDocumentOperationShape(operation).map((error) => error.path)).toEqual([
      "operation.patch.conditionalFormats[0].stopIfTrue",
    ]);
  });

  it("enforces every snapshot resource boundary before normalization", () => {
    const snapshot = rich_snapshot();
    snapshot.documentId = '雪\u0000"\n\ud800';
    const serialized_bytes = new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;
    const accepted_limits = [
      { maxSheets: 2 },
      { maxRowsPerSheet: 4 },
      { maxColumnsPerSheet: 2 },
      { maxMetadataEntries: 8 },
      { maxSerializedBytes: serialized_bytes },
      { maxLogicalCellsPerSheet: 8 },
      { maxDenseCells: 10, maxLocalPagedCells: 0 },
      // Past the dense cells, a sheet loads in local pages up to their own limit.
      { maxLocalPagedCells: 10, maxDenseCells: 0 },
    ] as const;
    for (const resource_limits of accepted_limits) {
      expect(validateWorkbookSnapshot(snapshot, { resourceLimits: resource_limits }).ok).toBe(true);
      const [resource, limit] = Object.entries(resource_limits)[0]!;
      const rejected = validateWorkbookSnapshot(snapshot, {
        resourceLimits: { ...resource_limits, [resource]: limit - 1 },
      });
      expect(rejected.ok).toBe(false);
      if (rejected.ok) throw new Error(`${resource} limit unexpectedly accepted`);
      expect(rejected.errors[0]).toMatchObject({ code: "resource-limit" });
    }

    const columns = Array.from({ length: 6 }, (_, index) => ({
      key: `c${index}`,
      header: `C${index}`,
      width: 80,
      type: "text" as const,
    }));
    const million_row_snapshot: WorkbookSnapshot = {
      schemaVersion: WORKBOOK_SCHEMA_VERSION,
      workbook: { activeSheet: "paged" },
      sheets: [
        {
          id: "paged",
          name: "Paged",
          order: 0,
          rowCount: DEFAULT_SNAPSHOT_RESOURCE_LIMITS.maxRowsPerSheet,
          columns,
          cells: [],
        },
      ],
    };
    const paged = validateWorkbookSnapshot(million_row_snapshot, { storage: "paged" });
    expect(paged.ok).toBe(true);
    // Six million cells pass the dense cell limit and load in local pages.
    expect(validateWorkbookSnapshot(million_row_snapshot, { storage: "dense" }).ok).toBe(true);
    const local = validateWorkbookSnapshot(million_row_snapshot, {
      resourceLimits: { maxLocalPagedCells: 5_999_999 },
    });
    expect(local.ok).toBe(false);
    if (local.ok) throw new Error("oversized local capacity unexpectedly accepted");
    expect(local.errors[0]).toMatchObject({ code: "resource-limit" });

    million_row_snapshot.sheets[0]!.rowCount += 1;
    const excessive_rows = validateWorkbookSnapshot(million_row_snapshot, { storage: "paged" });
    expect(excessive_rows.ok).toBe(false);
    if (excessive_rows.ok) throw new Error("excessive paged rows unexpectedly accepted");
    expect(excessive_rows.errors[0]).toMatchObject({
      path: "sheets[0].rowCount",
      code: "resource-limit",
    });
  });

  it("rechecks a checked snapshot against every limit as a second validation would", () => {
    const accepted = validateWorkbookSnapshot(rich_snapshot());
    if (!accepted.ok) throw new Error("the rich snapshot is invalid");
    const serialized_bytes = new TextEncoder().encode(JSON.stringify(accepted.value)).byteLength;
    const checked = new CheckedSnapshot(accepted.value, serialized_bytes);
    const limits = [
      { maxSheets: 2 },
      { maxRowsPerSheet: 4 },
      { maxColumnsPerSheet: 2 },
      { maxMetadataEntries: 8 },
      { maxSerializedBytes: serialized_bytes },
      { maxLogicalCellsPerSheet: 8 },
      { maxDenseCells: 10, maxLocalPagedCells: 0 },
      { maxLocalPagedCells: 10, maxDenseCells: 0 },
    ] as const;
    for (const resource_limits of limits) {
      const [resource, limit] = Object.entries(resource_limits)[0]!;
      for (const options of [
        { resourceLimits: resource_limits },
        { resourceLimits: { ...resource_limits, [resource]: limit - 1 } },
        {
          storage: "paged" as const,
          resourceLimits: { ...resource_limits, [resource]: limit - 1 },
        },
      ]) {
        const expected = validateWorkbookSnapshot(accepted.value, options);
        const rechecked = recheckSnapshotResources(checked, options);
        expect(rechecked.ok).toBe(expected.ok);
        if (!rechecked.ok && !expected.ok) expect(rechecked.errors).toEqual(expected.errors);
      }
    }
  });

  it("validates typed validation comparisons without weakening legacy bounds", () => {
    const comparisons: DataValidationCondition[] = [
      { kind: "number", comparison: { operator: "between", min: 1, max: 3 } },
      { kind: "number", comparison: { operator: "notBetween", min: 1, max: 3 } },
      { kind: "number", comparison: { operator: "equal", value: 2 } },
      { kind: "number", comparison: { operator: "notEqual", value: 2 } },
      { kind: "number", comparison: { operator: "greaterThan", value: 2 } },
      { kind: "number", comparison: { operator: "lessThan", value: 2 } },
      { kind: "number", comparison: { operator: "greaterThanOrEqual", value: 2 } },
      { kind: "number", comparison: { operator: "lessThanOrEqual", value: 2 } },
      { kind: "date", comparison: { operator: "notEqual", value: 45_000 } },
      { kind: "textLength", comparison: { operator: "lessThan", value: 8 } },
      { kind: "number", min: 0, max: 10 },
    ];
    const accepted = rich_snapshot();
    accepted.sheets[1]!.validationRules = comparisons.map((condition, index) => ({
      id: `comparison-${index}`,
      range: {
        sheet: "sheet-a",
        start: { row: 0, col: 0 },
        end: { row: 3, col: 1 },
      },
      condition,
      policy: "reject",
    }));
    expect(validateWorkbookSnapshot(accepted)).toMatchObject({ ok: true });

    const invalid_conditions: unknown[] = [
      {
        kind: "number",
        min: 0,
        comparison: { operator: "greaterThan", value: 1 },
      },
      { kind: "number", comparison: { operator: "notBetween", min: 1 } },
      { kind: "number", comparison: { operator: "equal", value: 1, min: 1 } },
      { kind: "number", comparison: { operator: "between", min: 3, max: 1 } },
      { kind: "number", comparison: { operator: "outside", value: 1 } },
      { kind: "textLength", comparison: { operator: "equal", value: 1.5 } },
      { kind: "textLength", comparison: { operator: "between", min: -1, max: 4 } },
    ];
    for (const [index, condition] of invalid_conditions.entries()) {
      const rejected = rich_snapshot();
      rejected.sheets[1]!.validationRules = [
        {
          id: `invalid-comparison-${index}`,
          range: {
            sheet: "sheet-a",
            start: { row: 0, col: 0 },
            end: { row: 0, col: 0 },
          },
          condition: condition as DataValidationCondition,
          policy: "reject",
        },
      ];
      expect(validateWorkbookSnapshot(rejected).ok).toBe(false);
    }
  });

  it("rejects every dimension-bearing metadata shape outside its sheet", () => {
    const snapshot = rich_snapshot();
    const sheet = snapshot.sheets[1]!;
    sheet.frozenRows = sheet.rowCount + 1;
    sheet.frozenCols = sheet.columns.length + 1;
    sheet.rowMeta = [[sheet.rowCount, { hidden: true }]];
    sheet.merges = [{ r0: 0, c0: 0, r1: sheet.rowCount, c1: 0 }];
    sheet.cells = [
      {
        startRow: sheet.rowCount,
        startCol: 0,
        rowCount: 1,
        colCount: 1,
        cells: [],
      },
    ];
    sheet.validationRules = [
      {
        id: "outside",
        range: {
          sheet: sheet.id,
          start: { row: 0, col: 0 },
          end: { row: sheet.rowCount, col: 0 },
        },
        condition: { kind: "number", min: 0 },
        policy: "reject",
      },
    ];
    sheet.protectedRanges = [
      {
        id: "outside",
        range: {
          sheet: sheet.id,
          start: { row: 0, col: 0 },
          end: { row: 0, col: sheet.columns.length },
        },
      },
    ];
    sheet.notes = [
      {
        addr: { sheet: sheet.id, row: sheet.rowCount, col: 0 },
        text: "outside",
      },
    ];

    const result = validateWorkbookSnapshot(snapshot);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("out-of-bounds metadata unexpectedly accepted");
    expect(result.errors.map((error) => error.path)).toEqual(
      expect.arrayContaining([
        "sheets[1].frozenRows",
        "sheets[1].frozenCols",
        "sheets[1].rowMeta[0][0]",
        "sheets[1].merges[0]",
        "sheets[1].cells[0]",
        "sheets[1].validationRules[0].range",
        "sheets[1].protectedRanges[0].range",
        "sheets[1].notes[0].addr",
      ]),
    );
  });

  it("targets emitted operations and keeps their payloads JSON-only", () => {
    const store = new SheetwriteStore(makeWorkbook(3));
    const emitted: DocumentOp[] = [];
    store.on("change", (event) => emitted.push(...event.transaction.patches));
    const result = store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 0, col: 0 },
          value: { kind: "literal", value: "saved" },
        },
        { op: "setNote", addr: { sheet: "s1", row: 0, col: 0 }, text: "review" },
        {
          op: "setValidationRule",
          sheet: "s1",
          rule: {
            id: "positive",
            range: {
              sheet: "s1",
              start: { row: 0, col: 1 },
              end: { row: 2, col: 1 },
            },
            condition: { kind: "number", min: 0 },
            policy: "reject",
          },
        },
      ],
    });

    expect(result.status).toBe("applied");
    expect(emitted.map(documentOpTarget)).toEqual(["s1", "s1", "s1"]);
    expect(JSON.parse(JSON.stringify(emitted))).toEqual(emitted);
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("saved");
    expect(store.getWorkbook().sheets[0]!.notes).toEqual([
      { addr: { sheet: "s1", row: 0, col: 0 }, text: "review" },
    ]);
    expect(store.getWorkbook().sheets[0]!.validationRules?.[0]?.id).toBe("positive");
    store.dispose();
  });
});

describe("transaction resource protocol", () => {
  const set_operation = (text: string): DocumentOp => ({
    op: "set",
    addr: { sheet: "s1", row: 0, col: 0 },
    value: { kind: "literal", value: text },
  });
  const json_bytes = (operations: readonly DocumentOp[]): number =>
    new TextEncoder().encode(JSON.stringify(operations)).byteLength;

  it("publishes validated inclusive defaults and rejects invalid overrides", () => {
    expect(DEFAULT_TRANSACTION_RESOURCE_LIMITS).toEqual({
      maxOperations: 10_000,
      maxEncodedBytes: 8 * 1024 * 1024,
    });
    expect(resolveTransactionResourceLimits({ maxOperations: 7 })).toEqual({
      maxOperations: 7,
      maxEncodedBytes: 8 * 1024 * 1024,
    });
    for (const invalid of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const invalid_limit = expect.objectContaining({
        code: "invalid-limits",
        operation: "transaction",
      });
      expect(() => resolveTransactionResourceLimits({ maxOperations: invalid })).toThrow(
        invalid_limit,
      );
      expect(() => resolveTransactionResourceLimits({ maxEncodedBytes: invalid })).toThrow(
        invalid_limit,
      );
    }
  });

  it("accepts the default operation-count limit and rejects limit plus one", () => {
    const operation = set_operation("x");
    const accepted = Array.from(
      { length: DEFAULT_TRANSACTION_RESOURCE_LIMITS.maxOperations },
      () => operation,
    );
    const result = validateTransactionResources(accepted);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("operation-count limit unexpectedly rejected");
    expect(result.operationCount).toBe(DEFAULT_TRANSACTION_RESOURCE_LIMITS.maxOperations);

    const rejected = validateTransactionResources([...accepted, operation]);
    expect(rejected).toMatchObject({
      ok: false,
      issue: {
        kind: "resource-limit",
        severity: "error",
        resource: "operations",
        actual: DEFAULT_TRANSACTION_RESOURCE_LIMITS.maxOperations + 1,
        max: DEFAULT_TRANSACTION_RESOURCE_LIMITS.maxOperations,
      },
    });
  });

  it("accepts an exactly 8 MiB long-string payload and rejects one extra byte", () => {
    const empty = [set_operation("")];
    const overhead = json_bytes(empty);
    const exact_text = "x".repeat(DEFAULT_TRANSACTION_RESOURCE_LIMITS.maxEncodedBytes - overhead);
    const exact = [set_operation(exact_text)];
    expect(json_bytes(exact)).toBe(DEFAULT_TRANSACTION_RESOURCE_LIMITS.maxEncodedBytes);

    const accepted = validateTransactionResources(exact);
    expect(accepted).toEqual({
      ok: true,
      operationCount: 1,
      encodedBytes: DEFAULT_TRANSACTION_RESOURCE_LIMITS.maxEncodedBytes,
    });

    const rejected = validateTransactionResources([set_operation(`${exact_text}x`)]);
    expect(rejected.ok).toBe(false);
    if (rejected.ok) throw new Error("limit-plus-one string unexpectedly accepted");
    expect(rejected.issue).toMatchObject({
      resource: "encoded-bytes",
      actual: DEFAULT_TRANSACTION_RESOURCE_LIMITS.maxEncodedBytes + 1,
      max: DEFAULT_TRANSACTION_RESOURCE_LIMITS.maxEncodedBytes,
    });
  });

  it("measures packed setBlock fields rather than their logical range area", () => {
    const packed = (text: string): DocumentOp => ({
      op: "setBlock",
      range: {
        sheet: "s1",
        start: { row: 0, col: 0 },
        end: { row: 0, col: 0 },
      },
      block: { rowCount: 1, colCount: 1, values: [text] },
    });
    const accepted_operations = [packed("packed".repeat(100))];
    const max_encoded_bytes = json_bytes(accepted_operations);
    expect(
      validateTransactionResources(accepted_operations, {
        maxOperations: 1,
        maxEncodedBytes: max_encoded_bytes,
      }),
    ).toEqual({ ok: true, operationCount: 1, encodedBytes: max_encoded_bytes });

    const rejected = validateTransactionResources([packed(`${"packed".repeat(100)}x`)], {
      maxOperations: 1,
      maxEncodedBytes: max_encoded_bytes,
    });
    expect(rejected.ok).toBe(false);
    if (rejected.ok) throw new Error("oversized packed block unexpectedly accepted");
    expect(rejected.issue).toMatchObject({
      resource: "encoded-bytes",
      actual: max_encoded_bytes + 1,
      max: max_encoded_bytes,
    });
  });
});

describe("compressed restore operation admission", () => {
  const restore_range = { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } };
  const restored_block = {
    rowCount: 2,
    colCount: 2,
    values: ["résumé", null, 42, true],
    formulas: [[1, "=A1"]] as [number, string][],
    refs: [[2, { sheet: "s1", row: 0, col: 0 }]] as [
      number,
      { sheet: string; row: number; col: number },
    ][],
    styleTable: [{ bold: true }],
    styleIds: [0, 0, 0, 0],
  };

  function raw_restore(
    bytes: Uint8Array,
    decoded_bytes = bytes.length,
  ): Extract<DocumentOp, { op: "restoreBlock" }> {
    const compressed = deflateSync(bytes);
    let binary = "";
    for (const byte of compressed) binary += String.fromCharCode(byte);
    return {
      op: "restoreBlock",
      range: restore_range,
      encoding: "deflate-json-v1",
      decodedBytes: decoded_bytes,
      data: btoa(binary),
    };
  }

  it("admits one compact operation and preserves every packed cell field", () => {
    const operation = encodeRestoreBlock(restore_range, restored_block);
    expect(validateDocumentOperationShape(operation)).toEqual([]);
    expect(decodeRestoreBlock(JSON.parse(JSON.stringify(operation)))).toEqual(restored_block);
    expect(documentOpTarget(operation)).toBe("s1");
    expect(validateTransactionResources([operation])).toMatchObject({
      ok: true,
      operationCount: 1,
    });
  });

  it("rejects malformed encoding, byte claims, UTF-8 and decoded block fields", () => {
    const valid = encodeRestoreBlock(restore_range, restored_block);
    const invalid_operations = [
      { ...valid, encoding: "unknown" },
      { ...valid, decodedBytes: valid.decodedBytes - 1 },
      { ...valid, decodedBytes: valid.decodedBytes + 1 },
      { ...valid, decodedBytes: MAX_RESTORE_BLOCK_DECODED_BYTES + 1 },
      { ...valid, data: `${valid.data}\\n` },
      { ...valid, data: "AA==" },
      { ...valid, data: btoa(atob(valid.data).slice(0, -1)) },
      { ...valid, data: btoa(`${atob(valid.data)}\\0`) },
      raw_restore(new Uint8Array([255])),
      raw_restore(new TextEncoder().encode(JSON.stringify({ ...restored_block, values: [1] }))),
      raw_restore(
        new TextEncoder().encode(
          JSON.stringify({ ...restored_block, refs: [[4, { sheet: "s1", row: 0, col: 0 }]] }),
        ),
      ),
      raw_restore(
        new TextEncoder().encode(
          JSON.stringify({
            ...restored_block,
            formulas: [
              [1, "=A1"],
              [1, "=A2"],
            ],
          }),
        ),
      ),
      raw_restore(
        new TextEncoder().encode(
          JSON.stringify({
            ...restored_block,
            refs: [
              [2, { sheet: "s1", row: 0, col: 0 }],
              [2, { sheet: "s1", row: 1, col: 0 }],
            ],
          }),
        ),
      ),
      raw_restore(
        new TextEncoder().encode(
          JSON.stringify({ ...restored_block, refs: [[1, { sheet: "s1", row: 0, col: 0 }]] }),
        ),
      ),
      raw_restore(
        new TextEncoder().encode(JSON.stringify({ rowCount: 4_000_001, colCount: 1, values: [] })),
      ),
    ];
    for (const operation of invalid_operations) {
      expect(validateDocumentOperationShape(operation).length).toBeGreaterThan(0);
    }
  });

  it("rejects restore envelope accessors without executing untrusted code", () => {
    const valid = encodeRestoreBlock(restore_range, restored_block);
    for (const field of ["encoding", "decodedBytes", "data"] as const) {
      let reads = 0;
      const operation = Object.defineProperty({ ...valid }, field, {
        enumerable: true,
        get() {
          reads++;
          return valid[field];
        },
      });
      expect(validateDocumentOperationShape(operation).length).toBeGreaterThan(0);
      expect(reads).toBe(0);
    }
  });

  it("rejects actual expansion over the decoded boundary even when the byte claim is allowed", () => {
    const bomb = raw_restore(
      new Uint8Array(MAX_RESTORE_BLOCK_DECODED_BYTES + 1),
      MAX_RESTORE_BLOCK_DECODED_BYTES,
    );
    expect(validateDocumentOperationShape(bomb).length).toBeGreaterThan(0);
    const tiny_claim = raw_restore(new Uint8Array(1024 * 1024), 1);
    expect(validateDocumentOperationShape(tiny_claim).length).toBeGreaterThan(0);
  });

  /** Runs `body` as a runtime without native base64 would. */
  function without_native_base64(body: () => void): void {
    const to_base64 = Object.getOwnPropertyDescriptor(Uint8Array.prototype, "toBase64");
    const from_base64 = Object.getOwnPropertyDescriptor(Uint8Array, "fromBase64");
    Reflect.deleteProperty(Uint8Array.prototype, "toBase64");
    Reflect.deleteProperty(Uint8Array, "fromBase64");
    try {
      body();
    } finally {
      if (to_base64) Object.defineProperty(Uint8Array.prototype, "toBase64", to_base64);
      if (from_base64) Object.defineProperty(Uint8Array, "fromBase64", from_base64);
    }
  }

  /** A valid restore whose base64 ends in padding, so it has unused bits to set. */
  function padded_restore(): Extract<DocumentOp, { op: "restoreBlock" }> {
    for (let length = 1; ; length++) {
      const operation = encodeRestoreBlock(
        { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
        { rowCount: 1, colCount: 1, values: ["x".repeat(length)] },
      );
      if (operation.data.endsWith("=")) return operation;
    }
  }

  it("rejects a non-canonical base64 spelling of a valid stream with and without native base64", () => {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const valid = padded_restore();
    const last = valid.data.length - (valid.data.endsWith("==") ? 3 : 2);
    const last_char = valid.data[last] ?? "";
    // The low bits of the last data character are padding; canonical base64 leaves them zero.
    const spelled = `${valid.data.slice(0, last)}${alphabet[alphabet.indexOf(last_char) | 1]}${valid.data.slice(last + 1)}`;
    expect(atob(spelled)).toBe(atob(valid.data));

    expect(validateDocumentOperationShape(valid)).toEqual([]);
    expect(validateDocumentOperationShape({ ...valid, data: spelled }).length).toBeGreaterThan(0);
    without_native_base64(() => {
      expect(validateDocumentOperationShape({ ...valid })).toEqual([]);
      expect(validateDocumentOperationShape({ ...valid, data: spelled }).length).toBeGreaterThan(0);
    });
  });

  it("encodes the same restore with and without native base64", () => {
    const native = encodeRestoreBlock(restore_range, restored_block);
    without_native_base64(() => {
      expect(encodeRestoreBlock(restore_range, restored_block)).toEqual(native);
    });
    expect(decodeRestoreBlock(native)).toEqual(restored_block);
  });
});

describe("restore protocol store boundary", () => {
  it("applies packed contents atomically and emits the compact operation rather than decoded payloads", () => {
    const store = new SheetwriteStore(makeWorkbook(3));
    const emitted: DocumentOp[] = [];
    store.on("change", (event) => emitted.push(...event.transaction.patches));
    const operation = encodeRestoreBlock(
      { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
      {
        rowCount: 2,
        colCount: 1,
        values: ["restored", 42],
        styleTable: [{ bold: true }],
        styleIds: [0, 0],
      },
    );
    expect(store.applyTransaction({ patches: [operation] }).status).toBe("applied");
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("restored");
    expect(store.getCell({ sheet: "s1", row: 1, col: 0 }).resolved).toBe(42);
    expect(store.getCell({ sheet: "s1", row: 1, col: 0 }).style).toMatchObject({ bold: true });
    expect(emitted).toEqual([operation]);

    const rejected = store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 0, col: 0 },
          value: { kind: "literal", value: "must not apply" },
        },
        { ...operation, decodedBytes: operation.decodedBytes - 1 },
      ],
    });
    expect(rejected.status).not.toBe("applied");
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("restored");
    expect(emitted).toEqual([operation]);
  });
});
