---
"@sheetwrite/core": minor
---

A paste works as Excel's does with data validation: the pasted values land unchecked, and the cells the paste covers take the copied cells' rules in place of their own, as one undoable step. Before, a paste kept the target's rules and silently refused each value a rule rejected. Paste Values and a paste from outside the grid keep the target's rules. The store no longer checks validation for a commit with the `"paste"` reason.

New `GridConfig.paste.keepValidation`: a paste keeps the target cells' rules instead. A value a `reject` rule refuses is not pasted, a value a `warn` rule refuses lands, and the status bar names both kinds of cell, such as "3 cells refused: B4, B7, B9.", with a Select them button.
