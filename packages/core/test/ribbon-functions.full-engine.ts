// Host functions need the full engine, and engine selection is process-wide,
// so `ribbon.test.ts` runs this file in its own process.
import { afterEach, beforeAll, beforeEach, expect, it } from "bun:test";

import * as formulas from "@sheetwrite/formulas";

import { registerFunction, unregisterFunction } from "../src/functions.js";
import { GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { GridConfig } from "../src/types.js";
import { makeWorkbook } from "./fixtures.js";

const RIBBON_MODULE = "../src/ribbon/ribbon.js";

const TAX_RATE = {
  name: "TAXRATE",
  description: "Sales tax rate of a region.",
  arguments: [
    { name: "region", types: ["text"] },
    { name: "year", types: ["number"], optional: true },
  ],
  returnKind: "number",
};

let restore: () => void;
const cleanups: (() => void)[] = [];

beforeAll(async () => {
  await initSheetwrite(undefined, formulas);
  // Load the chrome chunk once, so each grid's own import resolves at once.
  await import(RIBBON_MODULE);
});
beforeEach(() => {
  restore = installCanvasTestStubs();
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.replaceChildren();
  restore();
});

/** Command state changes reach the chrome in a microtask; toolbar fits wait a frame. */
function settled(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  requestAnimationFrame(() => queueMicrotask(resolve));
  return promise;
}

async function setup(config: GridConfig) {
  const workbook = makeWorkbook(3);
  const store = new SheetwriteStore(workbook);
  const host = document.createElement("div");
  Object.defineProperties(host, { clientWidth: { value: 900 }, clientHeight: { value: 500 } });
  document.body.appendChild(host);
  const grid = new GridImpl(host, { workbook, config }, store);
  cleanups.push(() => {
    grid.destroy();
    store.dispose();
  });
  await import(RIBBON_MODULE);
  await settled();
  return { grid, host, store };
}

function tab(host: HTMLElement, name: string): HTMLElement {
  const found = [...host.querySelectorAll<HTMLElement>('.sheetwrite-ribbon [role="tab"]')].find(
    (candidate) => candidate.textContent === name,
  );
  if (found === undefined) throw new Error(`no ribbon tab "${name}"`);
  return found;
}

it("Formulas › Insert Function shows only while host functions exist, and starts a formula", async () => {
  const { grid, host, store } = await setup({ ribbon: true });
  const formulasTab = tab(host, "Formulas");
  expect(formulasTab.hidden).toBe(true);

  registerFunction(store, TAX_RATE, () => 0.2);
  await settled();
  expect(formulasTab.hidden).toBe(false);

  formulasTab.click();
  const insert = host.querySelector<HTMLButtonElement>('[data-command="insertFunction"]');
  if (insert === null) throw new Error("no Insert Function command");
  grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 1, col: 0 } });
  await settled();
  insert.click();
  const item = document.querySelector<HTMLButtonElement>(
    '.sheetwrite-ribbon-menu [role="menuitem"]',
  );
  expect(item?.textContent).toBe("TAXRATE");
  expect(item?.title).toBe("TAXRATE(region, [year]): Sales tax rate of a region.");

  item?.click();
  expect(host.querySelector<HTMLTextAreaElement>("textarea.sheetwrite-editor")?.value).toBe(
    "=TAXRATE(",
  );

  // The last function going away hides the tab and gives the selection back to Home.
  unregisterFunction(store, "TAXRATE");
  await settled();
  expect(formulasTab.hidden).toBe(true);
  expect(tab(host, "Home").getAttribute("aria-selected")).toBe("true");
});

it("the toolbar shows Insert Function only while host functions exist", async () => {
  const { host, store } = await setup({});
  const command = host.querySelector<HTMLElement>(
    '.sheetwrite-command-toolbar [data-command="insertFunction"]',
  );
  if (command === null) throw new Error("no toolbar Insert Function command");
  expect(command.hidden).toBe(true);

  registerFunction(store, TAX_RATE, () => 0.2);
  await settled();
  expect(command.hidden).toBe(false);
});
