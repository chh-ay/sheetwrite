---
"@sheetwrite/xlsx": patch
---

Read worksheets with very many outlined rows or column declarations in linear time. An outline over every sheet row no longer throws `RangeError`, isolated outlined rows no longer cost one scan of all outlined rows per group, and overlapping `<col>` declarations resolve each column once instead of expanding every declaration to all its columns.
