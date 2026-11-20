---
"@sheetwrite/core": patch
---

Scrolling and moving with the arrow keys build no screen-reader description for the visible cells of a sheet without notes or validation rules, which made those steps 2 to 4% slower in 0.7.0's prereleases.
