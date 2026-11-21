---
"@sheetwrite/core": patch
---

The shell's status line no longer draws over the sheet tabs or runs out of its row. When the row is too narrow, the tab strip narrows and scrolls first, down to half the row (or its own width, if less). Only then does the status drop whole parts: the selection size first, then the records found and the undo step, then Count, then Average. Sum stays longest, and the cell mode ("Ready") always stays. Screen readers still hear the whole line.
