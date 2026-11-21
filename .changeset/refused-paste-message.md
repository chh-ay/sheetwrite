---
"@sheetwrite/core": patch
---

A paste larger than a paste may be is refused with a plain message that says how large it is, such as "Nothing was pasted: this paste has 16,385 columns, and a paste can have at most 16,384.", and no error reaches the page. `grid.actions.paste()`, `pasteValues()` and `pasteSpecial()` resolve `"rejected"` instead of rejecting, as their docs say.
