---
"@sheetwrite/core": minor
"@sheetwrite/formulas": minor
---

Add measures to the workbook data model: formulas over model columns, calculated in the filter context of each pivot cell (#230).

- New type `Measure` (`id`, `name`, home `table`, `formula`) saved in `workbook.dataModel.measures`, and `MeasureStatus`.
- New document operations `setMeasure` and `removeMeasure`, and the store methods `getMeasures()`, `setMeasure()`, `removeMeasure()` and `getMeasureStatus()`. Each change is one undo step and is saved, synchronized and restored from version history. Measure names are unique ignoring case and differ from the column names of their home table. `getMeasureStatus()` checks the home table and the formula syntax on every engine.
- `PivotValueField` has a second form, `{ measure, name? }`, for pivots with a model source. Each value cell, subtotal and grand total evaluates the measure over the base rows that the cell's row items, column items and report filters select, so totals are not sums of the cells above them.
- A measure reads qualified columns of the pivot's base table, such as `=SUM(Sales[Amount])/SUM(Sales[Qty])`, with any worksheet function. A formula that does not parse shows `#NAME?` in its cells, a missing table or column `#REF!`, and a cell reference or another table's column `#VALUE!`. A removed measure shows `#REF!` at the pivot anchor until undo restores it.
- The full engine receives measures in the `setRelationships` payload, as records `[id, homeTable, formula, "", name]`, and keeps no measure state between recomputes: each update groups the base rows by output cell with one counting pass per pair of axis depths and binds each cell's rows to the formula. The default engine keeps and synchronizes measures without computing them.
- `RowBridgeMetadataDelta.metadata` has the new value `"measure"`.
- Measures and pivots that use them are kept in Sheetwrite metadata on XLSX export, as model pivots are, because Excel keeps measures in its data model part.
