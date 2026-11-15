import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { createGrid, initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { Grid, SheetwriteAddon } from "../src/types.js";
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

function recordingAddon(name: string, log: string[]): SheetwriteAddon {
  return {
    name,
    setup: () => log.push(name),
  };
}

describe("initSheetwrite add-ons", () => {
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
});
