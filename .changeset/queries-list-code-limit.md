---
"@sheetwrite/queries": patch
---

Power Query export refuses a query list whose code lanes are longer than a saved plan may be, as plan decoding already does, instead of reading it in full.
