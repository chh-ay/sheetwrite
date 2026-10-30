import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { installCanvasTestStubs } from "../../packages/core/src/testing.js";
import {
  ENGINE_COLUMN_INDEX,
  ENGINE_LIVE_SHEET,
} from "../src/showcases/scenarios/engine-live-data.js";
import {
  createEngineScenario,
  ENGINE_TRACE_LIMIT,
  type EngineScenario,
} from "../src/showcases/scenarios/engine-live.js";

let restoreCanvas: () => void;
const mounted: Array<{ scenario: EngineScenario; host: HTMLElement }> = [];

beforeEach(() => {
  restoreCanvas = installCanvasTestStubs();
});

afterEach(() => {
  for (const { scenario, host } of mounted.splice(0)) {
    scenario.dispose();
    host.remove();
  }
  restoreCanvas();
});

// This integration drives Grid's actual idle delivery and animation frames.
// Advancing a fake clock would replace the platform scheduling being exercised.
async function waitUntil(predicate: () => boolean) {
  const deadline = performance.now() + 8_000;
  while (!predicate()) {
    if (performance.now() > deadline) throw new Error("Engine scenario did not settle");
    await Bun.sleep(10);
  }
}

async function mountScenario() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const scenario = createEngineScenario(host, { workerUrl: "/worker.js" });
  mounted.push({ scenario, host });
  await waitUntil(() => scenario.snapshot().ready || scenario.snapshot().error !== null);
  expect(scenario.snapshot().error).toBeNull();
  await waitUntil(
    () =>
      typeof scenario.grid()?.store.getCell({
        sheet: ENGINE_LIVE_SHEET,
        row: 1,
        col: ENGINE_COLUMN_INDEX.actual,
      }).resolved === "number",
  );
  return scenario;
}

describe("live engine scenario", () => {
  it("orchestrates real Grid edits, formula observations, host acknowledgement and undo", async () => {
    const scenario = await mountScenario();
    const address = { sheet: ENGINE_LIVE_SHEET, row: 1, col: ENGINE_COLUMN_INDEX.actual };
    const before = scenario.grid()?.store.getCell(address).resolved;
    await scenario.run("edit");
    expect(scenario.grid()?.store.getCell(address).resolved).toBe(Number(before) + 1_250);
    expect(scenario.snapshot().pendingOperations).toBe(1);
    const edited = scenario.snapshot().events;
    const transaction = edited.findIndex(
      (event) => event.type === "transaction-result" && event.status === "applied",
    );
    const formula = edited.findIndex((event) => event.type === "formula-update");
    expect(transaction).toBeGreaterThanOrEqual(0);
    expect(formula).toBeGreaterThan(transaction);
    await scenario.run("save");
    expect(scenario.snapshot().pendingOperations).toBe(0);
    const saved = scenario.snapshot().events;
    expect(saved.findIndex((event) => event.type === "host-save")).toBeGreaterThan(formula);
    expect(saved.find((event) => event.type === "host-save")).toMatchObject({
      status: "applied",
      version: 1,
      operations: 1,
    });
    await scenario.run("undo");
    expect(scenario.grid()?.store.getCell(address).resolved).toBe(before);
    expect(scenario.snapshot().pendingOperations).toBe(1);
    while (scenario.grid()?.getCommandState("undo").disabled === false) {
      await scenario.run("undo");
    }
    await scenario.run("undo");
    expect(scenario.snapshot().status).toBe("There is no Grid edit to undo.");
  });

  it("validates row input and bounds observations through the scenario interface", async () => {
    const scenario = await mountScenario();
    for (const input of ["0", "50001", "1.5", "no row", "9007199254740992"]) {
      await scenario.run("jump", input);
      expect(scenario.snapshot().status).toBe("Enter a whole row from 1 to 50,000.");
      expect(scenario.snapshot().currentRow).toBe(1);
    }
    await scenario.run("jump", "8");
    expect(scenario.snapshot().currentRow).toBe(7);
    for (let index = 0; index < 100; index += 1) await scenario.run("undo");
    expect(scenario.traceLength()).toBe(ENGINE_TRACE_LIMIT);
    expect(scenario.snapshot().events).toHaveLength(ENGINE_TRACE_LIMIT);
    scenario.reset();
    expect(scenario.traceLength()).toBe(0);
    expect(scenario.snapshot()).toMatchObject({ events: [], pendingOperations: 0, currentRow: 1 });
  });

  it("measures the complete follow story and formula rewrite with real paged cells", async () => {
    const scenario = await mountScenario();
    await scenario.followChange();
    const snapshot = scenario.snapshot();
    expect(snapshot.error).toBeNull();
    expect(snapshot.following).toBe(false);
    expect(snapshot.followDuration).not.toBeNull();
    expect(snapshot.followSteps).toHaveLength(4);
    expect(snapshot.followSteps?.every((duration) => duration >= 0)).toBe(true);
    expect(snapshot.pendingOperations).toBe(0);
    expect(snapshot.events.map((event) => event.type)).toContain("browser-frame");
    scenario.rewriteFormula();
    expect(scenario.snapshot().rewriteDuration).not.toBeNull();
    expect(scenario.snapshot().events.at(-1)?.type).toBe("formula-rewrite");
  });

  it("aborts follow and ignores an in-flight save acknowledgement after reset", async () => {
    const scenario = await mountScenario();
    const follow = scenario.followChange();
    expect(scenario.snapshot().following).toBe(true);
    scenario.reset();
    await follow;
    expect(scenario.snapshot()).toMatchObject({
      following: false,
      followDuration: null,
      followSteps: null,
      error: null,
      events: [],
    });
    await waitUntil(() => scenario.snapshot().ready);
    await waitUntil(
      () =>
        typeof scenario.grid()?.store.getCell({
          sheet: ENGINE_LIVE_SHEET,
          row: 1,
          col: ENGINE_COLUMN_INDEX.actual,
        }).resolved === "number",
    );
    await scenario.run("edit");
    const save = scenario.run("save");
    scenario.reset();
    await save;
    expect(scenario.snapshot().events).toEqual([]);
    expect(scenario.snapshot().pendingOperations).toBe(0);
    expect(scenario.snapshot().status).toBe("Starting the calculation engine…");
  });
});
