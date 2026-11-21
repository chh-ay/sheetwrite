---
"@sheetwrite/core": patch
---

A pasted block over a filtered range writes into consecutive sheet rows from its first cell, the rows the filter hides included, as Excel's paste does, and the grid says "This paste wrote into N hidden rows" with **Show them**. Before, the block went only into the rows the filter showed, so the same paste changed different cells than in Excel. One copied value pasted over a filtered selection still fills only the shown cells, and under a view sort a block still takes the shown rows.
