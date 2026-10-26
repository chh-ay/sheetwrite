---
"@sheetwrite/core": patch
---

Wrapped text lays out 2.5–3.3× faster in the browser (painting and row auto-fit). Each line's break is now found by searching prefix widths instead of measuring every growing prefix.

Wrapped lines no longer break inside an emoji sequence (such as 👨‍👩‍👧‍👦), a flag or a letter with combining marks: breaks fall between graphemes. Plain Latin text wraps exactly as before.
