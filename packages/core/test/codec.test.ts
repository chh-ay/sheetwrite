import { expect, it } from "bun:test";

import { validateBuiltWorkbookSnapshot } from "../src/codec.js";
import {
  type SnapshotValidationOptions,
  validateWorkbookSnapshot,
} from "../src/document-protocol.js";
import type { CellStyle, SnapshotCell, WorkbookSnapshot } from "../src/types.js";

function book(cells: unknown[]): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    workbook: { activeSheet: "s1" },
    sheets: [
      {
        id: "s1",
        name: "Data",
        order: 0,
        rowCount: 4,
        columns: [
          { key: "a", header: "A", width: 80, type: "text" },
          { key: "b", header: "B", width: 80, type: "number" },
        ],
        cells: [
          { startRow: 0, startCol: 0, rowCount: 4, colCount: 2, cells: cells as SnapshotCell[] },
        ],
      },
    ],
  };
}

const style: CellStyle = {
  bold: true,
  color: "#112233",
  border: { all: { width: 1, style: "solid" } },
};
const text: SnapshotCell = {
  rowOffset: 0,
  colOffset: 0,
  value: { kind: "literal", value: "text" },
  style,
};
const formula: SnapshotCell = {
  rowOffset: 0,
  colOffset: 1,
  value: { kind: "formula", src: "=1+2" },
};
const valid: SnapshotCell[] = [
  text,
  formula,
  { rowOffset: 1, colOffset: 0, value: { kind: "literal", value: null }, style: { ...style } },
  { rowOffset: 1, colOffset: 1, value: { kind: "ref", target: { sheet: "s1", row: 0, col: 1 } } },
];
/** Two cells with an empty slot between them, as `new Array(n)` leaves one. */
const holed: unknown[] = [];
holed[0] = text;
holed[2] = formula;

/** Snapshots a reader could assemble wrongly; the built check must give the same verdict. */
const SNAPSHOTS: readonly [string, unknown[], SnapshotValidationOptions][] = [
  ["a valid workbook", valid, {}],
  ["a negative row offset", [{ ...text, rowOffset: -1 }], {}],
  ["an unknown value kind", [{ ...text, value: { kind: "other" } }], {}],
  ["a non-finite literal", [{ ...text, value: { kind: "literal", value: Number.NaN } }], {}],
  ["an undefined field", [{ ...formula, value: { kind: "formula", src: undefined } }], {}],
  ["an invalid style", [{ ...text, style: { bold: "yes", align: "middle" } }], {}],
  ["an invalid border", [{ ...text, style: { border: { top: { width: -1 } } } }], {}],
  [
    "a reference to a missing sheet",
    [{ ...text, value: { kind: "ref", target: { sheet: "gone", row: 0, col: 0 } } }],
    {},
  ],
  ["a cell outside its block", [{ ...formula, rowOffset: 9 }], {}],
  ["two cells at one address", [formula, formula], {}],
  ["a hole in the cells", holed, {}],
  ["a snapshot over the byte limit", valid, { resourceLimits: { maxSerializedBytes: 200 } }],
];

it.each(SNAPSHOTS)(
  "checks a built snapshot with %s as validateWorkbookSnapshot does",
  (_name, cells, options) => {
    const built = validateBuiltWorkbookSnapshot(book(cells), options);
    const exact = validateWorkbookSnapshot(book(cells), options);
    expect(built.ok).toBe(exact.ok);
    if (built.ok && exact.ok) expect(built.value).toEqual(exact.value);
    if (!built.ok && !exact.ok) {
      expect(built.errors.map((error) => error.code)).toEqual(
        exact.errors.map((error) => error.code),
      );
    }
  },
);

it("refuses a cell field behind a getter in the exact check", () => {
  const cell = { rowOffset: 0, colOffset: 0 };
  Object.defineProperty(cell, "value", {
    enumerable: true,
    get: () => ({ kind: "literal", value: 1 }),
  });
  expect(validateWorkbookSnapshot(book([cell])).ok).toBe(false);
});

it("reads no cell field from a polluted Object.prototype in the built check", () => {
  // A cell without its own row offset; the prototype lends it one.
  const cell = { colOffset: 0, value: { kind: "literal", value: 1 } };
  Reflect.set(Object.prototype, "rowOffset", 0);
  try {
    expect(validateBuiltWorkbookSnapshot(book([cell])).ok).toBe(false);
    expect(validateWorkbookSnapshot(book([cell])).ok).toBe(false);
  } finally {
    Reflect.deleteProperty(Object.prototype, "rowOffset");
  }
});
