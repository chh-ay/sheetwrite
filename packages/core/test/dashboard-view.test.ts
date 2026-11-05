import { afterEach, beforeAll, beforeEach, expect, it } from "bun:test";

import { GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { DashboardItem, Workbook } from "../src/types.js";

let restore: () => void;
const grids: GridImpl[] = [];

const RIBBON_MODULE = "../src/ribbon/ribbon.js";
const VIEW_MODULE = "../src/dashboard/dashboard-view.js";

beforeAll(async () => {
  await initSheetwrite();
  await import(RIBBON_MODULE);
  await import(VIEW_MODULE);
});
beforeEach(() => {
  restore = installCanvasTestStubs();
});
afterEach(() => {
  for (const grid of grids.splice(0)) grid.destroy();
  document.body.replaceChildren();
  restore();
});

const slicer: DashboardItem = {
  id: "region",
  box: { x: 0, y: 0, w: 4, h: 3 },
  kind: "slicer",
  field: { table: "orders", column: "region" },
};

const pivotItem: DashboardItem = {
  id: "sales",
  box: { x: 4, y: 0, w: 8, h: 6 },
  kind: "pivot",
  pivot: "by-region",
};

/** Orders A1:B4 on Data (regions East, West, East), and the dashboard Dash. */
function workbook(): Workbook {
  return {
    activeSheet: "data",
    sheets: [
      {
        id: "data",
        name: "Data",
        rowCount: 6,
        columns: ["a", "b"].map((key) => ({ key, header: key, width: 80, type: "text" as const })),
        tables: [
          {
            id: "orders",
            name: "Orders",
            range: { sheet: "data", start: { row: 0, col: 0 }, end: { row: 3, col: 1 } },
            columns: [
              { id: "region", name: "Region" },
              { id: "amount", name: "Amount" },
            ],
            headerRow: true,
            totalsRow: false,
          },
        ],
      },
      {
        id: "dash",
        name: "Dash",
        kind: "dashboard",
        dashboard: { items: [slicer, pivotItem] },
        rowCount: 0,
        columns: [],
        pivots: [
          {
            id: "by-region",
            name: "By region",
            source: { table: "orders" },
            anchor: { row: 0, col: 0 },
            rows: [0],
            columns: [],
            values: [{ field: 1, aggregation: "SUM" }],
          },
        ],
      },
    ],
  };
}

async function setup(readOnly = false) {
  const store = new SheetwriteStore(workbook());
  const write = (row: number, col: number, value: string | number) =>
    store.applyTransaction({
      patches: [
        { op: "set", addr: { sheet: "data", row, col }, value: { kind: "literal", value } },
      ],
    });
  ["Region", "East", "West", "East"].forEach((value, row) => write(row, 0, value));
  ["Amount", 1, 2, 3].forEach((value, row) => write(row, 1, value));

  const host = document.createElement("div");
  Object.defineProperties(host, { clientWidth: { value: 1200 }, clientHeight: { value: 600 } });
  document.body.appendChild(host);
  const grid = new GridImpl(
    host,
    { workbook: workbook(), readOnly, config: { ribbon: true } },
    store,
  );
  grids.push(grid);
  await import(RIBBON_MODULE);

  grid.setActiveSheet("dash");
  await import(VIEW_MODULE);
  await Promise.resolve();

  const items = () => store.getDashboard("dash")?.items ?? [];
  const element = (label: string) => {
    const found = host.querySelector<HTMLElement>(`.sheetwrite-dashboard [aria-label="${label}"]`);
    if (found === null) throw new Error(`nothing labelled ${label}`);
    return found;
  };
  const press = (target: Element, init: MouseEventInit = {}) =>
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0, ...init }));
  const key = (target: Element, name: string) =>
    target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
  const runMenu = (label: string, entry: string) => {
    press(element(label));
    const menuItem = [...host.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (candidate) => candidate.textContent === entry,
    );
    if (menuItem === undefined) throw new Error(`no ${entry} in ${label}`);
    press(menuItem);
  };
  return { grid, host, store, items, element, press, key, runMenu };
}

it("shows the items of the active dashboard over the cells, and hides them on a worksheet", async () => {
  const { grid, host } = await setup();
  const view = host.querySelector<HTMLElement>(".sheetwrite-dashboard");

  expect(view?.hidden).toBe(false);
  expect(
    [...host.querySelectorAll(".sheetwrite-dashboard-item")].map((item) =>
      item.getAttribute("aria-label"),
    ),
  ).toEqual(["Region", "By region"]);
  // The default engine keeps the pivot and says what computing it needs.
  expect(host.querySelector(".sheetwrite-dashboard-note")?.textContent).toContain("full engine");

  grid.setActiveSheet("data");
  expect(view?.hidden).toBe(true);
});

