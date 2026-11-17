---
"@sheetwrite/core": patch
---

Undo and redo show changes on other sheets, as in Excel. A step that changes cells only on another sheet makes that sheet active and selects the cells, instead of changing them out of sight. Each sheet keeps its selection and scroll position when you switch away and back, a sheet shown for the first time has A1 selected, and clicking a sheet tab gives the keyboard to the sheet, so Ctrl+Z works at once.
