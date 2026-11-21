---
"@sheetwrite/core": patch
---

Large ribbon buttons no longer leave one letter on a line of its own. A one-letter word is tied to the next word (or to the word before when it ends the label), so Sort A to Z and Sort Z to A break as "Sort" / "A to Z", the way Excel's two-line labels read. Accessible names and tooltips do not change.
