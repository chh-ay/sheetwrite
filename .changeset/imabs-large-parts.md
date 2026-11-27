---
"@sheetwrite/formulas": patch
---

IMABS and the complex functions built on the modulus (IMLN, IMLOG10, IMLOG2, IMPOWER, IMSQRT) handle parts above 1E154 and below 1E-154: `=IMABS("3E+200+4E+200i")` is 5E+200, not `#NUM!`, and `=IMABS("3E-200+4E-200i")` is 5E-200, not 0.
