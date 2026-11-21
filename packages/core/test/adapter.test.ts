import { afterEach, beforeAll, beforeEach, expect, it } from "bun:test";

import {
  applyChangedLiveGridOptions,
  createAdapterGridController,
  createGridController,
  createSimpleGridInput,
  extractGridOptions,
  getGridResetReason,
  type GridReadyEvent,
  gridSizeStyle,
} from "../src/adapter.js";
import { initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { Grid, GridOptions } from "../src/types.js";
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

for (const [retiredReadiness, currentPublication] of [
  ["rejects", "sync"],
  ["resolves", "async"],
] as const) {
  it(`announces only the current generation, ignores a retired attachment's publication that ${retiredReadiness}, and applies live changes while ${currentPublication} publication waits`, async () => {
    const host = mountHost();
    const stale = Promise.withResolvers<void>();
    const current = Promise.withResolvers<void>();
    const retired = Promise.withResolvers<void>();
    const ready: GridReadyEvent[] = [];
    const failures: unknown[] = [];
    const published: { grid: Grid | null; count: number } = { grid: null, count: 0 };
    const controller = createAdapterGridController(
      { onReady: (event) => ready.push(event) },
      {
        publish(grid) {
          published.grid = grid;
          if (!grid) return retired.promise;
          if (++published.count === 1) return stale.promise;
          if (currentPublication === "async") return current.promise;
        },
        setInitializationState() {},
        reportConsumerFailure: (error) => failures.push(error),
      },
    );
    const options = { workbook: makeWorkbook(10) };
    controller.mount(host, { options });
    controller.update({ options: { ...options, theme: { bg: "#102030" } } });
    expect(published.grid?.getEffectiveTheme().bg).toBe("#102030");
    controller.unmount();
    controller.mount(host, { options });
    if (retiredReadiness === "rejects") stale.reject(new Error("retired readiness"));
    else stale.resolve();
    retired.reject(new Error("retired handle"));
    current.resolve();
    const turn = Promise.withResolvers<void>();
    setImmediate(turn.resolve);
    await turn.promise;
    expect(ready.map((event) => event.generation)).toEqual([2]);
    expect(ready[0]?.grid ?? null).toBe(published.grid);
    expect(failures).toEqual([]);
    controller.unmount();
    controller.unmount();
    expect(published.grid).toBeNull();
    expect(host.childElementCount).toBe(0);
  });
}

it("retires a new Grid after publication throws without reporting an initialization failure", () => {
  const host = mountHost();
  const failure = new Error("consumer publication failed");
  const initializationErrors: unknown[] = [];
  let published: Grid | null = null;
  const controller = createAdapterGridController(
    { onInitializationError: (error) => initializationErrors.push(error) },
    {
      publish(grid) {
        published = grid;
        if (grid) throw failure;
      },
      setInitializationState() {},
      reportConsumerFailure(error) {
        throw error;
      },
    },
  );
  expect(() => controller.mount(host, { options: { workbook: makeWorkbook(10) } })).toThrow(
    failure,
  );
  expect(published).toBeNull();
  expect(host.childElementCount).toBe(0);
  expect(initializationErrors).toEqual([]);
});

it("applies live readOnly and config changes to the existing grid", async () => {
  const host = mountHost();
  const previous: GridOptions = {
    workbook: makeWorkbook(3),
    data: makeColumnarData(3),
    readOnly: false,
    config: { toolbar: true },
  };
  const controller = createGridController(host, previous, {});
  const grid = controller.grid;
  const addr = { sheet: "s1", row: 0, col: 0 };
  const edit = (value: string) =>
    grid.applyTransaction({ patches: [{ op: "set", addr, value: { kind: "literal", value } }] });
  // The toolbar loads lazily; awaiting its module runs the grid's mount first.
  await import("../src/ribbon/command-toolbar.js");
  expect(host.querySelector(".sheetwrite-toolbar")).not.toBeNull();

  const next: GridOptions = { ...previous, readOnly: true, config: { toolbar: false } };
  applyChangedLiveGridOptions(controller, previous, next);
  expect(host.querySelector('[role="grid"]')?.getAttribute("aria-readonly")).toBe("true");
  expect(host.querySelector(".sheetwrite-toolbar")).toBeNull();
  edit("blocked");
  expect(grid.store.getCell(addr).resolved).toBe("Customer 0");

  applyChangedLiveGridOptions(controller, next, { ...next, readOnly: false });
  edit("editable");
  expect(host.querySelector('[role="grid"]')?.hasAttribute("aria-readonly")).toBe(false);
  expect(grid.store.getCell(addr).resolved).toBe("editable");
  controller.destroy();
});

it("extracts only supported grid options and normalizes explicit host sizing", () => {
  const workbook = makeWorkbook(1);
  expect(
    extractGridOptions({ workbook, readOnly: true, className: "host-only", onReady: () => {} }),
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

it("replaces the grid with an input reset when only data changes", () => {
  const workbook = makeWorkbook(1);
  const previous = { workbook, data: makeColumnarData(1) };
  const next = { workbook, data: makeColumnarData(1) };
  expect(getGridResetReason(previous, next)).toBe("input-reset");
});

it("rejects duplicate keys, empty keys, and empty titles in simple columns", () => {
  const defaultRows: Array<Record<string, string>> = [{ name: "A", "": "A" }];
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
