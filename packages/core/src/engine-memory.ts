import { getEngine, prepareEngineInstance, replaceEngineInstance } from "./engine.js";
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
 * Preparation failures leave every live store and the selected instance unchanged.
 * A larger replacement is discarded; the report then has zero migrated stores.
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
    for (const engine of liveStoreEngines()) {
      const wait = engine.waitForPageLoads();
      if (wait) waits.push(wait);
    }

    if (waits.length === 0) break;

    await Promise.all(waits);
  }

  const started = performance.now();
  const previous = getEngine();
  const before = previous.getMemory().buffer.byteLength;
  const prepared: PreparedEngineMemoryRelease[] = [];
  const engines = liveStoreEngines();
  try {
    for (const engine of engines) {
      const migration = engine.prepareMemoryRelease(replacement);
      if (migration) prepared.push(migration);
    }
  } catch (cause) {
    for (const migration of prepared) migration.abort();
    replacement.retire();
    throw new Error(
      "Sheetwrite: engine memory release preparation failed; live stores are unchanged",
      { cause },
    );
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
