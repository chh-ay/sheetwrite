---
"@sheetwrite/core": minor
"@sheetwrite/queries": minor
"@sheetwrite/xlsx": minor
---

Write saved queries to XLSX as Power Query M and read them back. Pass
`powerQuery: await loadPowerQueryCodec()` to `toXlsxWorkbook` and
`fromXlsxWorkbook`. Export writes a DataMashup part, plus a workbook connection
and a query table for each output table. Import parses supported M members into
saved queries and never evaluates M. Other members stay in the kept part and are
reported with a new `query-loss` warning. Without a codec, a kept DataMashup is
written back only while the saved queries are unchanged since import.
