// Garbage collection for lifetime tests. A WeakRef is cleared only after a
// collection that runs on a stack without the referent, so each collection
// runs from a timer callback, after the job that last read the WeakRef.

const GC_TURNS = 5;
const SETTLE_DEADLINE_MS = 2_000;
const SETTLE_DELAY_MS = 10;

/** Collect from a timer callback, so no caller frame still holds a referent. */
function collectInFreshStack(delayMs = 0): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(() => {
    Bun.gc(true);
    resolve();
  }, delayMs);
  return promise;
}

/**
 * JavaScriptCore marks the objects that a compilation in its concurrent JIT
 * worklist profiled, and the code blocks of that compilation, as GC roots until
 * the compilation finishes. On a loaded machine a compilation can stay in
 * flight across several collections, so collect again until every referent is
 * free or the deadline passes. A real owner keeps its referent alive past the
 * deadline.
 */
export async function collectUntilFreed(refs: readonly WeakRef<object>[]): Promise<void> {
  for (let turn = 0; turn < GC_TURNS; turn++) await collectInFreshStack();

  const deadline = performance.now() + SETTLE_DEADLINE_MS;
  while (refs.some((ref) => ref.deref() !== undefined) && performance.now() < deadline) {
    await collectInFreshStack(SETTLE_DELAY_MS);
  }
}
