---
"@sheetwrite/core": minor
---

A WASM trap in the engine now stops the engine with the new error code `engine-failed` (operation `engine`) instead of an untyped `RuntimeError`. The call that trapped throws it. Every grid on that engine emits the new `engine-failed` grid event once, keeps its last frame and becomes read-only; `setReadOnly(false)` does not undo this. Stores on that engine refuse `applyTransaction`, `recalculateVolatile` and `loadPage` with the same code. Call `initSheetwrite()` again and create a new grid from a saved document to continue. The restart uses the compiled module again.

Worker renderer failures are now typed `renderer-fallback` errors with `context.failure`: `spawn`, `crash`, `protocol`, `timeout` or `fatal`. A reply or request that one side cannot read stops the worker and falls back to the canvas renderer, where it was ignored before.

Engine loading and memory release failures are typed too: `getEngine` before `initSheetwrite()` reports `initialization-required`, an engine change or a concurrent source reports `initialization-failed`, and a `releaseEngineMemory()` preparation that runs out of memory reports `resource-limit` (a trap reports `engine-failed`).

Upgrade checklist:

- If you catch errors from grid or store calls, handle `error.code === "engine-failed"`: destroy the grid, `await initSheetwrite()` and create a new grid from your last saved document. Do not read the failed grid or store for the document.
- If you check `renderer-fallback` errors by message, use `error.context.failure` instead.
- If you `switch` over `SheetwriteErrorCode` or `SheetwriteErrorOperation` without a default case, add `engine-failed` and `engine`.
