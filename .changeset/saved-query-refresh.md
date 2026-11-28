---
"@sheetwrite/core": minor
"@sheetwrite/queries": minor
---

Save refreshable queries in the workbook. `workbook.queries` holds each query's
source, steps and output table. The undoable, synced `setQuery` and `removeQuery`
operations change them. `createQuerySession(grid, { fetchSource })` checks
definitions in the query engine. It refreshes one query, or all queries, as one
undoable transaction that writes the output tables. Sources load only through the
host callback. CSV records with fewer fields than the declared columns have null
in the missing columns, and extra fields are ignored, as in Power Query's
`Csv.Document`.
