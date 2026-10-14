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
  const started = performance.now();
  const before = getEngine().getMemory().buffer.byteLength;
  const prepared: PreparedEngineMemoryRelease[] = [];
  try {
    for (const engine of liveStoreEngines()) {
      const migration = engine.prepareMemoryRelease(replacement);
      if (migration) prepared.push(migration);
    }
  } catch (cause) {
    for (const migration of prepared) migration.abort();
    throw new Error(
      "Sheetwrite: engine memory release preparation failed; live stores are unchanged",
      { cause },
    );
  }
  // No await, callbacks, or fallible reconstruction beyond this point.
  for (const migration of prepared) migration.commit();
  replaceEngineInstance(replacement);
  return {
    stores: prepared.length,
    wasmBytesBefore: before,
    wasmBytesAfter: replacement.getMemory().buffer.byteLength,
    pauseMs: performance.now() - started,
  };
}
