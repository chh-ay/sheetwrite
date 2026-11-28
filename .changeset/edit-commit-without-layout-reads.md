---
"@sheetwrite/core": patch
---

Committing a cell edit and opening the cell editor read less of the page's layout. Whether a change shows in the painted cells, and whether a move after Enter or Tab needs a scroll, now come from the grid's last frame while nothing has scrolled or resized since, instead of reading the scroller. The editor hands the focus back to the grid before it leaves the page, and the grid takes the focus without a scroll into view. Pressing a key reads the page height only for Page Up and Page Down.
