---
"@sheetwrite/wasm": minor
"@sheetwrite/formulas": minor
"@sheetwrite/core": minor
---

`SUBTOTAL` and `AGGREGATE` skip hidden rows, as in Excel:

- `SUBTOTAL` accepts codes 101 to 111. All codes skip the rows that a filter hides. Codes 101 to 111 also skip the rows that you hide (`hideRows`) and the rows of a collapsed row group. Before, codes 101 to 111 returned `#VALUE!`.
- `SUBTOTAL` reads a cell argument, such as `A2` in `=SUBTOTAL(9,A2)`, as a reference: text in the cell is ignored, as in Excel, and the cell's row can be hidden.
- `SUBTOTAL` skips cells whose formula calls `SUBTOTAL` or `AGGREGATE`, as `AGGREGATE` already did, so a subtotal is not counted two times.
- `AGGREGATE` options 1, 3, 5 and 7 skip hidden rows. Before, they had no effect.
- When you hide or show rows, collapse or expand a row group, or change a filter, only the `SUBTOTAL` and `AGGREGATE` formulas that read the sheet calculate again. Core sends the hidden rows of a sheet in one engine call per transaction.
- New engine export `CellStore.setHiddenRows(sheet, manual, filtered)` sets the hidden rows of a sheet as packed `[first, last]` row ranges. A sheet without hidden rows uses no extra memory.
