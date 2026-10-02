---
"@sheetwrite/core": patch
---

Scrolling a large search result no longer walks every match on each repaint. Search
highlights and note indicators are indexed by view row and rebuilt only when the matches,
notes, view order or geometry change, so a repaint touches just the rows the viewport
covers. Header hover resolves the previous visible column from the column index instead of
scanning the column list, and a legacy DOM cell renderer that only moved keeps the
accessibility and interactivity semantics it already installed.
