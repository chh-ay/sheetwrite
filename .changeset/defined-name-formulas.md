---
"@sheetwrite/core": minor
"@sheetwrite/wasm": minor
"@sheetwrite/formulas": minor
"@sheetwrite/xlsx": minor
---

Add defined-name formulas and a lazy Name Manager under Formulas › Defined Names in the ribbon, compact ribbon, and toolbar. Names can hold constants, calculated values, references, or a reusable LAMBDA. Saves and deletes use document transactions, undo/redo, and collaboration.

Plain named formulas evaluate in both engines. Named LAMBDA calls require the full engine; the default engine keeps and round-trips definitions but returns `#NAME?` when called. Recursive calls stop at 64 nested calls with `#NUM!`, below Excel's parameter-dependent allowance.

Keep defined-name formulas and scope in native XLSX. The engine converts Excel's future-function and LAMBDA parameter prefixes without changing quoted text or reference names. Formula-name conversion reuses the document engine or releases a temporary instance; range-only workbooks do not load one.
