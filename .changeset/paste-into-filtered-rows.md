---
"@sheetwrite/core": patch
---

A pasted block over a filtered range, or over rows hidden with Hide Rows, writes into consecutive sheet rows from its first cell, the hidden rows included, as Excel's paste does. The grid says "This paste wrote into N hidden rows" with **Show them**. Before, a filter made the block go only into the shown rows, so the same paste changed different cells than in Excel. One copied value pasted over a filtered selection still fills only the shown cells, and under a view sort a block still takes the shown rows.

After such a paste, the context menu's Paste Options row offers **Paste into visible rows only** (new context-menu action `pasteVisibleRows`, `grid.actions.pasteVisibleRows()`, and `grid.canPasteVisibleRows()`): it pastes the same cells again on the shown rows only, as one undo step.

A paste over a filtered range of more than 10,000 cells now writes them all. Before, it wrote nothing and still resolved `"done"`.

A paste the grid refuses (a protected range, the host's admission, or a document limit) now says "Nothing was pasted" and why, and resolves the new `ClipboardOutcome` `"rejected"` instead of `"done"`. Paste into visible rows only is offered only after a paste that applied, and it undoes only that paste.
