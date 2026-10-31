/**
 * Fresh-process probe for `abort.test.ts`. It imports a workbook file whose
 * text cells all start with `kept-cell-`, then prints how many such strings are
 * still alive in a heap snapshot. The file comes from the test, so this process
 * holds no source copy of those strings.
 *
 * Usage: `bun abort-retention-probe.ts <aborted|dropped|held> <xlsx path> <abort check>`.
 * `aborted` runs `REPEATS` imports that abort at the given check, `dropped`
 * runs `REPEATS` completed imports and drops them, and `held` keeps one
 * completed import (one snapshot's worth of strings, the positive control).
 *
 * The collector scans the native stack conservatively, so one stale pointer
 * can pin the last import's cells whatever the codec does. Repeating the import
 * tells that apart from a leak: a leak keeps one copy per import.
 */
import { fromXlsxWorkbook, initSheetwrite, type WorkbookSnapshot } from "@sheetwrite/core";

import { registerXlsxBackends } from "../src/index.js";

const CELL_PREFIX = "kept-cell-";
const PROBE_ABORT = "probe abort";
const REPEATS = 4;

/** A real signal that aborts when the codec reads `aborted` for the `abortAt`-th time. */
function signalAbortingAt(abortAt: number): AbortSignal {
  const controller = new AbortController();
  let checks = 0;
  let fired = false;
  Object.defineProperty(controller.signal, "aborted", {
    get() {
      checks += 1;
      if (checks === abortAt) {
        controller.abort(new Error(PROBE_ABORT));
        fired = true;
      }
      return fired;
    },
  });
  return controller.signal;
}

/** Frames that `scrubStack` pushes; enough to cover the codec's deepest call chain. */
const SCRUB_DEPTH = 2_000;

/**
 * Overwrite stack slots that earlier calls left behind. The collector scans the
 * native stack conservatively, so a stale pointer there can keep a dead
 * snapshot alive and make the count depend on what ran before.
 */
function scrubStack(depth: number): number {
  const slots = [0, 0, 0, 0, 0, 0, 0, 0];
  return depth === 0 ? slots.length : scrubStack(depth - 1) + slots.length;
}

/** The parts of a V8-format heap snapshot that this probe reads. */
interface HeapSnapshot {
  readonly snapshot: {
    readonly meta: { readonly node_fields: string[]; readonly node_types: [string[]] };
  };
  readonly nodes: number[];
  readonly strings: string[];
}

/**
 * Count live string objects that hold an imported cell text. The snapshot
 * stores each distinct text once in `strings`, so equal strings from several
 * imports are counted by their nodes, not by the text table.
 */
function countCellStringNodes(heap: HeapSnapshot): number {
  const fields = heap.snapshot.meta.node_fields;
  const typeField = fields.indexOf("type");
  const nameField = fields.indexOf("name");
  const stringType = heap.snapshot.meta.node_types[0].indexOf("string");

  let count = 0;
  for (let node = 0; node < heap.nodes.length; node += fields.length) {
    if (heap.nodes[node + typeField] !== stringType) continue;
    const name = heap.strings[heap.nodes[node + nameField] ?? -1];
    if (name?.startsWith(CELL_PREFIX)) count += 1;
  }
  return count;
}

/** Collect garbage and count live cell strings from a fresh 0 ms timer callback. */
function liveCellStrings(): Promise<number> {
  const { promise, resolve } = Promise.withResolvers<number>();
  setTimeout(() => {
    scrubStack(SCRUB_DEPTH);
    Bun.gc(true);
    const heap: HeapSnapshot = JSON.parse(Bun.generateHeapSnapshot("v8"));
    resolve(countCellStringNodes(heap));
  }, 0);
  return promise;
}

const [scenario, path, abortAtText] = process.argv.slice(2);
if (scenario !== "aborted" && scenario !== "dropped" && scenario !== "held") {
  throw new Error(`unknown probe scenario ${String(scenario)}`);
}
if (!path) throw new Error("missing workbook path");
const abortAt = Number(abortAtText);
if (!Number.isSafeInteger(abortAt) || abortAt < 1) throw new Error("missing abort check");

await initSheetwrite();
registerXlsxBackends();
const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());

/** Results kept by the `held` scenario, so they stay reachable while cells are counted. */
const heldResults: WorkbookSnapshot[] = [];

/**
 * Run the scenario in its own frame that returns nothing, so after it settles
 * no value of this module's frame points at the import result.
 */
async function runScenario(): Promise<void> {
  if (scenario === "held") {
    heldResults.push(await fromXlsxWorkbook(bytes));
    return;
  }

  for (let run = 0; run < REPEATS; run++) {
    if (scenario === "dropped") {
      await fromXlsxWorkbook(bytes);
      continue;
    }
    await fromXlsxWorkbook(bytes, { signal: signalAbortingAt(abortAt) }).catch((error: unknown) => {
      if (!(error instanceof Error) || error.message !== PROBE_ABORT) throw error;
    });
  }
}

await runScenario();
// Count only once: a heap snapshot is a string that quotes every live cell
// string, so a second count would find the first snapshot's copies.
const cellStrings = await liveCellStrings();

process.stdout.write(`${JSON.stringify({ cellStrings, heldResults: heldResults.length })}\n`);
