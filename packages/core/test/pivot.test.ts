import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { validateDocumentOperationShape } from "../src/document-protocol.js";
import {
  type Column,
  createGrid,
  createGridFromSnapshot,
  type DocumentOp,
  type Grid,
  initSheetwrite,
  MemoryPersistenceAdapter,
  type PivotDefinition,
  rebaseDocumentOperations,
  releaseEngineMemory,
  SheetwriteStore,
  SyncCoordinator,
  type Range,
  validateWorkbookSnapshot,
  type Workbook,
  type WorkbookSnapshot,
  type WorkbookTable,
} from "../src/index.js";
import { installCanvasTestStubs } from "../src/testing.js";

beforeAll(async () => {
  await initSheetwrite();
});

let restoreStubs: () => void;
beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
});
afterEach(() => restoreStubs());

const columns = (count: number): Column[] =>
  Array.from({ length: count }, (_, index) => ({
    key: `c${index}`,
    header: `C${index}`,
    width: 80,
    type: "text" as const,
  }));

const salesTable = (): WorkbookTable => ({
  id: "t-sales",
  name: "Sales",
  range: { sheet: "data", start: { row: 0, col: 0 }, end: { row: 4, col: 2 } },
  columns: [
    { id: "region", name: "Region" },
    { id: "year", name: "Year" },
    { id: "amount", name: "Amount" },
  ],
  headerRow: true,
  totalsRow: false,
});

/** A pivot on "report" summarizing data!A1:C6 (header row 0). */
const rangePivot = (overrides: Partial<PivotDefinition> = {}): PivotDefinition => ({
  id: "p-range",
  name: "By region",
  source: { range: { sheet: "data", start: { row: 0, col: 0 }, end: { row: 5, col: 2 } } },
  anchor: { row: 2, col: 1 },
  rows: [0],
  columns: [1],
  values: [{ field: 2, aggregation: "SUM", name: "Total" }],
  filters: [{ field: 0, values: ["East", 3, true, null] }],
  sort: [{ axis: "rows", field: 0, descending: true }],
  rowTotals: false,
  layout: "tabular",
  ...overrides,
});

const tablePivot = (): PivotDefinition => ({
  id: "p-table",
  name: "Table pivot",
  source: { table: "t-sales" },
  anchor: { row: 10, col: 0 },
  rows: [0],
  columns: [],
  values: [{ field: 2, aggregation: "DISTINCTCOUNT" }],
});

const workbook = (pivots: PivotDefinition[] = []): Workbook => ({
  activeSheet: "report",
  sheets: [
    { id: "report", name: "Report", rowCount: 20, columns: columns(6), pivots },
    { id: "data", name: "Data", rowCount: 10, columns: columns(4), tables: [salesTable()] },
  ],
});

const snapshot = (pivots: PivotDefinition[] = [rangePivot()]): WorkbookSnapshot => ({
  schemaVersion: 1,
  workbook: { activeSheet: "report" },
  // The report sheet comes first, so its pivot refers forward to "data".
  sheets: workbook(pivots).sheets.map((sheet, order) => ({
    id: sheet.id,
    name: sheet.name,
    order,
    rowCount: sheet.rowCount,
    columns: sheet.columns,
    ...(sheet.tables ? { tables: sheet.tables } : {}),
    ...(sheet.pivots?.length ? { pivots: sheet.pivots } : {}),
    cells: [],
  })),
});

const grids: Grid[] = [];
const mountGrid = (pivots: PivotDefinition[]): Grid => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const grid = createGrid(host, { workbook: structuredClone(workbook(pivots)) });
  grids.push(grid);
  return grid;
};
afterEach(() => {
  for (const grid of grids.splice(0)) grid.destroy();
});

const onlyPivot = (grid: Grid, id: string): PivotDefinition => {
  const pivot = grid.getPivots().find((candidate) => candidate.id === id);
  if (!pivot) throw new Error(`pivot ${id} is missing`);
  return pivot;
};

