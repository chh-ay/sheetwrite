---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Formulas use less memory: each node of a parsed formula is 24 bytes instead of 48 in WebAssembly, and references to other sheets are bound to the sheet while the formula is parsed. A formula that names a sheet that does not exist yet shows `#REF!` until that sheet is added or renamed to that name; then only the formulas that name it are updated, without parsing every formula again. References to other workbooks keep their exact text.
