---
"@sheetwrite/core": patch
---

Keys pressed while a command loads its code on first use now act after that command, in order, where it left the focus. Before, pressing Ctrl+Shift+L and then Alt+Down quickly could move the cell down instead of opening the header's dropdown, and typing right after Ctrl+F could edit the cell instead of filling the find field. This covers find and replace, the AutoFilter commands and New Dashboard.
