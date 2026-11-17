// Engine memory release lifetime probe, run by engine-memory.test.ts in a fresh bun
// process. A WeakRef is cleared only when no root reaches its referent, and in the
// shared `bun test` process the runtime adds roots the product does not own: JIT
// compilations of sibling suites keep the values they profiled alive until they finish.
// The probe prints the migrated store count and whether the retired memory was freed
// while a disposed store and its range history stay reachable.
import assert from "node:assert/strict";

import { getEngine } from "../src/engine.js";
import { initSheetwrite, releaseEngineMemory, SheetwriteStore } from "../src/index.js";
import { collectUntilFreed } from "./collect-garbage.js";
import { makeWorkbook } from "./fixtures.js";

await initSheetwrite();

const store = new SheetwriteStore(makeWorkbook(2));
const disposed = new SheetwriteStore(makeWorkbook(2));
const range = { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } };
const snapshot = disposed.captureRangeHistory(range);
if (!snapshot) throw new Error("Expected a compact history resource");

disposed.dispose();

const retired = new WeakRef(getEngine().getMemory());
const report = await releaseEngineMemory();
await collectUntilFreed([retired]);
const freed = retired.deref() === undefined;

// The disposed facade and its history are still reachable here, after the check.
assert.throws(() => snapshot.toDocumentOp(range), /already disposed/);
snapshot.dispose();
store.dispose();

process.stdout.write(`${JSON.stringify({ stores: report.stores, freed })}\n`);
