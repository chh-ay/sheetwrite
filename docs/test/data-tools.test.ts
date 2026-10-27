import { afterEach, beforeEach, expect, test } from "bun:test";

import { installCanvasTestStubs } from "../../packages/core/src/testing.js";
import {
  createDataToolsScenario,
  DATA_SHEET,
  type DataToolsScenario,
} from "../src/showcases/scenarios/data-tools.js";

let restoreCanvas: () => void;
let scenario: DataToolsScenario | null = null;
let host: HTMLElement;
beforeEach(() => {
  restoreCanvas = installCanvasTestStubs();
  host = document.createElement("div");
  document.body.append(host);
});
afterEach(() => {
  scenario?.dispose();
  scenario = null;
  host.remove();
  restoreCanvas();
});

test("clear view preserves independent manual and grouped visibility", async () => {
  scenario = createDataToolsScenario(host);
  await scenario.ready;
  expect(scenario.snapshot().error).toBeNull();
  scenario.run("sort");
  const sorted = scenario.grid()?.store.getVisibleWindow(DATA_SHEET, { start: 0, end: 1 }, [1, 4]);
  expect(sorted ? Array.from(sorted.values) : []).toEqual(["APAC", 250]);
  scenario.filter("EMEA", "Northstar");
  expect(scenario.snapshot().visible).toBe(640);
  scenario.run("group");
  scenario.run("rows");
  scenario.run("columns");
  scenario.run("clear");
  expect(scenario.snapshot()).toMatchObject({
    visible: 4773,
    hiddenRows: 3,
    hiddenColumns: 2,
    collapsed: true,
    filters: [],
  });
  scenario.run("group");
  scenario.run("rows");
  scenario.run("columns");
  expect(scenario.snapshot()).toMatchObject({
    visible: 4800,
    hiddenRows: 0,
    hiddenColumns: 0,
    collapsed: false,
  });
});

test("mutation receipts distinguish rejected, warned and host-authorized stored edits", async () => {
  scenario = createDataToolsScenario(host);
  await scenario.ready;
  expect(scenario.snapshot().error).toBeNull();
  scenario.filter("APAC", "Atlas");
  scenario.run("sort");
  scenario.run("reject");
  const cell = (col: number) =>
    scenario?.grid()?.store.getCell({ sheet: DATA_SHEET, row: 0, col }).resolved;
  expect(cell(4)).toBe(1);
  expect(scenario.snapshot().probes.units).toMatchObject({ outcome: "rejected", stored: "1" });
  scenario.run("warn");
  expect(cell(5)).toBe(350);
  expect(scenario.snapshot().probes.freight).toMatchObject({ outcome: "warned", stored: "350" });
  scenario.run("protected");
  expect(cell(0)).toBe("ORD-10001");
  expect(scenario.snapshot().probes.order).toMatchObject({ outcome: "rejected" });
  scenario.run("manager");
  scenario.run("protected");
  expect(cell(0)).toBe("MANAGER-REVIEW");
  expect(scenario.snapshot().probes.order).toMatchObject({
    outcome: "saved",
    stored: "MANAGER-REVIEW",
  });
});
