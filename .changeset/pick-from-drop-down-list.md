---
"@sheetwrite/core": minor
---

Alt+Down on a cell opens Excel's Pick From Drop-down List: the distinct text entries above and below the cell in its column, sorted, in a list under the cell. Arrow keys and typing move in it, Enter or a click puts the entry in the cell, and Escape closes it. The cell's context menu has **Pick from drop-down list…** (the new `pickFromList` action), and `grid.actions.pickFromList()` opens it from code.
