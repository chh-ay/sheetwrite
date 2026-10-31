---
"@sheetwrite/core": minor
"@sheetwrite/xlsx": minor
---

**Behaviour change:** XLSX and CSV/TSV aborts reject with `signal.reason`, not with a `SheetwriteError` that has `code: "aborted"`.

- `fromXlsxWorkbook`, `fromXlsxWorkbookFile`, `fromXlsxTable`, `toXlsxWorkbook`, `toXlsxTable`, their streams, `buildXlsxModel`, and the CSV/TSV parse and export functions reject, throw or error with `signal.reason` after the signal fires. An abort is not a failure, so it is never a `SheetwriteError`.
- `parseCsv`, `parseTsv` and `fromCsv` now check `signal` too: before the scan and once per 1,024 records.
- The XLSX codec checks the signal once per ZIP entry, worksheet and chunk of cells, also while it builds the snapshot. An aborted import keeps no partial snapshot.

**Upgrade checklist:** if your code tells an aborted XLSX or CSV/TSV call apart with `error.code === "aborted"`, check `signal.aborted` (or `error === signal.reason`) instead. Persistence and IndexedDB storage still use `code: "aborted"`.
