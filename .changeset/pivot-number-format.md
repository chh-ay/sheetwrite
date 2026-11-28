---
"@sheetwrite/core": minor
"@sheetwrite/xlsx": minor
---

Pivot value fields get a number format (`PivotValueField.numberFormat`), as Excel's Value Field Settings › Number Format. The grid paints it on the field's value cells, subtotals and grand totals included, and dashboards show it. The field list has **Number Format…** in each value field's actions menu. A new value field stays General, as in Excel. XLSX export writes it as the `dataField` `numFmtId`, and import reads it.
