---
"@sheetwrite/core": patch
---

The grid's dialogs (Paste Special, Data Validation, Format Cells, Insert, Delete, the merge warning and the keyboard shortcuts) open centred in the window on a page whose CSS reset sets `* { margin: 0 }`. Before, such a reset removed the browser's `margin: auto`, and the dialogs opened at the window's top-left corner.
