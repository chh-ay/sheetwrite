---
"@sheetwrite/core": minor
---

Add `Grid.summarizeSelection()`: Count, Sum, Average, Min and Max over the selected cells the user can see (rows a filter hides are left out), read in bounded chunks between frames and cancellable with an `AbortSignal`. The shell's status line now shows Excel's Average, Count and Sum next to the selection size.
