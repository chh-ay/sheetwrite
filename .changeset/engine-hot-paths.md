---
"@sheetwrite/wasm": patch
---

Faster formulas, queries and builds on Rust 1.99.0. Results are unchanged; numbers are medians from alternating runs.

- Rewriting a formula whose cell and range reads stay the same keeps the dependency index: changing one constant among 100,000 formulas went from 35 ms to 0.03 ms.
- Each `LET` binding is evaluated at most once per evaluation (`LET(x, lookup, x+x+x)` 87% faster).
- Plain value cells are read without formula and spill-error lookups, which speeds up range formulas such as `SUMPRODUCT`, `COUNTIF`, `SUMIFS` and `PERCENTILE` by 27–59%.
- Distinct values dedupe by string-pool ID (30–90% faster), value-list filters use a per-column lookup (1,000 picks over 1,000,000 rows: 2.9 s to 28 ms), and multi-key sorts build each key once (34–38% faster).
- The engine now builds with the pinned Rust 1.99.0 toolchain.
