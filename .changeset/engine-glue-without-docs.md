---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

The engine's JavaScript glue no longer carries the Rust documentation as comments. A page that loads the default engine downloads 12.8 KB less JavaScript (Brotli), and 13.7 KB less with the full engine. The types in `sheetwrite_wasm.d.ts` keep the documentation.
