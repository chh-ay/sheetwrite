---
"@sheetwrite/core": patch
---

Selecting a range is faster when a toolbar, a ribbon or an `onCommandStateChange` handler follows the command state. To tell whether Bold, the alignments, Wrap and Border are on, off or mixed, the grid read every selected cell's value and style; on a sheet without a sort, filter or hidden-row view that is not paged, it now asks the engine for the distinct styles of each selected rectangle. Selecting 64 by 64 cells with a command-state handler takes about a third of the time it did.
