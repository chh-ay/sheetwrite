import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import { initSheetwrite } from "@sheetwrite/core";

const engine = process.argv[2];
if (engine !== "default" && engine !== "full") throw new Error("Expected default or full engine");
const package_name = engine === "full" ? "formulas" : "wasm";
const root = process.env.SHEETWRITE_BENCH_ENGINE_ROOT;
const engine_directory =
  root === undefined
    ? new URL(`../../packages/${package_name}/`, import.meta.url)
    : pathToFileURL(`${resolve(root, `packages/${package_name}`)}/`);
const wasm_bytes = readFileSync(new URL("pkg/sheetwrite_wasm_bg.wasm", engine_directory));
const wasm_sha256 = createHash("sha256").update(wasm_bytes).digest("hex");
const manifest = JSON.parse(readFileSync(new URL("package.json", engine_directory), "utf8"));
// SHEETWRITE_BENCH_BASELINE_VERSION names the older release the root holds (see gate-protocol.ts).
const baseline_version = process.env.SHEETWRITE_BENCH_BASELINE_VERSION;
if (root !== undefined && baseline_version !== undefined) {
  if (manifest.version !== baseline_version) {
    throw new Error(
      `Baseline Node initialization loaded ${manifest.version}, not ${baseline_version}`,
    );
  }
  const current_bytes = readFileSync(
    new URL(`../../packages/${package_name}/pkg/sheetwrite_wasm_bg.wasm`, import.meta.url),
  );
  if (wasm_sha256 === createHash("sha256").update(current_bytes).digest("hex")) {
    throw new Error("Baseline Node initialization loaded the current WASM");
  }
}
// The selected checkout is only known at runtime; core remains the current harness.
const provider = await import(new URL("loader-node.mjs", engine_directory).href);
const started = performance.now();
await initSheetwrite({ engine: provider });
process.stdout.write(
  `${JSON.stringify({ elapsedMs: performance.now() - started, node: process.version, wasmSha256: wasm_sha256 })}\n`,
);
