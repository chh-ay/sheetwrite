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
  rebaseDocumentOperations,
  type SavedQuery,
  SheetwriteStore,
  SyncCoordinator,
  validateWorkbookSnapshot,
  type Workbook,
  type WorkbookSnapshot,
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

const workbook = (): Workbook => ({
  activeSheet: "data",
  sheets: [{ id: "data", name: "Data", rowCount: 20, columns: columns(6) }],
});

const customers: SavedQuery = {
  id: "customers",
  name: "Customers",
  source: {
    kind: "csv",
    sourceId: "crm",
    locator: "https://example.test/customers.csv",
    columns: [
      { id: "id", name: "Id", type: "number" },
      { id: "region", name: "Region", type: "text" },
    ],
  },
  steps: [],
};

const orders: SavedQuery = {
  id: "orders",
  name: "Orders",
  source: {
    kind: "json",
    sourceId: "shop",
    columns: [
      { id: "customer", name: "Customer", type: "number" },
      { id: "total", name: "Total", type: "number" },
    ],
  },
  steps: [{ kind: "join", input: "customers", keys: [["customer", "id"]], join: "left" }],
  output: { table: "orders-table", tableName: "Orders", anchor: { sheet: "data", row: 0, col: 0 } },
};

const snapshot = (queries: SavedQuery[]): WorkbookSnapshot => ({
  schemaVersion: 1,
  workbook: { activeSheet: "data", queries },
  sheets: [{ id: "data", name: "Data", order: 0, rowCount: 20, columns: columns(6), cells: [] }],
});

const grids: Grid[] = [];
const mountGrid = (): Grid => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const grid = createGrid(host, { workbook: workbook() });
  grids.push(grid);
  return grid;
};
afterEach(() => {
  for (const grid of grids.splice(0)) grid.destroy();
});

const queries = (grid: Grid): readonly SavedQuery[] => grid.store.getWorkbook().queries ?? [];

describe("saved query shape", () => {
  it("validates setQuery and removeQuery operations", () => {
    expect(validateDocumentOperationShape({ op: "setQuery", query: orders })).toEqual([]);
    expect(validateDocumentOperationShape({ op: "removeQuery", id: "orders" })).toEqual([]);

    for (const [query, path] of [
      [{ ...orders, source: { ...orders.source, kind: "ftp" } }, "operation.query.source.kind"],
      [
        { ...customers, source: { ...customers.source, delimiter: 0 } },
        "operation.query.source.delimiter",
      ],
      [{ ...orders, steps: [{ kind: "join" }] }, "operation.query.steps[0].input"],
      [
        { ...orders, output: { ...orders.output, anchor: { sheet: "data", row: -1, col: 0 } } },
        "operation.query.output.anchor",
      ],
    ] as const) {
      expect(validateDocumentOperationShape({ op: "setQuery", query })).toContainEqual(
        expect.objectContaining({ path }),
      );
    }
  });

  it("refuses a locator with credentials so a secret is never saved", () => {
    const leaked = {
      ...customers,
      source: { ...customers.source, locator: "https://user:secret@example.test/data.csv" },
    };

    expect(validateDocumentOperationShape({ op: "setQuery", query: leaked })).toContainEqual(
      expect.objectContaining({ path: "operation.query.source.locator" }),
    );
  });

  it("refuses saved lists with duplicate identities, missing inputs, cycles or shared tables", () => {
    const loop: SavedQuery = {
      ...customers,
      steps: [{ kind: "join", input: "orders", keys: [["id", "customer"]], join: "inner" }],
    };
    const sharedTable: SavedQuery = { ...customers, output: orders.output };

    for (const list of [
      [customers, { ...orders, id: "customers" }],
      [customers, { ...orders, name: "CUSTOMERS" }],
      [orders],
      [loop, orders],
      [sharedTable, orders],
    ]) {
      expect(validateWorkbookSnapshot(snapshot(list)).ok).toBe(false);
    }

    expect(validateWorkbookSnapshot(snapshot([customers, orders])).ok).toBe(true);
  });
});

describe("saved queries in the store", () => {
  it("round-trips through a snapshot and drops an empty list", () => {
    const store = SheetwriteStore.fromSnapshot(snapshot([customers, orders]));
    const empty = SheetwriteStore.fromSnapshot(snapshot([]));
    try {
      expect(store.exportSnapshot().workbook.queries).toEqual([customers, orders]);
      expect(empty.exportSnapshot().workbook.queries).toBeUndefined();
    } finally {
      store.dispose();
      empty.dispose();
    }
  });
});

