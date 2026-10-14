---
"@sheetwrite/core": minor
---

A Grid with `presentation: "data-grid"` shows only its own columns. Before, it added empty, unnamed columns until the grid filled its host width, as a spreadsheet does, and typing into them created cells with no column. A spreadsheet still fills the width. To keep empty columns in a data grid, set `minColumns`.
