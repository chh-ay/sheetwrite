---
"@sheetwrite/queries": patch
---

Power Query export reports a CSV or JSON query whose locator is not an http(s) URL with the loss code `source-locator` instead of `host-source`, which now names only host-supplied sources.
