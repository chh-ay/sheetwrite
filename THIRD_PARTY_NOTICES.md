# Third-party notices

Material from others that this repository includes, apart from the npm and Cargo dependencies, which carry their own licenses.

## Enron spreadsheet corpus

`packages/formula-assist/bench/enron/dev.json`, `dev2.json` and `heldout.json` are derived from the Enron spreadsheet corpus by Felienne Hermans and Emerson Murphy-Hill, *Enron Spreadsheets and Emails*, figshare, <https://doi.org/10.6084/m9.figshare.1221767.v2>, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The sample keeps 150 workbooks and only the cells near the formulas it uses; `packages/formula-assist/bench/enron/README.md` describes every change. The benchmark of formula assist uses it, and no package ships it.