describe("saved query history", () => {
  it("undoes and redoes each definition change as one step", () => {
    const grid = mountGrid();
    const apply = (patch: DocumentOp) => grid.applyTransaction({ patches: [patch] }).status;
    const renamed: SavedQuery = { ...customers, name: "Clients" };

    expect(apply({ op: "setQuery", query: customers })).toBe("applied");
    expect(apply({ op: "setQuery", query: renamed })).toBe("applied");
    expect(apply({ op: "removeQuery", id: "customers" })).toBe("applied");
    expect(grid.store.getWorkbook().queries).toBeUndefined();

    grid.undo();
    expect(queries(grid)).toEqual([renamed]);
    grid.undo();
    expect(queries(grid)).toEqual([customers]);
    grid.undo();
    expect(grid.store.getWorkbook().queries).toBeUndefined();
    grid.redo();
    expect(queries(grid)).toEqual([customers]);
  });
});

describe("saved query collaboration", () => {
  it("conflicts on any concurrent definition change", () => {
    const local: DocumentOp[] = [{ op: "setQuery", query: customers }];

    expect(
      rebaseDocumentOperations(local, [{ op: "addRows", sheet: "data", at: 0, count: 2 }]),
    ).toEqual({ status: "rebased", operations: local });

    for (const remote of [
      { op: "setQuery", query: orders },
      { op: "removeQuery", id: "anything" },
    ] satisfies DocumentOp[]) {
      expect(rebaseDocumentOperations(local, [remote])).toMatchObject({
        status: "conflict",
        conflict: { code: "overlapping-edit" },
      });
    }
  });

  it("delivers a definition to a synced peer", async () => {
    const base = { ...snapshot([]), documentId: "query-doc", version: 0 };
    const adapter = new MemoryPersistenceAdapter(base);
    const senderHost = document.createElement("div");
    const peerHost = document.createElement("div");
    document.body.append(senderHost, peerHost);
    const sender = createGridFromSnapshot(senderHost, structuredClone(base));
    const peer = createGridFromSnapshot(peerHost, structuredClone(base));
    grids.push(sender, peer);
    const options = { documentId: "query-doc", serverVersion: 0 };
    const senderSync = new SyncCoordinator(sender, adapter, options);
    const peerSync = new SyncCoordinator(peer, adapter, options);
    try {
      expect(
        sender.applyTransaction({ patches: [{ op: "setQuery", query: customers }] }).status,
      ).toBe("applied");
      expect(await senderSync.sendNext()).toMatchObject({ status: "applied", version: 1 });

      const tail = await adapter.commit({
        documentId: "query-doc",
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
      expect(queries(peer)).toEqual([customers]);
    } finally {
      senderSync.destroy();
      peerSync.destroy();
    }
  });
});

describe("kept Power Query members on a retained graph", () => {
  const snapshotWith = (unsupportedQueries: unknown): unknown => ({
    schemaVersion: 1,
    workbook: {
      ...workbook(),
      xlsxSource: {
        parts: [
          {
            name: "customXml/item1.xml",
            contentType: "application/xml",
            method: 0,
            crc32: 0,
            uncompressedSize: 0,
            data: "",
          },
        ],
        graphs: [
          {
            owner: "workbook",
            type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml",
            target: "customXml/item1.xml",
            queries: "0123456789abcdef",
            unsupportedQueries,
            parts: ["customXml/item1.xml"],
            dependencies: [],
          },
        ],
      },
    },
    sheets: [],
  });
  const paths = (input: unknown): string[] => {
    const result = validateWorkbookSnapshot(input);
    return result.ok ? [] : result.errors.map((error) => error.path);
  };
  const path = "workbook.xlsxSource.graphs[0].unsupportedQueries";

  it("accepts bounded member names and reasons, and rejects anything past the caps", () => {
    expect(paths(snapshotWith([{ member: "Budget", reason: "schema" }]))).not.toContain(path);
    expect(paths(snapshotWith("Budget"))).toContain(path);
    expect(paths(snapshotWith([{ member: "Budget" }]))).toContain(`${path}[0].reason`);
    expect(paths(snapshotWith([{ member: "Budget", reason: "x".repeat(65) }]))).toContain(
      `${path}[0].reason`,
    );
    expect(paths(snapshotWith([{ member: "m".repeat(1025), reason: "schema" }]))).toContain(
      `${path}[0].member`,
    );
    const many = Array.from({ length: 257 }, (_, index) => ({
      member: `M${index}`,
      reason: "schema",
    }));
    expect(paths(snapshotWith(many))).toContain(path);
  });
});
