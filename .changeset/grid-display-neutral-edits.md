---
"@sheetwrite/core": patch
---

Skip repaint work for edits that cannot change what the grid shows. On a sheet without formulas, a plain value edit outside the painted window or on another sheet no longer re-reads the visible window, rebuilds the search-match and note indexes, or rewrites the accessibility mirror. An active search now also picks up matches that a value edit adds or removes, without scrolling.
