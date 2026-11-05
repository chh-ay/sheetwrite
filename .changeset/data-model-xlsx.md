---
"@sheetwrite/xlsx": minor
---

Keep the data model in XLSX files (#229). Relationships between workbook tables now round-trip through Sheetwrite metadata, with pivots over related tables. Import also reads the active relationships of an Excel data model (`x15:dataModel`) whose model tables load worksheet tables, matched through their workbook connections by table and column name; each other relationship is reported with a warning. Sheetwrite does not write an Excel data model, so Excel opens an exported file without one.
