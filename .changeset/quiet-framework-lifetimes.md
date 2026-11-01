---
"@sheetwrite/core": patch
"@sheetwrite/react": patch
"@sheetwrite/vue": patch
"@sheetwrite/svelte": patch
---

Unmounting a React, Vue or Svelte grid destroys it and aborts its pending summaries, lazy chrome, clipboard work and built-in saves without an error event. Late initialization and publication failures from an unmounted or replaced grid are not reported. Shared WASM initialization continues for other mounted grids.

**Upgrade checklist:** treat an `AbortError` from `grid.summarizeSelection()` after unmount as cancellation. Destroy host-created sync and collaboration coordinators yourself when the view is removed.
