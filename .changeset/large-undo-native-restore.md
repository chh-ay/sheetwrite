---
"@sheetwrite/core": patch
"@sheetwrite/wasm": patch
---

Large undo restores the saved range directly from its packed engine snapshot instead of decoding and re-applying a JSON block, and the restore payload sent to listeners and sync is measured once instead of being walked at every layer. In local runs, undo of a 1,000,000-cell clear was 2–6× faster and the memory it added during undo fell from about 310 MiB to about 190 MiB. Undo history now also drops its oldest entries once retained range snapshots pass 256 MiB (about twenty million-cell clears); the newest entry always stays undoable. `restoreRange` now applies the same source, reference and dirty-capacity rules as a packed block write, so a local undo and its replay on another peer give the same state.

The 256 MiB policy uses engine-reported snapshot payload bytes, not total retained process memory. It excludes cloned formula ASTs and JavaScript patch/redo payloads, which remain bounded only by the 200-entry limit.

Formula-free packed writes and restores select their source-free cell loop once per range, avoiding repeated formula-map checks and kind normalization during large imports.
