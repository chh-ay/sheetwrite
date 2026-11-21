---
"@sheetwrite/core": patch
---

The shell's status line no longer draws over the sheet tabs or runs out of its row. As in Excel, it drops whole parts as the row narrows: Sum first, then Average, then Count, then the selection size, the records found and the undo step. The cell mode ("Ready") always stays. Only then does the tab strip narrow and scroll. Screen readers still hear the whole line.
