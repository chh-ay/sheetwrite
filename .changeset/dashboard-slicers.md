---
"@sheetwrite/core": minor
---

Slicers filter dashboards (#231). The slicers of a dashboard filter every pivot on it whose table reaches the slicer's table through many-to-one relationships, as report filters added when the pivot computes; the saved definitions do not change. In an editable grid a slicer selection is a saved, synced, undoable change; in a read-only grid it filters only that viewer's view. Insert › Filters › Slicer opens the Insert Slicers list on a dashboard.
