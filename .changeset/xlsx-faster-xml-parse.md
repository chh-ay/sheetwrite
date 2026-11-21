---
"@sheetwrite/core": patch
"@sheetwrite/xlsx": patch
---

XLSX import parses worksheet XML faster. Text and attribute values are counted against `maxXmlTextBytes` only when they could pass it, and text with only the five predefined XML entities is decoded in one pass. The limits, errors and imported values do not change.
