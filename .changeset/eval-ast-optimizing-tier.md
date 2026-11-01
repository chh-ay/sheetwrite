---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

The formula evaluator now keeps most function families (references, conditionals, information, volatile, criteria, lookup, math, statistics, financial) in their own out-of-line handlers. Before, wasm-opt inlined all of them into `CellStore::eval_ast`, which grew to 99,911 bytes in the default engine. It is now 45,923 bytes. JavaScriptCore (Bun, Safari) never compiles a WebAssembly function of 100,000 bytes or more with its optimizing tier, so one more small change would have slowed every formula. No formula result changes.
