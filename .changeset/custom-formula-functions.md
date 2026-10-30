---
"@sheetwrite/core": minor
"@sheetwrite/wasm": minor
"@sheetwrite/formulas": minor
---

Hosts can register synchronous JavaScript functions that formulas call. Use `store.registerFunction(metadata, implementation)` and `store.unregisterFunction(name)`. A thrown error or a result that is not a number, text, boolean or `null` shows `#VALUE!`. A workbook that calls a function that is not registered shows `#NAME?`. `store.listFunctions()` returns the metadata of the built-in functions of the active engine and of the host functions in one list.
