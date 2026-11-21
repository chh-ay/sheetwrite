# Enron sample for the formula assist replay

`dev.json`, `dev2.json` and `heldout.json` are a derived sample of the Enron spreadsheet corpus:

> Felienne Hermans and Emerson Murphy-Hill. *Enron's Spreadsheets and Related Emails: A Dataset and Analysis.* ICSE 2015. Dataset: Hermans, Felienne (2014). *Enron Spreadsheets and Emails.* figshare. <https://doi.org/10.6084/m9.figshare.1221767.v2>

The corpus is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The sample is changed from it as follows:

- **Workbooks.** Workbooks are chosen by seeded draws from `spreadsheets.7z`. Only one file is kept per spreadsheet title, because the corpus holds many copies of one spreadsheet sent in different emails. A workbook needs at least 10 formulas to be chosen.
- **Formulas.** Up to 20 formulas per workbook are the formulas the replay types.
- **Cells.** Only the cells near each of those formulas are kept: 25 rows above, 3 below, 6 columns to the left and 2 to the right, the top 3 rows of the same columns, and up to 60 × 12 cells of each range the formula reads, with the 3 rows above that range. Formula results are dropped, because the engine recalculates them, and text is cut to 40 characters.
- **Defined names.** The workbook's defined names are kept, with formulas of up to 200 characters. The replay leaves out the names the engine refuses once the cells they read are gone.
- **Whole workbooks.** The `-whole` sets keep every cell of each workbook instead, with text cut to 40 characters, and mark hidden and very hidden sheets. Signals that read the whole workbook need them: in the other sets, most of a workbook's formulas are not there to read.

## The sets

| File | Draw | Use |
| --- | --- | --- |
| `dev.json` | Seed 801, 100 workbooks, the even draws | Development: tune on it |
| `dev2.json` | Seed 801, the odd draws | Development. It was the first held-out set. It was run once, missed the wrong-suggestion bar (2.8% against under 2%), and is used for tuning since. |
| not committed | Seed 802, 50 workbooks (960 formulas) whose titles neither development set holds | Burned. It was the second held-out set, run once: 53.0% saved, 2.1% wrong (12 of 579 shown), against under 2%. The predictor was then limited to the strongest neighbour cases. `build.ts --held-out` draws it again from its seed, which gives the same workbooks, only to keep its titles out of the next draw; it is not kept, so the sample stays under 3 MB. |
| `heldout.json` | Seed 803, 50 workbooks (975 formulas) whose titles neither development set nor the seed-802 draw holds | The quality gate's alone (`test/replay.test.ts`). Nobody reads it while tuning. Run once with the neighbour and syntax signals: 38.5% saved, 2.6% wrong (15 of 587 shown). With the column and workbook signals: 48.3% saved, 2.2% wrong (16 of 715). The gate holds the latest values (`bench/bar.ts`). |
| `dev-large.json`, not committed | Seed 804, 500 workbooks (9,689 formulas) whose titles no other set and no burned draw holds | Development: tune on it. At 12 MB it is too large to commit; `build.ts --dev-large` builds it and checks its SHA-256 against the one the script records. |
| `dev-large-whole.json`, not committed | The seed-804 draw again, with the same workbooks and formulas, whole (100 MB) | Development: tune the signals that read the whole workbook on it. `build.ts --dev-large-whole` builds it and checks its SHA-256. |
| `heldout-whole.json`, not committed | Seed 805, 50 whole workbooks (966 formulas) whose titles no earlier set or draw holds | Held out for the column and workbook signals; nobody read it while tuning. Run once: 62.0% saved, 0.7% wrong (5 of 735 shown); the predictor before those signals gave 50.2% saved, 0.6% wrong (4 of 628) on the same formulas. At 16 MB it is not committed, so CI can't gate it; `build.ts --held-out-whole` builds it and checks its SHA-256. |

To rebuild the sample, run the script. It downloads the archive to the path given when the file isn't there (1 GB, MD5 `188ec98d04c83a4725d9205cc75ce5a2`):

```sh
bun packages/formula-assist/bench/enron/build.ts spreadsheets.7z /tmp/enron-scratch                     # dev.json, dev2.json
bun packages/formula-assist/bench/enron/build.ts spreadsheets.7z /tmp/enron-scratch --held-out          # heldout.json
bun packages/formula-assist/bench/enron/build.ts spreadsheets.7z /tmp/enron-scratch --dev-large         # dev-large.json
bun packages/formula-assist/bench/enron/build.ts spreadsheets.7z /tmp/enron-scratch --dev-large-whole   # dev-large-whole.json
bun packages/formula-assist/bench/enron/build.ts spreadsheets.7z /tmp/enron-scratch --held-out-whole    # heldout-whole.json
```

The script needs `7z` and built packages (`bun run build`). The same archive gives the same sample. A fresh held-out set is drawn only when a change is ready to be tested against the original bar (at least 40% saved, under 2% wrong), and it skips every title above.
