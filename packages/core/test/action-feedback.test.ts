import { afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test";

import { createGrid, initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { Grid, ToolbarItem } from "../src/types.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

let restoreCanvas: () => void;
let grid: Grid | undefined;

beforeAll(async () => {
  await initSheetwrite();
});
beforeEach(() => {
  restoreCanvas = installCanvasTestStubs();
});
afterEach(() => {
  grid?.destroy();
  grid = undefined;
  restoreCanvas();
  document.body.replaceChildren();
});

async function mount(toolbar: ToolbarItem[]): Promise<HTMLElement> {
  const host = document.createElement("div");
  Object.defineProperties(host, { clientWidth: { value: 800 }, clientHeight: { value: 400 } });
  document.body.append(host);
  grid = createGrid(host, {
    workbook: makeWorkbook(3),
    data: makeColumnarData(3),
    config: { toolbar, contextMenu: [{ id: "copy", action: "copy" }], find: true },
  });
  // The toolbar loads lazily; awaiting its module runs the grid's mount first.
  await import("../src/ribbon/command-toolbar.js");
  return host;
}

async function flush(): Promise<void> {
  for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
}

describe("built-in action feedback", () => {
  for (const format of ["csv", "xlsx"] as const) {
    it(`shows ${format} export failures and emits the format without rejecting the action`, async () => {
      const host = await mount([{ action: format === "csv" ? "exportCsv" : "exportXlsx" }]);
      if (!grid) throw new Error("Grid did not mount");
      const failure = new Error("Download failed");
      const exporter =
        format === "csv"
          ? spyOn(grid, "exportCsv").mockImplementation(() => {
              throw failure;
            })
          : spyOn(grid, "exportXlsx").mockRejectedValue(failure);
      const failures: unknown[] = [];
      grid.on("export-error", (event) => failures.push(event));
      try {
        if (format === "csv") grid.actions.exportCsv();
        else await expect(grid.actions.exportXlsx()).resolves.toBeUndefined();
        await flush();
        expect(failures).toMatchObject([
          { format, error: { code: "export-failed", message: "Download failed", cause: failure } },
        ]);
        expect(host.querySelector<HTMLElement>("[role=alert]")?.textContent).toContain(
          "Download failed",
        );
      } finally {
        exporter.mockRestore();
      }
    });
  }
});
