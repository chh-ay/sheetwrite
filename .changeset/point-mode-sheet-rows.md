---
"@sheetwrite/core": patch
---

Under a filter or sort view, pointing at cells while typing a formula writes sheet references, as Excel does: the cell shown as row 7 is `C7`, not its position in the view. The cell editor's accessible name gives the row number the row header shows.
