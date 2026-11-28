---
"@sheetwrite/core": minor
"@sheetwrite/wasm": minor
"@sheetwrite/formulas": minor
---

Hosts can register synchronous JavaScript functions that formulas call, on the full engine (`@sheetwrite/formulas`). Import `registerFunction(store, metadata, implementation)` and `unregisterFunction(store, name)` from `@sheetwrite/core/functions`; an application that does not import that entry carries none of its JavaScript, and the default engine binary does not change. On the default engine, `registerFunction` throws a `SheetwriteError` with code `optional-backend-unavailable`. A thrown error or a result that is not a number, text, boolean or `null` shows `#VALUE!`. A workbook that calls a function that is not registered shows `#NAME?`. `listFunctions(store)` returns the metadata of the built-in functions of the active engine and of the host functions in one list.
