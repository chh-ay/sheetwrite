---
"@sheetwrite/core": patch
---

Fill, Replace all, formatting across merged cells, merging cells, and deleting a sheet now read old cell values in bulk and write with one range operation, instead of one engine call and one operation per cell. Undo capture for multi-cell edits reads in bulk too. In local alternating comparisons, fill took 66–71% less time from 1,000 to 100,000 cells, Replace all 35–50% less, formatting a 4,096-cell selection across merges 52% less, merging cells 41% less, and deleting a 100,000-cell sheet 85% less. Events, undo results, and sync operations stay the same. Sheets with validation rules or protected ranges keep one operation per cell, so policy issues still name each cell.

Fill and Replace all now send one range operation instead of one operation per cell, so the `maxOperations` transaction limit (10,000 by default) no longer rejects them when they cover more than 10,000 cells, as paste already worked. The `maxEncodedBytes` limit still applies.
