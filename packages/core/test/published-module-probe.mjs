// Runs in a fresh process: the published exports and their adopted module are process-global.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const name = process.argv[2];
const instantiated = [];
const NativeInstance = WebAssembly.Instance;

function RecordingInstance(module, imports) {
  instantiated.push(module);
  return new NativeInstance(module, imports);
}

RecordingInstance.prototype = NativeInstance.prototype;
WebAssembly.Instance = RecordingInstance;

const bytes = await readFile(new URL(`../../${name}/pkg/sheetwrite_wasm_bg.wasm`, import.meta.url));
const first = await WebAssembly.compile(bytes);
const second = await WebAssembly.compile(bytes);
const loader = await import(`../../${name}/loader-node.mjs`);

await loader.createEngine(first);
await loader.createEngine(second);
assert.equal(loader.isLoaded(), true);

instantiated.length = 0;
new loader.CellStore().free();
assert.equal(instantiated.length, 1);
assert.ok(instantiated[0] === first, "published exports must use the first adopted module");

console.log(`${name}: published exports keep the first adopted module`);
