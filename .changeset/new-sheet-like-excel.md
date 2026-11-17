---
"@sheetwrite/core": minor
---

New sheets follow Excel.

- The tab bar's add button (+) adds the sheet after the active one, and its name is `Sheet` and the next free number, with no space: `Sheet4` beside three sheets. The sheet menu's Insert and Insert › PivotTable on a new sheet use the same name.
- A sheet from the add button, Insert or Shift+F11 is an empty sheet with columns A to Z and 1,000 rows, as a new pivot sheet already was, instead of one column and 100 rows.
- A sheet added or loaded after the grid was created fills the grid's width with empty columns, as the first sheets do. Before, `addSheet` without `columns` showed one column and nothing beside it.
- Shift+F11 inserts an empty sheet before the active one and makes it active, as in Excel. It is the new rebindable keyboard action `insertSheet`. A host binding that already uses Shift+F11 now raises `shortcut-conflict`.
