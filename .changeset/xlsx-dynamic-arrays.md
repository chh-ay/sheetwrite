---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
"@sheetwrite/core": patch
"@sheetwrite/xlsx": patch
---

XLSX export now marks formulas whose result is an array, such as `=SEQUENCE(3)`, `=FILTER(...)` or `=A1:A3`, as Excel dynamic arrays, so Excel spills them instead of showing `=@SEQUENCE(3)` and one value. Each such cell gets `cm="1"` and `<f t="array">`, and the workbook gets the `xl/metadata.xml` part, as Excel 365 writes them. Exporting a grid also writes each spill's range and the values it shows in the cells it covers. Formulas with one value stay plain, and a workbook without array formulas has no metadata part.

XLSX import reads Excel's dynamic arrays as formulas that spill again, without the cached values of the cells they cover. Legacy array formulas (Ctrl+Shift+Enter, `t="array"` without `cm`) are still kept as text with a warning.

The engines have two new exports for this: `xlsxArrayFormulas` and the `CellStore` method `spillRanges`. Core's `XlsxFormulaEngine` has the matching `arrayFormulas(formulas)`.
