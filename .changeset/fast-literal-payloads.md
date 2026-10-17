---
"@sheetwrite/wasm": patch
---

Read literal cell values directly to restore column sum performance and reduce sort overhead. Keep calculated values on the formula-aware read path.
