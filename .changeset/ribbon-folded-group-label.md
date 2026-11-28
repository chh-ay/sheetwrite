---
"@sheetwrite/core": patch
---

In the full ribbon, a folded group's button names the group on at most two lines, with the same rule as large buttons: a one-letter word or "&" is never left at a line break on its own. At 390 px, "Get & Transform Data" used to wrap onto three lines and run into the caption under it. A folded group no longer shows the caption, as in Excel's narrow ribbon, because the button already names the group. The button's accessible name stays whole.
