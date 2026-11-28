---
"@sheetwrite/core": minor
"@sheetwrite/formulas": minor
---

The full engine adds Excel's complex number functions (#274): `COMPLEX` and the 25 `IM*` functions, such as `IMSUM`, `IMPRODUCT`, `IMDIV`, `IMEXP` and `IMSQRT`. They read and write complex numbers in Excel's text form, such as `3+4i` or `2-j`. Each part of a result has 15 significant digits. `IMSUM` and `IMPRODUCT` skip blank cells in a range.

The default engine does not change.
