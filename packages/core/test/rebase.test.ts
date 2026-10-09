import { describe, expect, it } from "bun:test";
import {
  type CellAddress,
  type CellValue,
  type Column,
  type DocumentOp,
  type Range,
  type RebaseConflictCode,
  rebaseDocumentOperations,
  type SheetSnapshot,
} from "../src/index.js";
import { decodeRestoreBlock, encodeRestoreBlock } from "../src/restore-block.js";

const SHEET = "s1";
const OTHER_SHEET = "s2";
const AXES = ["row", "column"] as const;
type Axis = (typeof AXES)[number];
type StructuralKind = "insert" | "delete";

type RebaseConflictFamily = "cell" | "range" | "sheet" | "named-range";

function columns(count: number): Column[] {
  return Array.from({ length: count }, (_, index) => ({
    key: `column-${index}`,
    header: `Column ${index}`,
    width: 100,
    type: "text",
  }));
}

function address(axis: Axis, index: number, sheet = SHEET): CellAddress {
  return axis === "row" ? { sheet, row: index, col: 1 } : { sheet, row: 1, col: index };
}

function range(axis: Axis, start: number, end: number, sheet = SHEET): Range {
  return axis === "row"
    ? { sheet, start: { row: start, col: 1 }, end: { row: end, col: 2 } }
    : { sheet, start: { row: 1, col: start }, end: { row: 2, col: end } };
}

function structure(axis: Axis, kind: StructuralKind, at = 4, count = 2, sheet = SHEET): DocumentOp {
  if (axis === "row") {
    return kind === "insert"
      ? { op: "addRows", sheet, at, count }
      : { op: "removeRows", sheet, at, count };
  }
  return kind === "insert"
    ? { op: "addColumns", sheet, at, columns: columns(count) }
    : { op: "removeColumns", sheet, at, count };
}

function literal(value: string | number = "value"): CellValue {
  return { kind: "literal", value };
}

function snapshot(id = "new-sheet", values: CellValue[] = [literal()]): SheetSnapshot {
  return {
    id,
    name: `Sheet ${id}`,
    order: 2,
    rowCount: 20,
    columns: columns(3),
    cells: [
      {
        startRow: 0,
        startCol: 0,
        rowCount: values.length,
        colCount: 1,
        cells: values.map((value, rowOffset) => ({ rowOffset, colOffset: 0, value })),
      },
    ],
  };
}

function expectRebased(
  local: readonly DocumentOp[],
  remote: readonly DocumentOp[],
  expected: readonly DocumentOp[],
): void {
  expect(rebaseDocumentOperations(local, remote)).toEqual({
    status: "rebased",
    operations: expected,
  });
}

function expectConflict(
  local: readonly DocumentOp[],
  remote: readonly DocumentOp[],
  code: RebaseConflictCode,
  localOperationIndex = 0,
  remoteOperationIndex = 0,
): void {
  const result = rebaseDocumentOperations(local, remote);
  expect(result.status).toBe("conflict");
  if (result.status !== "conflict") throw new Error("Expected a rebase conflict");
  expect(result.conflict).toEqual({
    code,
    localOperationIndex,
    remoteOperationIndex,
    message: expect.any(String),
  });
}

