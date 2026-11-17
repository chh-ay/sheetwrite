---
"@sheetwrite/core": patch
---

The command toolbar paints its final row from the first frame. When a command it holds was unavailable, such as Import XLSX with no XLSX add-on, the command was hidden at once but its separator stayed until the next animation frame, and then the items after it moved 7 to 9 px: a layout shift on every page that shows the toolbar. The toolbar now fits its row as soon as a command's availability changes.
