import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { DEFAULT_SNAPSHOT_RESOURCE_LIMITS } from "../src/document-protocol.js";
import { createGrid, initSheetwrite } from "../src/index.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { ApplyTransactionResult, Column, MutationIssue, Workbook } from "../src/types.js";
import { mountHost } from "./fixtures.js";

const SHEET = "s";

function columns(count: number): Column[] {
  return Array.from({ length: count }, (_, index) => ({
    key: `c${index}`,
    header: `C${index}`,
    width: 80,
    type: "number" as const,
  }));
}

function workbook(rowCount: number, columnCount: number): Workbook {
  return {
    activeSheet: SHEET,
    sheets: [{ id: SHEET, name: "Data", rowCount, columns: columns(columnCount) }],
  };
}

function rowCountOf(store: SheetwriteStore): number | undefined {
  return store.getWorkbook().sheets[0]?.rowCount;
}

/** The single resource-limit issue of a rejected result. */
function limitIssue(
  result: ApplyTransactionResult,
): Extract<MutationIssue, { kind: "resource-limit" }> {
  expect(result.status).toBe("rejected");
  if (result.status !== "rejected") throw new Error("expected a rejected transaction");
  const [issue] = result.issues;
  if (issue?.kind !== "resource-limit") throw new Error("expected a resource-limit issue");
  return issue;
}

beforeAll(async () => {
  await initSheetwrite();
});

describe("row and column inserts are held to the document limits", () => {
  const maxRows = DEFAULT_SNAPSHOT_RESOURCE_LIMITS.maxRowsPerSheet;

  it("rejects addRows past maxRowsPerSheet and keeps the row count", () => {
    const store = new SheetwriteStore(workbook(maxRows, 1));
    try {
      const issue = limitIssue(
        store.applyTransaction({ patches: [{ op: "addRows", sheet: SHEET, at: 0, count: 5 }] }),
      );
      expect(issue).toMatchObject({ resource: "sheet-rows", max: maxRows, actual: maxRows + 5 });
      expect(issue.message).toContain("1,000,000");
      expect(rowCountOf(store)).toBe(maxRows);
    } finally {
      store.dispose();
    }
  });

  it("applies addRows up to maxRowsPerSheet, and the snapshot of that sheet loads", () => {
    const store = new SheetwriteStore(workbook(maxRows - 5, 1));
    try {
      const result = store.applyTransaction({
        patches: [{ op: "addRows", sheet: SHEET, at: 0, count: 5 }],
      });
      expect(result.status).toBe("applied");
      expect(rowCountOf(store)).toBe(maxRows);
      const reloaded = SheetwriteStore.fromSnapshot(store.exportSnapshot());
      try {
        expect(rowCountOf(reloaded)).toBe(maxRows);
      } finally {
        reloaded.dispose();
      }
    } finally {
      store.dispose();
    }
  });

  it("counts every insert of one transaction toward the limit", () => {
    const store = new SheetwriteStore(workbook(maxRows - 5, 1));
    try {
      const issue = limitIssue(
        store.applyTransaction({
          patches: [
            { op: "addRows", sheet: SHEET, at: 0, count: 3 },
            { op: "addRows", sheet: SHEET, at: 0, count: 3 },
          ],
        }),
      );
      expect(issue).toMatchObject({ resource: "sheet-rows", actual: maxRows + 1 });
      expect(rowCountOf(store)).toBe(maxRows - 5);
    } finally {
      store.dispose();
    }
  });

  it("rejects addColumns past maxColumnsPerSheet", () => {
    const store = new SheetwriteStore(workbook(10, 4), undefined, {
      snapshotResourceLimits: { maxColumnsPerSheet: 4 },
    });
    try {
      const issue = limitIssue(
        store.applyTransaction({
          patches: [{ op: "addColumns", sheet: SHEET, at: 4, columns: columns(5).slice(4) }],
        }),
      );
      expect(issue).toMatchObject({ resource: "sheet-columns", max: 4, actual: 5 });
      expect(store.getWorkbook().sheets[0]?.columns).toHaveLength(4);
    } finally {
      store.dispose();
    }
  });

  it("rejects an insert past the dense cell limit with a reason instead of a no-op", () => {
    const maxDense = DEFAULT_SNAPSHOT_RESOURCE_LIMITS.maxDenseCells;
    // Ten columns reach the dense limit at 500,000 rows, well below the row limit.
    const rows = maxDense / 10 - 1;
    const store = new SheetwriteStore(workbook(rows, 10));
    try {
      const fits = store.applyTransaction({
        patches: [{ op: "addRows", sheet: SHEET, at: 0, count: 1 }],
      });
      expect(fits.status).toBe("applied");
      const issue = limitIssue(
        store.applyTransaction({ patches: [{ op: "addRows", sheet: SHEET, at: 0, count: 1 }] }),
      );
      expect(issue).toMatchObject({
        resource: "dense-cells",
        max: maxDense,
        actual: maxDense + 10,
      });
      expect(issue.message).toContain("5,000,000");
      expect(rowCountOf(store)).toBe(rows + 1);
    } finally {
      store.dispose();
    }
  });
});

describe("Grid.insertRows past a document limit", () => {
  let restoreStubs: () => void;
  beforeEach(() => {
    restoreStubs = installCanvasTestStubs();
  });
  afterEach(() => restoreStubs());

  it("emits mutation-rejected and shows the limit instead of doing nothing", () => {
    const maxRows = DEFAULT_SNAPSHOT_RESOURCE_LIMITS.maxRowsPerSheet;
    const host = mountHost();
    const grid = createGrid(host, { workbook: workbook(maxRows, 1) });
    try {
      const rejected: MutationIssue[] = [];
      grid.on("mutation-rejected", ({ issues }) => rejected.push(...issues));
      grid.insertRows(0, 5);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]).toMatchObject({ kind: "resource-limit", resource: "sheet-rows" });
      expect(grid.store.getWorkbook().sheets[0]?.rowCount).toBe(maxRows);
      const alert = host.querySelector<HTMLElement>(".sheetwrite-action-status");
      expect(alert?.hidden).toBe(false);
      expect(alert?.textContent).toContain("1,000,000");
    } finally {
      grid.destroy();
      host.remove();
    }
  });
});
