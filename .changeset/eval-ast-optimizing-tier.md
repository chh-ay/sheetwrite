---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

The formula evaluator now keeps most function families (references, conditionals, information, volatile, criteria, lookup, math, statistics, financial) in their own out-of-line handlers; text and date stay inline because moving them out slowed text formulas. Before, wasm-opt folded the evaluator's single-caller helpers into `CellStore::eval_ast`, which grew to 99,911 bytes in the default engine. JavaScriptCore (Bun, Safari) never compiles a WebAssembly function of 100,000 bytes or more with its optimizing tier, so one more small change would have slowed every formula. No formula result changes.