describe("pivot definitions in snapshots", () => {
  it("round-trips forward cross-sheet, table and invalid sources through a store snapshot", () => {
    const invalid = rangePivot({
      id: "p-invalid",
      anchor: { row: 15, col: 0 },
      source: {
        range: { sheet: "gone", start: { row: 0, col: 0 }, end: { row: 3, col: 9 } },
        invalid: true,
      },
    });
    const input = snapshot([rangePivot(), tablePivot(), invalid]);

    const checked = validateWorkbookSnapshot(input);
    expect(checked.ok).toBe(true);

    const store = SheetwriteStore.fromSnapshot(input);
    try {
      const exported = store.exportSnapshot();
      const reloaded = validateWorkbookSnapshot(exported);
      if (!reloaded.ok) throw new Error("exported snapshot must validate");
      const byId = (pivots: readonly PivotDefinition[] = []) =>
        [...pivots].sort((left, right) => left.id.localeCompare(right.id));
      expect(byId(reloaded.value.sheets[0]?.pivots)).toEqual(
        byId([rangePivot(), tablePivot(), invalid]),
      );
    } finally {
      store.dispose();
    }
  });

  it.each([
    [
      "a pivot ID used on two sheets",
      (input: WorkbookSnapshot) => {
        const data = input.sheets[1];
        if (!data) throw new Error("data sheet");
        data.pivots = [rangePivot({ anchor: { row: 8, col: 3 } })];
      },
      "sheets[1].pivots[0].id",
      "duplicate-id",
    ],
    [
      "a source sheet that does not exist",
      (input: WorkbookSnapshot) => {
        input.sheets[0]!.pivots = [
          rangePivot({
            source: {
              range: { sheet: "gone", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } },
            },
          }),
        ];
      },
      "sheets[0].pivots[0].source.range.sheet",
      "missing-reference",
    ],
    [
      "a source table that does not exist",
      (input: WorkbookSnapshot) => {
        input.sheets[0]!.pivots = [{ ...tablePivot(), source: { table: "t-gone" } }];
      },
      "sheets[0].pivots[0].source.table",
      "missing-reference",
    ],
    [
      "a field beyond the source width",
      (input: WorkbookSnapshot) => {
        input.sheets[0]!.pivots = [rangePivot({ values: [{ field: 3, aggregation: "SUM" }] })];
      },
      "sheets[0].pivots[0]",
      "out-of-bounds",
    ],
    [
      "an anchor outside its sheet",
      (input: WorkbookSnapshot) => {
        input.sheets[0]!.pivots = [rangePivot({ anchor: { row: 20, col: 0 } })];
      },
      "sheets[0].pivots[0].anchor",
      "out-of-bounds",
    ],
    [
      "an unknown aggregation",
      (input: WorkbookSnapshot) => {
        const pivot = rangePivot();
        Object.assign(pivot.values[0]!, { aggregation: "MEDIAN" });
        input.sheets[0]!.pivots = [pivot];
      },
      "sheets[0].pivots[0].values[0].aggregation",
      "invalid-value",
    ],
    [
      "more filter values than the limit",
      (input: WorkbookSnapshot) => {
        input.sheets[0]!.pivots = [
          rangePivot({
            filters: [{ field: 0, values: Array.from({ length: 10_001 }, (_, index) => index) }],
          }),
        ];
      },
      "sheets[0].pivots[0].filters[0].values",
      "resource-limit",
    ],
  ])("rejects %s", (_name, mutate, path, code) => {
    const input = snapshot();
    mutate(input);
    const checked = validateWorkbookSnapshot(input);
    if (checked.ok) throw new Error("expected a rejection");
    expect(checked.errors).toContainEqual(expect.objectContaining({ path, code }));
  });
});

