// XLSX import lifetime probe, run by import-lifetime.test.ts in a fresh bun
// process, because sibling suites in a shared `bun test` process keep the
// values their own JIT compilations profiled alive. It reads a workbook from
// stdin, imports it as the first codec call of the process, drops it, collects
// a few times, and prints how many of the imported sheets, cell lists and
// cells those collections did not free, as JSON. Something that keeps the
// workbook for dozens of collections keeps it for as long as an idle page
// does not collect.
import type { WorkbookSnapshot } from "@sheetwrite/core";

import { collectFromFreshStacks } from "../../core/test/collect-garbage.js";
import { sheetwriteWorkbookBackend } from "../src/workbook.js";

/**
 * Import `bytes` and keep only weak references to what the import returned:
 * the sheet list, and each block's cell list and its first and last cell. The
 * cells are shared with the snapshot the codec built and checked, so they
 * outlive the import if anything still holds that snapshot.
 */
async function import_weakly(bytes: Uint8Array): Promise<WeakRef<object>[]> {
  const snapshot: WorkbookSnapshot = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes);
  const refs: WeakRef<object>[] = [new WeakRef(snapshot.sheets)];
  for (const sheet of snapshot.sheets) {
    for (const block of sheet.cells) {
      refs.push(new WeakRef(block.cells));
      const first = block.cells[0];
      const last = block.cells.at(-1);
      if (first) refs.push(new WeakRef(first));
      if (last && last !== first) refs.push(new WeakRef(last));
    }
  }
  return refs;
}

const bytes = new Uint8Array(await Bun.stdin.arrayBuffer());
const refs = await import_weakly(bytes);
await collectFromFreshStacks();

process.stdout.write(
  `${JSON.stringify({
    tracked: refs.length,
    retained: refs.filter((ref) => ref.deref() !== undefined).length,
  })}\n`,
);
