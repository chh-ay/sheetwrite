---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Engine builds now fail if an optimized WebAssembly function exceeds 75,000 bytes, below JavaScriptCore's 100,000-byte optimizing-compiler limit. Build output lists the ten largest functions by name and explains how to split an oversized evaluator. Function names are removed before packaging, so the published WebAssembly bytes do not change.