describe("pivot document operations", () => {
  it("validates setPivot and removePivot shapes", () => {
    expect(
      validateDocumentOperationShape({ op: "setPivot", sheet: "report", pivot: rangePivot() }),
    ).toEqual([]);
    expect(validateDocumentOperationShape({ op: "removePivot", sheet: "report", id: "p" })).toEqual(
      [],
    );
    expect(
      validateDocumentOperationShape({
        op: "setPivot",
        sheet: "report",
        pivot: { ...rangePivot(), rows: [0], columns: [0] },
      }),
    ).toContainEqual(expect.objectContaining({ path: "operation.pivot.columns[0]" }));
  });

  it("keeps one undo entry per change and refuses references the workbook does not hold", () => {
    const grid = mountGrid([]);
    expect(grid.setPivot(rangePivot()).status).toBe("applied");
    expect(grid.setPivot(rangePivot({ name: "Renamed" })).status).toBe("applied");
    expect(onlyPivot(grid, "p-range").name).toBe("Renamed");
    expect(grid.setPivot(rangePivot({ id: "p-second" })).status).not.toBe("applied");

    // The same ID on another sheet, a missing table and an out-of-range field change nothing.
    expect(grid.setPivot(rangePivot({ anchor: { row: 8, col: 3 } }), "data").status).not.toBe(
      "applied",
    );
    expect(grid.setPivot({ ...tablePivot(), source: { table: "t-gone" } }).status).not.toBe(
      "applied",
    );
    expect(
      grid.setPivot(rangePivot({ id: "p-wide", values: [{ field: 3, aggregation: "MAX" }] }))
        .status,
    ).not.toBe("applied");
    expect(grid.getPivots().map((pivot) => pivot.id)).toEqual(["p-range"]);

    expect(grid.removePivot("p-range").status).toBe("applied");
    expect(grid.getPivots()).toEqual([]);
    grid.undo();
    expect(onlyPivot(grid, "p-range").name).toBe("Renamed");
    grid.undo();
    expect(onlyPivot(grid, "p-range")).toEqual(rangePivot());
    grid.undo();
    expect(grid.getPivots()).toEqual([]);
    grid.redo();
    expect(onlyPivot(grid, "p-range")).toEqual(rangePivot());
  });

  it("returns clones that callers cannot use to change the document", () => {
    const grid = mountGrid([rangePivot()]);
    const read = onlyPivot(grid, "p-range");
    read.rows.push(1);
    read.anchor.row = 9;
    expect(onlyPivot(grid, "p-range")).toEqual(rangePivot());
  });

  it("checks anchor ownership in document-operation order", () => {
    const grid = mountGrid([]);
    grid.applyTransaction({
      patches: [
        { op: "setPivot", sheet: "report", pivot: rangePivot() },
        { op: "setPivot", sheet: "report", pivot: rangePivot({ id: "second" }) },
      ],
    });
    expect(grid.getPivots()).toEqual([]);
    expect(grid.setPivot(rangePivot()).status).toBe("applied");
    expect(
      grid.applyTransaction({
        patches: [
          { op: "removePivot", sheet: "report", id: "p-range" },
          { op: "setPivot", sheet: "report", pivot: rangePivot({ id: "second" }) },
        ],
      }).status,
    ).toBe("applied");
    expect(grid.getPivots().map((pivot) => pivot.id)).toEqual(["second"]);
  });
});

