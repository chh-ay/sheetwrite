---
"@sheetwrite/xlsx": patch
---

One owner inside the XLSX package for each format rule that the reader, writer, pivot, Power Query and preservation code shared as copies (part of #250): OOXML namespaces, the metadata sheet markers and column width units (`format.ts`), A1 cell and range parsing and formatting (`cell-reference.ts`, on core's `cellA1` and `rangeA1`), ISO 8601 date serials, OPC relationship part names, sheet growth and column keys. Pivot `d` items now read with the cell rule: only a date-time without a zone gets UTC, so a date-only item no longer depends on a runtime accepting `2024-01-01Z`. Pivot ranges accept any row number the reader accepts.
