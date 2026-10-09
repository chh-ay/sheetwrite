---
"@sheetwrite/core": patch
---

Faster CSV import and workbook snapshot validation.

- CSV import writes each parsed record straight into its target columns instead of building an intermediate string grid. Plain fields are one slice of the input, and imported values are converted without building a temporary cell value. Over 200,000 rows by 10 columns, a same-process A/B measured a 52% median improvement (493 ms to 239 ms). The parsed values are unchanged.
- Snapshot validation builds an error path only when it reports a problem, instead of formatting one for every property it checks. Error paths and messages are unchanged.
