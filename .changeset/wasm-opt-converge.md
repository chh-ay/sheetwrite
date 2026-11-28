---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

wasm-opt runs its passes until the engine stops shrinking: the default engine's WASM is 0.7 KB smaller and the full engine's 1.7 KB (Brotli).
