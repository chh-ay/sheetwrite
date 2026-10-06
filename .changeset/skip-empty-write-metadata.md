---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Skip spill and formula metadata lookups when the metadata is empty. This reduces the time to load one million rows by 35% in the measured mixed-column workload. The default WebAssembly file grows by 718 bytes (0.09%) for this improvement.
