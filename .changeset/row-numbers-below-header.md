---
"@sheetwrite/core": patch
---

Keep row numbers below the column header. When the top row was scrolled partly under the header, its number painted into the header's top-left corner. Row numbers now clip at the header edge, like cell text.
