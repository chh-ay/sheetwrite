import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import {
  applyChangedLiveGridOptions,
  createAdapterGridController,
  createGridController,
  createSimpleGridInput,
  extractGridOptions,
  gridSizeStyle,
} from "../src/adapter.js";
import { initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { GridOptions } from "../src/types.js";
import { makeColumnarData, makeWorkbook, mountHost } from "./fixtures.js";

let restoreCanvasStubs: () => void;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restoreCanvasStubs = installCanvasTestStubs();
});

afterEach(() => {
  restoreCanvasStubs();
  document.body.innerHTML = "";
});

describe("shared adapter option policy", () => {
  it("does not report rejected publication from an unmounted attachment after remount", async () => {
    const stalePublication = Promise.withResolvers<void>();
    const retiredPublication = Promise.withResolvers<void>();
    const failures: unknown[] = [];
    const readyGenerations: number[] = [];
    let published = 0;
    const controller = createAdapterGridController(
      {
        onReady: ({ generation }) => readyGenerations.push(generation),
      },
      {
        publish(grid) {
          if (!grid) return retiredPublication.promise;
          published += 1;
          if (published === 1) return stalePublication.promise;
        },
        setInitializationState() {},
        reportConsumerFailure: (error) => failures.push(error),
      },
    );
    const input = { options: { workbook: makeWorkbook(1) } };
    controller.mount(mountHost(), input);
    controller.unmount();
    controller.mount(mountHost(), input);
    stalePublication.reject(new Error("retired readiness"));
    retiredPublication.reject(new Error("retired handle"));
    const turn = Promise.withResolvers<void>();
    setImmediate(turn.resolve);
    await turn.promise;
    expect(readyGenerations).toEqual([2]);
    expect(failures).toHaveLength(0);
    controller.unmount();
  });

  it("applies live options to the existing grid and changes its behavior", async () => {
    const host = mountHost();
    const workbook = makeWorkbook(3);
    const previous: GridOptions = {
      workbook,
      data: makeColumnarData(3),
      theme: { bg: "#ffffff" },
      readOnly: false,
      config: { toolbar: true },
    };
    const controller = createGridController(host, previous, {});
    const originalGrid = controller.grid;
    const addr = { sheet: "s1", row: 0, col: 0 };
    // The toolbar loads lazily; awaiting its module runs the grid's mount first.
    await import("../src/ribbon/command-toolbar.js");
    expect(host.querySelector(".sheetwrite-toolbar")).not.toBeNull();

    const next: GridOptions = {
      ...previous,
      theme: { bg: "#123456" },
      readOnly: true,
      config: { toolbar: false },
      overscan: 2,
      minColumns: 4,
    };
    applyChangedLiveGridOptions(controller, previous, next);

    expect(controller.grid).toBe(originalGrid);
    expect(originalGrid.getEffectiveTheme().bg).toBe("#123456");
    expect(host.getAttribute("aria-readonly")).toBe("true");
    expect(host.querySelector(".sheetwrite-toolbar")).toBeNull();
    originalGrid.applyTransaction({
      patches: [{ op: "set", addr, value: { kind: "literal", value: "blocked" } }],
    });
    expect(originalGrid.store.getCell(addr).resolved).toBe("Customer 0");

    applyChangedLiveGridOptions(controller, next, { ...next, readOnly: false });
    originalGrid.applyTransaction({
      patches: [{ op: "set", addr, value: { kind: "literal", value: "editable" } }],
    });
    expect(host.hasAttribute("aria-readonly")).toBe(false);
    expect(originalGrid.store.getCell(addr).resolved).toBe("editable");

    controller.destroy();
  });
  it("extracts only supported grid options and normalizes explicit host sizing", () => {
    const workbook = makeWorkbook(1);
    expect(
      extractGridOptions({
        workbook,
        readOnly: true,
        className: "host-only",
        onReady: () => {},
      }),
    ).toEqual({ workbook, readOnly: true });
    expect(gridSizeStyle({ fill: true })).toEqual({
      width: "100%",
      height: "100%",
      minHeight: "0",
    });
    expect(gridSizeStyle({ height: 320 })).toEqual({ width: "100%", height: "320px" });
    expect(gridSizeStyle({ height: "40vh" })).toEqual({ width: "100%", height: "40vh" });
    expect(gridSizeStyle({})).toEqual({});
  });
});

describe("simple data conversion", () => {
  it("rejects duplicate keys, empty keys, and empty titles", () => {
    type Row = Record<string, string>;
    const defaultRows: Row[] = [{ name: "A", "": "A" }];
    const valid = { columns: [{ key: "name", title: "Name" }], defaultRows };
    expect(() => createSimpleGridInput(valid)).not.toThrow();
    const invalid: Array<Array<{ key: string; title: string }>> = [
      [
        { key: "name", title: "Name" },
        { key: "name", title: "Again" },
      ],
      [{ key: "", title: "Missing" }],
      [{ key: "name", title: "" }],
    ];
    for (const columns of invalid) {
      expect(() => createSimpleGridInput({ ...valid, columns })).toThrow(Error);
    }
  });
});
