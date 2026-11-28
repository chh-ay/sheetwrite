---
"@sheetwrite/vue": patch
"@sheetwrite/svelte": patch
---

`<Sheetwrite>` reports an invalid `height`/`fill` combination as `SheetwriteError` with code `invalid-argument` and operation `create-grid`.

**Upgrade checklist:** code that caught this as a plain `Error` by message should check `error.code === "invalid-argument"`.
