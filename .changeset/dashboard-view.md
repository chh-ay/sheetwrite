---
"@sheetwrite/core": minor
---

Show dashboards (#231). While a dashboard sheet is active, the grid shows its pivot and slicer items over the cells, from a chunk that loads the first time a dashboard is shown. Items move and resize with the mouse and with the keyboard; each step is one undo step. Slicer items list their column's values and save the values the user keeps. Insert › New Dashboard (`grid.actions.newDashboard()`, command state `newDashboard`) adds a dashboard, and on a dashboard Insert › PivotTable asks for a table and adds the pivot to the first free place. Pivots on a dashboard compute without placing output in cells; `getPivotResult` reports their status and size, and the dashboard view shows their cells.
