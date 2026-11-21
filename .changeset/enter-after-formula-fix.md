---
"@sheetwrite/core": patch
---

Enter after a one-click formula fix that corrects a function name ("Did you mean SUM?") stores the formula, as without a fix. Before, the fix left the caret after the corrected name, the function list opened for it, and Enter went to the list, so the editor stayed open.
