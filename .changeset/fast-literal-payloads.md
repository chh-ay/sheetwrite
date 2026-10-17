---
"@sheetwrite/wasm": patch
---

Read literal cell values directly to restore column sum performance and reduce sort overhead. Skip unused count and minimum/maximum work when computing a column sum. Keep calculated values on the formula-aware read path.
