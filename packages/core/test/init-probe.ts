// Init-semantics probe, run by init.test.ts in a fresh bun process: loader state is
// module-global, and sibling suites of the shared `bun test` process already
// initialized WASM. Modes: lifecycle (pre-init guard, concurrent init, calls after
// success) and retry (a failing source rejects, then a corrected init succeeds).
import assert from "node:assert/strict";

import {
  initSheetwrite,
  isSheetwriteReady,
  SheetwriteError,
  SheetwriteStore,
} from "../src/index.js";
import type { Workbook } from "../src/types.js";

const workbook: Workbook = {
  activeSheet: "s1",
  sheets: [
    {
      id: "s1",
      name: "Sheet 1",
      rowCount: 1,
      columns: [{ key: "a", header: "A", width: 100, type: "text" }],
    },
  ],
};

async function assertFailure(run: () => unknown, code: string, operation: string): Promise<void> {
  await assert.rejects(
    async () => run(),
    (error) => {
      assert.ok(error instanceof SheetwriteError);
      assert.equal(error.code, code);
      assert.equal(error.operation, operation);
      return true;
    },
  );
}

if (process.argv[2] === "retry") {
  const broken = { source: "https://example.invalid/broken.wasm" };
  await assertFailure(() => initSheetwrite(broken), "initialization-failed", "initialize");
  assert.equal(isSheetwriteReady(), false);
  // The rejected init cleared the in-flight cache: a corrected call succeeds.
  await initSheetwrite();
  assert.equal(isSheetwriteReady(), true);
} else {
  assert.equal(isSheetwriteReady(), false);
  await assertFailure(() => new SheetwriteStore(workbook), "initialization-required", "store");
  // While the first call is in flight, a same-source call shares it and a different source rejects.
  const first = initSheetwrite();
  const sameSource = initSheetwrite();
  const otherSource = assertFailure(
    () => initSheetwrite({ source: "https://example.invalid/x.wasm" }),
    "initialization-failed",
    "initialize",
  );
  await Promise.all([first, sameSource, otherSource]);
  assert.equal(isSheetwriteReady(), true);
  // After success, repeats and a different source (which only warns) fulfill.
  await Promise.all([initSheetwrite(), initSheetwrite()]);
  await initSheetwrite({ source: "https://example.invalid/late.wasm" });
  assert.ok(new SheetwriteStore(workbook) instanceof SheetwriteStore);
}
