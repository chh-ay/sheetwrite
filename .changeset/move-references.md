---
"@sheetwrite/wasm": minor
"@sheetwrite/formulas": minor
"@sheetwrite/core": patch
---

Moving rows or columns (`moveRows`, `moveColumns`) moves the cells, as Excel's Cut and Insert Cut Cells does, and every reference in the workbook follows the cells it names. Before, a move ran as a delete and an insert: references to the moved cells became `#REF!`, and a moved formula read the cells that took its old place. A range loses a moved row or column at its edge and grows by a block that lands inside it, as in Excel, and undo restores the formulas that lost a row or column. A move that would split a table is refused, as in Excel.

The engines add `CellStore.moveRows`, `CellStore.moveCols` and `CellStore.moveLosses`. `CellStore.moveNamedFormulaSource` is removed: the engine moves defined-name formulas itself.
