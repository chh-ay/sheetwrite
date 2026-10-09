---
"@sheetwrite/formulas": minor
"@sheetwrite/core": minor
---

Add `@sheetwrite/formulas`, an optional full formula engine. It is the same Rust engine as `@sheetwrite/wasm`, built with more functions, and it has the same API and loaders. The default `@sheetwrite/wasm` engine does not change: its function set and its binary size stay the same.

- Select the full engine one time, before the app creates a grid or a store: `import * as formulas from "@sheetwrite/formulas"; await initSheetwrite(undefined, formulas);`. A call that selects a different engine after this rejects. Calls without an engine keep the selected engine, so framework adapters work with both engines.
- The full engine adds 36 statistical distribution functions: `NORM.DIST`, `NORM.INV`, `NORM.S.DIST`, `NORM.S.INV`, `T.DIST`, `T.DIST.2T`, `T.DIST.RT`, `T.INV`, `T.INV.2T`, `CHISQ.DIST`, `CHISQ.DIST.RT`, `CHISQ.INV`, `CHISQ.INV.RT`, `F.DIST`, `F.DIST.RT`, `F.INV`, `F.INV.RT`, `BINOM.DIST`, `POISSON.DIST`, `EXPON.DIST`, `GAMMA`, `GAMMALN`, `GAMMA.DIST`, `GAMMA.INV`, `BETA.DIST`, `BETA.INV`, `LOGNORM.DIST`, `LOGNORM.INV`, `WEIBULL.DIST`, `CONFIDENCE.NORM`, `CONFIDENCE.T`, `STANDARDIZE`, `FISHER`, `FISHERINV`, `PHI`, and `GAUSS`. They use the Excel argument rules and error values.
- Formula assist suggests only the functions of the selected engine. With the default engine, these functions return `#NAME?`.
- The full engine binary is 794,725 bytes (240,690 bytes with Brotli). The default engine binary is 758,385 bytes (228,822 bytes with Brotli).
