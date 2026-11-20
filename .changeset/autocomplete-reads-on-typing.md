---
"@sheetwrite/core": patch
---

AutoComplete reads the column at the first typed character again. Opening a cell edit and pasting or deleting text no longer reads every entry above and below the cell, which made committing such an edit in a 100,000-row column of distinct text take 19 ms instead of 0.13 ms on an M5 Pro. Its list of matching entries appears from the first typed character.
