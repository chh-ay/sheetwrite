import { afterEach, beforeAll, beforeEach, expect, it } from "bun:test";
import { createAdapterGridController, type GridReadyEvent } from "../src/adapter.js";
import { initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { Grid } from "../src/types.js";
import { makeWorkbook } from "./fixtures.js";

let restoreStubs: () => void;
beforeAll(async () => {
  await initSheetwrite();
});
beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
});
afterEach(() => {
  restoreStubs();
});

it("only announces a still-current published generation and applies live changes while publication waits", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const publication = Promise.withResolvers<void>();
  const ready: GridReadyEvent[] = [];
  const errors: unknown[] = [];
  const published: { grid: Grid | null } = { grid: null };
  const lifetime = createAdapterGridController(
    { onReady: (event) => ready.push(event) },
    {
      publish(grid) {
        published.grid = grid;
        if (grid) return publication.promise;
      },
      setInitializationState() {},
      reportConsumerFailure: (error) => errors.push(error),
    },
  );
  const options = { workbook: makeWorkbook(10) };
  lifetime.mount(host, { options });
  lifetime.update({ options: { ...options, theme: { bg: "#102030" } } });
  expect(published.grid?.getEffectiveTheme().bg).toBe("#102030");
  lifetime.unmount();
  lifetime.mount(host, { options });
  publication.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(ready.map((event) => event.generation)).toEqual([2]);
  expect(ready[0]?.grid ?? null).toBe(published.grid);
  expect(errors).toEqual([]);
  lifetime.unmount();
  lifetime.unmount();
  expect(published.grid).toBeNull();
  expect(host.childElementCount).toBe(0);
});

for (const failureAt of ["publication", "ready"] as const) {
  it(`retires a new Grid after ${failureAt} throws without reporting an initialization failure`, () => {
    const host = document.createElement("div");
    document.body.append(host);
    const failure = new Error(`consumer ${failureAt} failed`);
    const initializationErrors: unknown[] = [];
    let published: Grid | null = null;
    const lifetime = createAdapterGridController(
      {
        onReady() {
          if (failureAt === "ready") throw failure;
        },
        onInitializationError: (error) => initializationErrors.push(error),
      },
      {
        publish(grid) {
          published = grid;
          if (grid && failureAt === "publication") throw failure;
        },
        setInitializationState() {},
        reportConsumerFailure(error) {
          throw error;
        },
      },
    );
    expect(() => lifetime.mount(host, { options: { workbook: makeWorkbook(10) } })).toThrow(
      failure,
    );
    expect(published).toBeNull();
    expect(host.childElementCount).toBe(0);
    expect(initializationErrors).toEqual([]);
    lifetime.unmount();
  });
}