it("moves an item with the keyboard, one undo step per arrow, and refuses an occupied place", async () => {
  const { grid, items, element, key, runMenu } = await setup();

  runMenu("Region item actions", "Move");
  key(element("Region"), "ArrowDown");
  expect(items().find((item) => item.id === "region")?.box).toEqual({ x: 0, y: 1, w: 4, h: 3 });

  key(element("Region"), "ArrowRight");
  expect(items().find((item) => item.id === "region")?.box).toEqual({ x: 0, y: 1, w: 4, h: 3 });
  expect(document.querySelector(".sheetwrite-dashboard-status")?.textContent).toBe(
    "Another item is in that place.",
  );

  key(element("Region"), "Escape");
  grid.undo();
  expect(items().find((item) => item.id === "region")?.box).toEqual(slicer.box);
});

it("resizes an item by dragging its corner", async () => {
  const { host, items } = await setup();
  const handle = host.querySelector<HTMLElement>(
    '[data-item-id="region"] .sheetwrite-dashboard-resize',
  );
  if (handle === null) throw new Error("no resize handle");
  handle.setPointerCapture = () => {};
  const pointer = (type: string, clientX: number, clientY: number) =>
    handle.dispatchEvent(
      new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, clientX, clientY }),
    );

  // Rows are 48 px high, so 100 px down is two rows.
  pointer("pointerdown", 100, 100);
  pointer("pointermove", 100, 200);
  pointer("pointerup", 100, 200);

  expect(items().find((item) => item.id === "region")?.box).toEqual({ x: 0, y: 0, w: 4, h: 5 });
});

it("keeps one slicer value on a click and adds one with Ctrl, as saved changes", async () => {
  const { host, items, press, grid } = await setup();
  const value = (label: string) => {
    const button = [
      ...host.querySelectorAll<HTMLElement>(".sheetwrite-dashboard-slicer-value"),
    ].find((candidate) => candidate.textContent === label);
    if (button === undefined) throw new Error(`no slicer value ${label}`);
    return button;
  };

  expect(
    [...host.querySelectorAll(".sheetwrite-dashboard-slicer-value")].map((b) => b.textContent),
  ).toEqual(["East", "West"]);
  press(value("East"));
  expect(items()[0]).toEqual({ ...slicer, selected: ["East"] });

  press(value("West"), { ctrlKey: true });
  // Every value kept is no selection.
  expect(items()[0]).toEqual(slicer);

  grid.undo();
  expect(items()[0]).toEqual({ ...slicer, selected: ["East"] });
});

it("offers no layout changes in a read-only grid", async () => {
  const { host } = await setup(true);

  expect(host.querySelector(".sheetwrite-dashboard-item .sheetwrite-panel-menu-button")).toBeNull();
  expect(host.querySelector(".sheetwrite-dashboard-resize")).toBeNull();
});

it("adds a dashboard from Insert and shows it", async () => {
  const { grid, host, press } = await setup();
  grid.setActiveSheet("data");
  // Command availability refreshes in a microtask after a change.
  await Promise.resolve();
  const tab = [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (candidate) => candidate.textContent === "Insert",
  );
  if (tab === undefined) throw new Error("no Insert tab");
  tab.click();
  const button = host.querySelector<HTMLElement>(
    '.sheetwrite-ribbon-panel:not([hidden]) [aria-label="New Dashboard"]',
  );
  if (button === null) throw new Error("no New Dashboard command");

  press(button);
  // The command loads the dashboard chunk first.
  await import("../src/dashboard/dashboard-layout.js");
  await new Promise((resolve) => setTimeout(resolve, 0));

  const added = grid.store.getWorkbook().sheets.at(-1);
  expect(added).toMatchObject({ name: "Dashboard1", kind: "dashboard" });
  expect(grid.getActiveSheet()).toBe(added?.id ?? "");
  expect(host.querySelector(".sheetwrite-dashboard-empty")?.textContent).toContain("empty");
});

it("computes dashboard pivots on the full engine, in its own process", async () => {
  // Engine selection is process-wide, so the full-engine checks run apart.
  const probe = Bun.spawn(
    [process.execPath, "test", "./packages/core/test/dashboard.full-engine.ts"],
    { cwd: new URL("../../..", import.meta.url).pathname, stdout: "pipe", stderr: "pipe" },
  );
  const [exitCode, stderr] = await Promise.all([probe.exited, new Response(probe.stderr).text()]);

  expect({ exitCode, failures: stderr.match(/^\(fail\).*$/gmu) ?? [] }).toEqual({
    exitCode: 0,
    failures: [],
  });
});
