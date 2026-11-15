---
"@sheetwrite/core": minor
"@sheetwrite/xlsx": minor
---

XLSX export writes dashboards (#231). Excel has no dashboard sheet, so each dashboard becomes a worksheet of its current values: pivot results, slicer selections and KPI values from the top-left of each item's box, and PivotCharts as native charts with literal data. The dashboard is saved in the Sheetwrite metadata and opens as a dashboard again. Core passes the computed values to the backend in the export context (`DashboardExport`, `DashboardItemExport`).