/** Freezes every object reachable from `value`; a write to it throws in strict mode. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

interface PointFactory {
  name: string;
  make(axis: Axis, index: number, sheet?: string): DocumentOp;
}

function pointFactories(axis: Axis): PointFactory[] {
  return [
    axis === "row"
      ? {
          name: "setRowMeta",
          make: (_targetAxis, index, sheet = SHEET) => ({
            op: "setRowMeta",
            sheet,
            row: index,
            meta: { height: 32 },
          }),
        }
      : {
          name: "setColumn",
          make: (_targetAxis, index, sheet = SHEET) => ({
            op: "setColumn",
            sheet,
            col: index,
            patch: { width: 160 },
          }),
        },
  ];
}

interface RangeFactory {
  name: string;
  make(axis: Axis, start: number, end: number, sheet?: string): DocumentOp;
}

const RANGE_FACTORIES: RangeFactory[] = [
  {
    name: "addMerge",
    make: (axis, start, end, sheet = SHEET) => {
      const target = range(axis, start, end, sheet);
      return {
        op: "addMerge",
        sheet,
        merge: {
          r0: target.start.row,
          c0: target.start.col,
          r1: target.end.row,
          c1: target.end.col,
        },
      };
    },
  },
  {
    name: "setValidationRule",
    make: (axis, start, end, sheet = SHEET) => ({
      op: "setValidationRule",
      sheet,
      rule: {
        id: "validation-1",
        range: range(axis, start, end, sheet),
        condition: { kind: "number", min: 0 },
        policy: "reject",
      },
    }),
  },
  {
    name: "setProtectedRange",
    make: (axis, start, end, sheet = SHEET) => ({
      op: "setProtectedRange",
      sheet,
      protectedRange: {
        id: "protection-1",
        range: range(axis, start, end, sheet),
        permissionKey: "edit",
      },
    }),
  },
  {
    name: "setNamedRange",
    make: (axis, start, end, sheet = SHEET) => ({
      op: "setNamedRange",
      namedRange: { name: "Sales", scope: sheet, range: range(axis, start, end, sheet) },
    }),
  },
];

interface SpanFactory {
  name: string;
  make(axis: Axis, at: number, count: number, sheet?: string): DocumentOp;
}

const SPAN_FACTORIES: SpanFactory[] = [
  {
    name: "remove",
    make: (axis, at, count, sheet = SHEET) =>
      axis === "row"
        ? { op: "removeRows", sheet, at, count }
        : { op: "removeColumns", sheet, at, count },
  },
  {
    name: "move",
    make: (axis, at, count, sheet = SHEET) =>
      axis === "row"
        ? { op: "moveRows", sheet, from: at, count, to: 0 }
        : { op: "moveColumns", sheet, from: at, count, to: 0 },
  },
];

for (const axis of AXES) {
  describe(`${axis} structural target matrix`, () => {
    for (const factory of pointFactories(axis)) {
      it(`${factory.name} handles insert/delete positions and sheet identity`, () => {
        const insert = structure(axis, "insert");
        expectRebased([factory.make(axis, 2)], [insert], [factory.make(axis, 2)]);
        expectRebased([factory.make(axis, 4)], [insert], [factory.make(axis, 6)]);
        expectRebased([factory.make(axis, 7)], [insert], [factory.make(axis, 9)]);
        expectRebased(
          [factory.make(axis, 4, OTHER_SHEET)],
          [insert],
          [factory.make(axis, 4, OTHER_SHEET)],
        );

        const deletion = structure(axis, "delete");
        expectRebased([factory.make(axis, 2)], [deletion], [factory.make(axis, 2)]);
        expectConflict([factory.make(axis, 4)], [deletion], "structural-overlap");
        expectRebased([factory.make(axis, 7)], [deletion], [factory.make(axis, 5)]);
        expectRebased([factory.make(axis, 3)], [deletion], [factory.make(axis, 3)]);
        expectRebased([factory.make(axis, 6)], [deletion], [factory.make(axis, 4)]);
        expectRebased(
          [factory.make(axis, 4, OTHER_SHEET)],
          [deletion],
          [factory.make(axis, 4, OTHER_SHEET)],
        );
      });
    }

    for (const factory of RANGE_FACTORIES) {
      it(`${factory.name} handles the complete range relation matrix`, () => {
        const insert = structure(axis, "insert");
        expectRebased([factory.make(axis, 1, 2)], [insert], [factory.make(axis, 1, 2)]);
        expectRebased([factory.make(axis, 4, 5)], [insert], [factory.make(axis, 6, 7)]);
        expectRebased([factory.make(axis, 7, 8)], [insert], [factory.make(axis, 9, 10)]);
        expectConflict([factory.make(axis, 3, 6)], [insert], "structural-overlap");
        expectRebased([factory.make(axis, 2, 3)], [insert], [factory.make(axis, 2, 3)]);
        expectRebased(
          [factory.make(axis, 3, 6, OTHER_SHEET)],
          [insert],
          [factory.make(axis, 3, 6, OTHER_SHEET)],
        );

        const deletion = structure(axis, "delete");
        expectRebased([factory.make(axis, 1, 2)], [deletion], [factory.make(axis, 1, 2)]);
        expectRebased([factory.make(axis, 7, 8)], [deletion], [factory.make(axis, 5, 6)]);
        expectConflict([factory.make(axis, 4, 5)], [deletion], "structural-overlap");
        expectConflict([factory.make(axis, 3, 4)], [deletion], "structural-overlap");
        expectConflict([factory.make(axis, 3, 6)], [deletion], "structural-overlap");
        expectRebased([factory.make(axis, 2, 3)], [deletion], [factory.make(axis, 2, 3)]);
        expectRebased([factory.make(axis, 6, 7)], [deletion], [factory.make(axis, 4, 5)]);
        expectRebased(
          [factory.make(axis, 3, 6, OTHER_SHEET)],
          [deletion],
          [factory.make(axis, 3, 6, OTHER_SHEET)],
        );
      });
    }

    it(`add${axis === "row" ? "Rows" : "Columns"} transforms insertion positions`, () => {
      const make = (at: number, sheet = SHEET): DocumentOp =>
        axis === "row"
          ? { op: "addRows", sheet, at, count: 2 }
          : { op: "addColumns", sheet, at, columns: columns(2) };
      const insert = structure(axis, "insert");
      expectRebased([make(2)], [insert], [make(2)]);
      expectRebased([make(4)], [insert], [make(6)]);
      expectRebased([make(7)], [insert], [make(9)]);
      expectRebased([make(4, OTHER_SHEET)], [insert], [make(4, OTHER_SHEET)]);

      const deletion = structure(axis, "delete");
      expectRebased([make(2)], [deletion], [make(2)]);
      expectRebased([make(4)], [deletion], [make(4)]);
      expectRebased([make(5)], [deletion], [make(4)]);
      expectRebased([make(7)], [deletion], [make(5)]);
      expectRebased([make(4, OTHER_SHEET)], [deletion], [make(4, OTHER_SHEET)]);
    });

    for (const factory of SPAN_FACTORIES) {
      it(`${factory.name} ${axis} operations handle the complete span relation matrix`, () => {
        const insert = structure(axis, "insert");
        expectRebased([factory.make(axis, 1, 2)], [insert], [factory.make(axis, 1, 2)]);
        expectRebased([factory.make(axis, 4, 2)], [insert], [factory.make(axis, 6, 2)]);
        expectRebased([factory.make(axis, 7, 2)], [insert], [factory.make(axis, 9, 2)]);
        expectConflict([factory.make(axis, 3, 4)], [insert], "structural-overlap");
        expectRebased(
          [factory.make(axis, 3, 4, OTHER_SHEET)],
          [insert],
          [factory.make(axis, 3, 4, OTHER_SHEET)],
        );

        const deletion = structure(axis, "delete");
        expectRebased([factory.make(axis, 1, 2)], [deletion], [factory.make(axis, 1, 2)]);
        expectRebased([factory.make(axis, 7, 2)], [deletion], [factory.make(axis, 5, 2)]);
        expectConflict([factory.make(axis, 4, 2)], [deletion], "structural-overlap");
        expectConflict([factory.make(axis, 3, 2)], [deletion], "structural-overlap");
        expectConflict([factory.make(axis, 3, 4)], [deletion], "structural-overlap");
        expectRebased([factory.make(axis, 2, 2)], [deletion], [factory.make(axis, 2, 2)]);
        expectRebased([factory.make(axis, 6, 2)], [deletion], [factory.make(axis, 4, 2)]);
        expectRebased(
          [factory.make(axis, 3, 4, OTHER_SHEET)],
          [deletion],
          [factory.make(axis, 3, 4, OTHER_SHEET)],
        );
      });
    }

    it(`moves the ${axis} destination when the server changes preceding indices`, () => {
      const local: DocumentOp =
        axis === "row"
          ? { op: "moveRows", sheet: SHEET, from: 0, count: 1, to: 7 }
          : { op: "moveColumns", sheet: SHEET, from: 0, count: 1, to: 7 };
      const inserted: DocumentOp =
        axis === "row"
          ? { op: "moveRows", sheet: SHEET, from: 0, count: 1, to: 9 }
          : { op: "moveColumns", sheet: SHEET, from: 0, count: 1, to: 9 };
      const deleted: DocumentOp =
        axis === "row"
          ? { op: "moveRows", sheet: SHEET, from: 0, count: 1, to: 5 }
          : { op: "moveColumns", sheet: SHEET, from: 0, count: 1, to: 5 };
      expectRebased([local], [structure(axis, "insert")], [inserted]);
      expectRebased([local], [structure(axis, "delete")], [deleted]);
    });
  });
}

describe("embedded references and formulas", () => {
  const containers = [
    {
      name: "set",
      make: (value: CellValue): DocumentOp => ({
        op: "set",
        addr: { sheet: OTHER_SHEET, row: 0, col: 0 },
        value,
      }),
    },
    {
      name: "setRange sparse cells",
      make: (value: CellValue): DocumentOp => ({
        op: "setRange",
        range: range("row", 0, 0, OTHER_SHEET),
        cells: [{ rowOffset: 0, colOffset: 0, value }],
      }),
    },
    {
      name: "addSheet snapshot cells",
      make: (value: CellValue): DocumentOp => ({ op: "addSheet", sheet: snapshot("new", [value]) }),
    },
  ];

  it("setBlock packed refs shift, preserve other sheets, and reject deletion", () => {
    const make = (target: CellAddress): DocumentOp => ({
      op: "setBlock",
      range: range("row", 0, 0, OTHER_SHEET),
      block: { rowCount: 1, colCount: 1, values: [null], refs: [[0, target]] },
    });
    expectRebased(
      [make(address("column", 7))],
      [structure("column", "delete")],
      [make(address("column", 5))],
    );
    expectRebased(
      [make(address("column", 4, OTHER_SHEET))],
      [structure("column", "delete")],
      [make(address("column", 4, OTHER_SHEET))],
    );
    expectConflict(
      [make(address("column", 4))],
      [structure("column", "delete")],
      "structural-overlap",
    );
  });

  it("setBlock rejects packed formulas across structural edits", () => {
    expectConflict(
      [
        {
          op: "setBlock",
          range: range("row", 0, 0, OTHER_SHEET),
          block: { rowCount: 1, colCount: 1, values: [null], formulas: [[0, "=s1!A1"]] },
        },
      ],
      [structure("row", "insert")],
      "formula-structural",
    );
  });

  it("conflicts every embedded ref container when its target sheet is removed or moved", () => {
    const reference = { kind: "ref", target: address("row", 7) } as const;
    const referencing: DocumentOp[] = [
      ...containers.map((container) => container.make(reference)),
      {
        op: "setBlock",
        range: range("row", 0, 0, OTHER_SHEET),
        block: {
          rowCount: 1,
          colCount: 1,
          values: [null],
          refs: [[0, reference.target]],
        },
      },
    ];
    for (const operation of referencing) {
      expectConflict([operation], [{ op: "removeSheet", sheet: SHEET }], "sheet-removed");
      expectConflict(
        [operation],
        [{ op: "moveRows", sheet: SHEET, from: 1, count: 2, to: 5 }],
        "unsupported-structural",
      );
    }
  });
});

describe("metadata, identity, and sheet lifecycle", () => {
  it("setSheetMeta conflicts on the structurally changed sheet and passes on another sheet", () => {
    const same: DocumentOp = {
      op: "setSheetMeta",
      sheet: SHEET,
      patch: { frozenRows: 2 },
    };
    const other: DocumentOp = {
      op: "setSheetMeta",
      sheet: OTHER_SHEET,
      patch: { frozenRows: 2 },
    };
    expectConflict([same], [structure("row", "insert")], "unsupported-structural");
    expectRebased([other], [structure("row", "insert")], [other]);
  });

  it("keeps sheet lifecycle and stable remove-by-ID operations across structural edits", () => {
    const local: DocumentOp[] = [
      { op: "addSheet", sheet: snapshot("new") },
      { op: "removeSheet", sheet: SHEET },
      { op: "renameSheet", sheet: SHEET, name: "Renamed" },
      { op: "moveSheet", sheet: SHEET, to: 2 },
      { op: "removeValidationRule", sheet: SHEET, id: "validation-1" },
      { op: "removeProtectedRange", sheet: SHEET, id: "protection-1" },
      { op: "removeNamedRange", name: "Sales", scope: SHEET },
    ];
    expectRebased(local, [structure("row", "insert")], local);
  });

  it("treats remote row and column moves as conservative conflicts on their sheet", () => {
    const local: DocumentOp = {
      op: "set",
      addr: { sheet: SHEET, row: 8, col: 8 },
      value: literal(),
    };
    expectConflict(
      [local],
      [{ op: "moveRows", sheet: SHEET, from: 1, count: 2, to: 5 }],
      "unsupported-structural",
    );
    expectConflict(
      [local],
      [{ op: "moveColumns", sheet: SHEET, from: 1, count: 2, to: 5 }],
      "unsupported-structural",
    );
    expectRebased(
      [{ ...local, addr: { ...local.addr, sheet: OTHER_SHEET } }],
      [{ op: "moveRows", sheet: SHEET, from: 1, count: 2, to: 5 }],
      [{ ...local, addr: { ...local.addr, sheet: OTHER_SHEET } }],
    );
  });

  it("detects duplicate sheet IDs and same-sheet rename/move lifecycle ambiguity", () => {
    expectConflict(
      [{ op: "addSheet", sheet: snapshot("stable-id") }],
      [{ op: "addSheet", sheet: snapshot("stable-id") }],
      "sheet-lifecycle",
    );
    expectConflict(
      [{ op: "renameSheet", sheet: SHEET, name: "Offline" }],
      [{ op: "renameSheet", sheet: SHEET, name: "Server" }],
      "sheet-lifecycle",
    );
    expectConflict(
      [{ op: "moveSheet", sheet: SHEET, to: 2 }],
      [{ op: "moveSheet", sheet: SHEET, to: 3 }],
      "sheet-lifecycle",
    );
    expectRebased(
      [{ op: "renameSheet", sheet: OTHER_SHEET, name: "Offline" }],
      [{ op: "renameSheet", sheet: SHEET, name: "Server" }],
      [{ op: "renameSheet", sheet: OTHER_SHEET, name: "Offline" }],
    );
  });

  it("conflicts direct, scoped named-range, and formula work with sheet removal", () => {
    expectConflict(
      [{ op: "setNote", addr: address("row", 1), text: "note" }],
      [{ op: "removeSheet", sheet: SHEET }],
      "sheet-removed",
    );
    expectConflict(
      [
        {
          op: "setNamedRange",
          namedRange: {
            name: "Local",
            scope: SHEET,
            range: range("row", 0, 1, OTHER_SHEET),
          },
        },
      ],
      [{ op: "removeSheet", sheet: SHEET }],
      "sheet-removed",
    );
    expectConflict(
      [
        {
          op: "set",
          addr: address("row", 1, OTHER_SHEET),
          value: { kind: "formula", src: "=s1!A1" },
        },
      ],
      [{ op: "removeSheet", sheet: SHEET }],
      "sheet-removed",
    );
    const unrelated: DocumentOp = {
      op: "set",
      addr: address("row", 1, OTHER_SHEET),
      value: literal("unrelated"),
    };
    expectRebased([unrelated], [{ op: "removeSheet", sheet: SHEET }], [unrelated]);
  });

  it("detects sheet-removal conflicts across representative operation families", () => {
    const cases: Array<{ family: RebaseConflictFamily; operation: DocumentOp }> = [
      {
        family: "cell",
        operation: { op: "setNote", addr: address("row", 1), text: "review" },
      },
      {
        family: "range",
        operation: {
          op: "setRangeStyle",
          range: range("row", 0, 2),
          style: { bold: true },
        },
      },
      {
        family: "sheet",
        operation: { op: "setRowMeta", sheet: SHEET, row: 2, meta: { height: 24 } },
      },
      {
        family: "named-range",
        operation: {
          op: "setNamedRange",
          namedRange: {
            name: "Local",
            scope: SHEET,
            range: range("row", 0, 2),
          },
        },
      },
      {
        family: "named-range",
        operation: { op: "removeNamedRange", name: "Local", scope: SHEET },
      },
    ];

    for (const { operation } of cases) {
      expectConflict([operation], [{ op: "removeSheet", sheet: SHEET }], "sheet-removed");
    }
  });

  it("detects representative overlapping edits for each conflict family", () => {
    const cases: Array<{
      family: RebaseConflictFamily;
      local: DocumentOp;
      remote: DocumentOp;
    }> = [
      {
        family: "cell",
        local: { op: "set", addr: address("row", 1), value: literal("local") },
        remote: { op: "setNote", addr: address("row", 1), text: "remote" },
      },
      {
        family: "range",
        local: {
          op: "setRange",
          range: range("row", 0, 2),
          cells: [{ rowOffset: 0, colOffset: 0, value: literal("local") }],
        },
        remote: {
          op: "setRangeStyle",
          range: range("row", 1, 3),
          style: { italic: true },
        },
      },
      {
        family: "range",
        local: {
          op: "setRangeStyle",
          range: range("row", 0, 2),
          style: { bold: true },
        },
        remote: { op: "clearRange", range: range("row", 1, 3), contents: true },
      },
      {
        family: "range",
        local: { op: "addMerge", sheet: SHEET, merge: { r0: 0, c0: 0, r1: 2, c1: 2 } },
        remote: { op: "removeMerge", sheet: SHEET, merge: { r0: 1, c0: 1, r1: 3, c1: 3 } },
      },
      {
        family: "sheet",
        local: { op: "setColumn", sheet: SHEET, col: 2, patch: { width: 120 } },
        remote: { op: "setColumn", sheet: SHEET, col: 2, patch: { header: "Remote" } },
      },
      {
        family: "named-range",
        local: {
          op: "setNamedRange",
          namedRange: { name: "Sales", scope: SHEET, range: range("row", 0, 2) },
        },
        remote: { op: "removeNamedRange", name: "Sales", scope: SHEET },
      },
    ];

    for (const { local, remote } of cases) {
      expectConflict([local], [remote], "overlapping-edit");
    }
  });

  it("detects same identities without requiring a cell range", () => {
    const identities: Array<[DocumentOp, DocumentOp]> = [
      [
        { op: "setColumn", sheet: SHEET, col: 2, patch: { width: 120 } },
        { op: "setColumn", sheet: SHEET, col: 2, patch: { header: "Server" } },
      ],
      [
        { op: "setRowMeta", sheet: SHEET, row: 2, meta: { height: 24 } },
        { op: "setRowMeta", sheet: SHEET, row: 2, meta: { hidden: true } },
      ],
      [
        { op: "removeValidationRule", sheet: SHEET, id: "validation-1" },
        RANGE_FACTORIES[1]!.make("row", 3, 4),
      ],
      [
        { op: "removeProtectedRange", sheet: SHEET, id: "protection-1" },
        RANGE_FACTORIES[2]!.make("row", 3, 4),
      ],
      [
        { op: "removeNamedRange", name: "sales", scope: SHEET },
        RANGE_FACTORIES[3]!.make("row", 3, 4),
      ],
      [
        { op: "setSheetMeta", sheet: SHEET, patch: { frozenRows: 1 } },
        { op: "setSheetMeta", sheet: SHEET, patch: { frozenCols: 1 } },
      ],
    ];
    for (const [local, remote] of identities) {
      expectConflict([local], [remote], "overlapping-edit");
    }
  });

  it("allows non-overlapping metadata identities", () => {
    const local: DocumentOp[] = [
      { op: "removeValidationRule", sheet: SHEET, id: "validation-local" },
      { op: "removeProtectedRange", sheet: SHEET, id: "protection-local" },
      { op: "removeNamedRange", name: "Local", scope: SHEET },
      { op: "setSheetMeta", sheet: OTHER_SHEET, patch: { frozenRows: 1 } },
    ];
    const remote: DocumentOp[] = [
      { op: "removeValidationRule", sheet: SHEET, id: "validation-remote" },
      { op: "removeProtectedRange", sheet: SHEET, id: "protection-remote" },
      { op: "removeNamedRange", name: "Remote", scope: SHEET },
      { op: "setSheetMeta", sheet: SHEET, patch: { frozenRows: 1 } },
    ];
    expectRebased(local, remote, local);
  });
});

describe("server ordering, immutability, and determinism", () => {
  it("applies structural transformations in remote server order", () => {
    const local: DocumentOp[] = [{ op: "set", addr: address("row", 4), value: literal("offline") }];
    const insert = structure("row", "insert", 2, 2);
    const deletion = structure("row", "delete", 5, 2);
    expectConflict(local, [insert, deletion], "structural-overlap", 0, 1);
    expectRebased(
      local,
      [deletion, insert],
      [{ op: "set", addr: address("row", 6), value: literal("offline") }],
    );
  });

  it("reports the first conflict by remote order and then local order", () => {
    const local: DocumentOp[] = [
      { op: "set", addr: address("row", 0, OTHER_SHEET), value: literal("safe") },
      { op: "set", addr: address("row", 8), value: { kind: "formula", src: "=A1" } },
      { op: "set", addr: address("row", 4), value: literal("deleted") },
    ];
    const remote: DocumentOp[] = [
      { op: "set", addr: address("row", 10), value: literal("server") },
      structure("row", "delete"),
    ];
    expectConflict(local, remote, "formula-structural", 1, 1);
  });

  it("does not mutate local or remote arrays or their nested objects", () => {
    const local: DocumentOp[] = [
      {
        op: "setRange",
        range: range("row", 7, 8),
        cells: [
          {
            rowOffset: 0,
            colOffset: 0,
            value: { kind: "ref", target: address("column", 7) },
            style: { bold: true },
          },
        ],
      },
      {
        op: "setBlock",
        range: range("row", 9, 9),
        block: {
          rowCount: 1,
          colCount: 1,
          values: [null],
          refs: [[0, address("column", 8)]],
          styleTable: [{ italic: true }],
          styleIds: [0],
        },
      },
    ];
    const remote: DocumentOp[] = [structure("row", "insert"), structure("column", "insert")];
    const localBefore = structuredClone(local);
    const remoteBefore = structuredClone(remote);

    const result = rebaseDocumentOperations(local, remote);

    expect(result.status).toBe("rebased");
    expect(local).toEqual(localBefore);
    expect(remote).toEqual(remoteBefore);
    if (result.status !== "rebased") throw new Error("Expected successful rebase");
    expect(result.operations[0]).not.toBe(local[0]);
    expect(result.operations[1]).not.toBe(local[1]);
    expect(result.operations).toEqual([
      {
        op: "setRange",
        range: range("row", 9, 10),
        cells: [
          {
            rowOffset: 0,
            colOffset: 0,
            value: { kind: "ref", target: address("column", 9) },
            style: { bold: true },
          },
        ],
      },
      {
        op: "setBlock",
        range: range("row", 11, 11),
        block: {
          rowCount: 1,
          colCount: 1,
          values: [null],
          refs: [[0, address("column", 10)]],
          styleTable: [{ italic: true }],
          styleIds: [0],
        },
      },
    ]);
  });

  it("rebases deeply frozen local and remote operations", () => {
    const local: DocumentOp[] = [
      {
        op: "set",
        addr: address("row", 4),
        value: { kind: "ref", target: address("row", 7) },
        style: { bold: true },
      },
      {
        op: "setRange",
        range: range("row", 7, 8),
        cells: [
          { rowOffset: 0, colOffset: 0, value: literal("frozen"), style: { italic: true } },
          { rowOffset: 2, colOffset: 0, value: { kind: "ref", target: address("row", 3) } },
        ],
      },
    ];
    const remote: DocumentOp[] = [structure("row", "insert", 2, 2)];
    deepFreeze(local);
    deepFreeze(remote);

    const result = rebaseDocumentOperations(local, remote);

    expect(result).toEqual({
      status: "rebased",
      operations: [
        {
          op: "set",
          addr: address("row", 6),
          value: { kind: "ref", target: address("row", 9) },
          style: { bold: true },
        },
        {
          op: "setRange",
          range: range("row", 9, 10),
          cells: [
            { rowOffset: 0, colOffset: 0, value: literal("frozen"), style: { italic: true } },
            { rowOffset: 2, colOffset: 0, value: { kind: "ref", target: address("row", 5) } },
          ],
        },
      ],
    });
  });
});

describe("compressed restore rebasing", () => {
  const target = { sheet: SHEET, start: { row: 8, col: 1 }, end: { row: 8, col: 1 } };
  const block = {
    rowCount: 1,
    colCount: 1,
    values: [null],
    refs: [[0, { sheet: SHEET, row: 9, col: 1 }]] as [number, CellAddress][],
    styleTable: [{ bold: true }],
    styleIds: [0],
  };

  it("shifts both restore target and packed refs while preserving serialized encoding and caller input", () => {
    const original = encodeRestoreBlock(target, block);
    const before = JSON.stringify(original);
    const result = rebaseDocumentOperations(
      [original],
      [{ op: "addRows", sheet: SHEET, at: 4, count: 2 }],
    );
    expect(result.status).toBe("rebased");
    if (result.status !== "rebased") throw new Error("Expected safe restore rebase");
    const restored = result.operations[0];
    if (restored?.op !== "restoreBlock") throw new Error("Expected serialized restore operation");
    expect(restored.range).toEqual({
      sheet: SHEET,
      start: { row: 10, col: 1 },
      end: { row: 10, col: 1 },
    });
    expect(restored.encoding).toBe("deflate-json-v1");
    expect(decodeRestoreBlock(restored)).toEqual({
      ...block,
      refs: [[0, { sheet: SHEET, row: 11, col: 1 }]],
    });
    expect(JSON.stringify(original)).toBe(before);
  });

  it("shifts cross-sheet packed references for column edits without moving its restore target", () => {
    const original = encodeRestoreBlock({ ...target, sheet: OTHER_SHEET }, block);
    const result = rebaseDocumentOperations([original], [structure("column", "insert", 0, 2)]);
    if (result.status !== "rebased") throw new Error("Expected safe cross-sheet rebase");
    const restored = result.operations[0];
    if (restored?.op !== "restoreBlock") throw new Error("Expected serialized restore operation");
    expect(restored.range).toEqual(original.range);
    expect(decodeRestoreBlock(restored).refs).toEqual([[0, { sheet: SHEET, row: 9, col: 3 }]]);
    expectConflict([original], [structure("row", "delete", 9, 1)], "structural-overlap");
  });

  it("composes remote transforms into independent serialized restores and uses the latest refs for later conflicts", () => {
    const local = [
      encodeRestoreBlock(target, block),
      encodeRestoreBlock({ ...target, sheet: OTHER_SHEET }, block),
    ];
    const remote: DocumentOp[] = [
      structure("row", "insert", 4, 2),
      structure("column", "insert", 0, 2),
      structure("row", "delete", 0, 1),
      structure("row", "insert", 0, 3, "unrelated"),
      { op: "renameSheet", sheet: OTHER_SHEET, name: "Renamed" },
      { op: "removeSheet", sheet: "unrelated" },
    ];
    const localBefore = JSON.stringify(local);
    const remoteBefore = JSON.stringify(remote);
    deepFreeze(local);
    deepFreeze(remote);

    const result = rebaseDocumentOperations(local, remote);
    if (result.status !== "rebased") throw new Error("Expected safe multitransform rebase");
    // A durable wire round trip must not depend on the live decoded scope.
    const serialized: DocumentOp[] = JSON.parse(JSON.stringify(result.operations));
    expect(serialized).toHaveLength(2);
    for (const [index, restored] of serialized.entries()) {
      if (restored.op !== "restoreBlock") throw new Error("Expected serialized restore operation");
      expect(restored.encoding).toBe("deflate-json-v1");
      expect(restored.range).toEqual(
        index === 0
          ? {
              sheet: SHEET,
              start: { row: 9, col: 3 },
              end: { row: 9, col: 3 },
            }
          : { ...target, sheet: OTHER_SHEET },
      );
      expect(decodeRestoreBlock(restored)).toEqual({
        ...block,
        refs: [[0, { sheet: SHEET, row: 10, col: 3 }]],
      });
    }

    // Row 10 only contains the reference after all preceding transforms.
    expectConflict(
      local,
      [...remote, structure("row", "delete", 10, 1)],
      "structural-overlap",
      0,
      remote.length,
    );
    expect(JSON.stringify(local)).toBe(localBefore);
    expect(JSON.stringify(remote)).toBe(remoteBefore);
  });

  it("keeps conservative formula conflicts and detects restore overlap from either side", () => {
    const formula = encodeRestoreBlock(target, {
      rowCount: 1,
      colCount: 1,
      values: [null],
      formulas: [[0, "=A1"]],
    });
    expectConflict([formula], [structure("row", "insert")], "formula-structural");
    const restored = encodeRestoreBlock(target, block);
    const edit: DocumentOp = {
      op: "set",
      addr: { sheet: SHEET, row: 8, col: 1 },
      value: literal(),
    };
    expectConflict([restored], [edit], "overlapping-edit");
    expectConflict([edit], [restored], "overlapping-edit");
    expectConflict([restored], [{ op: "removeSheet", sheet: SHEET }], "sheet-removed");
    expectConflict([restored], [structure("row", "delete", 8, 1)], "structural-overlap");
  });
});

describe("operation sequences", () => {
  const set = (row: number, col: number, value: number): DocumentOp => ({
    op: "set",
    addr: { sheet: SHEET, row, col },
    value: { kind: "literal", value },
  });
  const addRows = (at: number, count: number): DocumentOp => ({
    op: "addRows",
    sheet: SHEET,
    at,
    count,
  });
  const removeRows = (at: number, count = 1): DocumentOp => ({
    op: "removeRows",
    sheet: SHEET,
    at,
    count,
  });

  it("reports an edit to a row the server deleted after an earlier local insert", () => {
    // The local insert at 3 moves the original row 3 to index 4; the server deleted that row.
    expectConflict(
      [addRows(3, 1), set(8, 0, 1), set(4, 0, 2)],
      [removeRows(3), removeRows(0)],
      "structural-overlap",
      2,
      0,
    );
  });

  it("shifts an edit written after a local deletion past a server insert", () => {
    // Local row 6 after deleting row 6 is the original row 7; the server
    // inserted a row before it, so the edit lands on row 7.
    expectRebased(
      [set(2, 0, 1), removeRows(6), set(6, 2, 2)],
      [set(5, 1, 3), addRows(7, 1), set(6, 0, 4)],
      [set(2, 0, 1), removeRows(6), set(7, 2, 2)],
    );
  });

  it("keeps every rebased edit on the row it targeted", () => {
    // An independent oracle: rows carry identities, each operation's intent is
    // recorded by identity on the client that wrote it, and the server order
    // (remote, then local) is replayed by identity.
    const ROWS = 12;
    let state = 0x2545f491;
    const random = (n: number) => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return Math.floor(((state >>> 0) / 2 ** 32) * n);
    };
    const sequence = (tag: number): DocumentOp[] =>
      Array.from({ length: 1 + random(3) }, () => {
        const roll = random(10);
        if (roll < 6) return set(random(ROWS - 3), random(3), tag * 1000 + random(1000));
        if (roll < 8) return addRows(random(ROWS - 3), 1 + random(2));
        return removeRows(random(ROWS - 4));
      });

    type Rows = { ids: string[]; cells: Map<string, number> };
    type Intent =
      | { kind: "insert"; before: string | null; ids: string[] }
      | { kind: "remove"; id: string }
      | { kind: "set"; id: string; col: number; value: number };
    const literalOf = (operation: DocumentOp) =>
      (operation as { value: { value: number } }).value.value;
    const intentsOf = (ops: readonly DocumentOp[], tag: string): Intent[] => {
      const ids = Array.from({ length: ROWS }, (_, row) => `b${row}`);
      let next = 0;
      return ops.map((operation): Intent => {
        if (operation.op === "addRows") {
          const added = Array.from({ length: operation.count }, () => `${tag}${next++}`);
          const before = ids[operation.at] ?? null;
          ids.splice(operation.at, 0, ...added);
          return { kind: "insert", before, ids: added };
        }
        if (operation.op === "removeRows")
          return { kind: "remove", id: ids.splice(operation.at, 1)[0]! };
        if (operation.op !== "set") throw new Error("unexpected operation");
        return {
          kind: "set",
          id: ids[operation.addr.row]!,
          col: operation.addr.col,
          value: literalOf(operation),
        };
      });
    };
    /** Replays intents by identity; false when one targets a row that no longer exists. */
    const replay = (rows: Rows, intents: readonly Intent[]): boolean => {
      for (const intent of intents) {
        if (intent.kind === "insert") {
          let at = intent.before === null ? rows.ids.length : rows.ids.indexOf(intent.before);
          if (at < 0) {
            // The anchor was deleted: insert before the next surviving original row.
            const order = Number(intent.before!.slice(1));
            at = rows.ids.findIndex((id) => id.startsWith("b") && Number(id.slice(1)) > order);
            if (at < 0) at = rows.ids.length;
          }
          rows.ids.splice(at, 0, ...intent.ids);
        } else if (intent.kind === "remove") {
          const at = rows.ids.indexOf(intent.id);
          if (at < 0) return false;
          rows.ids.splice(at, 1);
        } else {
          if (!rows.ids.includes(intent.id)) return false;
          rows.cells.set(`${intent.id}:${intent.col}`, intent.value);
        }
      }
      return true;
    };
    /** Replays operations by index, as the store applies them. */
    const apply = (rows: Rows, ops: readonly DocumentOp[], tag: string) => {
      let next = 0;
      for (const operation of ops) {
        if (operation.op === "addRows") {
          rows.ids.splice(
            operation.at,
            0,
            ...Array.from({ length: operation.count }, () => `${tag}${next++}`),
          );
        } else if (operation.op === "removeRows") {
          rows.ids.splice(operation.at, operation.count);
        } else if (operation.op === "set") {
          rows.cells.set(
            `${rows.ids[operation.addr.row]}:${operation.addr.col}`,
            literalOf(operation),
          );
        }
      }
    };
    /** Values by position; inserted rows compare by position only. */
    const view = (rows: Rows) =>
      rows.ids.map((id) =>
        [0, 1, 2].map(
          (col) => rows.cells.get(`${id}:${col}`) ?? (id.startsWith("b") ? id : "inserted"),
        ),
      );
    const base = (): Rows => ({
      ids: Array.from({ length: ROWS }, (_, row) => `b${row}`),
      cells: new Map(),
    });

    let compared = 0;
    for (let trial = 0; trial < 2000; trial++) {
      const local = sequence(1);
      const remote = sequence(2);
      const remoteBefore = JSON.stringify(remote);
      const result = rebaseDocumentOperations(local, remote);
      // Carrying a remote operation through the local list never edits the caller's copy.
      expect(JSON.stringify(remote)).toBe(remoteBefore);
      const expected = base();
      expect(replay(expected, intentsOf(remote, "r"))).toBe(true);
      const intentKept = replay(expected, intentsOf(local, "l"));
      if (result.status === "conflict") continue;
      // A rebase that succeeds must never drop or redirect a local edit.
      expect({ local, remote, intentKept }).toEqual({ local, remote, intentKept: true });
      const server = base();
      apply(server, remote, "r");
      apply(server, result.operations, "l");
      expect({ local, remote, rows: view(server) }).toEqual({
        local,
        remote,
        rows: view(expected),
      });
      compared++;
    }
    expect(compared).toBeGreaterThan(1500);
  });
});
