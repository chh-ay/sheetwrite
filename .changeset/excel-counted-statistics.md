---
"@sheetwrite/wasm": minor
"@sheetwrite/formulas": minor
"@sheetwrite/core": minor
---

More Excel statistics functions (#277):

- Both engines add `AVERAGEA`, `MAXA`, `MINA`, `STDEVA`, `STDEVPA`, `VARA` and `VARPA`. A logical value counts as 1 or 0 and text in a reference counts as 0. Text typed as an argument is read as a number. Empty cells are skipped.
- The full engine adds `BINOM.DIST.RANGE`, `BINOM.INV`, `HYPGEOM.DIST` and `NEGBINOM.DIST` (with the cumulative form), `GAMMALN.PRECISE`, and the current test names `CHISQ.TEST`, `F.TEST`, `T.TEST` and `Z.TEST`.
