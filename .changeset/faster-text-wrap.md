---
"@sheetwrite/core": patch
---

Wrapped text lays out 2.5–3.3× faster in the browser (painting and row auto-fit). Each line's break is now found by searching prefix widths instead of measuring every growing prefix; line breaks are unchanged.
