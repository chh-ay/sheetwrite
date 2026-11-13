import { beforeAll, describe, expect, it } from "bun:test";

import { previewFormula } from "../src/functions.js";
import { initSheetwrite, isSheetwriteError, SheetwriteStore } from "../src/index.js";
import type { Store } from "../src/types/store.js";
import { makeWorkbook } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

function failure(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("previewFormula", () => {
  it("rejects arguments it cannot preview with Sheetwrite errors", () => {
    const store = new SheetwriteStore(makeWorkbook(2));
    try {
      const cases: readonly [() => unknown, string][] = [
        [() => previewFormula({} as Store, { sheet: "s1", row: 0, col: 0 }, "=1"), "invalid-argument"],
        [() => previewFormula(store, { sheet: "s1", row: -1, col: 0 }, "=1"), "invalid-argument"],
        [() => previewFormula(store, { sheet: "s1", row: 0, col: 1.5 }, "=1"), "invalid-argument"],
        [() => previewFormula(store, { sheet: "missing", row: 0, col: 0 }, "=1"), "not-found"],
      ];
      for (const [run, code] of cases) {
        const error = failure(run);
        expect(isSheetwriteError(error) && error.code).toBe(code);
      }

      expect(previewFormula(store, { sheet: "s1", row: 0, col: 0 }, "=ROW()*10")).toEqual({
        status: "value",
        value: 10,
      });
    } finally {
      store.dispose();
    }
  });
});
