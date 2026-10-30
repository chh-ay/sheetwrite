---
"@sheetwrite/xlsx": minor
---

Read and write Excel charts. `fromXlsxWorkbook` reads column, bar, line, area, pie, doughnut and scatter charts into `Sheet.charts`, with their series ranges, titles, axis titles, legend and anchor. `toXlsxWorkbook` writes `Sheet.charts` as chart parts that Excel and LibreOffice open. Cell edits keep these charts. Charts that the chart model cannot hold, for example 3-D or stacked charts, stay kept parts and emit an `unsupported-feature` warning.
