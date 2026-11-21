---
"@sheetwrite/core": patch
---

A commit does less work when a sync queue holds it and while the grid paints. A sync coordinator without listeners no longer copies each queued commit and its state for events nobody receives, and makes its mutation IDs from a table of hex digits. The undo history keeps a running total of its snapshot bytes instead of adding up all entries on every edit. The screen-reader mirror compares the window with what it wrote last instead of reading every attribute back from the page. Events, IDs, undo limits and the mirror's content do not change.
