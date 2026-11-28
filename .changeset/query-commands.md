---
"@sheetwrite/core": minor
"@sheetwrite/queries": minor
"@sheetwrite/xlsx": minor
---

Add the Data › Get Data, Refresh All and Queries & Connections commands to the
ribbon, the compact ribbon and the toolbar. `createQuerySession` shows them
through `registerQueryCommands`, and `dispose` removes them. Refresh All
cancels a running refresh when pressed again. The Queries & Connections panel
loads as its own chunk; it edits the source, output table and supported steps
as short text lines and saves through the engine check. XLSX import with a
Power Query codec records unsupported members on the kept DataMashup graph
(`XlsxSourceGraph.unsupportedQueries`), and the panel lists them read-only.
