---
"@sheetwrite/core": patch
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

A remote edit recalculates only the formulas that read the cells it writes, as a local edit does. Before, every remote cell edit that a `SyncCoordinator` applied recalculated every formula on its sheet. The engine gains `beginRemoteLoad`, which the store calls for remote operations instead of `beginPageLoad`: their writes still keep cells with an unacknowledged local edit. Snapshot and datasource page loads still recalculate the whole sheet, and a remote batch that writes more cells than its sheet has formulas recalculates each formula once. Values do not change.