describe("pivot structural rewrites", () => {
  it.each([
    ["row", { op: "removeRows", sheet: "report", at: 1, count: 3 }, { row: 1, col: 1 }],
    ["last row", { op: "removeRows", sheet: "report", at: 2, count: 18 }, { row: 1, col: 1 }],
    ["column", { op: "removeColumns", sheet: "report", at: 0, count: 2 }, { row: 2, col: 0 }],
  ] as const)(
    "keeps the pivot when its anchor %s is deleted, and undo restores the exact definition",
    (_name, operation, anchor) => {
      const grid = mountGrid([rangePivot()]);
      expect(grid.applyTransaction({ patches: [operation] }).status).toBe("applied");
      expect(onlyPivot(grid, "p-range")).toEqual(rangePivot({ anchor }));

      grid.undo();
      expect(onlyPivot(grid, "p-range")).toEqual(rangePivot());
      grid.redo();
      expect(onlyPivot(grid, "p-range")).toEqual(rangePivot({ anchor }));
    },
  );

  it.each<[string, DocumentOp, Pick<Range, "start" | "end">, Partial<PivotDefinition>]>([
    [
      "rows inserted above the source",
      { op: "addRows", sheet: "data", at: 0, count: 2 },
      { start: { row: 2, col: 0 }, end: { row: 7, col: 2 } },
      {},
    ],
    [
      "rows inserted inside the source",
      { op: "addRows", sheet: "data", at: 3, count: 1 },
      { start: { row: 0, col: 0 }, end: { row: 6, col: 2 } },
      {},
    ],
    [
      "a row deleted inside the source",
      { op: "removeRows", sheet: "data", at: 1, count: 2 },
      { start: { row: 0, col: 0 }, end: { row: 3, col: 2 } },
      {},
    ],
    [
      "a column inserted inside the source",
      {
        op: "addColumns",
        sheet: "data",
        at: 1,
        columns: [{ key: "new", header: "New", width: 80, type: "text" }],
      },
      { start: { row: 0, col: 0 }, end: { row: 5, col: 3 } },
      { columns: [2], values: [{ field: 3, aggregation: "SUM", name: "Total" }] },
    ],
    [
      "a grouped column deleted from the source",
      { op: "removeColumns", sheet: "data", at: 1, count: 1 },
      { start: { row: 0, col: 0 }, end: { row: 5, col: 1 } },
      { columns: [], values: [{ field: 1, aggregation: "SUM", name: "Total" }] },
    ],
    [
      "columns moved within the source",
      { op: "moveColumns", sheet: "data", from: 0, count: 1, to: 2 },
      { start: { row: 0, col: 0 }, end: { row: 5, col: 2 } },
      {
        rows: [2],
        columns: [0],
        values: [{ field: 1, aggregation: "SUM", name: "Total" }],
        filters: [{ field: 2, values: ["East", 3, true, null] }],
        sort: [{ axis: "rows", field: 2, descending: true }],
      },
    ],
    [
      "the entire source moved down",
      { op: "moveRows", sheet: "data", from: 0, count: 6, to: 4 },
      { start: { row: 4, col: 0 }, end: { row: 9, col: 2 } },
      {},
    ],
  ])("rewrites the source for %s", (_name, operation, range, fields) => {
    const grid = mountGrid([rangePivot()]);
    expect(grid.applyTransaction({ patches: [operation] }).status).toBe("applied");
    expect(onlyPivot(grid, "p-range")).toEqual(
      rangePivot({ source: { range: { sheet: "data", ...range } }, ...fields }),
    );
    grid.undo();
    expect(onlyPivot(grid, "p-range")).toEqual(rangePivot());
  });

  it.each([
    ["every source row is deleted", { op: "removeRows", sheet: "data", at: 0, count: 6 }],
    ["every source column is deleted", { op: "removeColumns", sheet: "data", at: 0, count: 3 }],
    ["the source sheet is removed", { op: "removeSheet", sheet: "data" }],
  ] as const)("marks a range source invalid when %s, and undo clears it", (_name, operation) => {
    const grid = mountGrid([rangePivot()]);
    expect(grid.applyTransaction({ patches: [operation] }).status).toBe("applied");
    // The reference stays verbatim, so the engine can show #REF! for it.
    expect(onlyPivot(grid, "p-range").source).toEqual({ ...rangePivot().source, invalid: true });
    grid.undo();
    expect(onlyPivot(grid, "p-range")).toEqual(rangePivot());
  });

  it("marks a table source invalid when the table is removed, and undo clears it", () => {
    const grid = mountGrid([tablePivot()]);
    expect(
      grid.applyTransaction({
        patches: [{ op: "removeTable", sheet: "data", tableId: "t-sales" }],
      }).status,
    ).toBe("applied");
    expect(onlyPivot(grid, "p-table").source).toEqual({ table: "t-sales", invalid: true });
    grid.undo();
    expect(onlyPivot(grid, "p-table")).toEqual(tablePivot());
  });

  it("moves a recorded undo with the pivot when a peer inserts rows above it", () => {
    const grid = mountGrid([]);
    grid.setPivot(rangePivot());
    grid.setPivot(rangePivot({ name: "Renamed" }));
    grid.applyRemoteOperations([{ op: "addRows", sheet: "report", at: 0, count: 4 }]);
    expect(onlyPivot(grid, "p-range").anchor).toEqual({ row: 6, col: 1 });

    // The undo was recorded with the anchor at row 2; it must follow the insert.
    grid.undo();
    expect(onlyPivot(grid, "p-range")).toEqual(rangePivot({ anchor: { row: 6, col: 1 } }));
  });
});

