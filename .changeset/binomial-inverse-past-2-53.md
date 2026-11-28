---
"@sheetwrite/formulas": patch
---

BINOM.INV and CRITBINOM no longer run forever when the number of trials is above 2^53, such as `=CRITBINOM(2^60,1,0.5)`; they return the count, as for smaller trials.
