---
"@sheetwrite/core": minor
---

Add File › Import XLSX when a workbook backend is registered. The command opens a native file picker and replaces the workbook without recreating the grid or its chrome.

Add `grid.importWorkbook(snapshotOrLoader, { signal? })`. A new import aborts the previous loader. Parsing and validation finish before replacement, so failure keeps the old document and undo history. Successful import frees old document resources and clears undo and redo, like Excel Open. Import is blocked for attached collaboration sessions, injected stores and datasource-backed grids.
