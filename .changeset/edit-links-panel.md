---
"@sheetwrite/core": minor
---

The grid has Excel's **Data › Queries & Connections › Edit Links** panel for workbooks with external links (#226). It lists each linked workbook with its location and status, and runs **Update Values**, **Change Source** and **Break Link** as one undoable change each. The command shows only while the workbook has links, and the panel loads as its own chunk on first use. `connectExternalLinks(grid, resolve)` from `@sheetwrite/core/external-links` gives the panel a resolver for **Update Values**; without one, the panel offers **Change Source** and **Break Link** only. The ribbon and the toolbar now also update which commands show after document changes, not only after command-state changes.
