import { expect, test } from "bun:test";

import { checkNodeLoadSample, type NodeLoadSample } from "../src/core-paths-bench.js";

/** A cold load as the M5 Pro reports it: under 3 ms, blocking the loop throughout. */
const fast_blocking_load: NodeLoadSample = {
  loadMs: 2.8,
  largestGapMs: 2.8,
  loaded: true,
  heartbeatTicks: 1,
  engineStatus: "applied",
  engineValue: 42,
  nodeVersion: "v26.12.1",
};

test("accepts a cold load between two heartbeat ticks, not an implausible gap or wrong result", () => {
  expect(() => checkNodeLoadSample({ ...fast_blocking_load, heartbeatTicks: 0 })).not.toThrow();
  expect(() => checkNodeLoadSample({ ...fast_blocking_load, largestGapMs: 6_000 })).toThrow(
    "implausible heartbeat gap",
  );
  expect(() => checkNodeLoadSample({ ...fast_blocking_load, engineValue: 41 })).toThrow(
    "expected engine result",
  );
});
