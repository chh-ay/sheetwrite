---
"@sheetwrite/core": minor
"@sheetwrite/wasm": minor
---

Compare two history versions (#228). `HistoryArchive.diffVersions({ from, to, cursor, maxEntries, signal, kernel })` from `@sheetwrite/core/history` returns one page of at most 1,000 changes: changed cells as typed columns (`HistoryDiffCells`: sheet, row, column, earlier position, `HistoryDiffFlag` bits and last writer), the before and after of each cell (`HistoryDiffDetail`), sheets added, removed or changed outside their cells (`HistoryDiffSheet`), changed workbook fields and a `cursor` for the next page. Sources and styles are compared by content, not calculated values. Rows and columns are aligned through the structural operations of the log, and each change names the last person whose write reached the cell. The comparison runs in a separate history-only WASM kernel, `@sheetwrite/wasm/history` (16.6 KB gzip, no formula engine), that loads on the first diff; the default and full engines do not change. `HistoryVersion.checkpoints` and `HistoryHead.checkpoints` list the checkpoints made since the previous marker, so the log between two retained versions stays readable.
