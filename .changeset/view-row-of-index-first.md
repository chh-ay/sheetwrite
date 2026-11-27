---
"@sheetwrite/core": patch
---

Finding the view row of a data row on a sorted or filtered sheet is faster. `viewRowOf` looked up the sheet's view order before its inverse index on every call; it now goes straight to the index, which exists only while the order does. A lookup on a sorted sheet of a million rows takes about a third less time.
