import { afterEach, expect, it } from "bun:test";

import { createGrid, initSheetwrite } from "../src/grid.js";
import type { SheetwriteAddon } from "../src/types.js";
import { makeWorkbook, mountHost } from "./fixtures.js";

afterEach(() => {
  document.body.replaceChildren();
});

it("initSheetwrite rejects an add-on name listed twice before any setup runs", async () => {
  const log: string[] = [];
  const addon = (name: string): SheetwriteAddon => ({ name, setup: () => log.push(name) });

  await expect(
    initSheetwrite({ addons: [addon("duplicate-first"), addon("duplicate"), addon("duplicate")] }),
  ).rejects.toMatchObject({
    code: "invalid-argument",
    operation: "initialize",
    context: { addon: "duplicate" },
  });
  expect(log).toEqual([]);
});

it("createGrid rejects settings for an add-on that initSheetwrite did not install", async () => {
  await initSheetwrite();
  const host = mountHost();

  expect(() =>
    createGrid(host, { workbook: makeWorkbook(5), addons: { "not-installed": {} } }),
  ).toThrow(
    expect.objectContaining({
      code: "invalid-argument",
      operation: "create-grid",
      context: { addon: "not-installed" },
    }),
  );
  expect(host.childElementCount).toBe(0);
});
