import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import {
  DEFAULT_SNAPSHOT_RESOURCE_LIMITS,
  SnapshotResourceError,
} from "../src/document-protocol.js";
import { initSheetwrite } from "../src/index.js";
import { SheetwriteStore } from "../src/store.js";
import { storeEngine } from "../src/store/engine-registry.js";
import type { Column, Workbook } from "../src/types.js";

const SHEET = "s";
const COLUMNS = 10;
/** One row past the dense cell limit, so the sheet loads in local pages. */
const ROWS = DEFAULT_SNAPSHOT_RESOURCE_LIMITS.maxDenseCells / COLUMNS + 1;

beforeAll(async () => {
  await initSheetwrite();
});

function columns(count: number): Column[] {
  return Array.from({ length: count }, (_, index) => ({
    key: `c${index}`,
    header: `C${index}`,
    width: 80,
    type: "number" as const,
  }));
}

function workbook(): Workbook {
  return {
    activeSheet: SHEET,
    sheets: [{ id: SHEET, name: "Data", rowCount: ROWS, columns: columns(COLUMNS) }],
  };
}

function set_number(store: SheetwriteStore, row: number, col: number, value: number): void {
  const result = store.applyTransaction({
    patches: [{ op: "set", addr: { sheet: SHEET, row, col }, value: { kind: "literal", value } }],
  });
  expect(result.status).toBe("applied");
}

// Each store path that branches on `isPaged` treats a local sheet as dense.
describe("a sheet past the dense cell limit", () => {
  let store: SheetwriteStore;
  beforeEach(() => {
    store = new SheetwriteStore(workbook());
    set_number(store, ROWS - 1, 3, 7);
  });
  afterEach(() => store.dispose());

  it("is not datasource-backed, has every cell loaded, and reads edits through windows", () => {
    expect(store.isPaged(SHEET)).toBe(false);
    expect(store.queryCapability(SHEET)).toEqual({ status: "complete" });
    expect(store.getCellLoadState({ sheet: SHEET, row: 2, col: 2 })).toBe("loaded-empty");
    expect(store.getCellLoadState({ sheet: SHEET, row: ROWS - 1, col: 3 })).toBe("loaded-value");
    expect(
      store.isRangeFullyLoaded({
        sheet: SHEET,
        start: { row: 0, col: 0 },
        end: { row: ROWS - 1, col: COLUMNS - 1 },
      }),
    ).toBe(true);
    expect(store.areColumnsFullyLoaded(SHEET, 0, ROWS, [0, 3, 9])).toBe(true);
    expect(
      store.canApplyLocally({
        op: "set",
        addr: { sheet: SHEET, row: 4, col: 1 },
        value: { kind: "literal", value: 2 },
      }),
    ).toBe(true);
    const window = store.getVisibleWindow(SHEET, { start: ROWS - 2, end: ROWS }, [2, 3]);
    expect(Array.from(window.values)).toEqual([null, null, null, 7]);
  });
});

describe("the host's dense and local limits", () => {
  function sheets_of(...shapes: [rows: number, width: number][]): Workbook {
    return {
      activeSheet: "s0",
      sheets: shapes.map(([row_count, width], index) => ({
        id: `s${index}`,
        name: `Sheet ${index}`,
        rowCount: row_count,
        columns: columns(width),
      })),
    };
  }

  function engine_of(store: SheetwriteStore) {
    const engine = storeEngine(store);
    if (!engine) throw new Error("expected a registered engine");
    return engine;
  }

  it("place sheets in the engine as validation does when the host lowers them", () => {
    const store = new SheetwriteStore(sheets_of([10, 10], [10, 10]), undefined, {
      snapshotResourceLimits: { maxDenseCells: 100, maxLocalPagedCells: 150 },
    });
    try {
      expect(engine_of(store).isLocalPaged("s0")).toBe(false);
      expect(engine_of(store).isLocalPaged("s1")).toBe(true);
      const fits = store.applyTransaction({
        patches: [{ op: "addRows", sheet: "s1", at: 0, count: 5 }],
      });
      expect(fits.status).toBe("applied");
      const refused = store.applyTransaction({
        patches: [{ op: "addRows", sheet: "s1", at: 0, count: 1 }],
      });
      expect(refused.status).toBe("rejected");
      if (refused.status !== "rejected") throw new Error("expected a rejected transaction");
      expect(refused.issues[0]).toMatchObject({ resource: "local-paged-cells", max: 150 });
      expect(store.getWorkbook().sheets.find((sheet) => sheet.id === "s1")?.rowCount).toBe(15);
    } finally {
      store.dispose();
    }
  });

  it("are capped at the engine's ceilings when the host raises them", () => {
    const limits = { maxDenseCells: 10_000_000, maxLocalPagedCells: 30_000_000 };
    // 5,000,010 local cells plus 16,000,000 pass the engine's 20,000,000, so
    // validation refuses the workbook before the engine allocates anything.
    let refusal: unknown;
    try {
      new SheetwriteStore(sheets_of([ROWS, COLUMNS], [1_000_000, 16]), undefined, {
        snapshotResourceLimits: limits,
      }).dispose();
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(SnapshotResourceError);
    expect(refusal).toMatchObject({
      resource: "maxLocalPagedCells",
      limit: DEFAULT_SNAPSHOT_RESOURCE_LIMITS.maxLocalPagedCells,
    });
  });
});
