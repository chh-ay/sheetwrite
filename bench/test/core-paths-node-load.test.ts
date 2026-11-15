import { expect, test } from "bun:test";

import { checkNodeLoadSample, type NodeLoadSample } from "../src/core-paths-bench.js";

/** A cold load as the M5 Pro reports it: under 3 ms, blocking the loop throughout. */
const fastBlockingLoad: NodeLoadSample = {
  loadMs: 2.8,
  largestGapMs: 2.8,
  loaded: true,
  heartbeatTicks: 1,
  engineStatus: "applied",
  engineValue: 42,
  nodeVersion: "v26.12.1",
};

test("accepts a cold load that finishes between two heartbeat ticks", () => {
  expect(() => checkNodeLoadSample({ ...fastBlockingLoad, heartbeatTicks: 0 })).not.toThrow();
});

test("still rejects an implausible heartbeat gap and a wrong engine result", () => {
  expect(() => checkNodeLoadSample({ ...fastBlockingLoad, largestGapMs: 6_000 })).toThrow(
    "implausible heartbeat gap",
  );
  expect(() => checkNodeLoadSample({ ...fastBlockingLoad, engineValue: 41 })).toThrow(
    "expected engine result",
  );
});
