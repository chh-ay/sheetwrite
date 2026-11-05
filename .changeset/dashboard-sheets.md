---
"@sheetwrite/core": minor
---

Add dashboard sheets (#231). A sheet with `kind: "dashboard"` has no cells, rows or columns, and holds pivot and slicer items on a grid of 12 columns. The new `setDashboardItem` and `removeDashboardItem` operations are admitted (items stay inside the grid and do not overlap), undone, rebased, saved, synchronized and restored by version history. `SheetwriteStore` gets `getDashboard`, `setDashboardItem` and `removeDashboardItem`, and `grid.addSheet({ name, kind: "dashboard" })` adds a dashboard. New types: `SheetKind`, `Dashboard`, `DashboardBox`, `DashboardItem`, `DashboardPivotItem` and `DashboardSlicerItem`.
