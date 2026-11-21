import { afterEach, beforeEach, expect, test } from "bun:test";

import { installCanvasTestStubs } from "../../packages/core/src/testing.js";
import {
  createDataToolsScenario,
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
