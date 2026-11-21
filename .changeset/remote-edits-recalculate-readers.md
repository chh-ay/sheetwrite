---
"@sheetwrite/core": patch
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

A remote edit recalculates only the formulas that read the cells it writes. Before, every remote cell edit that a `SyncCoordinator` applied recalculated every formula on its sheet. The engine gains `beginRemoteLoad`, which the store calls for remote operations instead of `beginPageLoad`: their writes still keep cells with an unacknowledged local edit. Snapshot and datasource page loads still recalculate the whole sheet, and so does a remote edit that writes more than about one cell per 64 formulas of its sheet, where that is cheaper. Values do not change.
