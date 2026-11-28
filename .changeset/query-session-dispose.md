---
"@sheetwrite/queries": patch
---

A disposed query session no longer changes the grid: `define` and `remove` throw a `SheetwriteError` with code `unavailable`, as refreshes already resolve `{ status: "aborted" }`. The session is disposed when its grid is destroyed or the queries add-on is removed.
