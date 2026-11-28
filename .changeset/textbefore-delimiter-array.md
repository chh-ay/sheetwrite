---
"@sheetwrite/formulas": patch
---

TEXTBEFORE and TEXTAFTER match any delimiter of an array, as Excel does: `=TEXTAFTER("Jones,Bob",{", ",","})` is "Bob". Before, only the first delimiter was used.
