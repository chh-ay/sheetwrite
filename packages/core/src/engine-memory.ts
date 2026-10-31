import {
  engineGeneration,
  getEngine,
  hasCause,
  isEngineLoaded,
  isEngineTrap,
  prepareEngineInstance,
  replaceEngineInstance,
  stopEngine,
} from "./engine.js";
import { SheetwriteError } from "./errors.js";
import type { PreparedEngineMemoryRelease } from "./store/data-engine.js";
import { liveStoreEngines } from "./store/engine-registry.js";

/** Result of an explicit, all-store engine memory release. */
export interface EngineMemoryReleaseReport {
  /** Stores migrated together; disposed stores are excluded. */
  readonly stores: number;

  /** Committed linear memory of the retired engine. */
  readonly wasmBytesBefore: number;

  /** Committed linear memory of its replacement, including migration scratch. */
  readonly wasmBytesAfter: number;

  /** Main-thread migration pause, excluding the wait for active work. */
  readonly pauseMs: number;
}

let pendingRelease: Promise<EngineMemoryReleaseReport> | undefined;

/**
 * Move all live stores into a fresh WASM instance. Call explicitly while idle;
 * the main-thread pause scales with resident data and compact undo history.
 * Preparation failures leave every live store and the selected instance unchanged;
 * running out of memory for the copy rejects with `resource-limit`. A WASM trap
 * during preparation rejects with `engine-failed`: the live instance can be
 * half-written, so it stops.
 * A larger replacement is discarded; the report then has zero migrated stores.
 *
 * @example
 * ```ts
 * import { initSheetwrite, releaseEngineMemory } from "@sheetwrite/core";
 *
 * await initSheetwrite();
 * // Run between user actions, not in an input or render callback.
 * const report = await releaseEngineMemory();
 * document.body.dataset.engineBytes = String(report.wasmBytesAfter);
 * ```
 * @see EngineMemoryReleaseReport
 */
export function releaseEngineMemory(): Promise<EngineMemoryReleaseReport> {
  if (pendingRelease) return pendingRelease;

  pendingRelease = release().finally(() => {
    pendingRelease = undefined;
  });

  return pendingRelease;
}

async function release(): Promise<EngineMemoryReleaseReport> {
  // Instantiation yields: a caller inside a synchronous transaction cannot cut
  // the engine over before that transaction and its listeners have returned.
  const replacement = await prepareEngineInstance();

  for (;;) {
    const waits: Promise<void>[] = [];

    for (const engine of liveStoreEngines(engineGeneration())) {
      const wait = engine.waitForPageLoads();
      if (wait) waits.push(wait);
    }

    if (waits.length === 0) break;

    await Promise.all(waits);
  }

  const started = performance.now();
  const owner = engineGeneration();
  if (!isEngineLoaded()) {
    // The engine stopped while page loads finished; `getEngine` reports why.
    replacement.retire();
  }

  const previous = getEngine();
  const before = previous.getMemory().buffer.byteLength;
  const prepared: PreparedEngineMemoryRelease[] = [];
  const engines = liveStoreEngines(owner);

  try {
    for (const engine of engines) {
      const migration = engine.prepareMemoryRelease(replacement);
      if (migration) prepared.push(migration);
    }
  } catch (cause) {
    for (const migration of prepared) migration.abort();

    replacement.retire();

    // Preparation reads every live store, so a trap can come from the live
    // instance as well as from the replacement; only a stop is safe.
    if (isEngineTrap(cause)) throw stopEngine(cause, owner);

    const message =
      "Sheetwrite: engine memory release preparation failed; live stores are unchanged";

    // The copy allocates as much as every live store holds; that is the expected
    // failure. History migration wraps it, so look through the causes.
    if (hasCause(cause, (wrapped) => wrapped instanceof RangeError)) {
      throw new SheetwriteError("resource-limit", "engine", message, { cause });
    }

    // Anything else is a broken engine export or import, a programmer bug.
    throw new Error(message, { cause });
  }

  const after = replacement.getMemory().buffer.byteLength;

  if (after > before) {
    for (const migration of prepared) migration.abort();
    replacement.retire();

    return {
      stores: 0,
      wasmBytesBefore: before,
      wasmBytesAfter: before,
      pauseMs: performance.now() - started,
    };
  }

  // No await, callbacks, or fallible reconstruction inside the cutover.
  for (const migration of prepared) migration.commit();
  replaceEngineInstance(replacement);
  previous.retire();

  // Renderers rebuild frames after the whole cutover, without document events.
  queueMicrotask(() => {
    for (const engine of engines) engine.notifyMemoryRelease();
  });

  return {
    stores: prepared.length,
    wasmBytesBefore: before,
    wasmBytesAfter: after,
    pauseMs: performance.now() - started,
  };
}
