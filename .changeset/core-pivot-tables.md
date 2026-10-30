---
"@sheetwrite/core": minor
---

Add saved pivot definitions and the `getPivots`, `setPivot`, `removePivot`, `getPivotFields`, and `getPivotResult` methods on grids and stores. Validate definitions before changes. Keep pivots in snapshots, undo history, collaboration, and engine memory transfers.

Use the full engine to calculate pivot output. The default engine shows Excel's saved pivot values as read-only calculated output that formulas can read. It reports `saved`, or `unavailable` when no saved values exist. Both engines keep the same saved output in snapshots and collaboration. A `setPivot` call removes saved values. Refuse local writes into pivot output. Row and column edits update sources and anchors; deleting an anchor moves it to the first remaining cell. Undo restores the previous definition and output.
