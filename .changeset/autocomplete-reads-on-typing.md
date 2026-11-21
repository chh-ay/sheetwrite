---
"@sheetwrite/core": patch
---

AutoComplete reads the column's entries at the first typed character of an edit. Pasting into the cell editor or deleting text before typing lists no entries and reads nothing, so committing such an edit in a long column stays as fast as any other.
