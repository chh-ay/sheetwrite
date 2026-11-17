---
"@sheetwrite/core": minor
---

The find bar has Excel's Find Options and Find All.

- **⋯ Options** shows Within (Sheet, Workbook), Search (By Rows, By Columns), Look in (Formulas, Values, Notes), Match case and Match entire cell contents.
- **≡ Find all** lists every match with its sheet, cell, value and formula, with a "12 cells found" count. Click a result, or use the arrow keys, to go to it.
- On Windows and Linux, Alt and the letter of Excel's dialog reach each control (Alt+C Match case, Alt+I Find All, Alt+T Options, and so on).
- `SearchOptions` takes `within: "workbook"`, which searches every visible sheet in tab order, `searchBy: "columns"`, and `lookIn: "notes"`. Find Next moves on to the next sheet with a match. Replace with `lookIn: "notes"` rewrites note text.
- `grid.selectMatch(index)` makes one match of the current search the active match and shows it, as clicking a Find All result does.
- `grid.getCellText(addr)` returns the text a cell shows, through its number format; Find All's Value column uses it.
