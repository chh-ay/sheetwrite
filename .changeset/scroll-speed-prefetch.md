---
"@sheetwrite/core": patch
---

Paged datasource prefetch follows scroll speed and fetch time. The grid looks ahead by the distance it scrolls during one fetch (from the measured p90 fetch time) plus one view, also sideways when it scrolls across columns, within the paged cache budget. A fling or scrollbar drag fetches around where the view will be when the fetch returns instead of the rows it passes, and cancels requests for rows already passed. The lookahead shrinks as a fling slows down.
