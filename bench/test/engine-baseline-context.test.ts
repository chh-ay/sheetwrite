import { afterEach, expect, it } from "bun:test";
import { resolve } from "node:path";

import { captureEngineBaselineContext } from "../src/gate-protocol.js";

const ROOT_VARIABLE = "SHEETWRITE_BENCH_ENGINE_ROOT";
const REPOSITORY_ROOT = resolve(import.meta.dir, "../..");
const original = process.env[ROOT_VARIABLE];

afterEach(() => {
  if (original === undefined) delete process.env[ROOT_VARIABLE];
  else process.env[ROOT_VARIABLE] = original;
});

// The paired formula gate selects this checkout for its candidate side.
it("does not treat the harness's own checkout as a baseline engine", () => {
  process.env[ROOT_VARIABLE] = REPOSITORY_ROOT;
  expect(captureEngineBaselineContext("0".repeat(40), ["wasm"])).toBeUndefined();

  process.env[ROOT_VARIABLE] = `${REPOSITORY_ROOT}/`;
  expect(captureEngineBaselineContext("0".repeat(40), ["wasm"])).toBeUndefined();
});
