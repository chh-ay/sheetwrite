// Host functions need the full engine, and engine selection is process-wide,
// so `ribbon.test.ts` runs this file in its own process.
import { afterEach, beforeAll, beforeEach, expect, it } from "bun:test";

import * as formulas from "@sheetwrite/formulas";

import {
  type FormulaFunctionDefinition,
  type FormulaFunctionMetadata,
  functionsAddon,
} from "../src/functions.js";
import { createGrid, initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { GridConfig } from "../src/types.js";
import { makeWorkbook } from "./fixtures.js";

const RIBBON_MODULE = "../src/ribbon/ribbon.js";

const TAX_RATE: FormulaFunctionMetadata = {
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
  await initSheetwrite({ engine: formulas, addons: [functionsAddon()] });
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

const TAX_RATE_FUNCTION: FormulaFunctionDefinition = {
  metadata: TAX_RATE,
  implementation: () => 0.2,
};

async function setup(config: GridConfig, functions: readonly FormulaFunctionDefinition[]) {
  const host = document.createElement("div");
  Object.defineProperties(host, { clientWidth: { value: 900 }, clientHeight: { value: 500 } });
  document.body.appendChild(host);
  const grid = createGrid(host, { workbook: makeWorkbook(3), config, addons: { functions } });
  cleanups.push(() => grid.destroy());
  await import(RIBBON_MODULE);
  await settled();
  return { grid, host };
}

function tab(host: HTMLElement, name: string): HTMLElement {
  const found = [...host.querySelectorAll<HTMLElement>('.sheetwrite-ribbon [role="tab"]')].find(
    (candidate) => candidate.textContent === name,
  );
  if (found === undefined) throw new Error(`no ribbon tab "${name}"`);
  return found;
}

it("Formulas › Insert Function shows only in a grid with host functions, and starts a formula", async () => {
  const plain = await setup({ ribbon: true }, []);
  tab(plain.host, "Formulas").click();
  const plainInsert = plain.host.querySelector<HTMLButtonElement>(
    '[data-command="insertFunction"]',
  );
  if (plainInsert === null) throw new Error("no Insert Function command");
  // Explain Formula keeps the tab when there is no host function.
  expect(plainInsert.hidden).toBe(true);
  expect(tab(plain.host, "Formulas").hidden).toBe(false);

  const { grid, host } = await setup({ ribbon: true }, [TAX_RATE_FUNCTION]);
  tab(host, "Formulas").click();
  const insert = host.querySelector<HTMLButtonElement>('[data-command="insertFunction"]');
  if (insert === null) throw new Error("no Insert Function command");
  expect(insert.hidden).toBe(false);

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
});

it("the toolbar shows Insert Function only in a grid with host functions", async () => {
  const toolbarCommand = (host: HTMLElement): HTMLElement => {
    const command = host.querySelector<HTMLElement>(
      '.sheetwrite-command-toolbar [data-command="insertFunction"]',
    );
    if (command === null) throw new Error("no toolbar Insert Function command");
    return command;
  };

  const plain = await setup({}, []);
  const withFunction = await setup({}, [TAX_RATE_FUNCTION]);

  expect(toolbarCommand(plain.host).hidden).toBe(true);
  expect(toolbarCommand(withFunction.host).hidden).toBe(false);
});
