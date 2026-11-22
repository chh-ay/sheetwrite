---
"@sheetwrite/core": patch
---

Scrolling a cell into view moves by whole columns and rows, as in Excel and Google Sheets. Arrow keys, Find, the Name Box, a selection change and `grid.scrollToCell` used to stop with the target's far edge at the edge of the view, so the first column or row on screen was cut part way, such as "ger" left of a "Manager" column. Going right or down, they now stop where the first column and row on screen start at their gridlines and the target still shows whole. This holds with frozen panes, hidden columns and rows, and zoom from 50% to 200%. A cell wider or taller than the view shows from its own left or top edge. The scroll area ends up to one column and one row past the last ones, so the last column and row can be reached this way too. Scrolling with a wheel, trackpad or scrollbar still moves by pixels. The visible area now leaves out classic scrollbars, so a target no longer ends under one.
