import { afterEach, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { BASELINE_VERSION_VARIABLE, captureEngineBaselineContext } from "../src/gate-protocol.js";

const ROOT_VARIABLE = "SHEETWRITE_BENCH_ENGINE_ROOT";
const REPOSITORY_ROOT = resolve(import.meta.dir, "../..");
const original = {
  root: process.env[ROOT_VARIABLE],
  version: process.env[BASELINE_VERSION_VARIABLE],
};

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore(ROOT_VARIABLE, original.root);
  restore(BASELINE_VERSION_VARIABLE, original.version);
});

// The paired formula gate selects this checkout for its candidate side.
it("does not treat the harness's own checkout as a baseline engine", () => {
  const manifest: unknown = JSON.parse(
    readFileSync(resolve(REPOSITORY_ROOT, "packages/wasm/package.json"), "utf8"),
  );
  if (typeof manifest !== "object" || manifest === null || !("version" in manifest)) {
    throw new Error("packages/wasm/package.json has no version");
  }
  // The checkout's own version would enter the baseline path for any other root.
  process.env[BASELINE_VERSION_VARIABLE] = String(manifest.version);

  process.env[ROOT_VARIABLE] = REPOSITORY_ROOT;
  expect(captureEngineBaselineContext("0".repeat(40), ["wasm"])).toBeUndefined();

  process.env[ROOT_VARIABLE] = `${REPOSITORY_ROOT}/`;
  expect(captureEngineBaselineContext("0".repeat(40), ["wasm"])).toBeUndefined();
});
