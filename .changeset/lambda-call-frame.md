---
"@sheetwrite/formulas": patch
---

LAMBDA calls, named LAMBDAs, MAP, REDUCE, SCAN, BYROW, BYCOL, MAKEARRAY and data-model measures now evaluate the LAMBDA's own formula with its arguments in a call frame instead of copying the formula for every call, so MAP and REDUCE over large ranges run about twice as fast. The call limit now counts calls: one outer helper or call makes at most 2,000,000, however large the LAMBDA.
