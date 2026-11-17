---
"@sheetwrite/core": minor
"@sheetwrite/xlsx": minor
"@sheetwrite/wasm": minor
"@sheetwrite/formulas": minor
---

Data › Data Validation opens Excel's Data Validation dialog for the selection, with Settings, Input Message and Error Alert tabs, Clear All, and "Apply these changes to all other cells with the same settings". OK applies the rule to the selected cells as one undoable step; a larger rule keeps its other cells. When the selection holds several kinds of rule, or cells with and without one, Excel's question comes first. The command is also `grid.actions.dataValidation()`.

`DataValidationCondition` gains Excel's other Allow choices: `{ kind: "any" }`, `{ kind: "time" }`, `{ kind: "custom", formula }`, and a list whose items come from a range or a defined name, `{ kind: "list", source: "=$H$2:$H$5" }` or `"=Regions"`; the list shows the cells' current values. Comparison bounds may be formulas, such as `"=TODAY()"`. `DataValidationRule.inCellDropdown: false` hides a list's arrow and list, as Excel's "In-cell dropdown" does. Formulas are relative to the rule's top-left cell and follow inserted and deleted rows and columns. A list compares text without case, and a text length rule measures numbers too, as in Excel.

XLSX import and export keep every Data Validation type, formula sources and bounds, and the dropdown flag. Before, formula-based rules and the time, custom and any-value types were dropped.

The engine's `previewFormulaWith` evaluates a formula as if a cell held a given value, without changing the store; a custom rule checks a typed value with it before the value is stored.
