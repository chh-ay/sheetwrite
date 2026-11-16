---
"@sheetwrite/core": patch
---

Keys pressed while an AutoFilter command loads its code now act after that command, in order. Before, pressing Ctrl+Shift+L and then Alt+Down quickly on the first use could move the cell down instead of opening the header's dropdown.
