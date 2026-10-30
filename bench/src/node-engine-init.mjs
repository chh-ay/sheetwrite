import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import { initSheetwrite } from "@sheetwrite/core";

const engine = process.argv[2];
if (engine !== "default" && engine !== "full") throw new Error("Expected default or full engine");
const packageName = engine === "full" ? "formulas" : "wasm";
const root = process.env.SHEETWRITE_BENCH_ENGINE_ROOT;
const engineDirectory =
  root === undefined
    ? new URL(`../../packages/${packageName}/`, import.meta.url)
    : pathToFileURL(`${resolve(root, `packages/${packageName}`)}/`);
const wasmBytes = readFileSync(new URL("pkg/sheetwrite_wasm_bg.wasm", engineDirectory));
const wasmSha256 = createHash("sha256").update(wasmBytes).digest("hex");
const manifest = JSON.parse(readFileSync(new URL("package.json", engineDirectory), "utf8"));
if (root !== undefined && manifest.version === "0.5.4") {
  const currentBytes = readFileSync(
    new URL(`../../packages/${packageName}/pkg/sheetwrite_wasm_bg.wasm`, import.meta.url),
  );
  if (wasmSha256 === createHash("sha256").update(currentBytes).digest("hex")) {
    throw new Error("Baseline Node initialization loaded current 0.6 WASM");
  }
}
// The selected checkout is only known at runtime; core remains the current harness.
const provider = await import(new URL("loader-node.mjs", engineDirectory).href);
const started = performance.now();
await initSheetwrite(undefined, provider);
process.stdout.write(
  `${JSON.stringify({ elapsedMs: performance.now() - started, node: process.version, wasmSha256 })}\n`,
);
