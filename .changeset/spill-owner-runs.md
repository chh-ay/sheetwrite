---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Spilled arrays record which cells they own as one row run per column instead of one entry per cell, so installing, clearing and resizing a spill does less work and a large spill keeps a few bytes of ownership state instead of megabytes. Results do not change.
