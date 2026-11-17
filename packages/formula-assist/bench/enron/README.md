# Enron sample for the formula assist replay

`dev.json` and `heldout.json` are a derived sample of the Enron spreadsheet corpus:

> Felienne Hermans and Emerson Murphy-Hill. *Enron's Spreadsheets and Related Emails: A Dataset and Analysis.* ICSE 2015. Dataset: Hermans, Felienne (2014). *Enron Spreadsheets and Emails.* figshare. <https://doi.org/10.6084/m9.figshare.1221767.v2>

The corpus is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The sample is changed from it as follows:

- **Workbooks.** 100 workbooks are chosen by a seeded draw from `spreadsheets.7z`. Only one file is kept per spreadsheet title, because the corpus holds many copies of one spreadsheet sent in different emails. A workbook needs at least 10 formulas to be chosen.
- **Formulas.** Up to 20 formulas per workbook are the formulas the replay types.
- **Cells.** Only the cells near each of those formulas are kept: 25 rows above, 3 below, 6 columns to the left and 2 to the right, the top 3 rows of the same columns, and up to 60 × 12 cells of each range the formula reads, with the 3 rows above that range. Formula results are dropped, because the engine recalculates them, and text is cut to 40 characters.

Workbooks alternate between the two files in the order they were drawn. Tune on `dev.json`. `heldout.json` is the quality gate's alone (`test/replay.test.ts`), and nobody reads it while tuning.

To rebuild the sample, download the archive (MD5 `188ec98d04c83a4725d9205cc75ce5a2`) and run:

```sh
curl -L -o spreadsheets.7z https://ndownloader.figshare.com/files/3242531
bun packages/formula-assist/bench/enron/build.ts spreadsheets.7z /tmp/enron-scratch
```

The script needs `7z` and built packages (`bun run build`). The same archive gives the same sample.
