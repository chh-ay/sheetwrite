import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { SheetwriteAddon } from "../src/addons.js";
import { createGrid, initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { Grid } from "../src/types.js";
import { makeWorkbook } from "./fixtures.js";

let restoreStubs: () => void;
const grids: Grid[] = [];

beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
});

afterEach(() => {
  for (const grid of grids.splice(0)) grid.destroy();
  restoreStubs();
  document.body.replaceChildren();
});

function mountHost(): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  return host;
}

function mountGrid(addons?: Record<string, unknown>): Grid {
  const grid = createGrid(mountHost(), {
    workbook: makeWorkbook(5),
    config: { toolbar: false, find: false, contextMenu: false },
    addons,
  });
  grids.push(grid);
  return grid;
}

function recordingAddon(name: string, log: string[]): SheetwriteAddon {
  return {
    name,
    setup: () => log.push(name),
  };
}

describe("initSheetwrite add-ons", () => {
  it("sets up add-ons once, in list order", async () => {
    const log: string[] = [];

    await initSheetwrite({
      addons: [recordingAddon("order-b", log), recordingAddon("order-a", log)],
    });
    await initSheetwrite({ addons: [recordingAddon("order-a", log)] });

    expect(log).toEqual(["order-b", "order-a"]);
  });

  it("rejects a name listed twice before any setup runs", async () => {
    const log: string[] = [];

    const install = initSheetwrite({
      addons: [
        recordingAddon("duplicate-first", log),
        recordingAddon("duplicate", log),
        recordingAddon("duplicate", log),
      ],
    });

    await expect(install).rejects.toMatchObject({
      code: "invalid-argument",
      operation: "initialize",
      context: { addon: "duplicate" },
    });
    expect(log).toEqual([]);
  });
});

describe("createGrid add-on settings", () => {
  it("rejects settings for an add-on that initSheetwrite did not install", async () => {
    await initSheetwrite();
    const host = mountHost();

    const create = () =>
      createGrid(host, { workbook: makeWorkbook(5), addons: { "not-installed": {} } });

    expect(create).toThrow(
      expect.objectContaining({
        code: "invalid-argument",
        operation: "create-grid",
        context: { addon: "not-installed" },
      }),
    );
    expect(host.childElementCount).toBe(0);
  });

  it("gives each grid its own settings and cleans up when that grid is destroyed", async () => {
    const attached: Array<{ grid: Grid; settings: unknown }> = [];
    const detached: Grid[] = [];
    const settingsAddon: SheetwriteAddon<{ label: string }> = {
      name: "per-grid",
      setup: () => {},
      grid: ({ grid, settings }) => {
        attached.push({ grid, settings });
        return () => detached.push(grid);
      },
    };
    await initSheetwrite({ addons: [settingsAddon] });

    const first = mountGrid({ "per-grid": { label: "first" } });
    const second = mountGrid();
    first.destroy();

    expect(attached).toEqual([
      { grid: first, settings: { label: "first" } },
      { grid: second, settings: undefined },
    ]);
    expect(detached).toEqual([first]);
  });
});
