---
"@sheetwrite/core": minor
"@sheetwrite/formulas": minor
---

The full engine adds the 34 statistical function names that Excel keeps for workbooks from Excel 2007 and earlier, so these workbooks no longer show `#NAME?` (#273):

- `STDEV`, `STDEVP`, `VAR`, `VARP`, `MODE` and `COVAR` give the results of `STDEV.S`, `STDEV.P`, `VAR.S`, `VAR.P`, `MODE.SNGL` and `COVARIANCE.P`. `STDEV`, `STDEVP`, `VAR` and `VARP` read 3-D references, and these five list functions read unions.
- `BETAINV`, `BINOMDIST`, `CHIDIST`, `CHIINV`, `CONFIDENCE`, `EXPONDIST`, `FDIST`, `FINV`, `GAMMADIST`, `GAMMAINV`, `LOGINV`, `NORMDIST`, `NORMINV`, `NORMSINV`, `POISSON`, `TINV` and `WEIBULL` give the results of their newer distribution functions. `CHIDIST` and `FDIST` are right-tailed, and `TINV` is two-tailed.
- `BETADIST`, `LOGNORMDIST` and `NORMSDIST` always return the cumulative probability. `HYPGEOMDIST` and `NEGBINOMDIST` return the probability mass. `TDIST(x, deg_freedom, tails)` returns one or both tails of a non-negative `x`. `CRITBINOM` returns the smallest number of successes whose cumulative binomial probability is at least `alpha`.
- `CHITEST`, `FTEST`, `TTEST` and `ZTEST` return the probability of the chi-squared, F, Student's t and z test statistics. `TTEST` supports paired, equal-variance and unequal-variance tests.

The default engine does not change.
