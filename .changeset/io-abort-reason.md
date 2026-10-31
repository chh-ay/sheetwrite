---
"@sheetwrite/core": minor
"@sheetwrite/xlsx": minor
---

XLSX and CSV/TSV aborts reject with `signal.reason`:

- `fromXlsxWorkbook`, `fromXlsxWorkbookFile`, `fromXlsxTable`, `toXlsxWorkbook`, `toXlsxTable`, their streams, `buildXlsxModel`, and the CSV/TSV parse and export functions reject, throw or error with `signal.reason` after the signal fires. They no longer wrap it in a `SheetwriteError` with `code: "aborted"`. Upgrade: compare the rejection with `signal.reason` (or check `error.name === "AbortError"`) instead of `error.code === "aborted"`.
- `parseCsv`, `parseTsv` and `fromCsv` now check `signal` too: before the scan and once per 1,024 records.
- The XLSX codec checks the signal once per ZIP entry, worksheet and chunk of cells, also while it builds the snapshot. An aborted import keeps no partial snapshot.
