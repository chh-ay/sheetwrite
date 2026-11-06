import { afterEach, beforeAll, beforeEach, expect, it } from "bun:test";

import { connectExternalLinks } from "../src/external-links.js";
import { GridImpl, initSheetwrite } from "../src/grid.js";
import { loadPanels } from "../src/panels/panel-loader.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { ExternalLink, Workbook } from "../src/types.js";

let restore: () => void;
const grids: GridImpl[] = [];

// The ribbon and the panel load as their own chunks in a grid, so the tests
// load them the same way.
const RIBBON_MODULE = "../src/ribbon/ribbon.js";
const PANEL_MODULE = "../src/panels/edit-links-panel.js";

beforeAll(async () => {
  await initSheetwrite();
  await import(RIBBON_MODULE);
});
beforeEach(() => {
  restore = installCanvasTestStubs();
});
afterEach(() => {
  for (const grid of grids.splice(0)) grid.destroy();
  document.body.replaceChildren();
  restore();
});

const budget: ExternalLink = {
  book: "Budget.xlsx",
  target: "https://files.example/Budget.xlsx",
  sheets: [{ name: "Annual", cells: [{ row: 0, col: 0, value: 7 }] }],
};
const A1 = { sheet: "s1", row: 0, col: 0 };

async function setup(externalLinks?: ExternalLink[]) {
  const workbook: Workbook = {
    ...(externalLinks === undefined ? {} : { externalLinks }),
    activeSheet: "s1",
    sheets: [
      {
        id: "s1",
        name: "Sheet1",
        rowCount: 10,
        columns: ["a", "b"].map((key) => ({
          key,
          header: key.toUpperCase(),
          type: "text" as const,
          width: 100,
        })),
      },
    ],
  };
  const store = new SheetwriteStore(workbook);
  const host = document.createElement("div");
  Object.defineProperties(host, { clientWidth: { value: 1400 }, clientHeight: { value: 500 } });
  document.body.appendChild(host);
  const grid = new GridImpl(host, { workbook, readOnly: false, config: { ribbon: true } }, store);
  grids.push(grid);
  grid.applyTransaction({
    patches: [{ op: "set", addr: A1, value: { kind: "formula", src: "=[Budget.xlsx]Annual!A1" } }],
  });

  const commandButton = (id: string): HTMLButtonElement | null => {
    const button = host.querySelector<HTMLButtonElement>(
      `.sheetwrite-ribbon [data-command="${id}"]`,
    );
    for (let node: HTMLElement | null = button; node !== null; node = node.parentElement) {
      if (node.hidden) return null;
    }
    return button;
  };
  const openTab = (name: string): void => {
    const tab = [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find(
      (candidate) => candidate.textContent === name,
    );
    if (tab === undefined) throw new Error(`no ribbon tab "${name}"`);
    tab.click();
  };
  const openPanel = async (): Promise<void> => {
    openTab("Data");
    const command = commandButton("editLinks");
    if (command === null) throw new Error("Edit Links is not shown");
    command.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
    await loadPanels(grid);
    await import(PANEL_MODULE);
    await Promise.resolve();
    await Promise.resolve();
  };
  const control = <T extends HTMLElement>(key: string): T => {
    const element = host.querySelector<T>(`.sheetwrite-panel [data-focus-key="${key}"]`);
    if (element === null) throw new Error(`no panel control ${key}`);
    return element;
  };
  const panelText = (): string => host.querySelector(".sheetwrite-panel")?.textContent ?? "";
  return { grid, commandButton, openTab, openPanel, control, panelText };
}

it("shows Edit Links only for a workbook with links", async () => {
  const { grid, commandButton, openTab } = await setup();
  openTab("Data");
  expect(commandButton("editLinks")).toBeNull();

  grid.applyTransaction({ patches: [{ op: "setExternalLinks", links: [budget] }] });
  expect(commandButton("editLinks")).not.toBeNull();
});

it("lists the links and updates their values through the connected resolver", async () => {
  const { grid, openPanel, control, panelText } = await setup([budget]);
  await openPanel();
  expect(panelText()).toContain("Budget.xlsx");
  expect(panelText()).toContain("Location: https://files.example/Budget.xlsx");
  expect(panelText()).toContain("Status: Saved values");
  expect(control<HTMLButtonElement>("update-all").disabled).toBe(true);

  const requests: string[] = [];
  connectExternalLinks(grid, async ({ book }) => {
    requests.push(book);
    return [{ name: "Annual", cells: [{ row: 0, col: 0, value: 9 }] }];
  });
  await openPanel();
  const saved = Promise.withResolvers<void>();
  const stop = grid.on("change", () => saved.resolve());
  control<HTMLButtonElement>("update-budget.xlsx").click();
  await saved.promise;
  stop();
  // The panel records each status after the update's transaction commits.
  await Promise.resolve();

  expect(requests).toEqual(["Budget.xlsx"]);
  expect(grid.store.getCell(A1).resolved).toBe(9);
  expect(panelText()).toContain("Status: Updated");
});

it("changes the source and breaks the link from the panel", async () => {
  const { grid, openPanel, control } = await setup([budget]);
  await openPanel();

  control<HTMLButtonElement>("source-budget.xlsx").click();
  control<HTMLInputElement>("source-book-budget.xlsx").value = "Plan.xlsx";
  control<HTMLInputElement>("source-target-budget.xlsx").value = "Plan.xlsx";
  control<HTMLButtonElement>("source-save-budget.xlsx").click();
  expect(grid.store.getFormula(A1)).toBe("=[Plan.xlsx]Annual!A1");
  expect(grid.store.getCell(A1).resolved).toBe(7);

  control<HTMLButtonElement>("break-plan.xlsx").click();
  control<HTMLButtonElement>("break-confirm-plan.xlsx").click();
  expect(grid.store.getFormula(A1)).toBeNull();
  expect(grid.store.getCell(A1).resolved).toBe(7);
  expect(grid.store.getWorkbook().externalLinks).toBeUndefined();

  grid.undo();
  expect(grid.store.getFormula(A1)).toBe("=[Plan.xlsx]Annual!A1");
});