describe("pivot collaboration", () => {
  it("rebases a pending pivot past a remote insert and conflicts on the same pivot ID", () => {
    const local: DocumentOp[] = [{ op: "setPivot", sheet: "report", pivot: rangePivot() }];

    const shifted = rebaseDocumentOperations(local, [
      { op: "addRows", sheet: "report", at: 0, count: 3 },
      { op: "addRows", sheet: "data", at: 0, count: 1 },
    ]);
    if (shifted.status !== "rebased") throw new Error("expected a rebase");
    expect(shifted.operations).toEqual([
      {
        op: "setPivot",
        sheet: "report",
        pivot: rangePivot({
          anchor: { row: 5, col: 1 },
          source: { range: { sheet: "data", start: { row: 1, col: 0 }, end: { row: 6, col: 2 } } },
        }),
      },
    ]);

    expect(
      rebaseDocumentOperations(local, [{ op: "removePivot", sheet: "report", id: "p-range" }]),
    ).toMatchObject({ status: "conflict", conflict: { code: "overlapping-edit" } });
    expect(rebaseDocumentOperations(local, [{ op: "removeSheet", sheet: "data" }])).toMatchObject({
      status: "conflict",
      conflict: { code: "sheet-removed" },
    });
  });

  it("delivers a pivot change to a synced peer", async () => {
    const base = { ...snapshot([]), documentId: "pivot-doc", version: 0 };
    const adapter = new MemoryPersistenceAdapter(base);
    const hosts = [document.createElement("div"), document.createElement("div")];
    document.body.append(...hosts);
    const sender = createGridFromSnapshot(hosts[0]!, structuredClone(base));
    const peer = createGridFromSnapshot(hosts[1]!, structuredClone(base));
    grids.push(sender, peer);
    const options = { documentId: "pivot-doc", serverVersion: 0 };
    const senderSync = new SyncCoordinator(sender, adapter, options);
    const peerSync = new SyncCoordinator(peer, adapter, options);
    try {
      const pivot = rangePivot({ savedOutput: { rows: 1, cols: 2, cells: ["Excel", 44] } });
      expect(
        sender.applyTransaction({ patches: [{ op: "setPivot", sheet: "report", pivot }] }).status,
      ).toBe("applied");
      expect(await senderSync.sendNext()).toMatchObject({ status: "applied", version: 1 });

      const tail = await adapter.commit({
        documentId: "pivot-doc",
        baseVersion: 0,
        clientMutationId: "read-tail",
        operations: [],
      });
      if (tail.status !== "conflict" || !tail.operationsSinceBase) {
        throw new Error("the adapter must return the committed version");
      }
      for (const version of tail.operationsSinceBase) {
        await peerSync.applyVersionedOperation(version);
      }
      expect(peer.getPivots()).toEqual([pivot]);
      expect(peer.getPivotResult("report", pivot.id)?.cells).toEqual(["Excel", 44]);
    } finally {
      senderSync.destroy();
      peerSync.destroy();
    }
  });
});

