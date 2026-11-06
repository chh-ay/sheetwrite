---
"@sheetwrite/wasm": minor
"@sheetwrite/formulas": minor
"@sheetwrite/core": minor
"@sheetwrite/xlsx": minor
---

Formulas can use the defined names of a linked workbook, as Excel does: `Budget.xlsx!Total`, `'C:\Reports\Budget.xlsx'!Total`, or `[Budget.xlsx]Annual!Total` for a name of one sheet. A name shows the saved values of the cells it refers to, and `#REF!` when the link does not hold it.

- `ExternalLink.names` (type `ExternalLinkName`: `name`, `refersTo` and an optional `sheet`) keeps the names of a link in snapshots. `validateWorkbookSnapshot` checks their shape.
- The store gives each name to the engine as a defined name spelled as formulas write it (`'[Budget.xlsx]'!Total`), whose references name the link's sheets. Both engines resolve every spelling of a link name to it, without case or folder.
- XLSX import reads the `definedNames` of each external link part and turns `[1]!Total` into `Budget.xlsx!Total`; before, such formulas were kept as text. Export writes `[1]!Total` and the names back.
- Change Source and Break Link also cover formulas that use a name of the link.
