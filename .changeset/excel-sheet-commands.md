---
"@sheetwrite/core": minor
"@sheetwrite/xlsx": minor
---

The sheet tab menu follows Excel's: Insert, Rename, Move or Copy…, Tab color, Hide and Remove.

- **Insert** adds a sheet before the tab. `AddSheetInput.index` sets the position of a new sheet.
- **Move or Copy…** opens a dialog that moves a sheet before another one, or copies it with "Create a copy". The new `grid.copySheet(id, { index?, name? })` makes the copy: it is named like `Sales (2)`, references to the sheet itself refer to the copy, its tables get new names (`Sales` becomes `Sales2`) and its sheet-scoped names come along.
- **Tab color** colors a tab with one of Excel's standard colors, or No Color. The new `grid.setSheetTabColor(id, color)`, `Sheet.tabColor` and `SheetSnapshot.tabColor` hold it, the `setSheetMeta` operation takes `tabColor`, and XLSX files read and write it.
- Ctrl+PageDown and Ctrl+PageUp switch to the next and previous visible sheet, and so do Excel for the web's Ctrl+Alt+PageDown and Ctrl+Alt+PageUp, because browsers keep Ctrl+PageDown and Ctrl+PageUp for their own tabs. They are the new rebindable keyboard actions `nextSheet` and `previousSheet`. A host binding that already uses these keys now raises `shortcut-conflict`.