describe("pivot engine boundary on the default engine", () => {
  it("installs saved values as read-only calculated output and re-syncs them after transfer", async () => {
    const pivot = rangePivot({
      savedOutput: { rows: 2, cols: 2, cells: ["Excel 🧮", true, 20, 30] },
    });
    const store = new SheetwriteStore(structuredClone(workbook([pivot])));
    const addr = { sheet: "report", row: 3, col: 2 };
    try {
      const initial = store.exportSnapshot();
      expect(store.getPivotResult("report", pivot.id)?.status).toBe("saved");
      expect(
        Array.from(store.getDataWindow("report", { start: 2, end: 4 }, [1, 2]).values),
      ).toEqual(pivot.savedOutput?.cells ?? []);
      expect(store.getCell(addr).resolved).toBe(30);
      expect(
        store.applyTransaction({
          patches: [
            {
              op: "set",
              addr,
              value: { kind: "literal", value: 99 },
            },
          ],
        }).status,
      ).toBe("rejected");
      const clone = store.getPivots("report");
      clone[0]?.savedOutput?.cells.splice(0, 1, "changed");
      expect(store.exportSnapshot()).toEqual(initial);
      expect(
        store.applyTransaction({
          patches: [
            {
              op: "set",
              addr: { sheet: "report", row: 9, col: 0 },
              value: { kind: "formula", src: "=SUM(B4:C4)" },
            },
          ],
        }).status,
      ).toBe("applied");
      expect(store.getCell({ sheet: "report", row: 9, col: 0 }).resolved).toBe(50);
      const before = store.exportSnapshot();
      await releaseEngineMemory();
      expect(store.exportSnapshot()).toEqual(before);
      expect(store.getCell(addr).resolved).toBe(30);
      expect(store.getCell({ sheet: "report", row: 9, col: 0 }).resolved).toBe(50);
      expect(store.setPivot(pivot).status).toBe("applied");
      expect(store.getPivots("report")[0]?.savedOutput).toBeUndefined();
      expect(store.getPivotResult("report", pivot.id)?.status).toBe("unavailable");
      expect(store.getCell(addr).resolved).toBeNull();
    } finally {
      store.dispose();
    }
  });

  it("reports a saved output collision and retries when its source blocker is cleared", () => {
    const pivot = rangePivot({ savedOutput: { rows: 2, cols: 2, cells: ["Excel", 10, 20, 30] } });
    const input = structuredClone(workbook([pivot]));
    const store = new SheetwriteStore(input);
    const addr = { sheet: "report", row: 3, col: 2 };
    try {
      expect(
        store.applyTransaction(
          {
            patches: [
              {
                op: "set",
                addr,
                value: { kind: "literal", value: 7 },
              },
            ],
          },
          { source: "remote" },
        ).status,
      ).toBe("applied");
      expect(store.getCell({ sheet: "report", ...pivot.anchor }).resolved).toBe("#SPILL!");
      expect(store.getCell(addr).resolved).toBe(7);
      expect(store.getPivotResult("report", pivot.id)).toMatchObject({
        status: "error",
        error: "#SPILL!",
      });
      expect(
        store.applyTransaction({
          patches: [
            {
              op: "clearRange",
              range: { sheet: "report", start: addr, end: addr },
            },
          ],
        }).status,
      ).toBe("applied");
      expect(store.getCell(addr).resolved).toBe(30);
      expect(store.getPivotResult("report", pivot.id)?.status).toBe("saved");
    } finally {
      store.dispose();
    }
  });

  it("validates saved scalar counts, resource limits and sheet bounds", () => {
    for (const [savedOutput, path, code] of [
      [{ rows: 2, cols: 2, cells: [1] }, "cells", "invalid-value"],
      [{ rows: 1_000_001, cols: 1, cells: [] }, "", "resource-limit"],
      [{ rows: 1, cols: 1, cells: [Infinity] }, "cells[0]", "non-serializable"],
      [{ rows: 20, cols: 1, cells: Array.from({ length: 20 }, () => 1) }, "", "out-of-bounds"],
    ] as const) {
      const checked = validateWorkbookSnapshot(
        snapshot([
          rangePivot({
            savedOutput: { ...savedOutput, cells: [...savedOutput.cells] },
          }),
        ]),
      );
      if (checked.ok) throw new Error("expected invalid saved output");
      expect(checked.errors).toContainEqual(
        expect.objectContaining({
          path: `sheets[0].pivots[0].savedOutput${path ? `.${path}` : ""}`,
          code,
        }),
      );
    }
    expect(
      validateWorkbookSnapshot(
        snapshot([
          rangePivot({
            savedOutput: { rows: 2, cols: 2, cells: ["Excel", null, true, 30] },
          }),
        ]),
      ).ok,
    ).toBe(true);
  });

  it("keeps definitions across engine memory release and reports results as unavailable", async () => {
    const store = new SheetwriteStore(structuredClone(workbook([rangePivot()])));
    try {
      const before = store.exportSnapshot();
      await releaseEngineMemory();
      expect(store.exportSnapshot()).toEqual(before);
      expect(store.getPivots("report")).toEqual([rangePivot()]);

      expect(store.getPivotResult("report", "p-range")).toEqual({
        status: "unavailable",
        anchor: { sheet: "report", row: 2, col: 1 },
        rows: 0,
        cols: 0,
        headerRows: 0,
        labelCols: 0,
        cells: [],
      });
      expect(store.getPivotResult("report", "p-missing")).toBeNull();
      expect(store.getPivotFields("report", "p-range")).toEqual([]);

      // The store still accepts changes after the release.
      expect(store.removePivot("p-range").status).toBe("applied");
      expect(store.getPivots()).toEqual([]);
    } finally {
      store.dispose();
    }
  });

  it("writes pivots through the store to the sheet that holds the ID", () => {
    const onData = { ...tablePivot(), anchor: { row: 8, col: 3 } };
    const store = new SheetwriteStore(structuredClone(workbook()));
    try {
      expect(store.setPivot(onData, "data").status).toBe("applied");
      expect(store.setPivot({ ...onData, name: "Renamed" }).status).toBe("applied");
      expect(store.getPivots("data")).toEqual([{ ...onData, name: "Renamed" }]);

      // Without a holder, a new pivot goes to the active sheet.
      expect(store.setPivot(rangePivot()).status).toBe("applied");
      expect(store.getPivots("report")).toEqual([rangePivot()]);

      expect(store.removePivot("p-table").status).toBe("applied");
      expect(store.removePivot("p-table").status).toBe("noop");
      expect(store.getPivots().map((pivot) => pivot.id)).toEqual(["p-range"]);
    } finally {
      store.dispose();
    }
  });
});

it("preserves full-engine pivot output through structural undo, transfer and write refusal", async () => {
  // Engine selection is process-wide. Exercise the full provider in its own
  // process so the default-engine contract above remains independent.
  const probe = Bun.spawn(
    [
      process.execPath,
      "--preload",
      "./test-setup.ts",
      "./packages/core/test/pivot-engine-probe.ts",
    ],
    { cwd: new URL("../../..", import.meta.url).pathname, stdout: "pipe", stderr: "pipe" },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    probe.exited,
    new Response(probe.stdout).text(),
    new Response(probe.stderr).text(),
  ]);
  expect({ exitCode, stdout, stderr }).toEqual({ exitCode: 0, stdout: "", stderr: "" });
});
