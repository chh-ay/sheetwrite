---
"@sheetwrite/core": minor
---

A paste larger than a paste may be is refused with a plain message that says how large it is, such as "This paste has 16,385 columns. A paste can have at most 16,384.", and no error reaches the page. `grid.actions.paste()`, `pasteValues()` and `pasteSpecial()` resolve with the new `ClipboardOutcome` `"too-large"` instead of rejecting, as their docs say. Code that switches over every `ClipboardOutcome` gains one case.
