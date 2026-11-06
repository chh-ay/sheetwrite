---
"@sheetwrite/core": minor
---

Charts over a pivot can plot only some of its values, measures included (#230).

- New `ChartDefinition.pivotValues`: the positions in the pivot's `values` that a chart over a pivot plots. Absent plots every value field.
- The Chart panel shows a **Values** section for a chart over a pivot, listing the pivot's value fields with measures next to fields. Each change is one undo step, and at least one value stays plotted.
