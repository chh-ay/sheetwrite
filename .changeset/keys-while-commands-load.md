---
"@sheetwrite/core": patch
---

Keys pressed while code loads on first use now act after it, in order, where it left the focus. This covers the find bar, the merge warning, the Insert, Delete and Format Cells dialogs, the sheet menu's panels and copying a sheet, the AutoFilter dropdown, New Dashboard, and the commands behind the number-format, hide and sheet keys. Before, typing right after Ctrl+F could edit the cell instead of filling the find field.
