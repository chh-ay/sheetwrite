---
"@sheetwrite/xlsx": minor
---

Read and write Excel charts. `fromXlsxWorkbook` reads column, bar, line, area, pie, doughnut and scatter charts into `Sheet.charts`, with their series ranges, titles, axis titles, legend and anchor. `toXlsxWorkbook` writes `Sheet.charts` as chart parts that Excel and LibreOffice open. Cell edits keep these charts. Charts that the chart model cannot hold, for example 3-D or stacked charts, stay kept parts and emit an `unsupported-feature` warning.

Chart import reads each part once per drawing and stops reading chart parts when the sheet reaches its chart limit. Repeated frames and frames beyond the limit stay preserved with a warning. Two-cell anchor sizing uses the defined column widths and row heights instead of walking every cell in the span.
