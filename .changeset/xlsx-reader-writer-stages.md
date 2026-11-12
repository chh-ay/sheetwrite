---
"@sheetwrite/xlsx": patch
---

The XLSX reader and writer are split into internal modules by job, with no change to the public interface or to conversion results (part of #251, #252, #253 and #254). Workbook loading, worksheet row streaming, worksheet metadata, tables, hyperlinks, validation and conditional formats, sidecar restore and sheet assembly each have their own module; `readWorkbook` and `writeSheet` now only run the stages in order. Index lookups that used non-null assertions now bind checked records, and the defined-name parser is named `parseNativeDefinedNames`.
